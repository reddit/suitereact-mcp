import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PreviewOutlined as PreviewIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import * as React from 'react';

import {
  dsEvaluateDynGroup,
  dsListDynGroups,
  dsSaveDynGroup,
} from '../actions/clientActions';
import {
  type DynCriteria,
  type DynGroup,
  type DynRule,
  type DynRuleOperator,
  OPERATORS_BY_TYPE,
} from '../types';

const EMPLOYEE_FIELDS = [
  { id: 'department', label: 'Department', type: 'list' as const },
  { id: 'subsidiary', label: 'Subsidiary', type: 'list' as const },
  { id: 'title', label: 'Title', type: 'string' as const },
  { id: 'class', label: 'Class', type: 'list' as const },
  { id: 'location', label: 'Location', type: 'list' as const },
  { id: 'email', label: 'Email', type: 'string' as const },
  { id: 'firstname', label: 'First name', type: 'string' as const },
  { id: 'lastname', label: 'Last name', type: 'string' as const },
  { id: 'isinactive', label: 'Inactive?', type: 'boolean' as const },
];

const DEFAULT_CRITERIA: DynCriteria = {
  logic: 'and',
  rules: [{ field: 'isinactive', op: 'is', value: false }],
};

interface Props {
  onNav: (path: string) => void;
}

export function DynGroupEditor({ onNav }: Props): React.ReactElement {
  const [groups, setGroups] = React.useState<DynGroup[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | 'new'>('new');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [criteria, setCriteria] = React.useState<DynCriteria>(DEFAULT_CRITERIA);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [previewErr, setPreviewErr] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await dsListDynGroups();
      setGroups(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (selectedId === 'new') {
      setName('');
      setDescription('');
      setCriteria(DEFAULT_CRITERIA);
      return;
    }
    const found = groups.find(g => g.id === selectedId);
    if (found) {
      setName(found.name);
      setDescription(found.description ?? '');
      try {
        const parsed = JSON.parse(found.criteriaJson) as DynCriteria;
        setCriteria(parsed);
      } catch {
        setCriteria(DEFAULT_CRITERIA);
      }
    }
  }, [selectedId, groups]);

  const updateRule = (idx: number, patch: Partial<DynRule>): void => {
    setCriteria(prev => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));
  };

  const addRule = (): void => {
    setCriteria(prev => ({
      ...prev,
      rules: [...prev.rules, { field: 'department', op: 'anyOf', value: [] }],
    }));
  };

  const removeRule = (idx: number): void => {
    setCriteria(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== idx),
    }));
  };

  const onPreview = async (): Promise<void> => {
    setPreviewBusy(true);
    setPreviewErr(null);
    setPreviewCount(null);
    try {
      const r = await dsEvaluateDynGroup({ criteria, limit: 0 });
      setPreviewCount(r.total);
    } catch (e) {
      setPreviewErr((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const onSave = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await dsSaveDynGroup({
        groupId: selectedId === 'new' ? undefined : selectedId,
        name: name.trim(),
        description: description.trim() || undefined,
        criteria,
      });
      setInfo('Saved.');
      await refresh();
      setSelectedId(result.groupId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 980 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          Dynamic permission groups
        </Typography>
        <Button onClick={() => onNav('/')}>Done</Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {info}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Paper sx={{ p: 2, width: { md: 280 } }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Groups
          </Typography>
          {loading && <CircularProgress size={18} />}
          {!loading && (
            <Stack spacing={0.5}>
              <Button
                variant={selectedId === 'new' ? 'contained' : 'text'}
                startIcon={<AddIcon />}
                onClick={() => setSelectedId('new')}
                size="small"
                sx={{ justifyContent: 'flex-start' }}
              >
                New group
              </Button>
              {groups.map(g => (
                <Button
                  key={g.id}
                  size="small"
                  variant={selectedId === g.id ? 'contained' : 'text'}
                  onClick={() => setSelectedId(g.id)}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  {g.name}
                </Button>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper sx={{ p: 3, flex: 1 }}>
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              size="small"
            />
            <TextField
              label="Description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              size="small"
              multiline
              minRows={2}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Match
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={criteria.logic}
                onChange={(_, v) =>
                  v && setCriteria(prev => ({ ...prev, logic: v }))
                }
                size="small"
              >
                <ToggleButton value="and">All rules (AND)</ToggleButton>
                <ToggleButton value="or">Any rule (OR)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Rules
              </Typography>
              <Stack spacing={1}>
                {criteria.rules.map((rule, idx) => {
                  const fieldDef =
                    EMPLOYEE_FIELDS.find(f => f.id === rule.field) ??
                    EMPLOYEE_FIELDS[0];
                  const operators = OPERATORS_BY_TYPE[fieldDef.type] ?? [];
                  return (
                    <Stack
                      key={idx}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ sm: 'center' }}
                    >
                      <TextField
                        select
                        size="small"
                        label="Field"
                        value={rule.field}
                        onChange={e =>
                          updateRule(idx, { field: e.target.value, value: '' })
                        }
                        sx={{ minWidth: 180 }}
                      >
                        {EMPLOYEE_FIELDS.map(f => (
                          <MenuItem key={f.id} value={f.id}>
                            {f.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        size="small"
                        label="Op"
                        value={rule.op}
                        onChange={e =>
                          updateRule(idx, {
                            op: e.target.value as DynRuleOperator,
                          })
                        }
                        sx={{ minWidth: 140 }}
                      >
                        {operators.map(op => (
                          <MenuItem key={op} value={op}>
                            {op}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        label="Value"
                        value={
                          rule.value === undefined || rule.value === null
                            ? ''
                            : Array.isArray(rule.value)
                              ? rule.value.join(',')
                              : String(rule.value)
                        }
                        onChange={e =>
                          updateRule(idx, {
                            value:
                              rule.op === 'anyOf' || rule.op === 'noneOf'
                                ? e.target.value
                                    .split(',')
                                    .map(v => v.trim())
                                    .filter(Boolean)
                                : e.target.value,
                          })
                        }
                        sx={{ flex: 1, minWidth: 200 }}
                      />
                      <IconButton size="small" onClick={() => removeRule(idx)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Stack>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addRule}
                sx={{ mt: 1 }}
              >
                Add rule
              </Button>
            </Box>

            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                variant="outlined"
                startIcon={<PreviewIcon />}
                onClick={onPreview}
                disabled={previewBusy}
              >
                Preview matches
              </Button>
              {previewBusy && <CircularProgress size={16} />}
              {previewCount !== null && !previewBusy && (
                <Chip
                  size="small"
                  color="primary"
                  label={`${previewCount} employee${previewCount === 1 ? '' : 's'} match`}
                />
              )}
              {previewErr && (
                <Typography variant="caption" color="error">
                  {previewErr}
                </Typography>
              )}
            </Stack>

            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={onSave}
                disabled={busy}
              >
                Save group
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
