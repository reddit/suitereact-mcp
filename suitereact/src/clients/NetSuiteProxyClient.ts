import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ProxyMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProxyStructuredOutput {
  name: string;
  schema: z.ZodType<any>;
  strict?: boolean;
}

export interface ProxyCompletionRequest {
  provider: 'openai' | 'openrouter';
  model: string;
  messages: ProxyMessage[];
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

export interface ProxyCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ProxyMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface NetSuiteProxyClientConfig {
  restletUrl?: string; // Optional - defaults to standard LLM proxy RESTlet
  timeout?: number;
  systemContext?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

export interface NetSuiteProxyClientOptions {
  clientType?: 'openai' | 'openrouter'; // Will be passed from model definition
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  structuredOutput?: ProxyStructuredOutput;
}

export class NetSuiteProxyClient {
  private client: AxiosInstance;
  private config: NetSuiteProxyClientConfig;
  private systemContext: string;

  constructor(config: NetSuiteProxyClientConfig) {
    this.config = {
      restletUrl:
        config.restletUrl ||
        '/app/site/hosting/restlet.nl?script=customscript_sr_rl_llm_proxy&deploy=1',
      timeout: config.timeout || 30000,
      defaultTemperature: config.defaultTemperature || 0.7,
      defaultMaxTokens: config.defaultMaxTokens || 15000,
      systemContext: config.systemContext,
    };

    this.systemContext = config.systemContext || '';

    this.client = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Log only transport metadata. Axios errors retain request headers.
    this.client.interceptors.request.use(
      config => {
        console.warn('NetSuite Proxy Request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
        });
        return config;
      },
      error => {
        console.error('NetSuite Proxy request setup failed');
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => {
        console.warn('NetSuite Proxy Response:', {
          status: response.status,
        });
        return response;
      },
      error => {
        console.error('NetSuite Proxy Response Error:', {
          status: error.response?.status,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Update the system context for future requests
   */
  setSystemContext(context: string): void {
    this.systemContext = context;
  }

  /**
   * Get the current system context
   */
  getSystemContext(): string {
    return this.systemContext;
  }

  /**
   * Convert Zod schema to proxy response format
   */
  private convertZodSchemaToResponseFormat(
    structuredOutput: ProxyStructuredOutput
  ) {
    // @ts-ignore — zodToJsonSchema generic inference causes TS2589 with z.ZodType<any> in some versions
    const jsonSchema = zodToJsonSchema(structuredOutput.schema) as Record<
      string,
      unknown
    >;

    return {
      type: 'json_schema' as const,
      json_schema: {
        name: structuredOutput.name,
        strict: structuredOutput.strict ?? true,
        schema: jsonSchema,
      },
    };
  }

  /**
   * Create a chat completion via NetSuite proxy
   */
  async createChatCompletion(
    messages: ProxyMessage[],
    options: NetSuiteProxyClientOptions = {}
  ): Promise<ProxyCompletionResponse> {
    const requestMessages: ProxyMessage[] = [];

    // Add system context if provided
    if (this.systemContext) {
      requestMessages.push({
        role: 'system',
        content: this.systemContext,
      });
    }

    // Add user messages
    requestMessages.push(...messages);

    // Handle structured output if provided
    let responseFormat;
    if (options.structuredOutput) {
      responseFormat = this.convertZodSchemaToResponseFormat(
        options.structuredOutput
      );
    }

    const request: ProxyCompletionRequest = {
      provider: options.clientType || 'openai', // Use clientType from model definition
      model: options.model || 'gpt-4o-mini',
      messages: requestMessages,
      temperature: options.temperature ?? this.config.defaultTemperature,
      max_tokens: options.maxTokens ?? this.config.defaultMaxTokens,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stream: options.stream,
      response_format: responseFormat,
    };

    const response = await this.client.post(
      this.config.restletUrl as string,
      request
    );

    // Handle NetSuite's response format
    if (response.data && response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data?.error || 'Proxy request failed');
    }
  }

  /**
   * Create a simple chat completion with just user message
   */
  async chat(
    userMessage: string,
    options: NetSuiteProxyClientOptions = {}
  ): Promise<string> {
    const messages: ProxyMessage[] = [
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const response = await this.createChatCompletion(messages, options);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Create a structured chat completion using a Zod schema
   */
  async chatStructured<T>(
    userMessage: string,
    schema: z.ZodType<T>,
    schemaName: string,
    options: Omit<NetSuiteProxyClientOptions, 'structuredOutput'> = {}
  ): Promise<T> {
    const messages: ProxyMessage[] = [
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const response = await this.createChatCompletion(messages, {
      ...options,
      structuredOutput: {
        name: schemaName,
        schema: schema,
        strict: true,
      },
    });

    const content = response.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(content);
      return schema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to parse structured response: ${error}`);
    }
  }

  /**
   * Create a conversation with structured output using a Zod schema
   */
  async conversationStructured<T>(
    messages: ProxyMessage[],
    schema: z.ZodType<T>,
    schemaName: string,
    options: Omit<NetSuiteProxyClientOptions, 'structuredOutput'> = {}
  ): Promise<T> {
    const response = await this.createChatCompletion(messages, {
      ...options,
      structuredOutput: {
        name: schemaName,
        schema: schema,
        strict: true,
      },
    });

    const content = response.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(content);
      return schema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to parse structured response: ${error}`);
    }
  }

  /**
   * Create a conversation with multiple messages
   */
  async conversation(
    messages: ProxyMessage[],
    options: NetSuiteProxyClientOptions = {}
  ): Promise<string> {
    const response = await this.createChatCompletion(messages, options);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Update client configuration
   */
  updateConfig(newConfig: Partial<NetSuiteProxyClientConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update axios instance if timeout or auth headers changed
    if (newConfig.timeout) {
      this.client = axios.create({
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): NetSuiteProxyClientConfig {
    return { ...this.config };
  }
}

/**
 * Create a new NetSuite proxy client instance
 */
export function createNetSuiteProxyClient(
  config: NetSuiteProxyClientConfig
): NetSuiteProxyClient {
  return new NetSuiteProxyClient(config);
}
