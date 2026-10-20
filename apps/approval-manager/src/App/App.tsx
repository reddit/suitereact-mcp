import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  DataGrid,
  ExportCsv,
  type GridColumnVisibilityModel,
  gridFilteredSortedRowIdsSelector,
  type GridRowId,
  type GridRowSelectionModel,
  QuickFilter,
  QuickFilterClear,
  QuickFilterControl,
  Toolbar,
  ToolbarButton,
  useGridApiRef,
} from '@mui/x-data-grid';
import dayjs from 'dayjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useToastHelpers } from 'suitereact';

import {
  approveTransaction,
  fetchDebitTotals,
  fetchPendingApprovals,
  fetchPendingCount,
  fetchRecordUrlTemplates,
} from '../domain/actions/clientActions';
import { formatTotals, plural } from '../domain/format';
import {
  type ApprovalOutcome,
  type ApprovedEntry,
  PAGE_SIZE,
  type PendingTransaction,
  TRANSACTION_TYPES,
  type TransactionTypeOption,
} from '../domain/types';
import ApproveDialog from '../domain/views/ApproveDialog';
import { buildColumns } from '../domain/views/columns';
import SessionLog from '../domain/views/SessionLog';
import { tokens } from './theme';

const MAX_PAGES = 200;
const EXPORT_FIELDS = [
  'tranid',
  'trandate',
  'entity',
  'memo',
  'amount',
  'currency',
];
const CONCURRENCY = 5;
const EMPTY_SELECTION: GridRowSelectionModel = {
  type: 'include',
  ids: new Set<GridRowId>(),
};

interface Queue {
  status: 'loading' | 'ready' | 'error';
  rows: PendingTransaction[];
  total: number | null;
  error?: string;
  loadedAt?: number;
}
const initialQueue: Queue = { status: 'loading', rows: [], total: null };

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.includes('Empty response')
    ? 'No response from NetSuite. Check the connection and try again.'
    : raw;
}

/** Toolbar data flows through context so the grid toolbar keeps a stable identity. */
const ToolbarContext = createContext<{
  type: TransactionTypeOption;
  rows: PendingTransaction[];
  selected: PendingTransaction[];
  onApprove: () => void;
  onClear: () => void;
  narrow: boolean;
} | null>(null);

function QueueToolbar() {
  const context = useContext(ToolbarContext);
  if (!context) return null;
  const { type, rows, selected, onApprove, onClear, narrow } = context;
  const count = selected.length;
  return (
    <Toolbar className={count ? 'has-selection' : undefined}>
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }} role="status">
        {count ? (
          <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
            <Typography fontWeight={700} fontSize={14}>
              {count.toLocaleString()} selected
            </Typography>
            <Typography
              fontSize={13}
              color="text.secondary"
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTotals(selected)}
            </Typography>
          </Stack>
        ) : (
          <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
            <Typography fontWeight={700} fontSize={14}>
              {plural(rows.length, type.singular, type.label)} pending
            </Typography>
            {rows.length > 0 && (
              <Typography
                fontSize={13}
                color="text.secondary"
                noWrap
                sx={{ fontVariantNumeric: 'tabular-nums', maxWidth: 520 }}
                title={formatTotals(rows)}
              >
                {formatTotals(rows)}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      {count > 0 && (
        <Stack direction="row" gap={1} alignItems="center">
          <Button size="small" color="inherit" onClick={onClear}>
            Clear
          </Button>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={onApprove}
            aria-label={`Approve ${count} selected`}
          >
            Approve {count.toLocaleString()}
          </Button>
        </Stack>
      )}
      <QuickFilter
        defaultExpanded
        style={{ flex: narrow ? '1 1 200px' : '0 1 260px' }}
      >
        <QuickFilterControl
          render={({ ref, ...other }) => (
            <TextField
              {...other}
              inputRef={ref}
              placeholder="Search this queue"
              size="small"
              fullWidth
              slotProps={{
                ...other.slotProps,
                htmlInput: {
                  'aria-label': 'Search this queue',
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
                        size="small"
                        aria-label="Clear search"
                      />
                    </InputAdornment>
                  ) : null,
                  ...other.slotProps?.input,
                },
              }}
            />
          )}
        />
      </QuickFilter>
      <Tooltip title="Export visible rows (CSV)">
        <ExportCsv
          render={<ToolbarButton aria-label="Export visible rows (CSV)" />}
          options={{
            fileName: `approval-manager_${type.id}_${dayjs().format('YYYY-MM-DD_HHmm')}`,
            // Amounts are exported as plain numbers, so the currency travels in its own column.
            fields: EXPORT_FIELDS,
            // Export what the queue shows (search + sort), never just the selection.
            getRowsToExport: ({ apiRef }) =>
              gridFilteredSortedRowIdsSelector(apiRef),
          }}
        >
          <FileDownloadIcon fontSize="small" />
        </ExportCsv>
      </Tooltip>
    </Toolbar>
  );
}

