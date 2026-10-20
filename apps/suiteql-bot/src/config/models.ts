import type { NsReactChatModelDefinition } from 'suitereact';

export const DEFAULT_SUITEQL_CHAT_MODEL_ID = 'gpt-5.6-sol';

export const SUITEQL_CHAT_MODELS: NsReactChatModelDefinition[] = [
  {
    id: 'gpt-5.6-sol',
    name: 'gpt-5.6-sol (ChatGPT)',
    clientType: 'openai',
    model: 'gpt-5.6-sol',
  },
  {
    id: 'gpt-5.6-terra',
    name: 'gpt-5.6-terra (ChatGPT)',
    clientType: 'openai',
    model: 'gpt-5.6-terra',
  },
  {
    id: 'gpt-5.6-luna',
    name: 'gpt-5.6-luna (ChatGPT)',
    clientType: 'openai',
    model: 'gpt-5.6-luna',
  },
  {
    id: 'gpt-5.5-2026-04-23',
    name: 'gpt-5.5-2026-04-23 (ChatGPT)',
    clientType: 'openai',
    model: 'gpt-5.5-2026-04-23',
  },
  {
    id: 'gpt-5.4-2026-03-05',
    name: 'gpt-5.4-2026-03-05 (ChatGPT)',
    clientType: 'openai',
    model: 'gpt-5.4-2026-03-05',
  },
  {
    id: 'xiaomi/mimo-v2.5',
    name: 'xiaomi/mimo-v2.5 (OpenRouter)',
    clientType: 'openrouter',
    model: 'xiaomi/mimo-v2.5',
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'deepseek/deepseek-v4-flash (OpenRouter)',
    clientType: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'deepseek/deepseek-v4-pro (OpenRouter)',
    clientType: 'openrouter',
    model: 'deepseek/deepseek-v4-pro',
  },
  {
    id: 'minimax/minimax-m3',
    name: 'minimax/minimax-m3 (OpenRouter)',
    clientType: 'openrouter',
    model: 'minimax/minimax-m3',
  },
  {
    id: 'z-ai/glm-5.2',
    name: 'z-ai/glm-5.2 (OpenRouter)',
    clientType: 'openrouter',
    model: 'z-ai/glm-5.2',
  },
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'moonshotai/kimi-k2.6 (OpenRouter)',
    clientType: 'openrouter',
    model: 'moonshotai/kimi-k2.6',
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'anthropic/claude-sonnet-4.6 (OpenRouter)',
    clientType: 'openrouter',
    model: 'anthropic/claude-sonnet-4.6',
  },
  {
    id: 'anthropic/claude-opus-4.7',
    name: 'anthropic/claude-opus-4.7 (OpenRouter)',
    clientType: 'openrouter',
    model: 'anthropic/claude-opus-4.7',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'anthropic/claude-opus-4.8 (OpenRouter)',
    clientType: 'openrouter',
    model: 'anthropic/claude-opus-4.8',
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'google/gemini-3-flash-preview (OpenRouter)',
    clientType: 'openrouter',
    model: 'google/gemini-3-flash-preview',
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    name: 'google/gemini-3.1-flash-lite (OpenRouter)',
    clientType: 'openrouter',
    model: 'google/gemini-3.1-flash-lite',
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'google/gemini-3.5-flash (OpenRouter)',
    clientType: 'openrouter',
    model: 'google/gemini-3.5-flash',
  },
];
