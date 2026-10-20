/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 */

import * as https from 'N/https';
import * as log from 'N/log';
import * as runtime from 'N/runtime';
import { EntryPoints } from 'N/types';

import { errorResponse, successResponse } from '../domain/suitereact';

interface LLMProxyRequest {
  provider: 'openai' | 'openrouter';
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: boolean;
      schema: any;
    };
  };
}

interface LLMProxyResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const PROVIDER_CONFIGS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    secretName: 'custsecret_openai_api_key', // This should match your secret name in NetSuite
    authHeader: (apiKey: string) => `Bearer ${apiKey}`,
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    secretName: 'custsecret_openrouter_api_key', // This should match your secret name in NetSuite
    authHeader: (apiKey: string) => `Bearer ${apiKey}`,
  },
};

const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARACTERS = 100_000;
const MAX_COMPLETION_TOKENS = 32_768;

const getCsvParameter = (name: string): string[] =>
  String(runtime.getCurrentScript().getParameter({ name }) || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

const assertAuthorizedRequest = (request: LLMProxyRequest): void => {
  const currentRole = String(runtime.getCurrentUser().role);
  const allowedRoles = getCsvParameter('custscript_sr_llm_role_ids');
  if (!allowedRoles.includes(currentRole)) {
    throw new Error('LLM proxy access is not authorized for the current role');
  }

  const allowedProviderModels = getCsvParameter('custscript_sr_llm_models');
  const providerModel = `${request.provider}:${request.model}`;
  if (!allowedProviderModels.includes(providerModel)) {
    throw new Error(
      'The requested provider/model pair is not enabled for this deployment'
    );
  }
};

const supportsCustomSampling = (request: LLMProxyRequest): boolean => {
  if (request.provider !== 'openai') return true;

  // GPT-6 requests use provider-default reasoning, which excludes sampling controls.
  if (/^gpt-6(?:[.-]|$)/i.test(request.model)) return false;

  const versionMatch = request.model.match(/^gpt-5\.(\d+)(?:[.-]|$)/i);
  return !versionMatch || Number(versionMatch[1]) < 4;
};

/**
 * Forward request to LLM provider using secure string handling
 */
const forwardToProvider = (request: LLMProxyRequest): LLMProxyResponse => {
  try {
    const config = PROVIDER_CONFIGS[request.provider];

    // Prepare the request payload
    // OpenAI uses max_completion_tokens, OpenRouter uses max_tokens
    const payload: Record<string, any> = {
      model: request.model,
      messages: request.messages,
      temperature: supportsCustomSampling(request)
        ? request.temperature
        : undefined,
      top_p: supportsCustomSampling(request) ? request.top_p : undefined,
      frequency_penalty: request.frequency_penalty,
      presence_penalty: request.presence_penalty,
      stream: request.stream,
      response_format: request.response_format,
    };

    // Handle max tokens parameter based on provider
    if (request.max_tokens !== undefined) {
      if (request.provider === 'openai') {
        payload.max_completion_tokens = request.max_tokens;
      } else {
        payload.max_tokens = request.max_tokens;
      }
    }

    // Remove undefined values
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    log.debug('LLM Proxy Request', {
      provider: request.provider,
      model: request.model,
      messageCount: request.messages?.length || 0,
      url: `${config.baseURL}/chat/completions`,
    });

    const secretString = https.createSecureString({
      input: `Bearer {${config.secretName}}`,
    });
    const response = https.post({
      url: `${config.baseURL}/chat/completions`,
      headers: {
        Authorization: secretString,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.code !== 200) {
      log.error('LLM API Error', {
        provider: request.provider,
        status: response.code,
      });
      throw new Error(
        `LLM provider request failed with status ${response.code}`
      );
    }

    const responseData = JSON.parse(response.body);

    log.debug('LLM Proxy Response', {
      provider: request.provider,
      model: responseData.model,
      usage: responseData.usage,
    });

    return responseData;
  } catch (error) {
    log.error('Error forwarding to LLM provider', error);
    throw error;
  }
};

/**
 * Validate the incoming request
 */
const validateRequest = (request: any): request is LLMProxyRequest => {
  if (!request) {
    throw new Error('Request body is required');
  }

  if (
    !request.provider ||
    !['openai', 'openrouter'].includes(request.provider)
  ) {
    throw new Error('Valid provider is required (openai or openrouter)');
  }

  if (!request.model || typeof request.model !== 'string') {
    throw new Error('Model is required and must be a string');
  }

  if (!request.messages || !Array.isArray(request.messages)) {
    throw new Error('Messages array is required');
  }

  if (request.messages.length === 0) {
    throw new Error('At least one message is required');
  }

  if (request.messages.length > MAX_MESSAGES) {
    throw new Error(`Messages cannot exceed ${MAX_MESSAGES} entries`);
  }

  const messageCharacters = request.messages.reduce(
    (total: number, message: { content?: unknown }) =>
      total +
      (typeof message.content === 'string' ? message.content.length : 0),
    0
  );
  if (messageCharacters > MAX_MESSAGE_CHARACTERS) {
    throw new Error(
      `Message content cannot exceed ${MAX_MESSAGE_CHARACTERS} characters`
    );
  }

  if (
    request.max_tokens !== undefined &&
    (!Number.isInteger(request.max_tokens) ||
      request.max_tokens < 1 ||
      request.max_tokens > MAX_COMPLETION_TOKENS)
  ) {
    throw new Error(
      `max_tokens must be between 1 and ${MAX_COMPLETION_TOKENS}`
    );
  }

  // Validate message format
  for (const message of request.messages) {
    if (
      !message.role ||
      !['system', 'user', 'assistant'].includes(message.role)
    ) {
      throw new Error(
        'Each message must have a valid role (system, user, or assistant)'
      );
    }

    if (!message.content || typeof message.content !== 'string') {
      throw new Error('Each message must have content');
    }
  }

  return true;
};

/**
 * Main RESTlet handler
 */
const onRequest = (params: any) => {
  try {
    log.debug('LLM Proxy Request Received', {
      provider: params?.provider,
      model: params?.model,
      messageCount: params?.messages?.length,
    });

    // Validate the request
    validateRequest(params);
    assertAuthorizedRequest(params as LLMProxyRequest);

    // Forward to the appropriate LLM provider
    const response = forwardToProvider(params as LLMProxyRequest);

    return successResponse(response);
  } catch (error) {
    log.error('LLM Proxy Error', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return errorResponse('LLM Proxy Error', errorMessage);
  }
};

export const post: EntryPoints.RESTlet.post = onRequest;
export const get: EntryPoints.RESTlet.get = onRequest;
