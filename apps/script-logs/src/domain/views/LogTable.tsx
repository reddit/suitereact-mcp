import {
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useMemo } from 'react';

import { severityColor, tokens } from '../../App/theme';
import { usePreference } from '../../utils/preferences';
import { LogTableRequest, LogTableRow } from '../types';
import Highlight from './Highlight';
import { Icon } from './icons';

export function SeverityBadge({ severity }: { severity: string }) {
  const color = severityColor(severity);
  return (
    <Chip
      size="small"
      label={severity}
      sx={{
        fontSize: 10,
        height: 20,
        fontWeight: 700,
        letterSpacing: '.04em',
        color,
        bgcolor: `${color}14`,
        borderRadius: 1,
        flexShrink: 0,
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );
}

export function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <Stack
      height="100%"
      alignItems="center"
      justifyContent="center"
      spacing={0.75}
      px={2}
      py={4}
      textAlign="center"
    >
      <Icon name="empty" sx={{ fontSize: 32, color: 'text.disabled' }} />
      <Typography fontWeight={600}>No logs match your filters</Typography>
      <Typography variant="body2" color="text.secondary">
        Try a longer time window, another log type, or clear your search.
      </Typography>
      <Button size="small" variant="outlined" onClick={onReset}>
        Clear filters
      </Button>
    </Stack>
  );
}

const COMPACT_HIDDEN = {
  severity: false,
  scriptName: false,
  deploymentName: false,
  userName: false,
  preview: false,
};
const clamp = {
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.4,
  whiteSpace: 'normal',
} as const;
const metadata = (name: string, id: string) => (
  <Box
    title={[name, id].filter(Boolean).join('\n')}
    sx={{ minWidth: 0, width: '100%' }}
  >
    <Typography fontSize={13} fontWeight={500} sx={clamp}>
      {name || 'Not recorded'}
    </Typography>
    {id && (
      <Typography fontSize={11} color="text.secondary" noWrap>
        {id}
      </Typography>
    )}
  </Box>
);

