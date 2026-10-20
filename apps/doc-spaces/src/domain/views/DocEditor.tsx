import Editor from '@monaco-editor/react';
import {
  ArrowBack as BackIcon,
  PublishOutlined as PublishIcon,
  SaveOutlined as SaveIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import * as React from 'react';

import {
  dsGetDocHtml,
  dsGetSpaceDocs,
  dsPublishDoc,
  dsSaveDocDraft,
} from '../actions/clientActions';
import { augmentDocHtml, DOC_IFRAME_SANDBOX } from '../docSandbox';
import type { Doc, Space } from '../types';

interface Props {
  spaceSlug: string;
  docSlug: string;
  space: Space;
  onNav: (path: string) => void;
}

const STARTER_HTML = (slug: string): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${slug}</title>
  <style>
    body { font-family: 'Inter', sans-serif; max-width: 760px; margin: 32px auto; padding: 0 20px; color: #0f172a; line-height: 1.65; }
    h1, h2, h3 { letter-spacing: -0.01em; }
    code { background: #f0f1f4; padding: 1px 6px; border-radius: 4px; }
    pre { background: #f6f8fb; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${slug}</h1>
  <p>Start writing here…</p>
</body>
</html>`;

export function DocEditor(props: Props): React.ReactElement {
  const { spaceSlug, docSlug, space, onNav } = props;
  const [doc, setDoc] = React.useState<Doc | null>(null);
  const [title, setTitle] = React.useState(docSlug);
  const [html, setHtml] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [info, setInfo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    setDirty(false);
    (async () => {
      try {
        const list = await dsGetSpaceDocs({
          spaceId: space.id,
          includeArchived: true,
        });
        if (cancelled) return;
        const found = list.find(d => d.slug === docSlug);
        if (found) {
          setDoc(found);
          setTitle(found.title);
          try {
            const r = await dsGetDocHtml({ docId: found.id, draft: true });
            if (!cancelled) setHtml(r.html || '');
          } catch {
            if (!cancelled) setHtml(STARTER_HTML(docSlug));
          }
        } else {
          setHtml(STARTER_HTML(docSlug));
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setHtml(STARTER_HTML(docSlug));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [space.id, docSlug]);

  const onChange = (next: string | undefined): void => {
    setHtml(next ?? '');
    setDirty(true);
  };

  const onSaveDraft = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await dsSaveDocDraft({
        spaceId: space.id,
        docSlug,
        title: title || docSlug,
        html,
      });
      setDoc(prev =>
        prev ? { ...prev, id: result.docId, status: 'draft' } : prev
      );
      setDirty(false);
      setInfo('Draft saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      let id = doc?.id;
      if (!id || dirty) {
        const saved = await dsSaveDocDraft({
          spaceId: space.id,
          docSlug,
          title: title || docSlug,
          html,
        });
        id = saved.docId;
        setDoc(prev =>
          prev ? { ...prev, id: saved.docId, status: 'draft' } : prev
        );
        setDirty(false);
      }
      if (id) {
        await dsPublishDoc({ docId: id });
        setDoc(prev => (prev ? { ...prev, status: 'published' } : prev));
        setInfo('Published.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button
          startIcon={<BackIcon />}
          size="small"
          onClick={() => onNav(`/space/${spaceSlug}`)}
        >
          {space.name}
        </Button>
        <TextField
          size="small"
          value={title}
          onChange={e => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          sx={{ flex: 1, maxWidth: 540 }}
          inputProps={{
            'data-testid': 'doc-title-input',
            style: { fontWeight: 700, fontSize: 18 },
          }}
        />
        {doc && (
          <Chip
            size="small"
            label={doc.status}
            color={doc.status === 'published' ? 'success' : 'default'}
          />
        )}
        {dirty && <Chip size="small" label="modified" color="warning" />}
        <Button
          startIcon={<SaveIcon />}
          variant="outlined"
          onClick={onSaveDraft}
          disabled={busy}
          data-testid="save-draft-btn"
        >
          Save draft
        </Button>
        <Button
          startIcon={<PublishIcon />}
          variant="contained"
          onClick={onPublish}
          disabled={busy}
          data-testid="publish-btn"
        >
          Publish
        </Button>
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

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Paper
            sx={{
              flex: 1,
              minHeight: '70vh',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: theme => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                HTML
              </Typography>
            </Box>
            <Box sx={{ height: 'calc(70vh - 36px)' }} data-testid="monaco-host">
              <Editor
                height="100%"
                defaultLanguage="html"
                value={html}
                onChange={onChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </Box>
          </Paper>
          <Paper sx={{ flex: 1, minHeight: '70vh', overflow: 'hidden' }}>
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: theme => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Preview
              </Typography>
            </Box>
            <iframe
              title="preview"
              sandbox={DOC_IFRAME_SANDBOX}
              style={{
                width: '100%',
                height: 'calc(70vh - 36px)',
                border: 'none',
                display: 'block',
              }}
              srcDoc={augmentDocHtml(html)}
              data-testid="preview-frame"
            />
          </Paper>
        </Stack>
      )}
    </Box>
  );
}
