import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import HistoryIcon from '@mui/icons-material/History';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import {
  Alert,
  AlertTitle,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import FocusTrap from '@mui/material/Unstable_TrapFocus';
import {
  ColumnsPanelTrigger,
  DataGrid,
  FilterPanelTrigger,
  type GridColDef,
  QuickFilter,
  QuickFilterClear,
  QuickFilterControl,
  Toolbar,
  ToolbarButton,
} from '@mui/x-data-grid';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NsReactChatbot } from 'suitereact';

import {
  DEFAULT_SUITEQL_CHAT_MODEL_ID,
  SUITEQL_CHAT_MODELS,
} from '../config/models';
import { LOCAL_PROXY_BASE_URL, LOCAL_PROXY_TOKEN } from '../config/runtime';
import {
  executeSuiteqlQuery,
  type SuiteqlError,
} from '../domain/actions/clientActions';
import { formatSuiteqlQuery } from '../domain/formatting/formatSuiteqlQuery';
import {
  loadQueryHistory,
  MAX_QUERY_HISTORY_ENTRIES,
  saveQueryHistory,
} from '../domain/history/queryHistoryStorage';
import { SUITEQL_ASSISTANT_SYSTEM_CONTEXT } from '../domain/resources/systemContext';
import {
  buildResultTable,
  cellValue,
  type ResultCell,
  type ResultRow,
  type ResultTable,
  rowKey,
  SUITEQL_ROW_LIMIT,
  tableToCsv,
} from '../domain/results/resultTable';
import {
  type NetSuiteQueryResponse,
  NetSuiteQueryResponseSchema,
} from '../domain/schemas/queryResponseSchema';
import type { QueryHistoryEntry } from '../domain/types';
import { tokens } from './theme';

/**
 * Plain text, not HTML: the chatbot renders text with preserved line breaks,
 * and enabling its HTML mode would also apply it to user and raw model input.
 */
function formatQueryResponse(explanation: string, data: unknown): string {
  const r = data as NetSuiteQueryResponse;
  if (!r?.suggestedQuery) return explanation;

  const fields = (r.expectedFields ?? []).map(
    f => `• ${f.name} (${f.type}) — ${f.description}`
  );
  return [
    explanation,
    r.suggestedQuery,
    `Confidence ${Math.round((r.confidence ?? 0) * 100)}% · ${r.queryType}`,
    ...(fields.length ? [['Expected fields:', ...fields].join('\n')] : []),
  ].join('\n\n');
}

const HISTORY_DRAWER_WIDTH = 360;
const CHAT_DRAWER_DEFAULT_WIDTH = 420;
const CHAT_DRAWER_MIN_WIDTH = 320;
const CHAT_DRAWER_MAX_WIDTH = 720;
const CHAT_DRAWER_KEYBOARD_STEP = 24;
const INITIAL_QUERY =
  'SELECT id, companyname, email FROM customer WHERE ROWNUM <= 25';

function clampChatDrawerWidth(width: number): number {
  return Math.min(
    CHAT_DRAWER_MAX_WIDTH,
    Math.max(CHAT_DRAWER_MIN_WIDTH, width)
  );
}

const ERROR_HINTS: Record<string, string> = {
  UNEXPECTED_ERROR:
    'This usually means the query references a field, table, or alias that NetSuite cannot resolve. Double-check column/table names and aliases.',
  SSS_SEARCH_ERROR_OCCURRED:
    'Check that all identifiers (table aliases, field names) are valid and properly qualified.',
  INSUFFICIENT_PERMISSION:
    'Your role may not have access to the record type or fields in this query.',
  SSS_USAGE_LIMIT_EXCEEDED:
    'The query consumed too many governance units. Try narrowing the result set with WHERE clauses or ROWNUM limits.',
  INVALID_SEARCH:
    'The query structure is invalid. Verify JOIN conditions and subquery syntax.',
};

type LastRun = {
  id: number;
  query: string;
  table: ResultTable;
  elapsedMs: number;
};

type RunError = SuiteqlError & { query: string };

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function buildManualQueryTitle(query: string): string {
  const tableMatch = query.match(/\bfrom\s+([\w.]+)/i);
  if (!tableMatch) return 'Manual SuiteQL query';

  const tableName = tableMatch[1]
    .split('.')
    .pop()
    ?.replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());

  return tableName ? `${tableName} query` : 'Manual SuiteQL query';
}

