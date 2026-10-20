import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import TuneIcon from '@mui/icons-material/Tune';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  ColumnsPanelTrigger,
  DataGrid,
  FilterPanelTrigger,
  type GridColDef,
  type GridRenderCellParams,
  QuickFilter,
  QuickFilterClear,
  QuickFilterControl,
  Toolbar,
  ToolbarButton,
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
  exportRowsToCsv,
  fetchDataViewerRecords,
  fetchDistinctTypes,
  fetchRecordCount,
  fetchRecordSchema,
  fetchRecordUrlTemplates,
} from '../domain/actions/clientActions';
import {
  cursorAdvances,
  isActiveFilter,
  isLineField,
  usesTransactionLines,
} from '../domain/query';
import {
  type DataViewerFilters,
  type DataViewerGridRow,
  DEFAULT_FILTERS,
  type DynamicColumn,
  type DynamicFilter,
  type FetchRecordsParams,
  type FilterOperator,
  OPERATORS_BY_TYPE,
  PAGE_SIZE,
  type RecordSchemaResult,
  type RecordTypeId,
  type SchemaField,
  type SchemaFieldType,
} from '../domain/types';
import GroupedTransactions from '../domain/views/GroupedTransactions';
import { tokens } from './theme';

const RECORD_OPTIONS: {
  value: RecordTypeId;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: 'customer',
    label: 'Customers',
    icon: <PeopleIcon fontSize="small" />,
    description: 'Active customer records',
  },
  {
    value: 'transaction',
    label: 'Transactions',
    icon: <ReceiptLongIcon fontSize="small" />,
    description: 'Posted transactions',
  },
  {
    value: 'employee',
    label: 'Employees',
    icon: <PeopleIcon fontSize="small" />,
    description: 'Employee directory',
  },
];

function buildRecordUrl(template: string, id: string | number): string {
  try {
    const url = new URL(template);
    url.searchParams.set('id', String(id));
    return url.toString();
  } catch {
    return `${template}${id}`;
  }
}

