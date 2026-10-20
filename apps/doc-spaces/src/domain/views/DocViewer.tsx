import { ArrowBack as BackIcon, Edit as EditIcon } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import * as React from 'react';

import { dsGetDocHtml, dsGetSpaceDocs } from '../actions/clientActions';
import type { Doc, Space } from '../types';
import { DocFrame } from './DocFrame';

interface Props {
  spaceSlug: string;
  docSlug: string;
  space: Space;
  onNav: (path: string) => void;
}

export function DocViewer(props: Props): React.ReactElement {
  const { spaceSlug, docSlug, space, onNav } = props;
  const [doc, setDoc] = React.useState<Doc | null>(null);
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const list = await dsGetSpaceDocs({ spaceId: space.id });
        if (cancelled) return;
        const found = list.find(d => d.slug === docSlug);
        if (!found) {
          setError(`Document "${docSlug}" not found in space "${spaceSlug}"`);
          setLoading(false);
          return;
        }
        setDoc(found);
        const r = await dsGetDocHtml({ docId: found.id });
        if (!cancelled) setHtml(r.html);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [space.id, spaceSlug, docSlug]);

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
        <Typography variant="h5" sx={{ flex: 1, fontWeight: 700 }}>
          {doc?.title ?? docSlug}
        </Typography>
        {doc && (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => onNav(`/space/${spaceSlug}/doc/${docSlug}/edit`)}
          >
            Edit
          </Button>
        )}
      </Stack>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && (
        <DocFrame
          html={html}
          title={`doc-${spaceSlug}-${docSlug}`}
          minHeight="calc(100vh - 160px)"
          testId="doc-frame-wrap"
        />
      )}
    </Box>
  );
}
