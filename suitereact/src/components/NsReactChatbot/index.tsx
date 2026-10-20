import {
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  createNetSuiteProxyClient,
  ProxyCompletionRequest,
  ProxyMessage,
} from '../../clients';
import {
  DEFAULT_CHAT_MODELS,
  NsReactActionProps,
  NsReactChatClientConfig,
  NsReactChatMessage,
  NsReactChatModelDefinition,
  NsReactHandleActionInputProps,
  NsReactHandleChangeInputProps,
  NsReactStructuredOutput,
} from '../../domain';

export interface NsReactChatbotProps {
  id: string;
  clientConfig?: NsReactChatClientConfig;
  availableModels?: NsReactChatModelDefinition[];
  defaultModelId?: string;
  title?: string;
  placeholder?: string;
  height?: string;
  customStyle?: React.CSSProperties;
  value?: NsReactChatMessage[];
  structuredOutput?: NsReactStructuredOutput;
  allowHtml?: boolean;
  apiBaseUrl?: string;
  apiToken?: string;

  /** 'inline' renders in-place (default). 'panel' renders as a fixed bottom-of-viewport collapsible panel. */
  variant?: 'inline' | 'panel';
  /** Panel width when variant='panel'. Default '400px'. Use '100%' for full-width. */
  panelWidth?: string;
  /** Whether the panel starts expanded. Default false. */
  defaultExpanded?: boolean;

  /** Transform structured response data into a rich display string (HTML when allowHtml is set) */
  formatStructuredContent?: (
    explanation: string,
    structuredData: unknown
  ) => string;

  /** Simple callback for structured response data (preferred over legacy handleAction) */
  onStructuredResponse?: (data: any) => void;

  /** @deprecated Legacy action-chaining props — use onStructuredResponse instead */
  onResponse?: NsReactActionProps;
  /** @deprecated */
  handleAction?: (props: NsReactHandleActionInputProps) => Promise<any>;
  onChange?: (props: NsReactHandleChangeInputProps) => void;
}

