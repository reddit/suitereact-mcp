import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Popover,
  Select,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getLiveDetail, listLiveLogs } from '../domain/actions/clientActions';
import {
  LogFilters,
  LogResult,
  LogTablePage,
  LogTableRequest,
  LogTableRow,
} from '../domain/types';
import FilterBar, { defaultFilters } from '../domain/views/FilterBar';
import { Icon, IconAction } from '../domain/views/icons';
import JsonInspector, { InspectorState } from '../domain/views/JsonInspector';
import LogTable, { SeverityBadge } from '../domain/views/LogTable';
import SplitDivider, {
  SPLIT_MAX,
  SPLIT_MIN,
} from '../domain/views/SplitDivider';
import { usePreference } from '../utils/preferences';
import { tokens } from './theme';

function Failure({
  result,
  retry,
  compact = false,
}: {
  result: { status: string; message: string };
  retry: () => void;
  compact?: boolean;
}) {
  const denied = result.status === 'permission_denied';
  return (
    <Stack
      role="alert"
      alignItems={compact ? 'flex-start' : 'center'}
      textAlign={compact ? 'left' : 'center'}
      spacing={0.75}
      sx={{ px: 3, py: compact ? 2 : 6, maxWidth: 520, mx: 'auto' }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: denied ? tokens.warningBg : `${tokens.severity.ERROR}12`,
          color: denied ? tokens.warningText : tokens.severity.ERROR,
        }}
      >
        <Icon name={denied ? 'lock' : 'warning'} />
      </Box>
      <Typography fontWeight={700} fontSize={15}>
        {denied ? 'Permission denied' : 'Could not load logs'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {result.message}
      </Typography>
      <Button variant="outlined" size="small" onClick={retry} sx={{ mt: 0.5 }}>
        {denied ? 'Recheck access' : 'Retry'}
      </Button>
    </Stack>
  );
}

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <Box
    component="span"
    title={`${label}: ${value}`}
    sx={{ display: 'inline-flex', gap: 0.5, minWidth: 0, maxWidth: '100%' }}
  >
    <Box component="span" sx={{ color: 'text.disabled', flexShrink: 0 }}>
      {label}
    </Box>
    <Box
      component="span"
      sx={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </Box>
  </Box>
);

