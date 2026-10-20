import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Fragment, useCallback, useEffect, useState } from 'react';

import {
  exportRowsToCsv,
  fetchRecordUrlTemplates,
  fetchTransactionChildren,
  fetchTransactionParents,
} from '../actions/clientActions';
import { isActiveFilter, isLineField } from '../query';
import {
  type DataViewerCursor,
  type DataViewerGridRow,
  type FetchRecordsParams,
  GROUP_PAGE_SIZE,
  type TransactionLineCounts,
  type TransactionSort,
} from '../types';
import { useTransactionPages } from './useTransactionPages';

function display(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number')
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value == null || value === '' ? '—' : String(value);
}

function Pager({
  page,
  hasMore,
  loading,
  go,
  noun,
}: {
  page: number;
  hasMore: boolean;
  loading: boolean;
  go: (page: number) => void;
  noun: string;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      justifyContent="flex-end"
      sx={{ p: 1.5 }}
    >
      <Typography variant="caption" color="text.secondary">
        {noun} page {page + 1} · up to {GROUP_PAGE_SIZE} per page
      </Typography>
      <Button
        size="small"
        disabled={loading || page === 0}
        onClick={() => go(page - 1)}
        aria-label={`Previous ${noun.toLowerCase()} page`}
      >
        Previous
      </Button>
      <Button
        size="small"
        disabled={loading || !hasMore}
        onClick={() => go(page + 1)}
        aria-label={`Next ${noun.toLowerCase()} page`}
      >
        Next
      </Button>
    </Stack>
  );
}

function LinePage({
  params,
  parentId,
  showAll,
  filtered,
}: {
  params: FetchRecordsParams;
  parentId: number;
  showAll: boolean;
  filtered: boolean;
}) {
  const [sort, setSort] = useState<TransactionSort>();
  const fetchPage = useCallback(
    (cursor?: DataViewerCursor) =>
      fetchTransactionChildren(params, parentId, showAll, cursor, sort),
    [params, parentId, showAll, sort]
  );
  const { result, page, loading, error, go, retry } =
    useTransactionPages(fetchPage);
  const [lastColumns, setLastColumns] = useState<GridColDef[]>([]);
  useEffect(() => {
    if (result) setLastColumns(result.columns);
  }, [result]);
  const matchColumn: GridColDef = {
    field: 'line_matches',
    headerName: 'Filter match',
    width: 140,
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    renderCell: p => (
      <Chip
        size="small"
        label={p.value === 'T' ? 'Matches' : 'Context'}
        color={p.value === 'T' ? 'primary' : 'default'}
        variant={p.value === 'T' ? 'filled' : 'outlined'}
      />
    ),
  };
  // Keep the selected field available during loading. MUI removes sorting
  // for fields that disappear from its column definitions.
  const columns = [
    ...(filtered && showAll ? [matchColumn] : []),
    ...(result?.columns ?? lastColumns),
  ];
  return (
    <Box>
      {error && (
        <Alert
          severity="error"
          action={<Button onClick={retry}>Retry lines</Button>}
        >
          {error}
        </Alert>
      )}
      <Box
        sx={{
          height: result
            ? Math.min(340, 56 + Math.max(3, result.rows.length) * 36)
            : 200,
        }}
      >
        <DataGrid
          aria-label={`Lines for transaction ${parentId}`}
          rows={result?.rows ?? []}
          columns={columns}
          getRowId={row => row.__rowId}
          loading={loading}
          hideFooter
          disableRowSelectionOnClick
          density="compact"
          disableColumnFilter
          sortingMode="server"
          sortModel={[
            { field: sort?.field ?? 'line_id', sort: sort?.direction ?? 'asc' },
          ]}
          onSortModelChange={model => {
            const next = model[0];
            setSort(
              !next?.sort || (next.field === 'line_id' && next.sort === 'asc')
                ? undefined
                : { field: next.field, direction: next.sort }
            );
          }}
          getRowClassName={row =>
            filtered && showAll && row.row.line_matches === 'T'
              ? 'matching-line'
              : ''
          }
          sx={{
            bgcolor: 'background.paper',
            '& .matching-line': {
              bgcolor: theme => alpha(theme.palette.primary.main, 0.08),
            },
          }}
        />
      </Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
      >
        <Button
          size="small"
          disabled={loading || !result?.rows.length}
          onClick={() => {
            if (result)
              exportRowsToCsv(
                columns,
                result.rows,
                `transaction-${parentId}_${showAll ? 'all' : 'matching'}-lines_page-${page + 1}.csv`
              );
          }}
        >
          Export line page
        </Button>
        <Pager
          page={page}
          hasMore={result?.hasMore ?? false}
          loading={loading}
          go={go}
          noun="Lines"
        />
      </Stack>
    </Box>
  );
}

