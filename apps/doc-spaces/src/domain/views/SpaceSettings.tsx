import {
  Archive as ArchiveIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import * as React from 'react';

import {
  dsArchiveSpace,
  dsGetSpaceDocs,
  dsSetLandingDoc,
  dsUpdateSpace,
} from '../actions/clientActions';
import { type Doc, type Space, SPACE_TYPES, type SpaceType } from '../types';

interface Props {
  space: Space;
  onChanged: () => void | Promise<void>;
  onNav: (path: string) => void;
}

export function SpaceSettings({
  space,
  onChanged,
  onNav,
}: Props): React.ReactElement {
  const [name, setName] = React.useState(space.name);
  const [description, setDescription] = React.useState(space.description ?? '');
  const [type, setType] = React.useState<SpaceType>(space.type);
  const [landingDocId, setLandingDocId] = React.useState<string | ''>(
    space.landingDocId ?? ''
  );
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [loadingDocs, setLoadingDocs] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingDocs(true);
    dsGetSpaceDocs({ spaceId: space.id })
      .then(list => {
        if (!cancelled) setDocs(list);
      })
      .catch(e => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingDocs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [space.id]);

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await dsUpdateSpace({
        spaceId: space.id,
        name,
        description: description.trim() || undefined,
        type,
      });
      if ((space.landingDocId ?? '') !== landingDocId) {
        await dsSetLandingDoc({
          spaceId: space.id,
          docId: landingDocId === '' ? null : landingDocId,
        });
      }
      setInfo('Saved.');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onArchive = async (): Promise<void> => {
    setArchiveOpen(false);
    setBusy(true);
    setError(null);
    try {
      await dsArchiveSpace({ spaceId: space.id });
      await onChanged();
      onNav('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Button
          startIcon={<BackIcon />}
          size="small"
          onClick={() => onNav(`/space/${space.slug}`)}
        >
          {space.name}
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Settings
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
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <TextField
            label="Description"
            value={description}
            multiline
            minRows={2}
            onChange={e => setDescription(e.target.value)}
          />
          <TextField
            label="Type"
            value={type}
            onChange={e => setType(e.target.value as SpaceType)}
            select
          >
            {SPACE_TYPES.map(t => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Landing doc"
            value={landingDocId}
            onChange={e => setLandingDocId(e.target.value)}
            select
            helperText="Document shown when this space is opened. Set to none to clear."
            disabled={loadingDocs}
          >
            <MenuItem value="">— None —</MenuItem>
            {docs
              .filter(d => d.status === 'published')
              .map(d => (
                <MenuItem key={d.id} value={d.id}>
                  {d.title} (/{d.slug})
                </MenuItem>
              ))}
          </TextField>
          {loadingDocs && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />{' '}
              <Typography variant="caption">Loading docs…</Typography>
            </Box>
          )}
        </Stack>
      </Paper>
      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button variant="contained" onClick={onSave} disabled={busy}>
          Save changes
        </Button>
        <Button
          variant="text"
          disabled={busy}
          onClick={() => onNav(`/space/${space.slug}`)}
        >
          Cancel
        </Button>
      </Stack>
      <Divider sx={{ my: 4 }} />
      <Paper sx={{ p: 3, borderColor: 'warning.main' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Archive space</Typography>
            <Typography variant="caption" color="text.secondary">
              Hides this space from the default sidebar. Docs are preserved.
            </Typography>
          </Box>
          <Button
            color="warning"
            variant="outlined"
            startIcon={<ArchiveIcon />}
            onClick={() => setArchiveOpen(true)}
            disabled={busy}
          >
            Archive
          </Button>
        </Stack>
      </Paper>
      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)}>
        <DialogTitle>Archive space?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            &quot;{space.name}&quot; will be hidden from the sidebar. Documents
            are preserved and can be restored by an admin.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveOpen(false)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={onArchive}>
            Archive
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
