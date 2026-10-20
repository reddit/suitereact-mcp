import type { NsReactChatModelDefinition } from 'suitereact';

export const DEFAULT_SUITEQL_CHAT_MODEL_ID = 'gpt-6.1-sol';

export const SUITEQL_CHAT_MODELS: NsReactChatModelDefinition[] = [
  {
    id: 'gpt-6.1-sol',
    name: 'GPT-6.1 Sol (OpenAI) — Default',
    clientType: 'openai',
    model: 'gpt-6.1-sol',
  },
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna (OpenAI) — Quick queries',
    clientType: 'openai',
    model: 'gpt-6-luna',
  },
  {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra (OpenAI) — Complex reasoning',
    clientType: 'openai',
    model: 'gpt-6-astra',
  },
  {
    id: 'anthropic/claude-sonnet-5.5',
    name: 'Claude Sonnet 5.5 (OpenRouter) — Everyday SQL',
    clientType: 'openrouter',
    model: 'anthropic/claude-sonnet-5.5',
  },
  {
    id: 'anthropic/claude-opus-5.5',
    name: 'Claude Opus 5.5 (OpenRouter) — Difficult SQL',
    clientType: 'openrouter',
    model: 'anthropic/claude-opus-5.5',
  },
  {
    id: 'google/gemini-4-argon',
    name: 'Gemini 4 Argon (OpenRouter) — Large context',
    clientType: 'openrouter',
    model: 'google/gemini-4-argon',
  },
  {
    id: 'deepseek/deepseek-v4.1-flash-1017',
    name: 'DeepSeek V4.1 Flash 1017 (OpenRouter) — Fast alternative',
    clientType: 'openrouter',
    model: 'deepseek/deepseek-v4.1-flash-1017',
  },
  {
    id: 'z-ai/glm-5.3',
    name: 'GLM 5.3 (OpenRouter) — General alternative',
    clientType: 'openrouter',
    model: 'z-ai/glm-5.3',
  },
];
