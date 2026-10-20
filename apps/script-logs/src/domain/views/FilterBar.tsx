import {
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { tokens } from '../../App/theme';
import { LogFilters, ScriptLogScript } from '../types';
import { Icon } from './icons';
import ScriptLookup from './ScriptLookup';

export const defaultFilters: LogFilters = {
  search: '',
  hours: 24,
  script: '',
  deployment: '',
  severity: '',
};
const pad = (value: number) => String(value).padStart(2, '0');
/** Browser-local wall time in the server's account-time literal format. */
/**
 * Formats a wall-clock instant held in a Date's UTC fields. Account times
 * are shifted through UTC so the browser's time zone never applies.
 */
const toLiteral = (date: Date, seconds = '00') =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${seconds}`;
/** Last 24 hours ending at the account's current time, or blank if unknown. */
const accountDayRange = (accountNow?: string) => {
  if (!accountNow || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(accountNow))
    return { from: '', to: '' };
  const now = new Date(accountNow.replace(' ', 'T') + 'Z');
  return {
    from: toLiteral(new Date(now.getTime() - 24 * 3600000)),
    to: toLiteral(now, '59'),
  };
};
const toInput = (literal = '') => literal.slice(0, 16).replace(' ', 'T');
const fromInput = (value: string, seconds: string) =>
  value ? `${value.replace('T', ' ')}:${seconds}` : '';
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const shortLiteral = (literal = '') =>
  literal
    ? `${MONTHS[Number(literal.slice(5, 7)) - 1]} ${Number(literal.slice(8, 10))} ${literal.slice(11, 16)}`
    : '…';
export const windowLabel = (filters: LogFilters) =>
  filters.hours === 0
    ? `${shortLiteral(filters.from)} – ${shortLiteral(filters.to)}`
    : {
        1: 'Last hour',
        24: 'Last 24 hours',
        168: 'Last 7 days',
        720: 'Last 30 days',
      }[filters.hours];
const customError = (draft: LogFilters) =>
  draft.hours !== 0
    ? ''
    : !draft.from || !draft.to
      ? 'Choose a start and an end.'
      : draft.from >= draft.to
        ? 'Start must be before end.'
        : '';

export default function FilterBar({
  filters,
  narrow,
  loading,
  checkedAt,
  accountNow,
  onApply,
  onReset,
  onRefresh,
}: {
  filters: LogFilters;
  narrow: boolean;
  loading: boolean;
  checkedAt: string;
  /** Account-time "now" (YYYY-MM-DD HH:MM:SS) from the latest result. */
  accountNow?: string;
  onApply: (filters: LogFilters) => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [script, setScript] = useState<ScriptLogScript | null>(null);
  const [deployment, setDeployment] = useState<ScriptLogScript | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const comparable = ({ from, to, ...rest }: LogFilters) =>
    JSON.stringify(rest.hours === 0 ? { ...rest, from, to } : rest);
  const dirty = comparable(draft) !== comparable(filters);
  const rangeError = customError(draft);
  const update = <K extends keyof LogFilters>(key: K, value: LogFilters[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }));
  const count = [
    filters.script,
    filters.deployment,
    filters.severity,
    filters.hours !== 24,
  ].filter(Boolean).length;
  const summary = [
    filters.search ? `“${filters.search}”` : 'All titles and details',
    windowLabel(filters),
    filters.severity || 'All levels',
    ...labels,
  ]
    .filter(Boolean)
    .join(' · ');
  const range = draft.hours === 0 && (
    <Stack
      role="group"
      aria-label="Custom time range"
      direction="row"
      alignItems="flex-start"
      flexWrap="wrap"
      gap={1}
      mt={narrow ? 0 : 1}
      sx={{ gridColumn: '1 / -1' }}
    >
      {(
        [
          ['from', 'From', '00'],
          ['to', 'To', '59'],
        ] as const
      ).map(([key, label, seconds]) => (
        <TextField
          key={key}
          type="datetime-local"
          label={label}
          value={toInput(draft[key])}
          onChange={event =>
            update(key, fromInput(event.target.value, seconds))
          }
          error={Boolean(rangeError) && (key === 'to' || !draft.from)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: { xs: '100%', sm: 220 } }}
        />
      ))}
      <Typography
        variant="caption"
        role={rangeError ? 'alert' : undefined}
        color={rangeError ? 'error' : 'text.secondary'}
        sx={{ alignSelf: 'center', maxWidth: 360 }}
      >
        {rangeError ||
          'NetSuite account time. Only logs from the last 30 days are searchable.'}
      </Typography>
    </Stack>
  );
  return (
    <Box
      component="form"
      aria-label="Log query"
      onSubmit={event => {
        event.preventDefault();
        setLabels([script?.label || '', deployment?.label || '']);
        setRevision(value => value + 1);
        setExpanded(false);
        if (rangeError) return;
        const { from, to, ...rest } = draft;
        onApply(draft.hours === 0 ? { ...rest, from, to } : rest);
      }}
      sx={{
        px: { xs: 1.5, md: 2 },
        pt: 1.25,
        pb: 0.75,
        bgcolor: 'background.paper',
        borderBottom: `1px solid ${tokens.border}`,
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 0.75,
          alignItems: 'start',
          gridTemplateColumns: narrow
            ? '1fr auto'
            : 'minmax(200px,1.6fr) minmax(150px,1fr) minmax(160px,1fr) 150px 128px auto',
        }}
      >
        <TextField
          label="Search titles and details"
          placeholder="Title, message, or request ID…"
          value={draft.search}
          onChange={event => update('search', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        {narrow && (
          <Button
            aria-expanded={expanded}
            aria-controls="query-filters"
            onClick={() => setExpanded(!expanded)}
          >
            Filters{count ? ` (${count})` : ''}
          </Button>
        )}
        <Box
          id="query-filters"
          sx={{
            display: narrow ? (expanded ? 'grid' : 'none') : 'contents',
            gridColumn: '1 / -1',
            gap: 1,
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          <Box sx={{ gridColumn: narrow ? '1 / -1' : 'auto' }}>
            <ScriptLookup
              compact
              key={`${revision}-script`}
              kind="script"
              value={script}
              onChange={option => {
                setScript(option);
                if (draft.script !== option?.value) setDeployment(null);
                setDraft(previous => ({
                  ...previous,
                  script: option?.value || '',
                  deployment:
                    previous.script === option?.value
                      ? previous.deployment
                      : '',
                }));
              }}
            />
          </Box>
          <Box sx={{ gridColumn: narrow ? '1 / -1' : 'auto' }}>
            <ScriptLookup
              compact
              key={`${revision}-deployment`}
              kind="deployment"
              value={deployment}
              script={draft.script}
              onChange={option => {
                setDeployment(option);
                if (option?.script)
                  setScript({
                    value: option.script,
                    label: option.scriptLabel || option.script,
                    scriptId: option.parentScriptId || '',
                  });
                setDraft(previous => ({
                  ...previous,
                  deployment: option?.value || '',
                  script: option?.script || previous.script,
                }));
              }}
            />
          </Box>
          <TextField
            select
            label="Time window"
            value={draft.hours}
            slotProps={{
              select: {
                renderValue: value =>
                  value === 0
                    ? 'Custom'
                    : windowLabel({
                        ...draft,
                        hours: value as LogFilters['hours'],
                      }),
              },
            }}
            onChange={event => {
              const hours = Number(event.target.value) as LogFilters['hours'];
              setDraft(previous =>
                hours === 0
                  ? {
                      ...previous,
                      hours,
                      from: previous.from || accountDayRange(accountNow).from,
                      to: previous.to || accountDayRange(accountNow).to,
                    }
                  : { ...previous, hours }
              );
            }}
          >
            {[
              [1, 'Last hour'],
              [24, 'Last 24 hours'],
              [168, 'Last 7 days'],
              [720, 'Last 30 days'],
              [0, 'Custom range…'],
            ].map(([value, label]) => (
              <MenuItem key={value} value={value} divider={value === 720}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Log type"
            value={draft.severity}
            onChange={event =>
              update('severity', event.target.value as LogFilters['severity'])
            }
          >
            <MenuItem value="">All levels</MenuItem>
            {['ERROR', 'EMERGENCY', 'AUDIT', 'DEBUG'].map(value => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          {narrow && range}
        </Box>
        <Button
          type="submit"
          variant="contained"
          disabled={loading || Boolean(rangeError)}
          sx={{
            minHeight: 40,
            px: 2.5,
            gridColumn: narrow ? '1 / -1' : 'auto',
            ...(dirty && {
              boxShadow: theme => `0 0 0 3px ${theme.palette.primary.main}33`,
            }),
          }}
        >
          Search logs
        </Button>
      </Box>
      {!narrow && range}
      <Stack
        direction="row"
        gap={0.5}
        alignItems="center"
        flexWrap={narrow ? 'wrap' : 'nowrap'}
        mt={0.5}
        minHeight={30}
      >
        <Typography
          variant="caption"
          color={dirty ? tokens.warningText : 'text.secondary'}
          title={summary}
          sx={{
            ...(dirty && {
              bgcolor: tokens.warningBg,
              borderRadius: 1,
              px: 0.75,
              py: 0.25,
            }),
            flex: narrow ? '1 0 100%' : 1,
            minWidth: 0,
            ...(narrow
              ? {}
              : {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }),
          }}
        >
          <strong>
            {dirty ? 'Unapplied changes. Showing: ' : 'Showing: '}
          </strong>
          {summary}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ whiteSpace: 'nowrap', flex: narrow ? 1 : undefined }}
        >
          {checkedAt ? `Checked ${checkedAt}` : ''}
        </Typography>
        <Button
          size="small"
          disabled={loading}
          onClick={onRefresh}
          startIcon={
            <Icon name="refresh" sx={{ fontSize: '16px !important' }} />
          }
        >
          Refresh
        </Button>
        <Button
          size="small"
          color="inherit"
          disabled={loading}
          onClick={onReset}
          sx={{ color: 'text.secondary' }}
        >
          Reset
        </Button>
      </Stack>
    </Box>
  );
}