export default function NsReactChatbot(props: NsReactChatbotProps) {
  const isPanel = props.variant === 'panel';
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? !isPanel);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sanitizeHtml = useCallback(
    (html: string): string => {
      if (!props.allowHtml) return html;
      let sanitized = html.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        ''
      );
      sanitized = sanitized.replace(/\s*on\w+\s*=\s*"[^"]*"/gi, '');
      sanitized = sanitized.replace(/\s*on\w+\s*=\s*'[^']*'/gi, '');
      sanitized = sanitized.replace(
        /href\s*=\s*["']javascript:[^"']*["']/gi,
        'href="#"'
      );
      sanitized = sanitized.replace(/\s*style\s*=\s*"[^"]*"/gi, '');
      sanitized = sanitized.replace(/\s*style\s*=\s*'[^']*'/gi, '');
      return sanitized;
    },
    [props.allowHtml]
  );

  const [availableModels] = useState<NsReactChatModelDefinition[]>(() => {
    return props.availableModels ?? DEFAULT_CHAT_MODELS;
  });

  const [messages, setMessages] = useState<NsReactChatMessage[]>(
    props.value || []
  );

  const [selectedModel, setSelectedModel] =
    useState<NsReactChatModelDefinition>(() => {
      if (props.defaultModelId) {
        return (
          availableModels.find(m => m.id === props.defaultModelId) ||
          availableModels[0]
        );
      }
      return availableModels[0];
    });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const dispatchStructuredData = useCallback(
    async (data: any) => {
      if (props.onStructuredResponse) {
        props.onStructuredResponse(data);
      } else if (props.onResponse && props.handleAction) {
        try {
          await props.handleAction({
            actionProps: props.onResponse,
            inputData: data,
          });
        } catch (actionError) {
          console.warn('Failed to execute onResponse action:', actionError);
        }
      }
    },
    [props.onStructuredResponse, props.onResponse, props.handleAction]
  );

  const formatDisplay = useCallback(
    (explanation: string, data: unknown): string => {
      if (props.formatStructuredContent) {
        return props.formatStructuredContent(explanation, data);
      }
      return explanation;
    },
    [props.formatStructuredContent]
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: NsReactChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    if (props.onChange) {
      props.onChange({
        elementId: props.id,
        key: 'value',
        newValue: newMessages,
      });
    }

    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const chatMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      chatMessages.push({ role: 'user', content: userMessage.content });

      const requestMessages: ProxyMessage[] = [];
      if (props.clientConfig?.systemContext) {
        requestMessages.push({
          role: 'system',
          content: props.clientConfig.systemContext,
        });
      }
      requestMessages.push(...chatMessages);

      let displayContent: string;

      if (props.apiBaseUrl && props.apiBaseUrl.length > 0) {
        const apiClient = axios.create({
          baseURL: props.apiBaseUrl,
          headers: props.apiToken
            ? { 'X-SuiteReact-Proxy-Token': props.apiToken }
            : undefined,
        });

        let responseFormat;
        if (props.structuredOutput) {
          const jsonSchema = zodToJsonSchema(props.structuredOutput.schema);
          responseFormat = {
            type: 'json_schema' as const,
            json_schema: {
              name: props.structuredOutput.name,
              strict: true,
              schema: jsonSchema,
            },
          };
        }

        const request: ProxyCompletionRequest = {
          provider: selectedModel.clientType || 'openai',
          model: selectedModel.model,
          messages: requestMessages,
          temperature: props.clientConfig?.defaultTemperature || 0.7,
          max_tokens: props.clientConfig?.defaultMaxTokens || 15000,
          response_format: responseFormat,
        };

        const response = await apiClient.post(
          '/api/handle-llm-request',
          request
        );
        const responseData = response.data;

        if (props.structuredOutput) {
          const content = responseData.choices[0]?.message?.content || '{}';
          try {
            const modifiedSchema = z.object({
              botExplanation: z
                .string()
                .describe(
                  'A friendly explanation of the response for the user'
                ),
              structuredData: props.structuredOutput.schema.describe(
                'The structured data response'
              ),
            });
            const parsed = JSON.parse(content);
            const structuredResponse = modifiedSchema.parse(parsed);
            displayContent = formatDisplay(
              structuredResponse.botExplanation,
              structuredResponse.structuredData
            );
            await dispatchStructuredData(structuredResponse.structuredData);
          } catch {
            // Fallback: LLM may return the raw schema without the wrapper
            try {
              const raw = JSON.parse(content);
              const directParsed = props.structuredOutput.schema.parse(raw);
              const fallbackExplanation =
                (directParsed as any).explanation ||
                'Here is the suggested query.';
              displayContent = formatDisplay(fallbackExplanation, directParsed);
              await dispatchStructuredData(directParsed);
            } catch {
              displayContent = responseData.choices[0]?.message?.content || '';
            }
          }
        } else {
          displayContent = responseData.choices[0]?.message?.content || '';
        }
      } else {
        const currentClient = createNetSuiteProxyClient({
          restletUrl: props.clientConfig?.restletUrl,
          systemContext: props.clientConfig?.systemContext,
          defaultTemperature: props.clientConfig?.defaultTemperature,
          defaultMaxTokens: props.clientConfig?.defaultMaxTokens,
        });

        if (props.structuredOutput) {
          try {
            const modifiedSchema = z.object({
              botExplanation: z
                .string()
                .describe(
                  'A friendly explanation of the response for the user'
                ),
              structuredData: props.structuredOutput.schema.describe(
                'The structured data response'
              ),
            });

            const structuredResponse =
              await currentClient.conversationStructured(
                chatMessages as ProxyMessage[],
                modifiedSchema,
                props.structuredOutput.name,
                {
                  clientType: selectedModel.clientType,
                  model: selectedModel.model,
                }
              );

            displayContent = formatDisplay(
              structuredResponse.botExplanation,
              structuredResponse.structuredData
            );
            await dispatchStructuredData(structuredResponse.structuredData);
          } catch {
            // Fallback: try parsing with the original schema directly
            try {
              const fallbackResponse =
                await currentClient.conversationStructured(
                  chatMessages as ProxyMessage[],
                  props.structuredOutput.schema,
                  props.structuredOutput.name,
                  {
                    clientType: selectedModel.clientType,
                    model: selectedModel.model,
                  }
                );
              const restletFallbackExplanation =
                (fallbackResponse as any).explanation ||
                'Here is the suggested query.';
              displayContent = formatDisplay(
                restletFallbackExplanation,
                fallbackResponse
              );
              await dispatchStructuredData(fallbackResponse);
            } catch {
              displayContent = await currentClient.conversation(
                chatMessages as ProxyMessage[],
                {
                  clientType: selectedModel.clientType,
                  model: selectedModel.model,
                }
              );
            }
          }
        } else {
          displayContent = await currentClient.conversation(
            chatMessages as ProxyMessage[],
            {
              clientType: selectedModel.clientType,
              model: selectedModel.model,
            }
          );
        }
      }

      const assistantMessage: NsReactChatMessage = {
        role: 'assistant',
        content: displayContent,
        timestamp: new Date(),
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);

      if (props.onChange) {
        props.onChange({
          elementId: props.id,
          key: 'value',
          newValue: finalMessages,
        });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      console.error(
        `${selectedModel.clientType.toUpperCase()} API request failed`,
        {
          status: typeof status === 'number' ? status : undefined,
        }
      );
      const responseMessage = err?.response?.data?.error?.message;
      setError(
        (typeof responseMessage === 'string' && responseMessage) ||
          (typeof err?.message === 'string' && err.message) ||
          'An error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    input,
    isLoading,
    messages,
    selectedModel,
    dispatchStructuredData,
    formatDisplay,
    props.structuredOutput,
    props.onChange,
    props.id,
    props.clientConfig,
    props.apiBaseUrl,
    props.apiToken,
  ]);

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    if (props.onChange) {
      props.onChange({ elementId: props.id, key: 'value', newValue: [] });
    }
  };

  const handleModelChange = (event: any) => {
    const model = availableModels.find(
      (m: NsReactChatModelDefinition) => m.id === event.target.value
    );
    if (model) setSelectedModel(model);
  };

  const title = props.title || 'AI Chat Assistant';

  // --- Header ---
  const header = (
    <Box
      onClick={isPanel ? () => setExpanded(prev => !prev) : undefined}
      sx={{
        p: isPanel ? 1.5 : 2,
        borderBottom: expanded ? 1 : 0,
        borderColor: 'divider',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        cursor: isPanel ? 'pointer' : 'default',
        userSelect: isPanel ? 'none' : 'auto',
      }}
    >
      <Typography variant={isPanel ? 'subtitle1' : 'h6'} fontWeight={600}>
        {title}
        {isPanel && !expanded && messages.length > 0 && (
          <Typography
            component="span"
            variant="caption"
            sx={{ ml: 1, color: 'text.secondary' }}
          >
            ({messages.length} messages)
          </Typography>
        )}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {expanded && (
          <>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Model</InputLabel>
              <Select
                value={selectedModel.id}
                onChange={handleModelChange}
                label="Model"
                onClick={e => e.stopPropagation()}
              >
                {availableModels.map(model => (
                  <MenuItem key={model.id} value={model.id}>
                    {model.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              onClick={e => {
                e.stopPropagation();
                clearChat();
              }}
              disabled={messages.length === 0}
            >
              Clear
            </Button>
          </>
        )}
        {isPanel && (
          <IconButton size="small" onClick={() => setExpanded(prev => !prev)}>
            {expanded ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          </IconButton>
        )}
      </Box>
    </Box>
  );

  // --- Messages area ---
  const messagesArea = (
    <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
      {messages.length === 0 && !isLoading && (
        <Box sx={{ textAlign: 'center', color: 'text.secondary', mt: 4 }}>
          <Typography variant="body2">
            Start a conversation with the AI assistant
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1, color: 'primary.main' }}
          >
            Using: {selectedModel.name}
          </Typography>
        </Box>
      )}

      {messages.map((message, index) => (
        <Box
          key={index}
          sx={{
            mb: 2,
            display: 'flex',
            justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
          }}
        >
          <Paper
            elevation={1}
            sx={{
              p: 2,
              maxWidth: '80%',
              bgcolor: message.role === 'user' ? 'primary.main' : 'grey.100',
              color:
                message.role === 'user'
                  ? 'primary.contrastText'
                  : 'text.primary',
            }}
          >
            {props.allowHtml ? (
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  '& p': { margin: 0, marginBottom: 1 },
                  '& p:last-child': { marginBottom: 0 },
                  '& ul, & ol': { marginTop: 0, marginBottom: 1 },
                  '& li': { marginBottom: 0.5 },
                  '& h1, & h2, & h3, & h4, & h5, & h6': {
                    margin: 0,
                    marginBottom: 1,
                    fontSize: 'inherit',
                    fontWeight: 'bold',
                  },
                  '& code': {
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    padding: '2px 4px',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                  },
                  '& pre': {
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    padding: 1,
                    borderRadius: 1,
                    overflow: 'auto',
                    '& code': { backgroundColor: 'transparent', padding: 0 },
                  },
                  '& blockquote': {
                    borderLeft: '4px solid',
                    borderColor: 'primary.main',
                    paddingLeft: 2,
                    margin: 0,
                    marginBottom: 1,
                    fontStyle: 'italic',
                  },
                }}
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(message.content),
                }}
              />
            ) : (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{ opacity: 0.7, mt: 1, display: 'block' }}
            >
              {message.timestamp.toLocaleTimeString()}
            </Typography>
          </Paper>
        </Box>
      ))}

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
          <Paper elevation={1} sx={{ p: 2, bgcolor: 'grey.100' }}>
            <Typography variant="body2">AI is thinking...</Typography>
          </Paper>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>{selectedModel.clientType.toUpperCase()} Error:</strong>{' '}
          {error}
        </Alert>
      )}
      <div ref={messagesEndRef} />
    </Box>
  );

  // --- Input area ---
  const inputArea = (
    <Box sx={{ p: isPanel ? 1.5 : 2, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={props.placeholder || 'Type your message...'}
          disabled={isLoading}
          size="small"
        />
        <Button
          variant="contained"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          sx={{ minWidth: 'auto', px: 2 }}
        >
          <SendIcon />
        </Button>
      </Box>
    </Box>
  );

  // --- Panel variant ---
  if (isPanel) {
    const panelWidth = props.panelWidth || '420px';
    const expandedHeight = props.height || '450px';
    const collapsedHeight = '48px';

    return (
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 0,
          right: 24,
          width: panelWidth,
          height: expanded ? expandedHeight : collapsedHeight,
          zIndex: 1300,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px 12px 0 0',
          overflow: 'hidden',
          transition: 'height 0.3s ease',
          ...props.customStyle,
        }}
      >
        {header}
        {expanded && (
          <>
            {messagesArea}
            {inputArea}
          </>
        )}
      </Paper>
    );
  }

  // --- Inline variant (default) ---
  return (
    <Paper
      elevation={2}
      sx={{
        height: props.height || '400px',
        display: 'flex',
        flexDirection: 'column',
        ...props.customStyle,
      }}
    >
      {header}
      {messagesArea}
      {inputArea}
    </Paper>
  );
}
