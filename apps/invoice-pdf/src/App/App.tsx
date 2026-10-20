import {
  Clear as ClearIcon,
  Close as CloseIcon,
  FolderZip as ZipIcon,
  PictureAsPdf as PdfIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRowSelectionModel,
  QuickFilter,
  QuickFilterClear,
  QuickFilterControl,
  Toolbar,
  useGridApiRef,
} from '@mui/x-data-grid';
import {
  createContext,
  type FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  downloadPdfsAsZip,
  fetchInvoiceCount,
  generateInvoicePdfs,
  searchInvoices,
} from '../domain/actions/clientActions';
import { generatePdfsInBatches } from '../domain/actions/pdfBatches';
import {
  DEFAULT_FILTERS,
  type InvoiceFilters,
  type InvoiceRow,
  MAX_PDF_BATCH,
  PDF_CHUNK_SIZE,
  PDF_CONCURRENCY,
} from '../domain/types';
import { tokens } from './theme';

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

function formatMoney(amount: number, currency: string): string {
  if (!currency)
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Totals grouped by currency; amounts in different currencies are never added. */
function formatTotals(rows: InvoiceRow[]): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.amount == null || Number.isNaN(row.amount)) continue;
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => formatMoney(total, currency))
    .join(' · ');
}

/**
 * The query returns dates as YYYY-MM-DD (TO_CHAR), independent of the user's
 * NetSuite date preference. Anything else, or an impossible calendar date,
 * stays as text rather than being guessed into a different date.
 */
function dateValue(value: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!iso) return null;
  const [year, month, day] = iso.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

const dateColumn = (
  field: 'trandate' | 'duedate',
  headerName: string
): GridColDef<InvoiceRow> => ({
  field,
  headerName,
  width: 120,
  type: 'date',
  valueGetter: (value: string) => dateValue(value),
  valueFormatter: (value: Date | null, row) =>
    value ? value.toLocaleDateString() : row[field],
});

const COLUMNS: GridColDef<InvoiceRow>[] = [
  {
    field: 'tranid',
    headerName: 'Invoice #',
    width: 150,
    renderCell: params => (
      <Typography component="span" fontWeight={600} fontSize="inherit">
        {params.value}
      </Typography>
    ),
  },
  dateColumn('trandate', 'Date'),
  { field: 'customer', headerName: 'Customer', flex: 1, minWidth: 200 },
  { field: 'status', headerName: 'Status', width: 150 },
  {
    field: 'amount',
    headerName: 'Amount',
    width: 160,
    type: 'number',
    valueFormatter: (value: number | null, row) =>
      value == null ? '' : formatMoney(value, row.currency),
  },
  { field: 'currency', headerName: 'Currency', width: 100 },
  dateColumn('duedate', 'Due date'),
  { field: 'memo', headerName: 'Memo', flex: 1, minWidth: 160 },
];

const EMPTY_SELECTION: GridRowSelectionModel = {
  type: 'include',
  ids: new Set(),
};

interface SearchState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  total: number | null;
}

interface GenerationOutcome {
  fileName: string | null;
  requested: number;
  succeeded: number;
  failed: Array<{ id: number; tranId: string; error: string }>;
}

const ToolbarContext = createContext<{
  rows: InvoiceRow[];
  selected: InvoiceRow[];
  searching: boolean;
  generating: boolean;
  onGenerate: () => void;
  onClear: () => void;
} | null>(null);