function QueueState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      spacing={1}
      sx={{ flex: 1, px: 3, py: 8 }}
    >
      {icon}
      <Typography fontWeight={700} fontSize={16}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {body}
      </Typography>
      {action}
    </Stack>
  );
}

export default function App() {
  const { showSuccess } = useToastHelpers();
  const narrow = useMediaQuery(useTheme().breakpoints.down('md'));
  const apiRef = useGridApiRef();

  const [typeId, setTypeId] = useState(TRANSACTION_TYPES[0].id);
  const type = TRANSACTION_TYPES.find(t => t.id === typeId)!;
  const [queues, setQueues] = useState<Record<string, Queue>>({});
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const requestedTemplates = useRef(new Set<string>());
  const generations = useRef<Record<string, number>>({});
  // Last fully loaded rows per queue, restored if a later refresh fails part-way.
  const snapshots = useRef<Record<string, PendingTransaction[] | undefined>>(
    {}
  );
  const approvedIds = useRef(new Set<string>());

  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [selectedRows, setSelectedRows] = useState<PendingTransaction[]>([]);
  const [confirming, setConfirming] = useState<PendingTransaction[] | null>(
    null
  );
  const [approvedLog, setApprovedLog] = useState<ApprovedEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  const queue = queues[typeId] ?? initialQueue;
  const patchQueue = useCallback(
    (id: string, patch: Partial<Queue>) =>
      setQueues(previous => ({
        ...previous,
        [id]: { ...(previous[id] ?? initialQueue), ...patch },
      })),
    []
  );

  const resolveTemplates = useCallback(async (rows: PendingTransaction[]) => {
    const needed = [...new Set(rows.map(row => row.recordtype))].filter(
      recordType => recordType && !requestedTemplates.current.has(recordType)
    );
    if (!needed.length) return;
    needed.forEach(recordType => requestedTemplates.current.add(recordType));
    try {
      const resolved = await fetchRecordUrlTemplates(needed);
      setTemplates(previous => ({ ...previous, ...resolved }));
    } catch {
      needed.forEach(recordType =>
        requestedTemplates.current.delete(recordType)
      );
    }
  }, []);

  const patchRows = useCallback(
    (
      id: string,
      update: (row: PendingTransaction) => PendingTransaction | undefined
    ) =>
      setQueues(previous => {
        const current = previous[id];
        if (!current) return previous;
        return {
          ...previous,
          [id]: {
            ...current,
            rows: current.rows.map(row => update(row) ?? row),
          },
        };
      }),
    []
  );

  // Header totals are empty for journals; sum their lines separately so a slow
  // or failed amount lookup never blocks the queue itself.
  const fillAmounts = useCallback(
    (queueId: string, rows: PendingTransaction[], current: () => boolean) => {
      const ids = new Set(
        rows.filter(row => row.amount == null).map(row => row.id)
      );
      if (!ids.size) return;
      patchRows(queueId, row =>
        ids.has(row.id) ? { ...row, amountStatus: 'loading' } : undefined
      );
      fetchDebitTotals([...ids])
        .then(totals => {
          if (!current()) return;
          patchRows(queueId, row =>
            ids.has(row.id)
              ? row.id in totals
                ? { ...row, amount: totals[row.id], amountStatus: undefined }
                : { ...row, amountStatus: 'unavailable' }
              : undefined
          );
        })
        .catch(() => {
          if (!current()) return;
          patchRows(queueId, row =>
            ids.has(row.id)
              ? { ...row, amountStatus: 'unavailable' }
              : undefined
          );
        });
    },
    [patchRows]
  );

  // Each queue has its own generation so refreshing one never cancels another.
  const loadQueue = useCallback(
    async (target: TransactionTypeOption) => {
      const generation = (generations.current[target.id] ?? 0) + 1;
      generations.current[target.id] = generation;
      const current = () => generations.current[target.id] === generation;
      setQueues(previous => {
        const queueState = previous[target.id] ?? initialQueue;
        // Keep an earlier snapshot through retries after a failed refresh.
        if (queueState.status === 'ready')
          snapshots.current[target.id] = queueState.rows;
        return {
          ...previous,
          [target.id]: { ...queueState, status: 'loading', error: undefined },
        };
      });
      fetchPendingCount(target)
        .then(total => current() && patchQueue(target.id, { total }))
        .catch(() => undefined);
      try {
        let rows: PendingTransaction[] = [];
        let after: number | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const result = await fetchPendingApprovals(target, after);
          if (!current()) return;
          void resolveTemplates(result.rows);
          // A response read before an approval finished can still list that
          // transaction; never reinsert anything approved in this session.
          const pageRows = result.rows.filter(
            row => !approvedIds.current.has(row.id)
          );
          rows = page === 0 ? pageRows : [...rows, ...pageRows];
          // Append to state rather than replacing it so amounts already filled for earlier pages survive.
          setQueues(previous => {
            const queueState = previous[target.id] ?? initialQueue;
            return {
              ...previous,
              [target.id]: {
                ...queueState,
                rows: page === 0 ? pageRows : [...queueState.rows, ...pageRows],
              },
            };
          });
          fillAmounts(target.id, pageRows, current);
          if (result.rows.length < PAGE_SIZE) break;
          const last = Number(result.rows[result.rows.length - 1]?.id);
          if (!Number.isFinite(last) || (after !== undefined && last <= after))
            break;
          after = last;
        }
        patchQueue(target.id, {
          status: 'ready',
          total: rows.length,
          loadedAt: Date.now(),
        });
      } catch (error) {
        if (!current()) return;
        // Never leave a partial page set approvable: fall back to the last
        // complete load (minus anything approved since), or to the error state.
        const restored = (snapshots.current[target.id] ?? []).filter(
          row => !approvedIds.current.has(row.id)
        );
        patchQueue(target.id, {
          status: 'error',
          error: friendlyError(error),
          rows: restored,
        });
        // The refresh cancelled any amount lookup still running for these rows.
        fillAmounts(target.id, restored, current);
      }
    },
    [patchQueue, resolveTemplates, fillAmounts]
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    TRANSACTION_TYPES.forEach(target => void loadQueue(target));
  }, [loadQueue]);

  // Resolve selection through the grid so "select all" (an exclude model) is counted correctly.
  useEffect(() => {
    const api = apiRef.current;
    setSelectedRows(
      api && queue.rows.length
        ? ([...api.getSelectedRows().values()] as PendingTransaction[])
        : []
    );
  }, [apiRef, selection, queue.rows]);

  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);
  const changeType = (id: string) => {
    setTypeId(id);
    clearSelection();
  };
  const refresh = () => {
    clearSelection();
    void loadQueue(type);
  };

  const runApprovals = useCallback(
    async (
      rows: PendingTransaction[],
      onProgress: (done: number) => void
    ): Promise<ApprovalOutcome> => {
      const outcome: ApprovalOutcome = { approved: [], failed: [] };
      const pending = [...rows];
      let done = 0;
      const worker = async () => {
        for (let row = pending.shift(); row; row = pending.shift()) {
          try {
            await approveTransaction(row.id, row.recordtype);
            outcome.approved.push(row);
          } catch (error) {
            outcome.failed.push({ row, message: friendlyError(error) });
          } finally {
            onProgress(++done);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker)
      );
      return outcome;
    },
    []
  );

  const finishApprovals = useCallback(
    (outcome: ApprovalOutcome) => {
      const justApproved = new Set(outcome.approved.map(row => row.id));
      justApproved.forEach(id => approvedIds.current.add(id));
      if (justApproved.size) {
        setQueues(previous => {
          const current = previous[typeId] ?? initialQueue;
          const rows = current.rows.filter(row => !justApproved.has(row.id));
          return {
            ...previous,
            [typeId]: { ...current, rows, total: rows.length },
          };
        });
        const now = Date.now();
        setApprovedLog(previous => [
          ...outcome.approved.map(row => ({
            id: row.id,
            tranid: row.tranid || `#${row.id}`,
            type: type.singular,
            recordtype: row.recordtype,
            entity: row.entity,
            amount: row.amount,
            currency: row.currency,
            approvedAt: now,
          })),
          ...previous,
        ]);
        showSuccess(
          `${plural(justApproved.size, type.singular, type.label)} approved`,
          3000
        );
      }
      setSelection({
        type: 'include',
        ids: new Set(outcome.failed.map(failure => failure.row.id)),
      });
      setConfirming(null);
    },
    [showSuccess, type, typeId]
  );

  const columns = useMemo(
    () => buildColumns(templates, narrow),
    [templates, narrow]
  );
  const columnVisibilityModel = useMemo<GridColumnVisibilityModel>(
    () => ({
      entity: type.hasEntity && !narrow,
      memo: !narrow,
      trandate: !narrow,
      currency: false,
    }),
    [narrow, type.hasEntity]
  );
  const toolbarValue = useMemo(
    () => ({
      type,
      rows: queue.rows,
      selected: selectedRows,
      onApprove: () => setConfirming(selectedRows),
      onClear: clearSelection,
      narrow,
    }),
    [type, queue.rows, selectedRows, clearSelection, narrow]
  );

  const showEmpty = queue.status === 'ready' && queue.rows.length === 0;
  const showError = queue.status === 'error' && queue.rows.length === 0;

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="header"
        sx={{
          bgcolor: 'background.paper',
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ px: { xs: 1.5, md: 3 }, pt: 1.25 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" component="h1" noWrap>
              Approval Manager
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              display="block"
            >
              Transactions pending approval in NetSuite
            </Typography>
          </Box>
          {queue.loadedAt && !narrow && (
            <Typography variant="caption" color="text.secondary">
              Updated {dayjs(queue.loadedAt).format('h:mm A')}
            </Typography>
          )}
          <Tooltip title={`Refresh ${type.label.toLowerCase()}`}>
            <span>
              <IconButton
                aria-label={`Refresh ${type.label.toLowerCase()}`}
                onClick={refresh}
                disabled={queue.status === 'loading'}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            startIcon={
              <Badge
                badgeContent={approvedLog.length}
                color="success"
                max={999}
              >
                <HistoryIcon fontSize="small" />
              </Badge>
            }
            onClick={() => setLogOpen(true)}
            sx={{ borderColor: tokens.border }}
          >
            {narrow ? 'Log' : 'Approved this session'}
          </Button>
        </Stack>
        <Tabs
          value={typeId}
          onChange={(_, value: string) => changeType(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Approval queues"
          sx={{ px: { xs: 0.5, md: 2 } }}
        >
          {TRANSACTION_TYPES.map(target => {
            const state = queues[target.id] ?? initialQueue;
            const loadingCount =
              state.total != null
                ? `${state.rows.length.toLocaleString()} of ${state.total.toLocaleString()}`
                : '';
            return (
              <Tab
                key={target.id}
                value={target.id}
                label={
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    {target.label}
                    {state.status === 'error' ? (
                      <ErrorOutlineIcon
                        color="error"
                        sx={{ fontSize: 16 }}
                        aria-label="failed to load"
                      />
                    ) : state.status === 'loading' && !loadingCount ? (
                      <CircularProgress size={12} aria-label="loading" />
                    ) : (
                      <Box
                        component="span"
                        sx={{
                          px: 0.75,
                          borderRadius: 10,
                          fontSize: 11.5,
                          lineHeight: '18px',
                          fontVariantNumeric: 'tabular-nums',
                          bgcolor: state.rows.length
                            ? tokens.pendingBg
                            : tokens.surfaceMuted,
                          color: state.rows.length
                            ? tokens.pending
                            : 'text.secondary',
                        }}
                      >
                        {state.status === 'loading'
                          ? loadingCount
                          : state.rows.length.toLocaleString()}
                      </Box>
                    )}
                  </Stack>
                }
              />
            );
          })}
        </Tabs>
      </Box>

      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          p: { xs: 1, md: 2 },
          gap: 1,
        }}
      >
        {queue.status === 'error' && queue.rows.length > 0 && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={refresh}>
                Retry
              </Button>
            }
          >
            Refresh failed: {queue.error}. Showing the last loaded results.
          </Alert>
        )}
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            minHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {showError ? (
            <QueueState
              icon={<ErrorOutlineIcon color="error" sx={{ fontSize: 40 }} />}
              title={`Couldn't load ${type.label.toLowerCase()}`}
              body={queue.error || 'The request failed.'}
              action={
                <Button
                  variant="outlined"
                  onClick={refresh}
                  startIcon={<RefreshIcon />}
                >
                  Retry
                </Button>
              }
            />
          ) : showEmpty ? (
            <QueueState
              icon={<TaskAltIcon color="success" sx={{ fontSize: 40 }} />}
              title={`No ${type.label.toLowerCase()} waiting for approval`}
              body="This queue is clear. New submissions appear after a refresh."
              action={
                <Button onClick={refresh} startIcon={<RefreshIcon />}>
                  Refresh
                </Button>
              }
            />
          ) : (
            <ToolbarContext.Provider value={toolbarValue}>
              <DataGrid
                apiRef={apiRef}
                rows={queue.rows}
                columns={columns}
                loading={queue.status === 'loading' && queue.rows.length === 0}
                checkboxSelection
                disableRowSelectionOnClick
                rowSelectionModel={selection}
                onRowSelectionModelChange={setSelection}
                columnVisibilityModel={columnVisibilityModel}
                rowHeight={56}
                hideFooterSelectedRowCount
                columnHeaderHeight={40}
                showToolbar
                slots={{ toolbar: QueueToolbar }}
                pagination
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 50 } },
                  sorting: { sortModel: [{ field: 'trandate', sort: 'asc' }] },
                  // Search covers columns hidden by layout (currency, and name/memo on mobile).
                  filter: {
                    filterModel: {
                      items: [],
                      quickFilterExcludeHiddenColumns: false,
                    },
                  },
                }}
                localeText={{
                  noResultsOverlayLabel: 'No transactions match your search.',
                }}
                slotProps={{
                  loadingOverlay: {
                    variant: 'skeleton',
                    noRowsVariant: 'skeleton',
                  },
                }}
                sx={{
                  border: 0,
                  fontSize: 13,
                  '& .MuiDataGrid-toolbar': {
                    minHeight: 52,
                    flex: '0 0 auto',
                    flexWrap: 'wrap',
                    gap: 1,
                    px: 1.5,
                    py: 1,
                  },
                  '& .MuiDataGrid-toolbar.has-selection': {
                    bgcolor: tokens.selected,
                  },
                  '--DataGrid-containerBackground': tokens.surfaceMuted,
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 600,
                    fontSize: 12,
                    color: 'text.secondary',
                  },
                  '& .MuiDataGrid-cell': {
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover':
                    { bgcolor: tokens.selected },
                  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus':
                    {
                      outline: 'none',
                    },
                  '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible':
                    {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: -2,
                    },
                }}
              />
            </ToolbarContext.Provider>
          )}
        </Paper>
      </Box>

      <ApproveDialog
        open={Boolean(confirming)}
        rows={confirming ?? []}
        type={type}
        run={runApprovals}
        onCancel={() => setConfirming(null)}
        onDone={finishApprovals}
      />
      <SessionLog
        open={logOpen}
        entries={approvedLog}
        templates={templates}
        onClose={() => setLogOpen(false)}
      />
    </Box>
  );
}