function makeViewColumn(
  templatesRef: React.RefObject<Record<string, string>>,
  fallbackType: string
): GridColDef {
  return {
    field: '__view',
    headerName: '',
    width: 50,
    minWidth: 50,
    maxWidth: 50,
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    renderCell: (params: GridRenderCellParams) => {
      const rt = (params.row.recordtype as string) || fallbackType;
      const template = templatesRef.current?.[rt];
      if (!template) return null;
      return (
        <Tooltip title="View in NetSuite">
          <IconButton
            size="small"
            href={buildRecordUrl(template, params.row.id)}
            target="_blank"
            rel="noopener noreferrer"
            component="a"
            sx={{ color: 'primary.main' }}
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
    },
  };
}

function withViewColumn(
  cols: GridColDef[],
  templatesRef: React.RefObject<Record<string, string>>,
  fallbackType: string
): GridColDef[] {
  if (cols.length > 0 && cols[0].field === '__view') return cols;
  return [makeViewColumn(templatesRef, fallbackType), ...cols];
}

let filterIdCounter = 0;
function nextFilterId(): string {
  return `f-${++filterIdCounter}`;
}

function schemaGroup(field: SchemaField): string {
  if (isLineField(field.field))
    return field.custom
      ? 'Custom Transaction Line Fields'
      : 'Transaction Line Fields';
  return field.custom ? 'Custom Fields' : 'Standard Fields';
}

function gridRowId(row: DataViewerGridRow): string {
  return row.__rowId;
}

/** Completeness of the rows on screen; a failed attempt never changes it. */
type LoadStatus =
  | { kind: 'complete'; count: number }
  | { kind: 'partial'; count: number; reason: string };

interface QueryShape {
  filters: DataViewerFilters;
  dynamicFilters: DynamicFilter[];
  dynamicColumns: DynamicColumn[];
}

interface LoadedQuery {
  signature: string;
  summary: string;
}

function hasStaticFilterValues(filters: DataViewerFilters): boolean {
  return !!(
    filters.dateFrom ||
    filters.dateTo ||
    filters.statusContains.trim() ||
    filters.typeEquals.trim() ||
    filters.internalId.trim() ||
    filters.tranIdContains.trim()
  );
}

function querySignature(query: QueryShape): string {
  return JSON.stringify({
    filters: query.filters,
    dynamicFilters: query.dynamicFilters
      .filter(isActiveFilter)
      .map(f => [f.field, f.operator, f.value]),
    dynamicColumns: query.dynamicColumns.map(c => c.field),
  });
}

/** Plain-language description of a query's refinements, e.g. "2 field filters". */
function describeQuery(query: QueryShape): string {
  const fieldFilters = query.dynamicFilters.filter(isActiveFilter).length;
  const extra = query.dynamicColumns.length;
  return [
    hasStaticFilterValues(query.filters) && 'basic filters on',
    fieldFilters > 0 &&
      `${fieldFilters} field filter${fieldFilters === 1 ? '' : 's'}`,
    extra > 0 && `${extra} extra column${extra === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

const SUPERSEDED_REASON =
  'Loading stopped when a new load started before every page arrived.';

const INTERRUPTED_REASON =
  'Loading stopped when you switched views before every page arrived.';

export default function App() {
  const { showError } = useToastHelpers();
  const muiTheme = useTheme();
  const compact = useMediaQuery(muiTheme.breakpoints.down('sm'));

  const [recordType, setRecordType] = useState<RecordTypeId>('customer');
  const [transactionView, setTransactionView] = useState<'grouped' | 'flat'>(
    'grouped'
  );
  const [groupedRequest, setGroupedRequest] = useState<{
    id: number;
    params: FetchRecordsParams;
  } | null>(null);
  const grouped = recordType === 'transaction' && transactionView === 'grouped';
  const [filters, setFilters] = useState<DataViewerFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [columns, setColumns] = useState<GridColDef[]>([]);
  const [rows, setRows] = useState<DataViewerGridRow[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadIdRef = useRef(0);
  const [loadStatus, setLoadStatus] = useState<LoadStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const errorCache = useRef<Record<RecordTypeId, string | null>>({
    customer: null,
    transaction: null,
    employee: null,
  });
  const [loadedQuery, setLoadedQuery] = useState<LoadedQuery | null>(null);
  const loadedQueryCache = useRef<Record<RecordTypeId, LoadedQuery | null>>({
    customer: null,
    transaction: null,
    employee: null,
  });
  const statusCache = useRef<Record<RecordTypeId, LoadStatus | null>>({
    customer: null,
    transaction: null,
    employee: null,
  });

  // Dynamic filter state
  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilter[]>([]);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([]);
  const schemaRequestRef = useRef(0);
  const [dynamicOpen, setDynamicOpen] = useState(false);

  // Dynamic column state
  const [dynamicColumns, setDynamicColumns] = useState<DynamicColumn[]>([]);
  const [columnsOpen, setColumnsOpen] = useState(false);

  // Transaction type options for the basic filter dropdown
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [typeOptionsLoading, setTypeOptionsLoading] = useState(false);
  const typeOptionsCache = useRef<string[] | null>(null);

  const schemaCache = useRef<Record<string, RecordSchemaResult>>({});
  const urlTemplatesRef = useRef<Record<string, string>>({});

  const dataCache = useRef<
    Record<
      RecordTypeId,
      {
        rows: DataViewerGridRow[];
        columns: GridColDef[];
        filters: DataViewerFilters;
        dynamicFilters: DynamicFilter[];
        dynamicColumns: DynamicColumn[];
      }
    >
  >({
    customer: {
      rows: [],
      columns: [],
      filters: DEFAULT_FILTERS,
      dynamicFilters: [],
      dynamicColumns: [],
    },
    transaction: {
      rows: [],
      columns: [],
      filters: DEFAULT_FILTERS,
      dynamicFilters: [],
      dynamicColumns: [
        { field: 'transactionline.memo', label: 'Line: Memo', type: 'string' },
        {
          field: 'transactionline.department',
          label: 'Line: Department',
          type: 'enum',
        },
        {
          field: 'transactionline.netamount',
          label: 'Line: Net Amount',
          type: 'number',
        },
      ],
    },
    employee: {
      rows: [],
      columns: [],
      filters: DEFAULT_FILTERS,
      dynamicFilters: [],
      dynamicColumns: [],
    },
  });

  const hasData = rows.length > 0;
  const hasStaticFilters = hasStaticFilterValues(filters);
  const activeDynCount = dynamicFilters.filter(isActiveFilter).length;

  const loadSchema = useCallback(async (rt: RecordTypeId, force = false) => {
    const requestId = ++schemaRequestRef.current;
    setSchemaWarnings([]);
    setSchemaFields([]);
    setSchemaLoaded(false);
    setSchemaLoading(true);
    try {
      const result =
        (!force && schemaCache.current[rt]) || (await fetchRecordSchema(rt));
      if (!result.warnings?.length) schemaCache.current[rt] = result;
      if (requestId !== schemaRequestRef.current) return;
      setSchemaFields(result.fields);
      setSchemaWarnings(result.warnings ?? []);
      setSchemaLoaded(true);
    } catch (e) {
      if (requestId !== schemaRequestRef.current) return;
      setSchemaWarnings([
        e instanceof Error
          ? e.message
          : 'Field list could not be loaded. Please retry.',
      ]);
    } finally {
      if (requestId === schemaRequestRef.current) setSchemaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dynamicOpen || columnsOpen) {
      loadSchema(recordType);
    }
  }, [dynamicOpen, columnsOpen, recordType, loadSchema]);

  useEffect(() => {
    if (
      filtersOpen &&
      recordType === 'transaction' &&
      !typeOptionsCache.current
    ) {
      setTypeOptionsLoading(true);
      fetchDistinctTypes()
        .then(types => {
          typeOptionsCache.current = types;
          setTypeOptions(types);
        })
        .catch(() => {
          setTypeOptions([]);
        })
        .finally(() => setTypeOptionsLoading(false));
    } else if (typeOptionsCache.current) {
      setTypeOptions(typeOptionsCache.current);
    }
  }, [filtersOpen, recordType]);

  const resolveUrlTemplates = useCallback(
    async (pageRows: DataViewerGridRow[]) => {
      const typesToResolve: string[] =
        recordType === 'transaction'
          ? [
              ...new Set(
                pageRows
                  .map(r => (r.recordtype as string) || '')
                  .filter(Boolean)
              ),
            ]
          : [recordType];
      const needed = typesToResolve.filter(t => !urlTemplatesRef.current[t]);
      if (needed.length > 0) {
        try {
          const templates = await fetchRecordUrlTemplates(needed);
          Object.assign(urlTemplatesRef.current, templates);
        } catch {
          /* non-critical */
        }
      }
    },
    [recordType]
  );

  const loadData = useCallback(async () => {
    if (grouped) {
      loadIdRef.current++;
      setLoading(false);
      setBackgroundLoading(false);
      setGroupedRequest(previous => ({
        id: (previous?.id ?? 0) + 1,
        params: {
          recordType,
          filters: { ...filters },
          dynamicFilters: dynamicFilters
            .filter(isActiveFilter)
            .map(f => ({ ...f })),
          dynamicColumns: dynamicColumns.map(c => ({ ...c })),
        },
      }));
      return;
    }
    if (backgroundLoading)
      setLoadStatus({
        kind: 'partial',
        count: rows.length,
        reason: SUPERSEDED_REASON,
      });
    setLoadError(null);
    setLoading(true);
    setBackgroundLoading(false);
    setTotalCount(null);
    const thisLoadId = ++loadIdRef.current;

    const fetchParams: FetchRecordsParams = {
      recordType,
      filters,
      dynamicFilters: dynamicFilters.filter(isActiveFilter),
      dynamicColumns,
    };

    try {
      const result = await fetchDataViewerRecords(fetchParams);
      if (loadIdRef.current !== thisLoadId) return;

      await resolveUrlTemplates(result.rows);
      if (loadIdRef.current !== thisLoadId) return;

      const resolvedCols = withViewColumn(
        result.columns,
        urlTemplatesRef,
        recordType
      );
      setColumns(resolvedCols);
      setRows(result.rows);
      setLoadedQuery({
        signature: querySignature(fetchParams as QueryShape),
        summary: describeQuery(fetchParams as QueryShape),
      });
      dataCache.current[recordType] = {
        rows: result.rows,
        columns: resolvedCols,
        filters,
        dynamicFilters,
        dynamicColumns,
      };
      setLoading(false);
      setLoadStatus(
        result.rows.length < PAGE_SIZE
          ? { kind: 'complete', count: result.rows.length }
          : null
      );

      // If first page is full, fetch count + remaining pages in background
      // Line queries advance by both transaction and line ID.
      if (result.rows.length >= PAGE_SIZE) {
        setBackgroundLoading(true);

        // Fire count query so the UI can show "5,000 of 38,169"
        fetchRecordCount(fetchParams)
          .then(c => {
            if (loadIdRef.current === thisLoadId) setTotalCount(c);
          })
          .catch(() => {});

        let allRows = result.rows;
        let cursor = result.nextCursor;
        let complete = false;
        let partialReason =
          'Page limit reached; narrow your filters to load fewer rows.';
        const MAX_PAGES = 200;

        for (
          let i = 0;
          i < MAX_PAGES && loadIdRef.current === thisLoadId;
          i++
        ) {
          try {
            if (!cursor) throw new Error('Missing pagination cursor');
            const page = await fetchDataViewerRecords(fetchParams, cursor);
            if (loadIdRef.current !== thisLoadId) return;

            if (page.rows.length === 0) {
              complete = true;
              break;
            }
            if (!page.nextCursor || !cursorAdvances(cursor, page.nextCursor)) {
              throw new Error('Pagination did not advance');
            }
            cursor = page.nextCursor;

            await resolveUrlTemplates(page.rows);
            if (loadIdRef.current !== thisLoadId) return;

            allRows = [...allRows, ...page.rows];
            setRows(allRows);
            dataCache.current[recordType].rows = allRows;

            // With keyset pagination, a partial page means no more data
            if (page.rows.length < PAGE_SIZE) {
              complete = true;
              break;
            }
          } catch (error) {
            partialReason =
              error instanceof Error
                ? error.message
                : 'A page could not be loaded';
            break;
          }
        }

        if (loadIdRef.current === thisLoadId) {
          setBackgroundLoading(false);
          setTotalCount(null);
          setLoadStatus(
            complete
              ? { kind: 'complete', count: allRows.length }
              : {
                  kind: 'partial',
                  count: allRows.length,
                  reason: partialReason,
                }
          );
        }
      }
    } catch (e) {
      if (loadIdRef.current !== thisLoadId) return;
      const raw = e instanceof Error ? e.message : String(e);
      const friendly = raw.includes('500')
        ? `Server error loading ${recordType} records — check filters or try again`
        : raw.includes('Empty response')
          ? `No response from server — is the proxy running?`
          : `Couldn't load ${(
              RECORD_OPTIONS.find(o => o.value === recordType)?.label ??
              recordType
            ).toLowerCase()}: ${raw}`;
      setLoadError(friendly);
      setLoading(false);
    }
  }, [
    grouped,
    filters,
    recordType,
    dynamicFilters,
    dynamicColumns,
    resolveUrlTemplates,
    backgroundLoading,
    rows.length,
  ]);

  const handleExport = useCallback(() => {
    if (!columns.length || !rows.length) {
      showError('Load data first', 3000);
      return;
    }
    const stamp = dayjs().format('YYYY-MM-DD_HHmm');
    exportRowsToCsv(
      columns.filter(c => c.field !== '__view'),
      rows,
      `data-viewer_${recordType}_${stamp}.csv`
    );
  }, [columns, recordType, rows, showError]);

  // The outcome belongs to the rows on screen: background paging stopped early
  // makes them partial, and a cancelled foreground load leaves them unchanged.
  const interruptedStatus = useCallback(
    (status: LoadStatus | null): LoadStatus | null =>
      backgroundLoading
        ? { kind: 'partial', count: rows.length, reason: INTERRUPTED_REASON }
        : status,
    [backgroundLoading, rows.length]
  );

  const handleRecordChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: RecordTypeId | null) => {
      if (!value) return;
      loadIdRef.current++;
      schemaRequestRef.current++;
      setLoading(false);
      setSchemaLoading(false);
      setSchemaWarnings([]);
      setBackgroundLoading(false);
      setTotalCount(null);

      dataCache.current[recordType] = {
        rows,
        columns,
        filters,
        dynamicFilters,
        dynamicColumns,
      };
      statusCache.current[recordType] = interruptedStatus(loadStatus);
      errorCache.current[recordType] = loadError;
      loadedQueryCache.current[recordType] = loadedQuery;

      setRecordType(value);
      setLoadStatus(statusCache.current[value]);
      setLoadError(errorCache.current[value]);
      setLoadedQuery(loadedQueryCache.current[value]);

      const cached = dataCache.current[value];
      setFilters(cached.filters);
      setDynamicFilters(cached.dynamicFilters);
      setDynamicColumns(cached.dynamicColumns);
      setColumns(cached.columns);
      setRows(cached.rows);

      setSchemaLoaded(false);
      setSchemaFields([]);
    },
    [
      recordType,
      rows,
      columns,
      filters,
      dynamicFilters,
      dynamicColumns,
      loadStatus,
      loadError,
      loadedQuery,
      interruptedStatus,
    ]
  );

  // Dynamic filter CRUD
  const addFilter = useCallback(() => {
    setDynamicFilters(prev => [
      ...prev,
      { id: nextFilterId(), field: '', operator: 'contains', value: '' },
    ]);
  }, []);

  const removeFilter = useCallback((id: string) => {
    setDynamicFilters(prev => prev.filter(f => f.id !== id));
  }, []);

  const updateFilter = useCallback(
    (id: string, patch: Partial<DynamicFilter>) => {
      setDynamicFilters(prev =>
        prev.map(f => {
          if (f.id !== id) return f;
          const updated = { ...f, ...patch };
          // Reset operator/value when field changes
          if (patch.field && patch.field !== f.field) {
            const fieldDef = schemaFields.find(sf => sf.field === patch.field);
            const ops = OPERATORS_BY_TYPE[fieldDef?.type ?? 'string'];
            updated.operator = ops[0].value;
            updated.value = '';
          }
          return updated;
        })
      );
    },
    [schemaFields]
  );

  const clearDynamicFilters = useCallback(() => {
    setDynamicFilters([]);
  }, []);

  const currentOption = RECORD_OPTIONS.find(o => o.value === recordType)!;

  // Build field lookup for filter rows
  const fieldMap = useMemo(() => {
    const m = new Map<string, SchemaField>();
    for (const f of schemaFields) m.set(f.field, f);
    return m;
  }, [schemaFields]);

  // Standard fields first (A-Z), then custom fields (A-Z)
  const sortedSchemaFields = useMemo(
    () =>
      [...schemaFields].sort((a, b) => {
        if (isLineField(a.field) !== isLineField(b.field))
          return isLineField(a.field) ? 1 : -1;
        if (a.custom !== b.custom) return a.custom ? 1 : -1;
        return a.label.localeCompare(b.label);
      }),
    [schemaFields]
  );

  const statusText = loading
    ? `Loading ${currentOption.label.toLowerCase()}…`
    : backgroundLoading
      ? totalCount
        ? `Loaded ${rows.length.toLocaleString()} of ${totalCount.toLocaleString()} rows`
        : `Loaded ${rows.length.toLocaleString()} rows · loading more`
      : loadStatus?.kind === 'complete'
        ? loadStatus.count === 1
          ? '1 row loaded'
          : `All ${loadStatus.count.toLocaleString()} rows loaded`
        : loadStatus?.kind === 'partial'
          ? `${loadStatus.count.toLocaleString()} rows loaded · incomplete`
          : `${rows.length.toLocaleString()} rows`;

  const currentQuery = { filters, dynamicFilters, dynamicColumns };
  const formSummary = describeQuery(currentQuery);
  const currentSignature = querySignature(currentQuery);
  const pendingEdits =
    loadedQuery !== null && loadedQuery.signature !== currentSignature;
  const groupedPendingEdits =
    groupedRequest !== null &&
    querySignature(groupedRequest.params as QueryShape) !== currentSignature;
  const loadedColumns = columns.filter(c => c.field !== '__view').length;
  const lineRows = columns.some(c => c.field === 'line_id');
  const toolbarSummary = [
    `${loadedColumns} columns`,
    loadedQuery?.summary,
    lineRows && 'One row per line; header totals repeat',
  ]
    .filter(Boolean)
    .join(' · ');
  const toolbarValue = useMemo(
    () => ({
      status: statusText,
      summary: toolbarSummary,
      pendingEdits,
      busy: loading || backgroundLoading,
    }),
    [statusText, toolbarSummary, pendingEdits, loading, backgroundLoading]
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
      {/* ─── Top bar ─── */}
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
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} minWidth={0}>
            <Avatar
              variant="rounded"
              sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}
            >
              <StorageIcon fontSize="small" />
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="h6" lineHeight={1.2} noWrap>
                Data Viewer
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: { xs: 'none', sm: 'block' } }}
              >
                NetSuite record explorer
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
            {!grouped && (
              <Button
                variant="outlined"
                aria-label="Export CSV"
                startIcon={compact ? undefined : <CloudDownloadIcon />}
                onClick={handleExport}
                disabled={loading || !hasData}
                sx={compact ? { minWidth: 40, px: 1 } : undefined}
              >
                {compact ? (
                  <CloudDownloadIcon fontSize="small" />
                ) : (
                  'Export CSV'
                )}
              </Button>
            )}
            <Button
              variant="contained"
              onClick={loadData}
              disabled={loading}
              startIcon={hasData ? <RefreshIcon /> : <SearchIcon />}
            >
              {loading
                ? 'Loading…'
                : (grouped ? groupedRequest !== null : hasData)
                  ? 'Refresh data'
                  : 'Load data'}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* ─── Content ─── */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 2, md: 3 },
          py: 2,
          gap: 2,
          overflow: 'hidden',
        }}
      >
        {/* ─── Query toolbar: what to query, how to view it, how to refine it ─── */}
        <Stack
          direction="row"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          spacing={1.5}
        >
          <ToggleButtonGroup
            aria-label="Record type"
            value={recordType}
            exclusive
            onChange={handleRecordChange}
            size="small"
            sx={{
              bgcolor: 'background.paper',
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            {RECORD_OPTIONS.map(o => {
              const count =
                o.value === 'transaction' && transactionView === 'grouped'
                  ? 0
                  : o.value === recordType
                    ? rows.length
                    : dataCache.current[o.value].rows.length;
              return (
                <ToggleButton
                  key={o.value}
                  value={o.value}
                  sx={{
                    gap: 0.75,
                    px: 1.75,
                    height: 34,
                    flex: { xs: 1, sm: 'none' },
                  }}
                >
                  <Box
                    component="span"
                    sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                  >
                    {o.icon}
                  </Box>
                  {o.label}
                  {count > 0 && <Count value={count} />}
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>

          {recordType === 'transaction' && (
            <ToggleButtonGroup
              aria-label="Transaction view"
              exclusive
              size="small"
              value={transactionView}
              onChange={(_, value: 'grouped' | 'flat' | null) => {
                if (!value) return;
                loadIdRef.current++;
                setLoading(false);
                setBackgroundLoading(false);
                setLoadStatus(interruptedStatus);
                setTransactionView(value);
              }}
              sx={{
                bgcolor: 'background.paper',
                width: { xs: '100%', sm: 'auto' },
                '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' } },
              }}
            >
              <ToggleButton value="grouped" sx={{ px: 1.75, height: 34 }}>
                Grouped transactions
              </ToggleButton>
              <ToggleButton value="flat" sx={{ px: 1.75, height: 34 }}>
                Flat lines
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          <Box
            sx={{ flex: 1, minWidth: 16, display: { xs: 'none', sm: 'block' } }}
          />

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              width: { xs: '100%', sm: 'auto' },
              '& > .MuiButton-root': { flex: { xs: 1, sm: 'none' } },
            }}
          >
            <PanelToggle
              label="Filters"
              accessibleLabel="Basic filters"
              icon={<FilterListIcon fontSize="small" />}
              open={filtersOpen}
              count={hasStaticFilters ? 'On' : 0}
              controls="dv-basic-filters"
              onClick={() => setFiltersOpen(o => !o)}
            />
            <PanelToggle
              label="Field filters"
              accessibleLabel="Dynamic field filters"
              icon={<TuneIcon fontSize="small" />}
              open={dynamicOpen}
              count={activeDynCount}
              controls="dv-field-filters"
              onClick={() => setDynamicOpen(o => !o)}
            />
            <PanelToggle
              label="Columns"
              accessibleLabel="Choose extra columns"
              icon={<ViewColumnIcon fontSize="small" />}
              open={columnsOpen}
              count={dynamicColumns.length}
              controls="dv-extra-columns"
              onClick={() => setColumnsOpen(o => !o)}
            />
          </Stack>
        </Stack>

        <Collapse in={filtersOpen} unmountOnExit>
          <Paper
            id="dv-basic-filters"
            component="section"
            aria-label="Basic filters"
            sx={{ p: 2 }}
          >
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <FilterListIcon fontSize="small" color="action" />
                <Typography variant="subtitle2">Basic filters</Typography>
                {hasStaticFilters && (
                  <Chip
                    size="small"
                    label="active"
                    color="primary"
                    onDelete={() => setFilters(DEFAULT_FILTERS)}
                  />
                )}
              </Stack>
              <Divider />
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ md: 'flex-end' }}
              >
                <TextField
                  label="Date from"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={filters.dateFrom}
                  onChange={e =>
                    setFilters((f: DataViewerFilters) => ({
                      ...f,
                      dateFrom: e.target.value,
                    }))
                  }
                  sx={{ minWidth: 170 }}
                />
                <TextField
                  label="Date to"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={filters.dateTo}
                  onChange={e =>
                    setFilters((f: DataViewerFilters) => ({
                      ...f,
                      dateTo: e.target.value,
                    }))
                  }
                  sx={{ minWidth: 170 }}
                />
                <TextField
                  label="Internal ID"
                  placeholder="e.g. 12345"
                  type="text"
                  inputMode="numeric"
                  value={filters.internalId}
                  onChange={e =>
                    setFilters((f: DataViewerFilters) => ({
                      ...f,
                      internalId: e.target.value,
                    }))
                  }
                  sx={{ minWidth: 130 }}
                />
                {recordType === 'transaction' && (
                  <TextField
                    label="Tran ID contains"
                    placeholder="e.g. INV"
                    value={filters.tranIdContains}
                    onChange={e =>
                      setFilters((f: DataViewerFilters) => ({
                        ...f,
                        tranIdContains: e.target.value,
                      }))
                    }
                    sx={{ minWidth: 160 }}
                  />
                )}
                <TextField
                  label="Status contains"
                  placeholder="e.g. Open, Pending"
                  value={filters.statusContains}
                  onChange={e =>
                    setFilters((f: DataViewerFilters) => ({
                      ...f,
                      statusContains: e.target.value,
                    }))
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ minWidth: 240, flex: 1 }}
                />
                {recordType === 'transaction' && (
                  <Autocomplete
                    size="small"
                    freeSolo
                    options={typeOptions}
                    loading={typeOptionsLoading}
                    value={filters.typeEquals}
                    onInputChange={(_, v) =>
                      setFilters((f: DataViewerFilters) => ({
                        ...f,
                        typeEquals: v,
                      }))
                    }
                    renderInput={params => (
                      <TextField
                        {...params}
                        label="Type"
                        placeholder="e.g. Invoice, Bill"
                      />
                    )}
                    sx={{ minWidth: 200 }}
                  />
                )}
                <Button
                  variant="contained"
                  onClick={loadData}
                  disabled={loading}
                >
                  Apply
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Collapse>

        {/* ─── Dynamic filter builder ─── */}
        <Collapse in={dynamicOpen} unmountOnExit>
          <Paper
            id="dv-field-filters"
            component="section"
            aria-label="Field filters"
            sx={{ p: 2 }}
          >
            <Stack spacing={2}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                flexWrap="wrap"
                useFlexGap
                gap={1}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TuneIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">Field filters</Typography>
                  {schemaLoaded && (
                    <Chip
                      size="small"
                      label={`${schemaFields.length} fields available`}
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  )}
                  {schemaLoading && <CircularProgress size={16} />}
                </Stack>
                <Stack direction="row" spacing={1}>
                  {dynamicFilters.length > 0 && (
                    <Button
                      size="small"
                      color="inherit"
                      onClick={clearDynamicFilters}
                    >
                      Clear all
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={addFilter}
                    disabled={schemaLoading || !schemaLoaded}
                  >
                    Add filter
                  </Button>
                </Stack>
              </Stack>

              {dynamicFilters.length > 0 && <Divider />}

              {dynamicFilters.map((df, idx) => (
                <FilterRow
                  key={df.id}
                  filter={df}
                  index={idx}
                  schemaFields={sortedSchemaFields}
                  fieldMap={fieldMap}
                  onChange={updateFilter}
                  onRemove={removeFilter}
                />
              ))}

              {dynamicFilters.length === 0 && schemaLoaded && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ py: 1 }}
                >
                  Add filters based on any field in the{' '}
                  <strong>{currentOption.label.toLowerCase()}</strong> schema.
                  {recordType === 'transaction'
                    ? ' Line filters must all match the same line. Boolean filters apply without a value.'
                    : ' Filters apply when you load data.'}
                </Typography>
              )}

              {dynamicFilters.length > 0 && (
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    onClick={loadData}
                    disabled={loading}
                  >
                    Apply &amp; Load
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Collapse>

        {schemaWarnings.length > 0 && (dynamicOpen || columnsOpen) && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                disabled={schemaLoading}
                onClick={() => loadSchema(recordType, true)}
              >
                Retry fields
              </Button>
            }
          >
            {schemaWarnings.join(' ')}
          </Alert>
        )}

        {/* ─── Dynamic column picker ─── */}
        <Collapse in={columnsOpen} unmountOnExit>
          <Paper
            id="dv-extra-columns"
            component="section"
            aria-label="Extra columns"
            sx={{ p: 2 }}
          >
            <Stack spacing={2}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                flexWrap="wrap"
                useFlexGap
                gap={1}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ViewColumnIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">Extra columns</Typography>
                  {schemaLoaded && (
                    <Chip
                      size="small"
                      label={`${schemaFields.length} fields available`}
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  )}
                  {schemaLoading && <CircularProgress size={16} />}
                </Stack>
                {dynamicColumns.length > 0 && (
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => setDynamicColumns([])}
                  >
                    Clear all
                  </Button>
                )}
              </Stack>
              <Divider />

              {(recordType === 'transaction'
                ? [
                    { label: 'Transaction columns', line: false },
                    { label: 'Line columns', line: true },
                  ]
                : [{ label: 'Extra columns', line: null }]
              ).map(group => (
                <Box key={group.label}>
                  <Autocomplete
                    multiple
                    size="small"
                    options={sortedSchemaFields.filter(
                      sf =>
                        group.line === null ||
                        isLineField(sf.field) === group.line
                    )}
                    groupBy={schemaGroup}
                    getOptionLabel={f => `${f.label} (${f.field})`}
                    value={sortedSchemaFields.filter(
                      sf =>
                        (group.line === null ||
                          isLineField(sf.field) === group.line) &&
                        dynamicColumns.some(dc => dc.field === sf.field)
                    )}
                    onChange={(_, selected) =>
                      setDynamicColumns([
                        ...dynamicColumns.filter(
                          dc =>
                            group.line !== null &&
                            isLineField(dc.field) !== group.line
                        ),
                        ...selected.map(sf => ({
                          field: sf.field,
                          label: sf.label,
                          type: sf.type as SchemaFieldType,
                        })),
                      ])
                    }
                    renderInput={params => (
                      <TextField
                        {...params}
                        label={group.label}
                        placeholder={
                          dynamicColumns.length === 0
                            ? 'Search and add columns…'
                            : ''
                        }
                      />
                    )}
                    renderOption={(props, option) => (
                      <li {...props} key={option.field}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          width="100%"
                        >
                          <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                            {option.label}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                          >
                            {option.field}
                          </Typography>
                          <Chip
                            label={option.type}
                            size="small"
                            sx={{ fontSize: '0.65rem', height: 18 }}
                          />
                        </Stack>
                      </li>
                    )}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => {
                        const { key, ...chipProps } = getTagProps({ index });
                        return (
                          <Chip
                            key={key}
                            label={option.label}
                            size="small"
                            {...chipProps}
                          />
                        );
                      })
                    }
                    isOptionEqualToValue={(opt, val) => opt.field === val.field}
                    disabled={schemaLoading || !schemaLoaded}
                    disableCloseOnSelect
                  />
                </Box>
              ))}

              {recordType === 'transaction' && (
                <Alert severity="info">
                  {grouped
                    ? 'Transaction columns stay on the parent. Line columns appear when you expand a transaction. Apply & Load refreshes both.'
                    : usesTransactionLines({
                          recordType,
                          filters,
                          dynamicColumns,
                        })
                      ? 'Loading line columns shows one row per matching transaction line. Header totals repeat on each line; use Line: Net Amount or Line: Foreign Amount for line values.'
                      : 'Choose Transaction Line Fields to view individual lines. Line filters alone return each matching transaction once.'}{' '}
                  All line types are included unless you filter Main Line or Tax
                  Line.
                </Alert>
              )}

              {dynamicColumns.length === 0 && schemaLoaded && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ py: 0.5 }}
                >
                  Add extra columns from the{' '}
                  <strong>{currentOption.label.toLowerCase()}</strong> schema to
                  appear alongside the default columns in the query results.
                </Typography>
              )}

              {dynamicColumns.length > 0 && (
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    onClick={loadData}
                    disabled={loading}
                  >
                    Apply &amp; Load
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Collapse>

        {grouped && groupedPendingEdits && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={loadData}>
                Apply edits
              </Button>
            }
          >
            <strong>Edits not applied.</strong> The transactions below and their
            exports still use the previous filters and columns.
          </Alert>
        )}

        {groupedRequest && (
          <Paper
            sx={{
              display: grouped ? 'block' : 'none',
              overflow: 'hidden',
            }}
          >
            <GroupedTransactions
              key={groupedRequest.id}
              params={groupedRequest.params}
            />
          </Paper>
        )}

        {!grouped && loadError && (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={loadData}
                disabled={loading}
              >
                Retry
              </Button>
            }
          >
            {loadError}
            {hasData && ' The rows below are from the previous load.'}
          </Alert>
        )}

        {!grouped && loadStatus?.kind === 'partial' && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={loadData}
                disabled={loading}
              >
                Load all
              </Button>
            }
          >
            <strong>
              Showing {loadStatus.count.toLocaleString()}{' '}
              {loadStatus.count === 1 ? 'row' : 'rows'}; results are incomplete.
            </strong>{' '}
            {loadStatus.reason}
            {/[.!?]$/.test(loadStatus.reason) ? '' : '.'} Exports include only
            the rows shown.
          </Alert>
        )}

        {/* Data grid or empty state */}
        <Paper
          sx={{
            flex: 1,
            minHeight: 480,
            display: grouped && groupedRequest ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {(grouped || !hasData) && !loading ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                py: 8,
                px: 3,
                textAlign: 'center',
              }}
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
                {currentOption.icon}
              </Avatar>
              <Typography variant="subtitle1">
                {loadStatus?.kind === 'complete'
                  ? `No ${currentOption.label.toLowerCase()} match this query`
                  : currentOption.label}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ maxWidth: 420 }}
              >
                {loadStatus?.kind === 'complete'
                  ? 'Adjust or clear filters, then load again.'
                  : `${currentOption.description}. ${
                      formSummary
                        ? `${formSummary.charAt(0).toUpperCase()}${formSummary.slice(1)}. `
                        : ''
                    }Load data to query NetSuite.`}
              </Typography>
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={loadData}
                sx={{ mt: 1 }}
              >
                Load data
              </Button>
            </Box>
          ) : (
            <ToolbarContext.Provider value={toolbarValue}>
              {backgroundLoading && (
                <LinearProgress
                  aria-hidden
                  variant={totalCount ? 'determinate' : 'indeterminate'}
                  value={
                    totalCount
                      ? Math.min(100, (rows.length / totalCount) * 100)
                      : undefined
                  }
                  sx={{ height: 2 }}
                />
              )}
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <DataGrid
                  rows={rows}
                  columns={columns}
                  getRowId={gridRowId}
                  loading={loading}
                  showToolbar
                  slots={{ toolbar: ResultsToolbar }}
                  density="compact"
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
                  disableRowSelectionOnClick
                  sx={{
                    border: 'none',
                    '--DataGrid-containerBackground': tokens.surfaceMuted,
                    '& .MuiDataGrid-columnHeaderTitle': {
                      fontWeight: 600,
                      color: 'text.secondary',
                    },
                    '& .MuiDataGrid-row:hover': {
                      bgcolor: tokens.surfaceMuted,
                    },
                    '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus':
                      { outlineOffset: -2 },
                    '& .MuiDataGrid-toolbar': {
                      flex: '0 0 auto',
                      flexWrap: 'wrap',
                      rowGap: 0.5,
                      py: 0.75,
                      px: 2,
                      gap: 0.5,
                      minHeight: 52,
                      bgcolor: tokens.surfaceMuted,
                    },
                  }}
                />
              </Box>
            </ToolbarContext.Provider>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

/** Toolbar data flows through context so the grid toolbar keeps a stable identity. */
const ToolbarContext = createContext<{
  status: string;
  summary: string;
  pendingEdits: boolean;
  busy: boolean;
} | null>(null);

function ResultsToolbar() {
  const context = useContext(ToolbarContext);
  if (!context) return null;
  return (
    <Toolbar>
      <Stack
        direction="row"
        alignItems="baseline"
        gap={1.25}
        sx={{ flex: { xs: '1 1 100%', sm: '1 1 auto' }, minWidth: 0 }}
      >
        <Typography
          role="status"
          aria-live="polite"
          variant="body2"
          fontWeight={700}
          noWrap
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}
        >
          {context.busy && <CircularProgress size={12} aria-hidden />}
          <span>{context.status}</span>
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          title={context.summary}
          sx={{ minWidth: 0, display: { xs: 'none', md: 'block' } }}
        >
          {context.summary}
        </Typography>
        {context.pendingEdits && (
          <Typography
            variant="body2"
            fontWeight={600}
            color="warning.main"
            noWrap
            sx={{ flexShrink: 0 }}
          >
            Edits not applied
          </Typography>
        )}
      </Stack>
      <Tooltip title="Show or hide columns">
        <ColumnsPanelTrigger
          render={<ToolbarButton aria-label="Show or hide columns" />}
        >
          <ViewColumnIcon fontSize="small" />
        </ColumnsPanelTrigger>
      </Tooltip>
      <Tooltip title="Filter loaded rows">
        <FilterPanelTrigger
          render={<ToolbarButton aria-label="Filter loaded rows" />}
        >
          <FilterListIcon fontSize="small" />
        </FilterPanelTrigger>
      </Tooltip>
      <QuickFilter defaultExpanded style={{ flex: '1 1 180px', maxWidth: 260 }}>
        <QuickFilterControl
          render={({ ref, ...other }) => (
            <TextField
              {...other}
              inputRef={ref}
              placeholder="Search loaded rows"
              size="small"
              fullWidth
              slotProps={{
                ...other.slotProps,
                htmlInput: {
                  'aria-label': 'Search loaded rows',
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
    </Toolbar>
  );
}

function Count({ value }: { value: number | string }) {
  return (
    <Box
      component="span"
      sx={{
        minWidth: 20,
        height: 20,
        px: 0.75,
        borderRadius: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.6875rem',
        fontWeight: 700,
        lineHeight: 1,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
      }}
    >
      {typeof value === 'number' ? value.toLocaleString() : value}
    </Box>
  );
}

function PanelToggle({
  label,
  accessibleLabel,
  icon,
  open,
  count,
  controls,
  onClick,
}: {
  label: string;
  accessibleLabel: string;
  icon: React.ReactNode;
  open: boolean;
  count: number | string;
  controls: string;
  onClick: () => void;
}) {
  const active = count !== 0;
  return (
    <Button
      size="small"
      variant="outlined"
      color={open || active ? 'primary' : 'inherit'}
      startIcon={icon}
      aria-label={
        active
          ? `${accessibleLabel} (${typeof count === 'number' ? `${count} active` : 'active'})`
          : accessibleLabel
      }
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onClick}
      sx={{
        height: 34,
        bgcolor: open ? tokens.selected : 'background.paper',
        borderColor: open || active ? undefined : tokens.border,
        color: open || active ? 'primary.main' : 'text.secondary',
        gap: 0.25,
      }}
    >
      {label}
      {active && (
        <Box component="span" sx={{ ml: 0.75, display: 'inline-flex' }}>
          <Count value={count} />
        </Box>
      )}
    </Button>
  );
}

// ─── FilterRow component ───

interface FilterRowProps {
  filter: DynamicFilter;
  index: number;
  schemaFields: SchemaField[];
  fieldMap: Map<string, SchemaField>;
  onChange: (id: string, patch: Partial<DynamicFilter>) => void;
  onRemove: (id: string) => void;
}

function FilterRow({
  filter,
  index,
  schemaFields,
  fieldMap,
  onChange,
  onRemove,
}: FilterRowProps) {
  const selectedField = fieldMap.get(filter.field);
  const fieldType: SchemaFieldType = selectedField?.type ?? 'string';
  const operators = OPERATORS_BY_TYPE[fieldType];
  const needsValueInput =
    filter.operator !== 'is_true' && filter.operator !== 'is_false';

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      alignItems={{ sm: 'center' }}
      sx={{
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1.5,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          minWidth: 32,
          textAlign: 'center',
          color: 'text.secondary',
          fontWeight: 700,
        }}
      >
        {index === 0 ? 'WHERE' : 'AND'}
      </Typography>

      {/* Field picker */}
      <Autocomplete
        size="small"
        options={schemaFields}
        groupBy={schemaGroup}
        getOptionLabel={f => `${f.label} (${f.field})`}
        value={selectedField ?? null}
        onChange={(_, newVal) =>
          onChange(filter.id, { field: newVal?.field ?? '' })
        }
        renderInput={params => (
          <TextField
            {...params}
            placeholder="Select field…"
            sx={{ minWidth: 260 }}
          />
        )}
        renderOption={(props, option) => (
          <li {...props} key={option.field}>
            <Stack direction="row" spacing={1} alignItems="center" width="100%">
              <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {option.field}
              </Typography>
              <Chip
                label={option.type}
                size="small"
                sx={{ fontSize: '0.65rem', height: 18 }}
              />
            </Stack>
          </li>
        )}
        isOptionEqualToValue={(opt, val) => opt.field === val.field}
        sx={{ flex: 2 }}
      />

      {/* Operator */}
      <Select
        size="small"
        value={filter.operator}
        onChange={e =>
          onChange(filter.id, { operator: e.target.value as FilterOperator })
        }
        sx={{ minWidth: 130 }}
      >
        {operators.map(op => (
          <MenuItem key={op.value} value={op.value}>
            {op.label}
          </MenuItem>
        ))}
      </Select>

      {/* Value input — varies by type */}
      {needsValueInput && (
        <>
          {fieldType === 'enum' && selectedField?.enumValues ? (
            <Autocomplete
              size="small"
              freeSolo
              options={selectedField.enumValues}
              value={filter.value}
              onInputChange={(_, v) => onChange(filter.id, { value: v })}
              renderInput={params => (
                <TextField {...params} placeholder="Value…" />
              )}
              sx={{ flex: 2, minWidth: 180 }}
            />
          ) : fieldType === 'date' ? (
            <TextField
              size="small"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={filter.value}
              onChange={e => onChange(filter.id, { value: e.target.value })}
              sx={{ flex: 2, minWidth: 160 }}
            />
          ) : fieldType === 'number' ? (
            <TextField
              size="small"
              type="number"
              placeholder="Value…"
              value={filter.value}
              onChange={e => onChange(filter.id, { value: e.target.value })}
              sx={{ flex: 2, minWidth: 120 }}
            />
          ) : (
            <TextField
              size="small"
              placeholder={
                fieldType === 'enum' && isLineField(filter.field)
                  ? 'Internal ID…'
                  : 'Value…'
              }
              helperText={
                fieldType === 'enum' && isLineField(filter.field)
                  ? 'Use the referenced record’s internal ID.'
                  : undefined
              }
              value={filter.value}
              onChange={e => onChange(filter.id, { value: e.target.value })}
              sx={{ flex: 2, minWidth: 180 }}
            />
          )}
        </>
      )}

      <Tooltip title="Remove filter">
        <IconButton size="small" onClick={() => onRemove(filter.id)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