function ResultsToolbar() {
  const context = useContext(ToolbarContext);
  if (!context) return null;
  const { rows, selected, searching, generating, onGenerate, onClear } =
    context;
  const count = selected.length;
  const overLimit = count > MAX_PDF_BATCH;
  return (
    <Toolbar>
      <Box sx={{ flex: '1 1 280px', minWidth: 0 }} role="status">
        <Stack direction="row" alignItems="baseline" gap={1.25} flexWrap="wrap">
          <Typography variant="body2" fontWeight={700}>
            {searching
              ? 'Searching invoices…'
              : count
                ? `${count.toLocaleString()} selected`
                : `${plural(rows.length, 'invoice')} · newest first`}
          </Typography>
          {count > 0 && !searching && (
            <Typography
              variant="body2"
              color={overLimit ? 'warning.main' : 'text.secondary'}
              fontWeight={overLimit ? 600 : 400}
            >
              {overLimit
                ? `Select at most ${MAX_PDF_BATCH} per download`
                : formatTotals(selected)}
            </Typography>
          )}
        </Stack>
      </Box>
      <QuickFilter defaultExpanded style={{ flex: '1 1 180px', maxWidth: 260 }}>
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
      {count > 0 && (
        <Button size="small" color="inherit" onClick={onClear}>
          Clear
        </Button>
      )}
      <Button
        variant="contained"
        startIcon={<ZipIcon />}
        onClick={onGenerate}
        disabled={count === 0 || overLimit || generating}
        sx={{ flex: { xs: '1 1 100%', sm: 'none' } }}
      >
        Download PDFs{count > 0 ? ` (${count.toLocaleString()})` : ''}
      </Button>
    </Toolbar>
  );
}

