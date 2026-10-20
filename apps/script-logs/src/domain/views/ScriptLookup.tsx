import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

import { searchLiveScripts } from '../actions/clientActions';
import { LogResult, ScriptLogScript, ScriptLogScriptPage } from '../types';

export default function ScriptLookup({
  kind,
  value,
  onChange,
  script,
  compact = false,
}: {
  kind: 'script' | 'deployment';
  value: ScriptLogScript | null;
  onChange: (value: ScriptLogScript | null) => void;
  script?: string;
  compact?: boolean;
}) {
  const [input, setInput] = useState(value?.label || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    term: string;
    scope: string;
    result: LogResult<ScriptLogScriptPage>;
  } | null>(null);
  const label = kind === 'script' ? 'Script' : 'Deployment';
  const scope = `${kind}:${script || ''}`;
  const term = input.trim();
  const eligible = open && term.length >= 2 && input !== value?.label;

  useEffect(() => setInput(value?.label || ''), [value]);
  useEffect(() => {
    setLoading(eligible);
    if (!eligible) return;
    setResponse(null);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await searchLiveScripts(
        term,
        controller.signal,
        kind,
        script
      );
      if (!controller.signal.aborted && result) {
        setResponse({ term, scope, result });
        setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, eligible, revision, kind, script, scope]);

  const result =
    response?.term === term && response.scope === scope
      ? response.result
      : null;
  const failure = result && result.status !== 'ok' ? result.status : null;
  const options = result?.status === 'ok' ? result.value.options : [];
  const helper =
    failure === 'permission_denied'
      ? `${label} lookup denied. Ask your administrator to check SuiteScript View and analytics access.`
      : failure
        ? `${label} lookup failed. Check the connection and deployed lookup action, then retry.`
        : result?.status === 'ok' && result.value.hasMore
          ? 'Showing the first 20 matches. Keep typing to narrow the list.'
          : kind === 'deployment' && script
            ? 'Type 2+ characters to find a deployment of the selected script.'
            : 'Type at least 2 characters; select a match to filter logs.';

  return (
    <Stack sx={{ flex: 1, minWidth: 0 }}>
      <Autocomplete
        id={`${kind}-filter`}
        options={options}
        value={value}
        inputValue={input}
        onInputChange={(_, next) => setInput(next)}
        onChange={(_, next) => onChange(next)}
        open={open && !failure}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        autoHighlight
        clearOnBlur={!failure}
        getOptionLabel={option => option.label}
        getOptionKey={option => option.value}
        isOptionEqualToValue={(option, selected) =>
          option.value === selected.value
        }
        clearText={`Clear ${label.toLowerCase()}`}
        filterOptions={items => items}
        loading={loading}
        loadingText={`Looking up ${label.toLowerCase()}s…`}
        noOptionsText={
          failure
            ? 'Lookup unavailable'
            : term.length < 2
              ? 'Type at least 2 characters'
              : 'No matches'
        }
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <Box
              component="li"
              key={key}
              {...rest}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start !important',
                overflowWrap: 'anywhere',
              }}
            >
              <Typography variant="body2">{option.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {option.scriptId} · #{option.value}
              </Typography>
            </Box>
          );
        }}
        renderInput={params => (
          <TextField
            {...params}
            label={label}
            placeholder="Type a name or ID…"
            error={Boolean(failure)}
            helperText={
              !compact ||
              failure ||
              (result?.status === 'ok' && result.value.hasMore)
                ? helper
                : undefined
            }
            slotProps={{
              htmlInput: { ...params.inputProps, maxLength: 100 },
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading && (
                      <CircularProgress
                        size={16}
                        aria-label={`Looking up ${label.toLowerCase()}s`}
                      />
                    )}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
              formHelperText: { role: 'status' },
            }}
          />
        )}
      />
      {failure && (
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            setOpen(true);
            setRevision(current => current + 1);
          }}
        >
          Retry {label.toLowerCase()} lookup
        </Button>
      )}
    </Stack>
  );
}
