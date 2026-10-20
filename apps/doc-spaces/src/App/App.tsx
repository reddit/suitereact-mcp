import {
  Add as AddIcon,
  Description as DocIcon,
  Folder as FolderIcon,
  Group as GroupIcon,
  Settings as SettingsIcon,
  TuneOutlined as DynGroupIcon,
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import * as React from 'react';

import {
  dsCreateSpace,
  dsGetSpaces,
  dsGetUserPrefs,
} from '../domain/actions/clientActions';
import {
  type Space,
  SPACE_TYPES,
  type SpaceType,
  type ViewKind,
} from '../domain/types';
import { DocEditor } from '../domain/views/DocEditor';
import { DocViewer } from '../domain/views/DocViewer';
import { DynGroupEditor } from '../domain/views/DynGroupEditor';
import { MembersPanel } from '../domain/views/MembersPanel';
import { SpaceLandingView } from '../domain/views/SpaceLandingView';
import { SpaceSettings } from '../domain/views/SpaceSettings';
import { UserPrefsView } from '../domain/views/UserPrefsView';

const parseHash = (hash: string): ViewKind => {
  const h = hash.replace(/^#\/?/, '');
  if (!h) return { kind: 'home' };
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'prefs') return { kind: 'prefs' };
  if (parts[0] === 'dyngroups') return { kind: 'dyngroups' };
  if (parts[0] === 'space' && parts[1] && parts[2] === 'settings') {
    return { kind: 'settings', spaceSlug: parts[1] };
  }
  if (parts[0] === 'space' && parts[1] && parts[2] === 'members') {
    return { kind: 'members', spaceSlug: parts[1] };
  }
  if (parts[0] === 'space' && parts[1] && parts[2] === 'doc' && parts[3]) {
    if (parts[4] === 'edit') {
      return { kind: 'edit', spaceSlug: parts[1], docSlug: parts[3] };
    }
    return { kind: 'doc', spaceSlug: parts[1], docSlug: parts[3] };
  }
  if (parts[0] === 'space' && parts[1]) {
    return { kind: 'space', slug: parts[1] };
  }
  return { kind: 'home' };
};

const navTo = (path: string): void => {
  window.location.hash = path;
};

const groupSpaces = (spaces: Space[]): Record<SpaceType, Space[]> => {
  const out: Record<SpaceType, Space[]> = {
    adhoc: [],
    team: [],
    personal: [],
  };
  for (const s of spaces) {
    if (!s.archived) out[s.type].push(s);
  }
  for (const k of SPACE_TYPES) {
    out[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
};

const SIDEBAR_WIDTH = 264;

function App(): React.ReactElement {
  const [spaces, setSpaces] = React.useState<Space[]>([]);
  const [defaultSpaceId, setDefaultSpaceId] = React.useState<string | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ViewKind>(() =>
    parseHash(window.location.hash)
  );
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    const onHash = (): void => setView(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshSpaces = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, prefs] = await Promise.all([
        dsGetSpaces(),
        dsGetUserPrefs().catch(() => ({ defaultSpaceId: null })),
      ]);
      setSpaces(list);
      setDefaultSpaceId(prefs.defaultSpaceId);
      if (view.kind === 'home' && prefs.defaultSpaceId) {
        const target = list.find(s => s.id === prefs.defaultSpaceId);
        if (target) navTo(`/space/${target.slug}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // refresh-once intent: only react to manual triggers, not view changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    refreshSpaces();
  }, [refreshSpaces]);

  const grouped = React.useMemo(() => groupSpaces(spaces), [spaces]);
  const spaceBySlug = React.useMemo(
    () => Object.fromEntries(spaces.map(s => [s.slug, s])),
    [spaces]
  );

  const currentSpace =
    view.kind === 'space'
      ? spaceBySlug[view.slug]
      : 'spaceSlug' in view
        ? spaceBySlug[view.spaceSlug]
        : undefined;

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: theme => `1px solid ${theme.palette.divider}`,
          zIndex: theme => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 2 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg,#0a3d62 0%,#073050 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            DS
          </Box>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}
          >
            Doc Spaces
          </Typography>
          <Chip
            label="Beta"
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}
          />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Dynamic groups">
            <IconButton onClick={() => navTo('/dyngroups')} size="small">
              <DynGroupIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="My preferences">
            <IconButton onClick={() => navTo('/prefs')} size="small">
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: theme => `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          mt: '48px',
          height: 'calc(100vh - 48px)',
          overflowY: 'auto',
          position: 'fixed',
          top: 0,
          left: 0,
        }}
        data-testid="sidebar"
      >
        <Box sx={{ p: 2 }}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            data-testid="new-space-btn"
          >
            New space
          </Button>
        </Box>
        <Divider />
        {SPACE_TYPES.map(t => {
          const items = grouped[t];
          if (items.length === 0) return null;
          return (
            <Box key={t} sx={{ pt: 1.5, pb: 0.5 }}>
              <Typography
                variant="overline"
                sx={{
                  px: 2.5,
                  color: 'text.secondary',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                }}
              >
                {t}
              </Typography>
              <List dense disablePadding>
                {items.map(s => (
                  <ListItemButton
                    key={s.id}
                    selected={currentSpace?.id === s.id}
                    onClick={() => navTo(`/space/${s.slug}`)}
                    sx={{ mx: 1, borderRadius: 1.5 }}
                    data-testid={`space-link-${s.slug}`}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <FolderIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={s.name}
                      primaryTypographyProps={{ fontSize: 13.5, noWrap: true }}
                    />
                    {defaultSpaceId === s.id && (
                      <Chip
                        size="small"
                        label="home"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      />
                    )}
                  </ListItemButton>
                ))}
              </List>
            </Box>
          );
        })}
        {spaces.length === 0 && !loading && (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No spaces yet. Click &quot;New space&quot; to create one.
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: `${SIDEBAR_WIDTH}px`,
          mt: '48px',
          p: 4,
          maxWidth: '100%',
          minHeight: 'calc(100vh - 48px)',
        }}
        data-testid="main-content"
      >
        {loading && (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}
            data-testid="loading"
          >
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} data-testid="load-error">
            {error}
          </Alert>
        )}

        {!loading && view.kind === 'home' && (
          <HomeView
            spaceCount={spaces.length}
            onCreateSpace={() => setCreateOpen(true)}
          />
        )}

        {view.kind === 'space' && currentSpace && (
          <SpaceLandingView space={currentSpace} onNav={navTo} />
        )}

        {view.kind === 'doc' && currentSpace && (
          <DocViewer
            spaceSlug={view.spaceSlug}
            docSlug={view.docSlug}
            space={currentSpace}
            onNav={navTo}
          />
        )}

        {view.kind === 'edit' && currentSpace && (
          <DocEditor
            spaceSlug={view.spaceSlug}
            docSlug={view.docSlug}
            space={currentSpace}
            onNav={navTo}
          />
        )}

        {view.kind === 'settings' && currentSpace && (
          <SpaceSettings
            space={currentSpace}
            onChanged={refreshSpaces}
            onNav={navTo}
          />
        )}

        {view.kind === 'members' && currentSpace && (
          <MembersPanel space={currentSpace} onNav={navTo} />
        )}

        {view.kind === 'dyngroups' && <DynGroupEditor onNav={navTo} />}

        {view.kind === 'prefs' && (
          <UserPrefsView
            spaces={spaces}
            currentDefaultId={defaultSpaceId}
            onChanged={refreshSpaces}
          />
        )}

        {!loading &&
          view.kind !== 'home' &&
          view.kind !== 'prefs' &&
          view.kind !== 'dyngroups' &&
          !currentSpace && (
            <Alert severity="info" data-testid="space-not-found">
              Space not found.{' '}
              <Button onClick={() => navTo('/')}>Go home</Button>
            </Alert>
          )}
      </Box>

      <CreateSpaceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async slug => {
          setCreateOpen(false);
          await refreshSpaces();
          navTo(`/space/${slug}`);
        }}
      />
    </Box>
  );
}