export default function App() {
  const muiTheme = useTheme();
  const compact = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const apiRef = useGridApiRef();

  const [filters, setFilters] = useState<InvoiceFilters>({
    ...DEFAULT_FILTERS,
  });
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState<SearchState>({
    status: 'idle',
    total: null,
  });
  const [selectionModel, setSelectionModel] =
    useState<GridRowSelectionModel>(EMPTY_SELECTION);
  const [selected, setSelected] = useState<InvoiceRow[]>([]);
  const [generating, setGenerating] = useState<{
    finished: number;
    total: number;
  } | null>(null);
  const [outcome, setOutcome] = useState<GenerationOutcome | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const updateFilter = useCallback(
    (field: keyof InvoiceFilters, value: string) => {
      setFilters(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectionModel(EMPTY_SELECTION);
    setSelected([]);
  }, []);

  const handleSearch = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      setSearch(prev => ({ ...prev, status: 'loading', error: undefined }));
      clearSelection();
      setOutcome(null);
      setGenerateError(null);
      try {
        const [result, count] = await Promise.all([
          searchInvoices(filters),
          fetchInvoiceCount(filters),
        ]);
        setRows(result.rows);
        setSearch({ status: 'ready', total: count });
      } catch (err) {
        setSearch(prev => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Search failed',
        }));
      }
    },
    [filters, clearSelection]
  );

  // Resolve after the grid applies the controlled model: the grid interprets
  // include/exclude models (header "select all", filtered pages), so the list
  // always contains exactly the invoices the user checked.
  useEffect(() => {
    const api = apiRef.current;
    setSelected(
      api ? ([...api.getSelectedRows().values()] as InvoiceRow[]) : []
    );
  }, [apiRef, selectionModel, rows]);

  const generate = useCallback(async (targets: InvoiceRow[]) => {
    if (targets.length === 0 || targets.length > MAX_PDF_BATCH) return;
    const invoices = targets.map(row => ({
      id: Number(row.id),
      tranId: row.tranid || String(row.id),
    }));
    setGenerating({ finished: 0, total: invoices.length });
    setGenerateError(null);
    setOutcome(null);
    try {
      const pdfs = await generatePdfsInBatches(invoices, {
        generate: generateInvoicePdfs,
        chunkSize: PDF_CHUNK_SIZE,
        concurrency: PDF_CONCURRENCY,
        onProgress: (finished, total) => setGenerating({ finished, total }),
      });
      const ok = pdfs.filter(p => p.base64 && !p.error);
      const failed = pdfs
        .filter(p => !p.base64 || p.error)
        .map(p => ({
          id: p.id,
          tranId: p.tranId,
          error: p.error || 'No PDF returned',
        }));
      const fileName = ok.length ? await downloadPdfsAsZip(ok) : null;
      setOutcome({
        fileName,
        requested: invoices.length,
        succeeded: ok.length,
        failed,
      });
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : 'PDF generation failed'
      );
    } finally {
      setGenerating(null);
    }
  }, []);

  const handleGenerate = useCallback(() => {
    void generate([
      ...apiRef.current!.getSelectedRows().values(),
    ] as InvoiceRow[]);
  }, [apiRef, generate]);

  const retryFailed = useCallback(() => {
    if (!outcome) return;
    const ids = new Set(outcome.failed.map(f => String(f.id)));
    void generate(rows.filter(row => ids.has(String(row.id))));
  }, [outcome, rows, generate]);

  const hasFilters = Object.values(filters).some(v => v.trim().length > 0);
  const capped =
    search.status !== 'loading' &&
    search.total != null &&
    search.total > rows.length;

  const toolbarValue = useMemo(
    () => ({
      rows,
      selected,
      searching: search.status === 'loading',
      generating: generating !== null,
      onGenerate: handleGenerate,
      onClear: clearSelection,
    }),
    [rows, selected, search.status, generating, handleGenerate, clearSelection]
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        component="header"
        sx={{
          px: { xs: 2, md: 3 },
          py: 1.5,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: muiTheme.zIndex.appBar,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Avatar
            variant="rounded"
            sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}
          >
            <PdfIcon fontSize="small" />
          </Avatar>
          <Box minWidth={0}>
            <Typography variant="h6" component="h1" lineHeight={1.2} noWrap>
              Invoice PDF Generator
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Find invoices, select them, and download their PDFs as one ZIP
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          px: { xs: 2, md: 3 },
          py: 2,
        }}
      >
        <Paper
          component="form"
          onSubmit={handleSearch}
          aria-label="Search invoices"
          sx={{ p: 2 }}
        >
          <Stack
            direction="row"
            flexWrap="wrap"
            useFlexGap
            gap={1.5}
            alignItems="center"
          >
            <TextField
              label="Date from"
              type="date"
              value={filters.dateFrom}
              onChange={e => updateFilter('dateFrom', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { xs: 'calc(50% - 6px)', sm: 160 } }}
            />
            <TextField
              label="Date to"
              type="date"
              value={filters.dateTo}
              onChange={e => updateFilter('dateTo', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { xs: 'calc(50% - 6px)', sm: 160 } }}
            />
            <TextField
              label="Customer"
              placeholder="Contains…"
              value={filters.customerContains}
              onChange={e => updateFilter('customerContains', e.target.value)}
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 200px' },
                maxWidth: { sm: 280 },
              }}
            />
            <TextField
              label="Status"
              placeholder="Contains…"
              value={filters.statusContains}
              onChange={e => updateFilter('statusContains', e.target.value)}
              sx={{ flex: { xs: '1 1 40%', sm: '0 1 160px' } }}
            />
            <TextField
              label="Invoice #"
              placeholder="Contains…"
              value={filters.tranIdContains}
              onChange={e => updateFilter('tranIdContains', e.target.value)}
              sx={{ flex: { xs: '1 1 40%', sm: '0 1 160px' } }}
            />
            <Stack
              direction="row"
              spacing={1}
              sx={{ ml: { md: 'auto' }, width: { xs: '100%', sm: 'auto' } }}
            >
              <Button
                type="submit"
                variant="contained"
                startIcon={<SearchIcon />}
                disabled={search.status === 'loading'}
                sx={{ flex: { xs: 1, sm: 'none' } }}
              >
                {search.status === 'loading' ? 'Searching…' : 'Search invoices'}
              </Button>
              {hasFilters && (
                <Button
                  color="inherit"
                  startIcon={compact ? undefined : <ClearIcon />}
                  onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>

        {search.status === 'error' && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void handleSearch()}
              >
                Retry
              </Button>
            }
          >
            {`Couldn't search invoices: ${search.error}.`}
            {rows.length > 0 &&
              ' The results below are from the previous search.'}
          </Alert>
        )}

        {capped && (
          <Alert severity="warning">
            <strong>
              Showing the newest {rows.length.toLocaleString()} of{' '}
              {search.total!.toLocaleString()} invoices.
            </strong>{' '}
            Narrow the date range or filters to reach older invoices. Selection
            and downloads include only the invoices shown.
          </Alert>
        )}

        {generateError && (
          <Alert severity="error" onClose={() => setGenerateError(null)}>
            {`Couldn't generate PDFs: ${generateError}. Nothing was downloaded.`}
          </Alert>
        )}

        {outcome && (
          <Alert
            severity={
              outcome.failed.length === 0
                ? 'success'
                : outcome.succeeded === 0
                  ? 'error'
                  : 'warning'
            }
            onClose={() => setOutcome(null)}
            action={
              outcome.failed.length > 0 ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={retryFailed}
                  disabled={generating !== null}
                >
                  Retry failed ({outcome.failed.length})
                </Button>
              ) : undefined
            }
          >
            <strong>
              {outcome.fileName
                ? `Downloaded ${plural(outcome.succeeded, 'PDF')}${
                    outcome.failed.length ? ` of ${outcome.requested}` : ''
                  } in ${outcome.fileName}.`
                : `No PDFs were generated; nothing was downloaded.`}
            </strong>
            {outcome.failed.length > 0 && (
              <>
                {' '}
                {plural(outcome.failed.length, 'invoice')} failed:
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {outcome.failed.map(f => (
                    <li key={f.id}>
                      <strong>{f.tranId}</strong> — {f.error}
                    </li>
                  ))}
                </Box>
              </>
            )}
          </Alert>
        )}

        <Paper
          sx={{
            flex: 1,
            minHeight: 480,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {search.status === 'idle' ||
          (search.status !== 'loading' && rows.length === 0) ? (
            <Stack
              alignItems="center"
              justifyContent="center"
              spacing={1.5}
              sx={{ flex: 1, py: 8, px: 3, textAlign: 'center' }}
            >
              <Avatar
                variant="rounded"
                sx={{
                  width: 48,
                  height: 48,
                  bgcolor: tokens.selected,
                  color: 'primary.main',
                }}
              >
                <PdfIcon />
              </Avatar>
              <Typography variant="subtitle1">
                {search.status === 'ready'
                  ? 'No invoices match these filters'
                  : 'Search for invoices to begin'}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ maxWidth: 440 }}
              >
                {search.status === 'ready'
                  ? 'Widen the date range or clear a filter, then search again.'
                  : `Filter by date, customer, status, or invoice number, then select up to ${MAX_PDF_BATCH} invoices to download as one ZIP of PDFs.`}
              </Typography>
            </Stack>
          ) : (
            <ToolbarContext.Provider value={toolbarValue}>
              <DataGrid<InvoiceRow>
                apiRef={apiRef}
                rows={rows}
                columns={COLUMNS}
                loading={search.status === 'loading'}
                checkboxSelection
                disableRowSelectionOnClick
                rowSelectionModel={selectionModel}
                onRowSelectionModelChange={setSelectionModel}
                showToolbar
                slots={{ toolbar: ResultsToolbar }}
                density="compact"
                hideFooterSelectedRowCount
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 50 } },
                }}
                sx={{
                  border: 'none',
                  '--DataGrid-containerBackground': tokens.surfaceMuted,
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 600,
                    color: 'text.secondary',
                  },
                  '& .MuiDataGrid-row:hover': { bgcolor: tokens.surfaceMuted },
                  '& .MuiDataGrid-row.Mui-selected': {
                    bgcolor: tokens.selected,
                  },
                  '& .MuiDataGrid-toolbar': {
                    flex: '0 0 auto',
                    flexWrap: 'wrap',
                    rowGap: 1,
                    gap: 1,
                    px: 2,
                    py: 1,
                    minHeight: 56,
                    bgcolor: tokens.surfaceMuted,
                  },
                }}
              />
            </ToolbarContext.Provider>
          )}
        </Paper>
      </Box>

      <Dialog
        open={generating !== null}
        maxWidth="xs"
        fullWidth
        aria-describedby="generation-status"
      >
        <DialogTitle>
          Generating {generating ? plural(generating.total, 'PDF') : 'PDFs'}
        </DialogTitle>
        <DialogContent>
          <Typography
            id="generation-status"
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
          >
            {generating && generating.finished < generating.total
              ? `NetSuite has rendered ${generating.finished.toLocaleString()} of ${plural(generating.total, 'invoice')}. They're rendered in groups of ${PDF_CHUNK_SIZE}, ${PDF_CONCURRENCY} groups at a time.`
              : 'Zipping the PDFs for download…'}
          </Typography>
          <LinearProgress
            aria-label="Generating PDFs"
            variant={
              generating && generating.finished < generating.total
                ? 'determinate'
                : 'indeterminate'
            }
            value={
              generating
                ? (generating.finished / Math.max(1, generating.total)) * 100
                : 0
            }
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
