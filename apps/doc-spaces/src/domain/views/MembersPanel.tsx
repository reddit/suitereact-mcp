import {
  ArrowBack as BackIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  TuneOutlined as DynGroupIcon,
} from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import * as React from 'react';

import {
  dsAddPermission,
  dsGetEmployees,
  dsListDynGroups,
  dsListPermissions,
  dsRevokePermission,
} from '../actions/clientActions';
import {
  type DynGroup,
  type Employee,
  type Permission,
  PERMISSION_LEVELS,
  type PermissionLevel,
  type PrincipalType,
  type Space,
} from '../types';

interface Props {
  space: Space;
  onNav: (path: string) => void;
}

export function MembersPanel({ space, onNav }: Props): React.ReactElement {
  const [perms, setPerms] = React.useState<Permission[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [employeeQuery, setEmployeeQuery] = React.useState('');
  const [employeeOptions, setEmployeeOptions] = React.useState<Employee[]>([]);
  const [employeeLoading, setEmployeeLoading] = React.useState(false);
  const [selectedEmployee, setSelectedEmployee] =
    React.useState<Employee | null>(null);
  const [grantLevel, setGrantLevel] = React.useState<PermissionLevel>('view');
  const [dynGroups, setDynGroups] = React.useState<DynGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = React.useState<DynGroup | null>(
    null
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, groups] = await Promise.all([
        dsListPermissions({ targetType: 'space', targetId: space.id }),
        dsListDynGroups().catch(() => []),
      ]);
      setPerms(list);
      setDynGroups(groups);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [space.id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!employeeQuery || employeeQuery.length < 2) {
      setEmployeeOptions([]);
      return;
    }
    let cancelled = false;
    setEmployeeLoading(true);
    const t = window.setTimeout(() => {
      dsGetEmployees({ spaceId: space.id, q: employeeQuery, limit: 25 })
        .then(emps => {
          if (!cancelled) setEmployeeOptions(emps);
        })
        .catch(() => {
          if (!cancelled) setEmployeeOptions([]);
        })
        .finally(() => {
          if (!cancelled) setEmployeeLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [employeeQuery, space.id]);

  const grant = async (
    principalType: PrincipalType,
    principalId: string | undefined,
    level: PermissionLevel
  ): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await dsAddPermission({
        targetType: 'space',
        targetId: space.id,
        principalType,
        principalId,
        level,
      });
      setInfo('Permission granted.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const revoke = async (permissionId: string): Promise<void> => {
    setError(null);
    setInfo(null);
    try {
      await dsRevokePermission({ permissionId });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Box sx={{ maxWidth: 880 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Button
          startIcon={<BackIcon />}
          size="small"
          onClick={() => onNav(`/space/${space.slug}`)}
        >
          {space.name}
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Members &amp; access
        </Typography>
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

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          Add employee
        </Typography>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems="center"
        >
          <Autocomplete
            sx={{ flex: 1, minWidth: 280 }}
            options={employeeOptions}
            value={selectedEmployee}
            onChange={(_, v) => setSelectedEmployee(v)}
            onInputChange={(_, v) => setEmployeeQuery(v)}
            loading={employeeLoading}
            getOptionLabel={e =>
              `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() ||
              e.entityId ||
              e.id
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => (
              <TextField {...params} label="Search employees" size="small" />
            )}
          />
          <TextField
            select
            label="Level"
            size="small"
            value={grantLevel}
            onChange={e => setGrantLevel(e.target.value as PermissionLevel)}
            sx={{ minWidth: 120 }}
          >
            {PERMISSION_LEVELS.map(l => (
              <MenuItem key={l} value={l}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            disabled={!selectedEmployee}
            onClick={() => {
              if (selectedEmployee) {
                grant('employee', selectedEmployee.id, grantLevel);
                setSelectedEmployee(null);
                setEmployeeQuery('');
              }
            }}
          >
            Grant
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          Add dynamic group
        </Typography>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems="center"
        >
          <Autocomplete
            sx={{ flex: 1, minWidth: 280 }}
            options={dynGroups}
            value={selectedGroup}
            onChange={(_, v) => setSelectedGroup(v)}
            getOptionLabel={g => g.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => (
              <TextField {...params} label="Pick a group" size="small" />
            )}
          />
          <TextField
            select
            label="Level"
            size="small"
            value={grantLevel}
            onChange={e => setGrantLevel(e.target.value as PermissionLevel)}
            sx={{ minWidth: 120 }}
          >
            {PERMISSION_LEVELS.map(l => (
              <MenuItem key={l} value={l}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            startIcon={<DynGroupIcon />}
            disabled={!selectedGroup}
            onClick={() => {
              if (selectedGroup) {
                grant('dyngroup', selectedGroup.id, grantLevel);
                setSelectedGroup(null);
              }
            }}
          >
            Grant
          </Button>
          <Button size="small" onClick={() => onNav('/dyngroups')}>
            Manage groups…
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            Current grants
          </Typography>
          <Button
            size="small"
            onClick={() => grant('everyone', undefined, 'view')}
          >
            Grant everyone view
          </Button>
        </Stack>
        {loading && (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={20} />
          </Box>
        )}
        {!loading && perms.length === 0 && (
          <Typography color="text.secondary" variant="body2">
            No grants yet.
          </Typography>
        )}
        {!loading && perms.length > 0 && (
          <Stack spacing={1}>
            {perms.map(p => (
              <Stack
                key={p.id}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{
                  p: 1.5,
                  border: theme => `1px solid ${theme.palette.divider}`,
                  borderRadius: 1.5,
                }}
              >
                <Chip size="small" label={p.principalType} />
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 12,
                  }}
                >
                  {p.principalLabel || p.principalId || 'everyone'}
                </Typography>
                <Chip size="small" color="primary" label={p.level} />
                <IconButton
                  size="small"
                  onClick={() => revoke(p.id)}
                  aria-label="revoke"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
