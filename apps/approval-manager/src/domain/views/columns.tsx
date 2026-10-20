import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Box, Link, Skeleton, Typography } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';

import { tokens } from '../../App/theme';
import { formatDate, formatMoney, relativeAge, toDate } from '../format';
import type { PendingTransaction } from '../types';

const clamp2 = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  whiteSpace: 'normal',
  lineHeight: 1.4,
} as const;

const muted = (text: string) => (
  <Typography component="span" fontSize={13} color="text.disabled">
    {text}
  </Typography>
);

export function buildRecordUrl(template: string, id: string): string {
  try {
    const url = new URL(template);
    url.searchParams.set('id', id);
    return url.toString();
  } catch {
    return `${template}${id}`;
  }
}

export function buildColumns(
  templates: Record<string, string>,
  narrow = false
): GridColDef<PendingTransaction>[] {
  return [
    {
      field: 'tranid',
      headerName: 'Number',
      width: narrow ? undefined : 190,
      flex: narrow ? 1 : undefined,
      minWidth: narrow ? 150 : undefined,
      renderCell: ({ row }) => {
        const template = templates[row.recordtype];
        const label = row.tranid || `#${row.id}`;
        const number = template ? (
          <Link
            href={buildRecordUrl(template, row.id)}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            onClick={event => event.stopPropagation()}
            aria-label={`Open ${label} in NetSuite (new tab)`}
            sx={{
              fontFamily: tokens.mono,
              fontSize: 13,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              minWidth: 0,
            }}
          >
            <Box
              component="span"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {label}
            </Box>
            <OpenInNewIcon sx={{ fontSize: 13, flexShrink: 0 }} />
          </Link>
        ) : (
          <Typography fontFamily={tokens.mono} fontSize={13} fontWeight={600}>
            {label}
          </Typography>
        );
        if (!narrow) return number;
        return (
          <Box sx={{ minWidth: 0, lineHeight: 1.35 }}>
            {number}
            <Box sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              {[formatDate(row.trandate), relativeAge(row.trandate)]
                .filter(Boolean)
                .join(' · ')}
            </Box>
          </Box>
        );
      },
    },
    {
      field: 'trandate',
      headerName: 'Date',
      width: 130,
      type: 'date',
      valueGetter: (value: string) => toDate(value),
      renderCell: ({ row }) => (
        <Box sx={{ lineHeight: 1.35, fontVariantNumeric: 'tabular-nums' }}>
          <Box>{formatDate(row.trandate)}</Box>
          <Box sx={{ fontSize: 11.5, color: 'text.secondary' }}>
            {relativeAge(row.trandate)}
          </Box>
        </Box>
      ),
    },
    {
      field: 'entity',
      headerName: 'Name',
      flex: 1,
      minWidth: 170,
      renderCell: ({ value }) =>
        value ? <Box sx={clamp2}>{value}</Box> : muted('Not set'),
    },
    {
      field: 'memo',
      headerName: 'Memo',
      flex: 1.5,
      minWidth: 220,
      renderCell: ({ value }) =>
        value ? (
          <Box sx={{ ...clamp2, color: 'text.secondary' }} title={value}>
            {value}
          </Box>
        ) : (
          muted('No memo')
        ),
    },
    {
      // Hidden in the grid (Amount shows the code) but exported so CSV amounts keep their units.
      field: 'currency',
      headerName: 'Currency',
      width: 90,
    },
    {
      field: 'amount',
      headerName: 'Amount',
      type: 'number',
      width: narrow ? 130 : 160,
      align: 'right',
      headerAlign: 'right',
      renderCell: ({ row }) =>
        row.amountStatus === 'loading' ? (
          <Box
            sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}
          >
            <Skeleton width={90} aria-label="Amount loading" />
          </Box>
        ) : row.amountStatus === 'unavailable' ? (
          <Box
            sx={{ width: '100%', textAlign: 'right' }}
            title="Amount couldn't be loaded"
          >
            {muted('Unavailable')}
          </Box>
        ) : (
          <Box
            sx={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 600,
              textAlign: 'right',
              width: '100%',
            }}
          >
            {formatMoney(row.amount, row.currency)}
          </Box>
        ),
    },
  ];
}
