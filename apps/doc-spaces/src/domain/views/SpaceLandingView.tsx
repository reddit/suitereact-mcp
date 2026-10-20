import {
  Add as AddIcon,
  Edit as EditIcon,
  Group as GroupIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import {
  Alert,
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
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import * as React from 'react';

import { dsGetDocHtml, dsGetSpaceDocs } from '../actions/clientActions';
import type { Doc, Space } from '../types';
import { DocFrame } from './DocFrame';

interface Props {
  space: Space;
  onNav: (path: string) => void;
}

export function SpaceLandingView({ space, onNav }: Props): React.ReactElement {
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [landingHtml, setLandingHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newDocOpen, setNewDocOpen] = React.useState(false);
  const [newDocSlug, setNewDocSlug] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLandingHtml(null);
    (async () => {
      try {
        const list = await dsGetSpaceDocs({ spaceId: space.id });
        if (cancelled) return;
        setDocs(list);
        if (space.landingDocId) {
          try {
            const r = await dsGetDocHtml({ docId: space.landingDocId });
            if (!cancelled) setLandingHtml(r.html);
          } catch (e) {
            if (!cancelled)
              setError(`Could not load landing doc: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [space.id, space.landingDocId]);

  const submitNewDoc = (): void => {
    const safeSlug = newDocSlug
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!safeSlug) return;
    setNewDocOpen(false);
    setNewDocSlug('');
    onNav(`/space/${space.slug}/doc/${safeSlug}/edit`);
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {space.name}
          </Typography>
          {space.description && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {space.description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Members">
            <IconButton onClick={() => onNav(`/space/${space.slug}/members`)}>
              <GroupIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton onClick={() => onNav(`/space/${space.slug}/settings`)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewDocOpen(true)}
            data-testid="new-doc-btn"
          >
            New doc
          </Button>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Chip size="small" label={space.type} />
        {space.landingDocId && (
          <Chip size="small" label="has landing" color="primary" />
        )}
      </Stack>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && landingHtml !== null && (
        <Box sx={{ mb: 4 }}>
          <DocFrame
            html={landingHtml}
            title={`landing-${space.slug}`}
            minHeight="calc(100vh - 280px)"
            testId="landing-frame-wrap"
          />
        </Box>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Documents
      </Typography>
      {!loading && docs.length === 0 && (
        <Alert severity="info" data-testid="empty-docs">
          No docs yet. Click &quot;New doc&quot; to author your first one.
        </Alert>
      )}
      <Dialog
        open={newDocOpen}
        onClose={() => setNewDocOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>New document</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Doc slug"
            placeholder="e.g. runbook-q4"
            value={newDocSlug}
            onChange={e => setNewDocSlug(e.target.value)}
            helperText="URL-safe identifier; the document title can be edited inside the editor."
            inputProps={{ 'data-testid': 'new-doc-slug' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDocOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitNewDoc}
            disabled={!newDocSlug.trim()}
            data-testid="new-doc-submit"
          >
            Open editor
          </Button>
        </DialogActions>
      </Dialog>

      {!loading && docs.length > 0 && (
        <Paper>
          {docs.map((d, i) => (
            <Box key={d.id}>
              {i > 0 && <Divider />}
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ p: 2 }}
              >
                <Box
                  sx={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => onNav(`/space/${space.slug}/doc/${d.slug}`)}
                >
                  <Typography sx={{ fontWeight: 600 }}>{d.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    /{d.slug}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={d.status}
                  color={d.status === 'published' ? 'success' : 'default'}
                />
                {d.isLanding && (
                  <Chip size="small" label="landing" color="primary" />
                )}
                <IconButton
                  size="small"
                  onClick={() =>
                    onNav(`/space/${space.slug}/doc/${d.slug}/edit`)
                  }
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
}