interface HomeViewProps {
  spaceCount: number;
  onCreateSpace: () => void;
}

function HomeView({
  spaceCount,
  onCreateSpace,
}: HomeViewProps): React.ReactElement {
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
        Welcome to Doc Spaces
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Author rich HTML documents, organize them into spaces, and share with
        teammates using employee or dynamic-group permissions.
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreateSpace}
        >
          Create your first space
        </Button>
        <Button
          variant="outlined"
          onClick={() => (window.location.hash = '/prefs')}
        >
          Set landing space
        </Button>
      </Stack>
      <Divider sx={{ my: 3 }} />
      <Stack direction="row" spacing={3}>
        <Stat icon={<FolderIcon />} label="Spaces" value={spaceCount} />
        <Stat icon={<DocIcon />} label="Docs" value={'—'} />
        <Stat icon={<GroupIcon />} label="Members" value={'—'} />
      </Stack>
    </Box>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}): React.ReactElement {
  return (
    <Box
      sx={{
        flex: 1,
        p: 2.5,
        bgcolor: 'background.paper',
        borderRadius: 2,
        border: theme => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        {icon}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="h5">{value}</Typography>
    </Box>
  );
}

interface CreateSpaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}

function CreateSpaceDialog(props: CreateSpaceDialogProps): React.ReactElement {
  const { open, onClose, onCreated } = props;
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [type, setType] = React.useState<SpaceType>('adhoc');
  const [description, setDescription] = React.useState('');
  const [everyoneView, setEveryoneView] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setType('adhoc');
      setDescription('');
      setEveryoneView(true);
      setErr(null);
    }
  }, [open]);

  const slugify = (raw: string): string =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

  const onNameChange = (raw: string): void => {
    setName(raw);
    if (!slug) setSlug(slugify(raw));
  };

  const submit = async (): Promise<void> => {
    if (!name.trim() || !slug.trim()) {
      setErr('Name and slug are required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await dsCreateSpace({
        slug: slug.trim(),
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        everyoneView,
      });
      onCreated(slug.trim());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New space</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            autoFocus
            fullWidth
            inputProps={{ 'data-testid': 'create-space-name' }}
          />
          <TextField
            label="Slug"
            value={slug}
            onChange={e => setSlug(slugify(e.target.value))}
            helperText="URL-safe identifier; used in File Cabinet path."
            fullWidth
            inputProps={{ 'data-testid': 'create-space-slug' }}
          />
          <TextField
            label="Type"
            value={type}
            onChange={e => setType(e.target.value as SpaceType)}
            select
            fullWidth
          >
            {SPACE_TYPES.map(t => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            label="Default access"
            value={everyoneView ? 'everyone:view' : 'private'}
            onChange={e => setEveryoneView(e.target.value === 'everyone:view')}
            select
            fullWidth
            helperText="Owner is always granted admin."
          >
            <MenuItem value="everyone:view">Everyone can view</MenuItem>
            <MenuItem value="private">Private (admins only)</MenuItem>
          </TextField>
          {err && <Alert severity="error">{err}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={busy}
          data-testid="create-space-submit"
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default App;