export default function LogTable({
  rows,
  loading,
  selected,
  sort,
  onSort,
  onSelect,
  onReset,
  narrow,
  compact = false,
  density,
  search,
}: {
  rows: LogTableRow[];
  loading: boolean;
  selected: string | undefined;
  sort: LogTableRequest['sort'];
  onSort: (sort: LogTableRequest['sort']) => void;
  onSelect: (row: LogTableRow) => void;
  onReset: () => void;
  narrow: boolean;
  /** Inspector is open beside the grid: show a scannable worklist instead of every column. */
  compact?: boolean;
  density: 'compact' | 'comfortable';
  search: string;
}) {
  const [widths, setWidths] = usePreference<Record<string, number>>(
    'column-widths',
    {},
    (value): value is Record<string, number> =>
      Boolean(value) &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.entries(value as object).every(
        ([key, width]) =>
          [
            'date',
            'severity',
            'scriptName',
            'deploymentName',
            'userName',
            'title',
            'preview',
          ].includes(key) &&
          typeof width === 'number' &&
          width >= 90 &&
          width <= 800
      )
  );
  const columns = useMemo<GridColDef<LogTableRow>[]>(() => {
    const definitions: GridColDef<LogTableRow>[] = [
      {
        field: 'date',
        headerName: 'Timestamp',
        width: compact ? 124 : 132,
        description: 'NetSuite account time',
        renderCell: ({ row }) => (
          <Box sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
            <Box fontWeight={600}>{row.date.slice(11)}</Box>
            <Box fontSize={11} color="text.secondary">
              {row.date.slice(0, 10)}
            </Box>
          </Box>
        ),
      },
      {
        field: 'severity',
        headerName: 'Log type',
        width: 106,
        renderCell: ({ value }) => <SeverityBadge severity={value} />,
      },
      {
        field: 'scriptName',
        headerName: 'Script',
        minWidth: 155,
        flex: 1,
        renderCell: ({ row }) =>
          metadata(row.scriptName, row.scriptId || row.script),
      },
      {
        field: 'deploymentName',
        headerName: 'Deployment',
        minWidth: 165,
        flex: 1,
        renderCell: ({ row }) =>
          metadata(row.deploymentName, row.deploymentLabel || row.deployment),
      },
      {
        field: 'userName',
        headerName: 'User',
        width: 130,
        renderCell: ({ value }) => (
          <Box
            title={value || 'NetSuite did not return a logging user'}
            sx={clamp}
          >
            {value || 'Not recorded'}
          </Box>
        ),
      },
      {
        field: 'title',
        headerName: 'Log title',
        minWidth: compact ? 160 : 190,
        flex: 1.15,
        renderCell: ({ row, tabIndex }) => (
          <Button
            tabIndex={tabIndex}
            aria-label={`Inspect ${row.title}`}
            onClick={() => onSelect(row)}
            title={row.title}
            sx={{
              textAlign: 'left',
              justifyContent: 'flex-start',
              p: 0,
              color: 'text.primary',
              fontWeight: 600,
              fontSize: 13,
              minWidth: 0,
              width: '100%',
              '&:hover': { bgcolor: 'transparent', color: 'primary.main' },
            }}
          >
            {compact ? (
              <Box sx={{ minWidth: 0, width: '100%' }}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <SeverityBadge severity={row.severity} />
                  <Box
                    component="span"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Highlight text={row.title} search={search} />
                  </Box>
                </Stack>
                <Typography
                  component="span"
                  noWrap
                  display="block"
                  fontSize={11.5}
                  fontWeight={400}
                  color="text.secondary"
                  mt={0.25}
                >
                  {[
                    row.scriptName || row.scriptId || row.script,
                    row.deploymentName || row.deploymentLabel,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </Box>
            ) : (
              <Box sx={clamp}>
                <Highlight text={row.title} search={search} />
              </Box>
            )}
          </Button>
        ),
      },
      {
        field: 'preview',
        headerName: 'Log detail',
        description:
          'Preview of the first 500 characters. Sorting uses this preview; open a log for its original details.',
        minWidth: 250,
        flex: 1.7,
        renderCell: ({ row }) => (
          <Box
            title={row.preview + (row.previewTruncated ? '… (preview)' : '')}
            sx={{
              ...clamp,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              color: 'text.secondary',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            <Highlight
              text={row.preview || '(empty details)'}
              search={search}
            />
            {row.previewTruncated ? '…' : ''}
          </Box>
        ),
      },
    ];
    return definitions.map(column => ({
      ...column,
      ...(widths[column.field] && !compact
        ? { width: widths[column.field], minWidth: 90, flex: undefined }
        : {}),
      filterable: false,
    }));
  }, [compact, onSelect, search, widths]);
  if (narrow)
    return (
      <Stack sx={{ height: '100%', minHeight: 0 }}>
        <Stack direction="row" gap={0.5} p={1} alignItems="center">
          <TextField
            select
            label="Sort logs by"
            value={sort.field}
            disabled={loading}
            onChange={event =>
              onSort({
                ...sort,
                field: event.target.value as LogTableRequest['sort']['field'],
              })
            }
            sx={{ flex: 1 }}
          >
            {columns.map(column => (
              <MenuItem key={column.field} value={column.field}>
                {column.headerName}
              </MenuItem>
            ))}
          </TextField>
          <Button
            disabled={loading}
            aria-label={
              sort.direction === 'asc' ? 'Sort descending' : 'Sort ascending'
            }
            onClick={() =>
              onSort({
                ...sort,
                direction: sort.direction === 'asc' ? 'desc' : 'asc',
              })
            }
          >
            {sort.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
          </Button>
        </Stack>
        {loading && <LinearProgress aria-label="Loading logs" />}
        <Box
          data-testid="narrow-log-list"
          sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}
        >
          {!loading && !rows.length && <NoResults onReset={onReset} />}
          {rows.map(row => (
            <Box
              component="article"
              key={row.id}
              data-log-id={row.id}
              sx={{
                px: 1.5,
                py: 1,
                borderTop: `1px solid ${tokens.border}`,
                borderLeft: '3px solid',
                borderLeftColor:
                  selected === row.id ? 'primary.main' : 'transparent',
                bgcolor:
                  selected === row.id ? tokens.selected : 'background.paper',
              }}
            >
              <Stack
                direction="row"
                gap={1}
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography
                  fontSize={12}
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.date}
                </Typography>
                <SeverityBadge severity={row.severity} />
              </Stack>
              <Button
                aria-label={`Inspect ${row.title}`}
                onClick={() => onSelect(row)}
                sx={{
                  fontSize: 14,
                  p: 0,
                  my: 0.5,
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  overflowWrap: 'anywhere',
                }}
              >
                <Highlight text={row.title} search={search} />
              </Button>
              <Box
                component="dl"
                sx={{
                  m: 0,
                  display: 'grid',
                  gridTemplateColumns: '76px minmax(0,1fr)',
                  fontSize: 12,
                  gap: 0.25,
                  '& dt': { color: 'text.secondary' },
                  '& dd': { m: 0, overflowWrap: 'anywhere' },
                }}
              >
                <dt>Script</dt>
                <dd title={row.scriptId}>
                  {row.scriptName || row.scriptId || row.script}
                </dd>
                <dt>Deployment</dt>
                <dd title={row.deploymentLabel}>
                  {row.deploymentName || row.deploymentLabel || 'Not recorded'}
                </dd>
                <dt>User</dt>
                <dd>{row.userName || 'Not recorded'}</dd>
                <dt>Log detail</dt>
                <dd title={row.preview} style={{ ...clamp }}>
                  <Highlight
                    text={row.preview || '(empty details)'}
                    search={search}
                  />
                  {row.previewTruncated ? '…' : ''}
                </dd>
              </Box>
            </Box>
          ))}
        </Box>
      </Stack>
    );
  return (
    <DataGrid
      aria-label="Execution logs table"
      rows={rows}
      columns={columns}
      columnVisibilityModel={compact ? COMPACT_HIDDEN : {}}
      loading={loading}
      onColumnWidthChange={({ colDef, width }) =>
        setWidths({
          ...widths,
          [colDef.field]: Math.max(90, Math.min(800, width)),
        })
      }
      rowHeight={density === 'compact' ? 52 : 70}
      columnHeaderHeight={34}
      hideFooter
      disableColumnMenu
      disableRowSelectionOnClick
      sortingMode="server"
      sortingOrder={['asc', 'desc']}
      sortModel={[{ field: sort.field, sort: sort.direction }]}
      onSortModelChange={model => {
        const next = model[0];
        if (
          next?.sort &&
          (next.field !== sort.field || next.sort !== sort.direction)
        )
          onSort({
            field: next.field as LogTableRequest['sort']['field'],
            direction: next.sort,
          });
      }}
      onRowClick={({ row }) => onSelect(row)}
      onCellKeyDown={({ row }, event) => {
        if (event.key === 'Enter') {
          event.defaultMuiPrevented = true;
          onSelect(row);
        }
      }}
      getRowClassName={({ id }) => (selected === id ? 'selected-log' : '')}
      slots={{
        noRowsOverlay: () => <NoResults onReset={onReset} />,
      }}
      sx={{
        height: '100%',
        border: 0,
        fontSize: 13,
        '--DataGrid-containerBackground': '#f8fafc',
        '& .MuiDataGrid-columnHeaderTitle': {
          color: 'text.secondary',
          fontSize: 12,
          fontWeight: 600,
        },
        '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': {
          outline: 'none',
        },
        '& .MuiDataGrid-cell:focus-visible': {
          outline: `2px solid ${tokens.selectedRail}`,
          outlineOffset: -2,
        },
        '& .MuiDataGrid-cell': {
          px: 1.25,
          display: 'flex',
          alignItems: 'center',
        },
        '& .MuiDataGrid-row': { cursor: 'pointer' },
        '& .selected-log, & .selected-log:hover': {
          bgcolor: tokens.selected,
          boxShadow: `inset 3px 0 ${tokens.selectedRail}`,
        },
      }}
    />
  );
}