function TransactionGroup({
  row,
  columns,
  counts,
  params,
  template,
}: {
  row: DataViewerGridRow;
  columns: GridColDef[];
  counts: TransactionLineCounts;
  params: FetchRecordsParams;
  template?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visited, setVisited] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const filtered = Boolean(
    params.dynamicFilters?.some(f => isLineField(f.field) && isActiveFilter(f))
  );
  const label = String(row.tranid || row.id);
  const detailId = `transaction-${row.id}-lines`;
  let href: string | undefined;
  if (template) {
    try {
      const url = new URL(template);
      url.searchParams.set('id', String(row.id));
      href = url.toString();
    } catch {
      /* No link for an invalid server template. */
    }
  }
  return (
    <Fragment>
      <TableRow
        hover
        sx={{
          '& > td': { borderBottom: expanded ? 0 : undefined },
          bgcolor: expanded ? 'action.hover' : undefined,
        }}
      >
        <TableCell padding="checkbox">
          <IconButton
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => {
              setVisited(true);
              setExpanded(v => !v);
            }}
          >
            {expanded ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
          </IconButton>
        </TableCell>
        {columns.map(column => (
          <TableCell
            key={column.field}
            align={column.type === 'number' ? 'right' : 'left'}
            sx={{
              whiteSpace: 'nowrap',
              fontWeight: column.field === 'tranid' ? 700 : 400,
            }}
          >
            {column.field === 'tranid' && href ? (
              <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                {label}
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </Link>
            ) : column.field === 'id' ? (
              String(row.id ?? '—')
            ) : (
              display(row[column.field])
            )}
          </TableCell>
        ))}
        <TableCell>
          <Chip
            size="small"
            color={filtered ? 'primary' : 'default'}
            variant="outlined"
            label={
              filtered
                ? `${counts.matching.toLocaleString()} matching of ${counts.total.toLocaleString()} lines`
                : `${counts.total.toLocaleString()} lines`
            }
            sx={{ whiteSpace: 'nowrap' }}
          />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell
          colSpan={columns.length + 2}
          sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}
        >
          <Collapse in={expanded} timeout="auto">
            <Box
              id={detailId}
              role="region"
              aria-label={`${label} transaction lines`}
              sx={{
                p: 2,
                bgcolor: theme => alpha(theme.palette.primary.main, 0.025),
                borderLeft: 3,
                borderColor: 'primary.main',
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Box>
                  <Typography variant="subtitle2">
                    {label} · Transaction lines
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {filtered
                      ? `${counts.matching.toLocaleString()} matching lines of ${counts.total.toLocaleString()} · ${showAll ? 'Including context' : 'Matching lines only'}`
                      : `${counts.total.toLocaleString()} lines · All line types`}
                  </Typography>
                </Box>
                {filtered && (
                  <Button
                    size="small"
                    variant="outlined"
                    aria-pressed={showAll}
                    onClick={() => setShowAll(v => !v)}
                  >
                    {showAll ? 'Show matching lines' : 'Show all lines'}
                  </Button>
                )}
              </Stack>
              {visited && (
                <LinePage
                  params={params}
                  parentId={Number(row.id)}
                  showAll={showAll}
                  filtered={filtered}
                />
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

export default function GroupedTransactions({
  params,
}: {
  params: FetchRecordsParams;
}) {
  const [sort, setSort] = useState<TransactionSort>();
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [linkWarning, setLinkWarning] = useState('');
  const fetchPage = useCallback(
    async (cursor?: DataViewerCursor) => {
      const result = await fetchTransactionParents(params, cursor, sort);
      const types = [
        ...new Set(
          result.rows.map(r => String(r.recordtype || '')).filter(Boolean)
        ),
      ];
      if (types.length) {
        try {
          const links = await fetchRecordUrlTemplates(types);
          setTemplates(previous => ({ ...previous, ...links }));
          setLinkWarning('');
        } catch {
          setLinkWarning(
            'NetSuite record links could not be loaded. Data is still available.'
          );
        }
      }
      return result;
    },
    [params, sort]
  );
  const { result, page, loading, error, go, retry } =
    useTransactionPages(fetchPage);
  const labels: Record<string, string> = {
    id: 'Internal ID',
    tranid: 'Transaction',
    type: 'Type',
    trandate: 'Date',
    entity: 'Entity',
    status: 'Status',
    foreigntotal: 'Transaction total',
  };
  const columns = (result?.columns ?? []).map(c => ({
    ...c,
    headerName: labels[c.field] ?? c.headerName,
  }));
  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        justifyContent="space-between"
        alignItems="center"
        sx={{ p: 2 }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            Transactions &amp; their lines
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Expand a transaction to see its lines. Totals appear once, in
            transaction currency. Headers sort all matching transactions; line
            headers sort within one transaction.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<CloudDownloadIcon />}
          sx={{ flexShrink: 0 }}
          disabled={loading || !result?.rows.length}
          onClick={() => {
            if (result)
              exportRowsToCsv(
                columns,
                result.rows,
                `transactions_page-${page + 1}.csv`
              );
          }}
        >
          Export transaction page
        </Button>
      </Stack>
      {loading && <LinearProgress aria-label="Loading transactions" />}
      {error && (
        <Alert
          severity="error"
          action={<Button onClick={retry}>Retry transactions</Button>}
        >
          {error}
        </Alert>
      )}
      {linkWarning && <Alert severity="warning">{linkWarning}</Alert>}
      {result && !result.rows.length && (
        <Alert severity="info">No transactions match these filters.</Alert>
      )}
      {result && (
        <TableContainer>
          <Table size="small" aria-label="Grouped transactions">
            <TableHead>
              <TableRow>
                <TableCell>
                  <span
                    className="sr-only"
                    style={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      overflow: 'hidden',
                    }}
                  >
                    Expand
                  </span>
                </TableCell>
                {columns.map(c => (
                  <TableCell
                    key={c.field}
                    align={c.type === 'number' ? 'right' : 'left'}
                    sortDirection={
                      (sort?.field ?? 'id') === c.field
                        ? (sort?.direction ?? 'asc')
                        : false
                    }
                    sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    <TableSortLabel
                      active={(sort?.field ?? 'id') === c.field}
                      direction={
                        (sort?.field ?? 'id') === c.field
                          ? (sort?.direction ?? 'asc')
                          : 'asc'
                      }
                      onClick={() => {
                        const direction =
                          (sort?.field ?? 'id') === c.field &&
                          (sort?.direction ?? 'asc') === 'asc'
                            ? 'desc'
                            : 'asc';
                        setSort(
                          c.field === 'id' && direction === 'asc'
                            ? undefined
                            : { field: c.field, direction }
                        );
                      }}
                    >
                      {c.headerName}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell>Lines</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.rows.map(row => (
                <TransactionGroup
                  key={`${page}/${row.id}`}
                  row={row}
                  columns={columns}
                  counts={result.lineCounts[String(row.id)]}
                  params={params}
                  template={templates[String(row.recordtype)]}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Pager
        page={page}
        hasMore={result?.hasMore ?? false}
        loading={loading}
        go={go}
        noun="Transactions"
      />
    </Box>
  );
}