function rowCountLabel(count: number): string {
  return count >= SUITEQL_ROW_LIMIT
    ? `${SUITEQL_ROW_LIMIT.toLocaleString()}+ rows`
    : plural(count, 'row');
}

function downloadCsv(table: ResultTable): void {
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', '-')
    .replace(/:/g, '');
  const blob = new Blob([tableToCsv(table)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `suiteql-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function GridToolbar() {
  return (
    <Toolbar>
      <QuickFilter defaultExpanded style={{ flex: '1 1 200px', maxWidth: 300 }}>
        <QuickFilterControl
          render={({ ref, ...other }) => (
            <TextField
              {...other}
              inputRef={ref}
              placeholder="Search results"
              size="small"
              fullWidth
              slotProps={{
                ...other.slotProps,
                htmlInput: {
                  'aria-label': 'Search results',
                  ...other.slotProps?.htmlInput,
                },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: other.value ? (
                    <InputAdornment position="end">
                      <QuickFilterClear
                        render={
                          <IconButton size="small" aria-label="Clear search" />
                        }
                      >
                        <CloseIcon fontSize="small" />
                      </QuickFilterClear>
                    </InputAdornment>
                  ) : null,
                  ...other.slotProps?.input,
                },
              }}
            />
          )}
        />
      </QuickFilter>
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Columns">
        <ColumnsPanelTrigger render={<ToolbarButton aria-label="Columns" />}>
          <ViewColumnOutlinedIcon fontSize="small" />
        </ColumnsPanelTrigger>
      </Tooltip>
      <Tooltip title="Filters">
        <FilterPanelTrigger render={<ToolbarButton aria-label="Filters" />}>
          <FilterListIcon fontSize="small" />
        </FilterPanelTrigger>
      </Tooltip>
    </Toolbar>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 8,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Typography variant="subtitle1">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440 }}>
        {body}
      </Typography>
      {action}
    </Box>
  );
}

export default function App() {
  const muiTheme = useTheme();
  const narrow = useMediaQuery(muiTheme.breakpoints.down('md'), {
    noSsr: true,
  });

  const [queryText, setQueryText] = useState(() =>
    formatSuiteqlQuery(INITIAL_QUERY)
  );
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<QueryHistoryEntry[]>(loadQueryHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => !narrow);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // The narrow overlay takes focus once its panel is visible (the drawer slides
  // in), unless focus is already inside, so keyboard users land in the dialog.
  useEffect(() => {
    if (!narrow || !chatOpen) return;
    let frame = 0;
    const focusPanel = () => {
      const panel = chatPanelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      if (getComputedStyle(panel).visibility === 'hidden') {
        frame = requestAnimationFrame(focusPanel);
        return;
      }
      panel.focus();
    };
    frame = requestAnimationFrame(focusPanel);
    return () => cancelAnimationFrame(frame);
  }, [narrow, chatOpen]);
  const [chatDrawerWidth, setChatDrawerWidth] = useState(
    CHAT_DRAWER_DEFAULT_WIDTH
  );
  const [isChatResizing, setIsChatResizing] = useState(false);
  const [assistantNote, setAssistantNote] = useState<{
    query: string;
    explanation: string;
  } | null>(null);
  const [assistantProblem, setAssistantProblem] = useState<string | null>(null);
  const [errorDetailOpen, setErrorDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const runSeqRef = useRef(0);
  const chatResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const chatDocked = chatOpen && !narrow;

  useEffect(() => {
    saveQueryHistory(history);
  }, [history]);

  const runQuery = useCallback(async (text: string, historyTitle?: string) => {
    const formattedQuery = formatSuiteqlQuery(text);
    setQueryText(formattedQuery);
    if (!formattedQuery.trim()) return;
    const seq = ++runSeqRef.current;
    setRunning(true);
    setRunError(null);
    setErrorDetailOpen(false);
    const started = performance.now();
    let outcome: Awaited<ReturnType<typeof executeSuiteqlQuery>>;
    try {
      outcome = await executeSuiteqlQuery(formattedQuery);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      outcome = {
        ok: false,
        error: {
          message: raw.includes('Empty response')
            ? 'No response from the server. Is the local proxy running?'
            : raw,
        },
      };
    }
    // A newer run owns the screen; drop this one's result.
    if (seq !== runSeqRef.current) return;
    setRunning(false);

    if (!outcome.ok) {
      setRunError({ ...outcome.error, query: formattedQuery });
      setLastRun(null);
      return;
    }

    const table = buildResultTable(
      outcome.data.headers,
      outcome.data.rows as Record<string, unknown>[]
    );
    setLastRun({
      id: seq,
      query: formattedQuery,
      table,
      elapsedMs: performance.now() - started,
    });

    const entry: QueryHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: historyTitle?.trim() || buildManualQueryTitle(formattedQuery),
      query: formattedQuery,
      timestamp: Date.now(),
      resultCount: table.rows.length,
    };
    setHistory(prev =>
      [entry, ...prev.filter(h => h.query !== entry.query)].slice(
        0,
        MAX_QUERY_HISTORY_ENTRIES
      )
    );
  }, []);

  const runCurrent = useCallback(
    () => void runQuery(queryText),
    [queryText, runQuery]
  );

  const handleStructuredResponse = useCallback(
    (data: unknown) => {
      const parsed = NetSuiteQueryResponseSchema.safeParse(data);
      if (!parsed.success) {
        setAssistantProblem(
          "The assistant's reply didn't include a usable query. Try rephrasing the request."
        );
        return;
      }
      const r = parsed.data;
      const query = formatSuiteqlQuery(r.suggestedQuery);
      setAssistantProblem(null);
      setAssistantNote({ query, explanation: r.explanation });
      if (narrow) setChatOpen(false);
      void runQuery(query, r.historyTitle);
    },
    [narrow, runQuery]
  );

  const selectHistoryEntry = useCallback((entry: QueryHistoryEntry) => {
    setQueryText(formatSuiteqlQuery(entry.query));
    setHistoryOpen(false);
  }, []);

  const removeHistoryEntry = useCallback((entry: QueryHistoryEntry) => {
    setHistory(previous => previous.filter(item => item.id !== entry.id));
  }, []);

  const handleCopyQuery = useCallback(() => {
    void navigator.clipboard.writeText(queryText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [queryText]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runCurrent();
      }
    },
    [runCurrent]
  );

  const handleChatResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      chatResizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: chatDrawerWidth,
      };
      setIsChatResizing(true);
    },
    [chatDrawerWidth]
  );

  const handleChatResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = chatResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      const nextWidth = resize.startWidth + resize.startX - event.clientX;
      setChatDrawerWidth(clampChatDrawerWidth(nextWidth));
    },
    []
  );

  const handleChatResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = chatResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      chatResizeRef.current = null;
      setIsChatResizing(false);
    },
    []
  );

  const handleChatResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let nextWidth = chatDrawerWidth;
      if (event.key === 'ArrowLeft') nextWidth += CHAT_DRAWER_KEYBOARD_STEP;
      else if (event.key === 'ArrowRight')
        nextWidth -= CHAT_DRAWER_KEYBOARD_STEP;
      else if (event.key === 'Home') nextWidth = CHAT_DRAWER_MIN_WIDTH;
      else if (event.key === 'End') nextWidth = CHAT_DRAWER_MAX_WIDTH;
      else return;
      event.preventDefault();
      setChatDrawerWidth(clampChatDrawerWidth(nextWidth));
    },
    [chatDrawerWidth]
  );

  const columns = useMemo<GridColDef<ResultRow>[]>(
    () =>
      (lastRun?.table.columns ?? []).map(column => ({
        field: column.field,
        headerName: column.field,
        minWidth: 72,
        maxWidth: 560,
        type:
          column.kind === 'number'
            ? 'number'
            : column.kind === 'date'
              ? 'date'
              : 'string',
        align: column.kind === 'number' ? 'right' : 'left',
        headerAlign: column.kind === 'number' ? 'right' : 'left',
        valueGetter: (value: ResultCell) => cellValue(column.kind, value),
        valueFormatter: (_value: unknown, row: ResultRow) => {
          const raw = row[column.field];
          return raw === null ? '' : String(raw);
        },
      })),
    [lastRun]
  );

  // Formatting normalizes layout but keeps string literals byte-for-byte.
  const formattedEditorQuery = useMemo(
    () => formatSuiteqlQuery(queryText),
    [queryText]
  );
  const edited = !!lastRun && formattedEditorQuery !== lastRun.query;
  const capped = !!lastRun && lastRun.table.rows.length >= SUITEQL_ROW_LIMIT;
  const showAssistantNote =
    !!assistantNote && formattedEditorQuery === assistantNote.query;
  const hint = runError?.code ? ERROR_HINTS[runError.code] : undefined;

  let summary: string;
  if (running) summary = 'Running query…';
  else if (lastRun)
    summary = [
      rowCountLabel(lastRun.table.rows.length),
      plural(lastRun.table.columns.length, 'column'),
      formatElapsed(lastRun.elapsedMs),
    ].join(' · ');
  else if (runError) summary = 'Last run failed';
  else summary = 'Not run yet';

  const chatPanel = (
    <Box
      data-testid="ai-assistant-panel"
      ref={chatPanelRef}
      tabIndex={-1}
      sx={{
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      {!narrow && (
        <Box
          role="separator"
          aria-label="resize AI assistant"
          aria-orientation="vertical"
          aria-valuemin={CHAT_DRAWER_MIN_WIDTH}
          aria-valuemax={CHAT_DRAWER_MAX_WIDTH}
          aria-valuenow={chatDrawerWidth}
          tabIndex={0}
          data-testid="ai-assistant-resize-handle"
          onPointerDown={handleChatResizeStart}
          onPointerMove={handleChatResizeMove}
          onPointerUp={handleChatResizeEnd}
          onPointerCancel={handleChatResizeEnd}
          onKeyDown={handleChatResizeKeyDown}
          sx={{
            position: 'absolute',
            inset: '0 auto 0 -4px',
            width: 8,
            zIndex: 2,
            cursor: 'col-resize',
            touchAction: 'none',
            outline: 'none',
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: '0 auto 0 3px',
              width: 2,
              bgcolor: 'primary.main',
              opacity: isChatResizing ? 1 : 0,
              transition: muiTheme.transitions.create('opacity'),
            },
            '&:hover::after, &:focus-visible::after': { opacity: 1 },
          }}
        />
      )}
      {narrow && (
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            px: 1.5,
            py: 0.75,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: tokens.surfaceMuted,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            Describe the data; the assistant writes and runs the SuiteQL.
          </Typography>
          <IconButton
            size="small"
            aria-label="Close assistant"
            onClick={() => setChatOpen(false)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <NsReactChatbot
          id="suiteql-bot-chat"
          variant="inline"
          title="Assistant"
          placeholder="e.g. Show open sales orders from this month with customer name…"
          height="100%"
          defaultExpanded
          availableModels={SUITEQL_CHAT_MODELS}
          defaultModelId={DEFAULT_SUITEQL_CHAT_MODEL_ID}
          apiBaseUrl={LOCAL_PROXY_BASE_URL}
          apiToken={LOCAL_PROXY_TOKEN}
          clientConfig={{
            systemContext: SUITEQL_ASSISTANT_SYSTEM_CONTEXT,
            defaultTemperature: 0.3,
            defaultMaxTokens: 8192,
          }}
          structuredOutput={{
            name: 'NetSuiteQueryResponse',
            schema: NetSuiteQueryResponseSchema,
          }}
          onStructuredResponse={handleStructuredResponse}
          formatStructuredContent={formatQueryResponse}
          customStyle={{
            height: '100%',
            borderRadius: 0,
            boxShadow: 'none',
          }}
        />
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        mr: chatDocked ? `${chatDrawerWidth}px` : 0,
        transition: isChatResizing
          ? 'none'
          : 'margin-right 225ms cubic-bezier(0, 0, 0.2, 1)',
      }}
    >
      <Box
        component="header"
        sx={{
          px: { xs: 2, md: 3 },
          py: 1.25,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: muiTheme.zIndex.appBar,
        }}
      >
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'grid',
              placeItems: 'center',
              flex: '0 0 auto',
            }}
          >
            <TerminalIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" component="h1" lineHeight={1.2}>
              SuiteQL Bot
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              component="p"
            >
              Write SuiteQL or ask for it, then run it against NetSuite
            </Typography>
          </Box>
          <Button
            size="small"
            color="inherit"
            startIcon={<HistoryIcon fontSize="small" />}
            onClick={() => setHistoryOpen(true)}
            aria-label="open query history"
          >
            History
          </Button>
          <Button
            size="small"
            color={chatOpen ? 'primary' : 'inherit'}
            variant={chatOpen ? 'outlined' : 'text'}
            startIcon={<SmartToyOutlinedIcon fontSize="small" />}
            onClick={() => setChatOpen(open => !open)}
            aria-pressed={chatOpen}
            aria-label="AI assistant"
          >
            Assistant
          </Button>
        </Stack>
      </Box>

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 1.5, md: 3 },
          py: 2,
          gap: 1.5,
          minWidth: 0,
        }}
      >
        <Paper sx={{ overflow: 'hidden' }}>
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            sx={{
              px: 1.5,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: tokens.surfaceMuted,
            }}
          >
            <Typography variant="subtitle2" component="h2">
              Query
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              ⌘/Ctrl + Enter to run
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title={copied ? 'Copied' : 'Copy query'}>
              <IconButton
                size="small"
                aria-label="Copy query"
                onClick={handleCopyQuery}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              size="small"
              onClick={runCurrent}
              disabled={running || !queryText.trim()}
              startIcon={
                running ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <PlayArrowIcon fontSize="small" />
                )
              }
            >
              {running ? 'Running…' : 'Run query'}
            </Button>
          </Stack>
          <TextField
            fullWidth
            multiline
            minRows={5}
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            onBlur={() => setQueryText(current => formatSuiteqlQuery(current))}
            onKeyDown={handleKeyDown}
            placeholder="SELECT ... FROM ... WHERE ..."
            slotProps={{
              htmlInput: { 'aria-label': 'SuiteQL query', spellCheck: false },
              input: {
                sx: {
                  fontFamily: tokens.mono,
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                  borderRadius: 0,
                  '& fieldset': { border: 'none' },
                  '& textarea': {
                    resize: 'vertical',
                    overflow: 'auto !important',
                  },
                },
              },
            }}
          />
          {showAssistantNote && (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: tokens.selected,
              }}
            >
              <Typography variant="body2">
                <Box component="span" sx={{ fontWeight: 700 }}>
                  From the assistant:{' '}
                </Box>
                {assistantNote.explanation}
              </Typography>
            </Box>
          )}
        </Paper>

        {assistantProblem && (
          <Alert
            severity="warning"
            onClose={() => setAssistantProblem(null)}
            sx={{ border: 1, borderColor: 'divider' }}
          >
            {assistantProblem}
          </Alert>
        )}

        {runError && (
          <Alert
            severity="error"
            onClose={() => setRunError(null)}
            sx={{ border: 1, borderColor: 'divider' }}
          >
            <AlertTitle sx={{ fontWeight: 700 }}>
              {runError.code
                ? `Query failed · ${runError.code}`
                : 'Query failed'}
            </AlertTitle>
            <Typography variant="body2">{runError.message}</Typography>
            {hint && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {hint}
              </Typography>
            )}
            {runError.detail && runError.detail !== runError.message && (
              <>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => setErrorDetailOpen(open => !open)}
                  sx={{ mt: 0.5, ml: -0.75, px: 0.75 }}
                  aria-expanded={errorDetailOpen}
                >
                  {errorDetailOpen ? 'Hide details' : 'Show details'}
                </Button>
                {errorDetailOpen && (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      mt: 0.5,
                      p: 1,
                      borderRadius: 1,
                      bgcolor: 'background.paper',
                      fontFamily: tokens.mono,
                      fontSize: '0.75rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {runError.detail}
                  </Box>
                )}
              </>
            )}
          </Alert>
        )}

        {capped && !running && (
          <Alert severity="warning" sx={{ border: 1, borderColor: 'divider' }}>
            <strong>
              NetSuite returned its limit of{' '}
              {SUITEQL_ROW_LIMIT.toLocaleString()} rows.
            </strong>{' '}
            More rows may match. Add a WHERE clause, aggregate, or page with
            ROWNUM to see the rest; export and history include only these rows.
          </Alert>
        )}

        <Paper
          sx={{
            flex: 1,
            minHeight: 420,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            flexWrap="wrap"
            sx={{
              px: 1.5,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: tokens.surfaceMuted,
            }}
          >
            <Typography variant="subtitle2" component="h2">
              Results
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              role="status"
              data-testid="results-summary"
            >
              {summary}
            </Typography>
            {edited && !running && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Edits not run"
              />
            )}
            <Box sx={{ flex: 1 }} />
            {edited && !running && (
              <Button size="small" onClick={runCurrent}>
                Run edited query
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
              onClick={() => lastRun && downloadCsv(lastRun.table)}
              disabled={running || !lastRun?.table.rows.length}
            >
              Export CSV
            </Button>
          </Stack>

          {lastRun && lastRun.table.rows.length > 0 ? (
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <DataGrid
                key={lastRun.id}
                autosizeOnMount
                autosizeOptions={{
                  includeHeaders: true,
                  includeOutliers: true,
                  expand: true,
                }}
                rows={lastRun.table.rows}
                columns={columns}
                getRowId={rowKey}
                loading={running}
                showToolbar
                slots={{ toolbar: GridToolbar }}
                slotProps={{
                  loadingOverlay: {
                    variant: 'linear-progress',
                    noRowsVariant: 'linear-progress',
                  },
                }}
                pagination
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 50 } },
                }}
                density="compact"
                disableRowSelectionOnClick
                sx={{
                  position: 'absolute',
                  inset: 0,
                  border: 'none',
                  '& .MuiDataGrid-toolbar': { flex: '0 0 auto' },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontFamily: tokens.mono,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  },
                  '& .MuiDataGrid-cell': { fontSize: '0.8125rem' },
                }}
              />
            </Box>
          ) : running ? (
            <EmptyState
              title="Running query…"
              body="Results appear here when NetSuite responds."
            />
          ) : lastRun ? (
            <EmptyState
              title="The query returned no rows"
              body={`It ran in ${formatElapsed(lastRun.elapsedMs)}. Loosen the WHERE clause or check the record type.`}
            />
          ) : runError ? (
            <EmptyState
              title="No results"
              body="The last run failed. Fix the query above and run it again."
            />
          ) : (
            <EmptyState
              title="Run a query to see results"
              body={
                <>
                  Write SuiteQL above and press <strong>Run query</strong>, or
                  describe what you need to the assistant.
                </>
              }
              action={
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrowIcon fontSize="small" />}
                  onClick={runCurrent}
                  disabled={!queryText.trim()}
                  sx={{ mt: 1 }}
                >
                  Run query
                </Button>
              }
            />
          )}
        </Paper>
      </Box>

      <Drawer
        anchor="left"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: HISTORY_DRAWER_WIDTH } },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" component="h2">
              Query history
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {history.length.toLocaleString()}{' '}
              {history.length === 1 ? 'query' : 'queries'} · saved in this
              browser
            </Typography>
          </Box>
          <IconButton
            size="small"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        {history.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Queries you run appear here.
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ px: 1 }}>
            {history.map(entry => (
              <ListItemButton
                key={entry.id}
                data-testid="history-entry"
                onClick={() => selectHistoryEntry(entry)}
                sx={{ borderRadius: 1, mb: 0.25, alignItems: 'flex-start' }}
              >
                <ListItemText
                  disableTypography
                  primary={
                    <Typography
                      variant="body2"
                      noWrap
                      title={entry.title}
                      data-testid="history-title"
                      fontWeight={650}
                    >
                      {entry.title}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ mt: 0.25 }}>
                      <Typography
                        variant="caption"
                        component="div"
                        noWrap
                        title={entry.query}
                        data-testid="history-query"
                        color="text.secondary"
                        sx={{ fontFamily: tokens.mono, fontSize: '0.7rem' }}
                      >
                        {entry.query}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {rowCountLabel(entry.resultCount)} ·{' '}
                        {timeAgo(entry.timestamp)}
                      </Typography>
                    </Box>
                  }
                />
                <Tooltip title="Remove from history">
                  <IconButton
                    size="small"
                    aria-label={`remove ${entry.title} from query history`}
                    onClick={event => {
                      event.stopPropagation();
                      removeHistoryEntry(entry);
                    }}
                    sx={{ ml: 1, flex: '0 0 auto' }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        )}
      </Drawer>

      {narrow && chatOpen && (
        <Backdrop
          open
          onClick={() => setChatOpen(false)}
          sx={{ zIndex: theme => theme.zIndex.modal - 1 }}
        />
      )}
      {/* One drawer at every width so the chatbot keeps its conversation across the breakpoint. */}
      <Drawer
        anchor="right"
        variant="persistent"
        open={chatOpen}
        PaperProps={{
          role: narrow ? 'dialog' : undefined,
          'aria-label': narrow ? 'Assistant' : undefined,
          onKeyDown: narrow
            ? (event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Escape') setChatOpen(false);
              }
            : undefined,
          sx: narrow
            ? {
                width: '100%',
                maxWidth: 480,
                zIndex: theme => theme.zIndex.modal,
              }
            : {
                width: chatDrawerWidth,
                borderLeft: 1,
                borderColor: 'divider',
                transition: isChatResizing
                  ? 'none'
                  : muiTheme.transitions.create('width', {
                      duration: muiTheme.transitions.duration.shorter,
                    }),
              },
        }}
      >
        {/* Narrow overlay keeps Tab inside and restores focus on close. */}
        <FocusTrap open={narrow && chatOpen} disableAutoFocus>
          {chatPanel}
        </FocusTrap>
      </Drawer>
    </Box>
  );
}