export default function App() {
  const narrow = useMediaQuery(useTheme().breakpoints.down('md'));
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFocused, setDetailFocused] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<LogTableRequest['sort']>({
    field: 'date',
    direction: 'desc',
  });
  const [density, setDensity] = usePreference<'compact' | 'comfortable'>(
    'density',
    'compact',
    (value): value is 'compact' | 'comfortable' =>
      value === 'compact' || value === 'comfortable'
  );
  const [split, setSplit] = usePreference(
    'list-split',
    40,
    (value): value is number =>
      typeof value === 'number' && value >= SPLIT_MIN && value <= SPLIT_MAX
  );
  const workspace = useRef<HTMLDivElement>(null);
  const [scopeAnchor, setScopeAnchor] = useState<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const anchor = useRef<string>();
  const pendingNavigation = useRef<'first' | 'last' | null>(null);
  const accessEpoch = useRef(0);
  const inspectorStates = useRef(new Map<string, InspectorState>());
  const [filters, setFilters] = useState<LogFilters>(defaultFilters);
  const [filterKey, setFilterKey] = useState(0);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LogResult<LogTablePage> | null>(null);
  const [selected, setSelected] = useState<LogTableRow | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [detail, setDetail] = useState<{
    id: string;
    result: LogResult<{ raw: string } | null>;
  } | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState('');
  const [accountNow, setAccountNow] = useState<string>();
  const [notice, setNotice] = useState('');
  const refresh = () => {
    anchor.current = undefined;
    pendingNavigation.current = null;
    setRevision(value => value + 1);
    setDetailRevision(value => value + 1);
  };
  const clearInspection = useCallback(() => {
    setDetailOpen(false);
    setDetailFocused(false);
    setSelected(null);
    setDetail(null);
  }, []);
  const denyAccess = useCallback(() => {
    accessEpoch.current += 1;
    inspectorStates.current.clear();
    pendingNavigation.current = null;
    clearInspection();
  }, [clearInspection]);

  useEffect(() => {
    let active = true;
    const epoch = accessEpoch.current;
    setLoading(true);
    setResult(null);
    setNotice('');
    const run = async () => {
      let next: LogResult<LogTablePage>;
      try {
        next = await listLiveLogs({
          ...filters,
          page,
          pageSize,
          sort,
          anchor: anchor.current,
        });
      } catch {
        next = {
          status: 'query_error',
          message:
            'The log request failed. Check your connection and the log reader configuration, then retry.',
        };
      }
      if (!active || epoch !== accessEpoch.current) return;
      if (next.status === 'ok') {
        anchor.current = next.value.anchor || undefined;
        if (next.value.anchor) setAccountNow(next.value.anchor);
        // Logs can expire between requests; move to the last page that still
        // exists instead of showing an empty page as "no matches".
        const lastPage = Math.max(
          0,
          Math.ceil(next.value.total / pageSize) - 1
        );
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setCheckedAt(
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
        const destination = pendingNavigation.current;
        pendingNavigation.current = null;
        const found = destination
          ? next.value.rows[
              destination === 'first' ? 0 : next.value.rows.length - 1
            ]
          : next.value.rows.find(row => row.id === selectedRef.current?.id);
        if (found) setSelected(found);
        else if (selectedRef.current) {
          clearInspection();
          setNotice(
            'The selected log is not on this result page. Select a log to continue.'
          );
        }
      } else {
        if (next.status === 'permission_denied') denyAccess();
        else clearInspection();
      }
      setResult(next);
      setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, [filters, page, pageSize, sort, revision, clearInspection, denyAccess]);

  const selectedId = selected?.id;
  useEffect(() => {
    let active = true;
    const epoch = accessEpoch.current;
    setDetail(null);
    if (!selectedId) return;
    const run = async () => {
      let next: LogResult<{ raw: string } | null>;
      try {
        next = await getLiveDetail(selectedId);
      } catch {
        next = {
          status: 'query_error',
          message:
            'The log details could not be loaded. Retry or select another execution.',
        };
      }
      if (!active || epoch !== accessEpoch.current) return;
      if (next.status === 'permission_denied') {
        denyAccess();
        setResult(next);
        setLoading(false);
      } else setDetail({ id: selectedId, result: next });
    };
    void run();
    return () => {
      active = false;
    };
  }, [selectedId, detailRevision, denyAccess]);

  useEffect(() => {
    if (narrow && detailOpen) heading.current?.focus();
  }, [narrow, detailOpen]);
  const select = useCallback((row: LogTableRow) => {
    returnFocus.current = document.activeElement as HTMLElement;
    setNotice('');
    setSelected(row);
    setDetailOpen(true);
  }, []);
  const rows = result?.status === 'ok' ? result.value.rows : [];
  const hasNext = result?.status === 'ok' && result.value.hasMore;
  const selectedIndex = rows.findIndex(row => row.id === selected?.id);
  const moveLog = (direction: -1 | 1) => {
    if (loading) return;
    const row = rows[selectedIndex + direction];
    if (row) setSelected(row);
    else if (direction === 1 ? hasNext : page > 0) {
      pendingNavigation.current = direction === 1 ? 'first' : 'last';
      setPage(value => value + direction);
    }
  };
  const apply = (nextFilters: LogFilters) => {
    setFilters(nextFilters);
    setPage(0);
    anchor.current = undefined;
    pendingNavigation.current = null;
  };
  const reset = () => {
    inspectorStates.current.clear();
    apply({ ...defaultFilters });
    setFilterKey(value => value + 1);
    setSort({ field: 'date', direction: 'desc' });
    clearInspection();
    setNotice('');
  };
  const changeSort = (value: LogTableRequest['sort']) => {
    setSort(value);
    setPage(0);
    anchor.current = undefined;
  };
  const loadedDetail = detail?.id === selectedId ? detail?.result : null;
  const splitOpen = Boolean(
    selected && detailOpen && !detailFocused && !narrow
  );
  const metadata = selected
    ? [
        { label: 'Time', value: selected.date + ' (account time)' },
        {
          label: 'Script',
          value: selected.scriptName || selected.scriptId || selected.script,
        },
        {
          label: 'Deployment',
          value:
            selected.deploymentName ||
            selected.deploymentLabel ||
            'Not recorded',
        },
        { label: 'User', value: selected.userName || 'Not recorded' },
      ]
    : [];
  const logPosition =
    result?.status === 'ok' && selectedIndex >= 0
      ? page * pageSize + selectedIndex + 1
      : 0;
  const total = result?.status === 'ok' ? result.value.total : 0;
  const tableHidden = (narrow && detailOpen) || (!narrow && detailFocused);
  const collapsedBar = Boolean(selected && !detailOpen && !narrow);

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <Stack
        component="header"
        direction="row"
        alignItems="center"
        gap={1}
        sx={{
          px: { xs: 1.5, md: 2 },
          height: 44,
          bgcolor: tokens.chrome,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <Typography
          fontSize={12}
          color={tokens.chromeMuted}
          sx={{ display: { xs: 'none', sm: 'block' } }}
        >
          SuiteReact /
        </Typography>
        <Typography
          component="h1"
          fontSize={{ xs: 15, md: 16 }}
          fontWeight={700}
          sx={{ flex: 1 }}
        >
          Script Log Explorer
        </Typography>
        <Chip
          label="Read only · Live NetSuite"
          size="small"
          icon={
            <Box
              component="span"
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#4ade80',
                ml: '8px !important',
              }}
            />
          }
          sx={{
            display: { xs: 'none', sm: 'flex' },
            bgcolor: '#26364f',
            color: tokens.chromeText,
            fontSize: 11.5,
            height: 24,
          }}
        />
        <Button
          size="small"
          startIcon={<Icon name="info" sx={{ fontSize: '16px !important' }} />}
          sx={{ color: tokens.chromeText }}
          onClick={event => setScopeAnchor(event.currentTarget)}
        >
          Scope & time
        </Button>
      </Stack>
      <Popover
        open={Boolean(scopeAnchor)}
        anchorEl={scopeAnchor}
        onClose={() => setScopeAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box p={2} maxWidth={360}>
          <Typography fontWeight={600}>Read only · Live NetSuite</Typography>
          <Typography variant="body2" mt={1}>
            Shows searchable logs linked to script deployments, up to 30 days.
            Coverage can differ from NetSuite’s Script Execution Logs page. Log
            timestamps use the account time zone. “Checked” uses your browser
            clock; results refresh only when requested.
          </Typography>
        </Box>
      </Popover>
      <Box sx={{ display: tableHidden ? 'none' : 'block', flexShrink: 0 }}>
        <FilterBar
          key={filterKey}
          filters={filters}
          narrow={narrow}
          loading={loading}
          checkedAt={checkedAt}
          accountNow={accountNow}
          onApply={apply}
          onReset={reset}
          onRefresh={refresh}
        />
      </Box>
      <Box
        component="main"
        sx={{
          p: { xs: 1, md: 1.5 },
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          overflow: 'auto',
        }}
      >
        {notice && (
          <Alert
            role="status"
            severity="info"
            onClose={() => setNotice('')}
            sx={{ py: 0, flexShrink: 0 }}
          >
            {notice}
          </Alert>
        )}
        <Box
          ref={workspace}
          sx={{
            flex: 1,
            minHeight: narrow ? 220 : 0,
            display: 'flex',
            flexDirection: splitOpen ? 'row' : 'column',
            gap: collapsedBar ? 1 : 0,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Paper
            id="log-table-pane"
            component="section"
            aria-label="Execution logs"
            sx={{
              border: `1px solid ${tokens.border}`,
              overflow: 'hidden',
              display: narrow && detailOpen ? 'none' : 'flex',
              ...(!narrow && detailFocused
                ? {
                    // Kept mounted to preserve grid scroll; DataGrid icons can override visibility.
                    position: 'absolute',
                    visibility: 'hidden',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1,
                    inset: 0,
                  }
                : {}),
              flexDirection: 'column',
              flex: splitOpen ? `0 0 ${split}%` : 1,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {result && result.status !== 'ok' ? (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Failure result={result} retry={refresh} />
              </Box>
            ) : (
              <>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{
                    px: 1.5,
                    minHeight: 40,
                    flexShrink: 0,
                    borderBottom: `1px solid ${tokens.border}`,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    role="status"
                    sx={{ flex: 1, minWidth: 0 }}
                    noWrap
                  >
                    {loading ? (
                      'Loading…'
                    ) : result?.status === 'ok' ? (
                      <>
                        <Box
                          component="strong"
                          sx={{ color: 'text.primary', fontWeight: 700 }}
                        >
                          {result.value.total.toLocaleString()}
                          {result.value.capped ? '+' : ''} logs
                        </Box>
                        {` · ${rows.length} on this page`}
                      </>
                    ) : (
                      'Unavailable'
                    )}
                  </Typography>
                  {!narrow && !splitOpen && (
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <Typography
                        id="density-label"
                        variant="caption"
                        color="text.secondary"
                      >
                        Density
                      </Typography>
                      <Select
                        variant="standard"
                        disableUnderline
                        labelId="density-label"
                        value={density}
                        onChange={event =>
                          setDensity(
                            event.target.value as 'compact' | 'comfortable'
                          )
                        }
                        sx={{
                          '& .MuiSelect-select': {
                            fontSize: 13,
                            fontWeight: 600,
                          },
                        }}
                      >
                        <MenuItem value="compact">Compact</MenuItem>
                        <MenuItem value="comfortable">Comfortable</MenuItem>
                      </Select>
                    </Stack>
                  )}
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <LogTable
                    rows={rows}
                    loading={loading}
                    selected={selected?.id}
                    sort={sort}
                    onSort={changeSort}
                    onSelect={select}
                    onReset={reset}
                    narrow={narrow}
                    compact={splitOpen}
                    density={density}
                    search={filters.search}
                  />
                </Box>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={{
                    px: 1.5,
                    minHeight: 40,
                    borderTop: `1px solid ${tokens.border}`,
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    id="rows-label"
                    variant="caption"
                    color="text.secondary"
                  >
                    Rows
                  </Typography>
                  <Select
                    variant="standard"
                    disableUnderline
                    labelId="rows-label"
                    value={pageSize}
                    disabled={loading}
                    onChange={event => {
                      setPageSize(Number(event.target.value));
                      setPage(0);
                      anchor.current = undefined;
                    }}
                    sx={{
                      '& .MuiSelect-select': { fontSize: 13, fontWeight: 600 },
                    }}
                  >
                    {[10, 25, 50].map(size => (
                      <MenuItem key={size} value={size}>
                        {size}
                      </MenuItem>
                    ))}
                  </Select>
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    Page {page + 1}
                  </Typography>
                  <IconAction
                    label="Previous page"
                    icon="chevronLeft"
                    disabled={page === 0 || loading}
                    onClick={() => setPage(value => value - 1)}
                  />
                  <IconAction
                    label="Next page"
                    icon="chevronRight"
                    disabled={!hasNext || loading}
                    onClick={() => setPage(value => value + 1)}
                  />
                </Stack>
              </>
            )}
          </Paper>
          {splitOpen && (
            <SplitDivider
              container={workspace}
              value={split}
              onChange={setSplit}
            />
          )}
          <Paper
            component="section"
            aria-label="Log details"
            sx={{
              border: `1px solid ${tokens.border}`,
              px: { xs: 1.25, md: 1.5 },
              py: collapsedBar ? 0.5 : 1,
              minWidth: 0,
              minHeight: 0,
              display: !selected || (narrow && !detailOpen) ? 'none' : 'flex',
              flexDirection: 'column',
              gap: 0.75,
              flex: detailOpen ? 1 : '0 0 auto',
              overflow: 'auto',
            }}
          >
            {selected && (
              <>
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={0.75}
                  sx={{ flexShrink: 0, minHeight: 34 }}
                >
                  {narrow && (
                    <Button
                      size="small"
                      startIcon={
                        <Icon
                          name="back"
                          sx={{ fontSize: '16px !important' }}
                        />
                      }
                      onClick={() => {
                        setDetailOpen(false);
                        setDetailFocused(false);
                        requestAnimationFrame(() =>
                          returnFocus.current?.focus({ preventScroll: true })
                        );
                      }}
                      sx={{ ml: -0.75 }}
                    >
                      Back to logs
                    </Button>
                  )}
                  {!narrow && <SeverityBadge severity={selected.severity} />}
                  {!narrow && (
                    <Typography
                      component="h2"
                      ref={heading}
                      tabIndex={-1}
                      fontSize={15}
                      fontWeight={700}
                      title={selected.title}
                      sx={{
                        flex: 1,
                        minWidth: 80,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        outline: 'none',
                      }}
                    >
                      {selected.title}
                    </Typography>
                  )}
                  {narrow && <Box sx={{ flex: 1 }} />}
                  {detailOpen ? (
                    <Stack
                      direction="row"
                      alignItems="center"
                      sx={{ flexShrink: 0 }}
                    >
                      <IconAction
                        label="Previous log"
                        icon="up"
                        disabled={loading || (selectedIndex <= 0 && page === 0)}
                        onClick={() => moveLog(-1)}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          whiteSpace: 'nowrap',
                          minWidth: 44,
                          textAlign: 'center',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                        title={
                          logPosition && total
                            ? `Log ${logPosition} of ${total}`
                            : undefined
                        }
                      >
                        {loading
                          ? 'Loading…'
                          : `Log ${page * pageSize + selectedIndex + 1}`}
                      </Typography>
                      <IconAction
                        label="Next log"
                        icon="down"
                        disabled={
                          loading ||
                          (selectedIndex >= rows.length - 1 && !hasNext)
                        }
                        onClick={() => moveLog(1)}
                      />
                      {!narrow && (
                        <>
                          <Divider
                            orientation="vertical"
                            flexItem
                            sx={{ mx: 0.5, my: 0.75 }}
                          />
                          <IconAction
                            label={
                              detailFocused ? 'Show table' : 'Focus details'
                            }
                            icon={detailFocused ? 'unfocus' : 'focus'}
                            onClick={() => setDetailFocused(!detailFocused)}
                          />
                          <IconAction
                            label="Collapse details"
                            icon="dock"
                            aria-expanded
                            aria-controls="detail-content"
                            onClick={() => {
                              setDetailOpen(false);
                              setDetailFocused(false);
                            }}
                          />
                        </>
                      )}
                    </Stack>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      aria-expanded={false}
                      aria-controls="detail-content"
                      onClick={() => setDetailOpen(true)}
                    >
                      Expand details
                    </Button>
                  )}
                </Stack>
                {detailOpen && narrow && (
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <SeverityBadge severity={selected.severity} />
                    <Typography
                      component="h2"
                      ref={heading}
                      tabIndex={-1}
                      fontSize={15}
                      fontWeight={700}
                      sx={{ overflowWrap: 'anywhere', outline: 'none' }}
                    >
                      {selected.title}
                    </Typography>
                  </Stack>
                )}
                {detailOpen && (
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      columnGap: 2,
                      rowGap: 0.25,
                      fontSize: 12,
                      color: 'text.secondary',
                      flexShrink: 0,
                    }}
                  >
                    {metadata.map(item => (
                      <MetaItem key={item.label} {...item} />
                    ))}
                  </Box>
                )}
                <Box
                  id="detail-content"
                  sx={{
                    display: detailOpen ? 'flex' : 'none',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  {!loadedDetail && (
                    <Stack
                      direction="row"
                      alignItems="center"
                      gap={1}
                      role="status"
                      sx={{ py: 2 }}
                    >
                      <CircularProgress size={18} />
                      <Typography variant="body2">Loading details…</Typography>
                    </Stack>
                  )}
                  {loadedDetail?.status === 'ok' &&
                    (loadedDetail.value ? (
                      <JsonInspector
                        key={selected.id}
                        raw={loadedDetail.value.raw}
                        logId={selected.id}
                        stateCache={inspectorStates.current}
                      />
                    ) : (
                      <Alert severity="info" role="note">
                        This log is no longer available. It may have expired;
                        refresh the results.
                      </Alert>
                    ))}
                  {loadedDetail && loadedDetail.status !== 'ok' && (
                    <Failure
                      compact
                      result={loadedDetail}
                      retry={() => setDetailRevision(value => value + 1)}
                    />
                  )}
                </Box>
              </>
            )}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
