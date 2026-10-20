import {
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from '@mui/icons-material';
import { IconButton, Paper, Tooltip } from '@mui/material';
import * as React from 'react';

import { augmentDocHtml, DOC_IFRAME_SANDBOX } from '../docSandbox';

interface DocFrameProps {
  /** Document HTML to display, or null while loading. */
  html: string | null;
  /** Accessible iframe title. */
  title: string;
  /** Inline (non-fullscreen) height. Defaults to a tall viewport band. */
  minHeight?: number | string;
  /** Test id applied to the frame wrapper. */
  testId?: string;
}

/**
 * Renders a document's HTML in a sandboxed iframe with a Full Screen
 * expand/collapse toggle.
 *
 * Untrusted document HTML runs in an opaque-origin sandbox (`allow-scripts`
 * without `allow-same-origin`) so interactive docs work without exposing the
 * NetSuite session — see `docSandbox.ts` for the full rationale. The HTML is
 * fed via `srcDoc` (augmented with an in-page anchor-scroll helper, since the
 * opaque origin precludes the same-origin `blob:` URL trick). In full-screen
 * mode the wrapper is fixed to cover the entire app (above the AppBar and
 * sidebar); the same iframe element is reused across modes so its scroll
 * position is preserved. Press Escape to exit full screen.
 *
 * Returns null while there is no HTML to show.
 */
export function DocFrame({
  html,
  title,
  minHeight = 'calc(100vh - 200px)',
  testId,
}: DocFrameProps): React.ReactElement | null {
  const [fullscreen, setFullscreen] = React.useState(false);

  React.useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (html == null) return null;

  return (
    <Paper
      data-testid={testId}
      data-fullscreen={fullscreen ? 'true' : 'false'}
      sx={
        fullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: theme => theme.zIndex.modal + 2,
              borderRadius: 0,
              overflow: 'hidden',
            }
          : { position: 'relative', overflow: 'hidden' }
      }
    >
      <Tooltip title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}>
        <IconButton
          size="small"
          onClick={() => setFullscreen(prev => !prev)}
          data-testid="doc-fullscreen-toggle"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            bgcolor: 'background.paper',
            boxShadow: 2,
            '&:hover': { bgcolor: 'background.paper' },
          }}
        >
          {fullscreen ? (
            <FullscreenExitIcon fontSize="small" />
          ) : (
            <FullscreenIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <iframe
        title={title}
        sandbox={DOC_IFRAME_SANDBOX}
        srcDoc={augmentDocHtml(html)}
        style={{
          width: '100%',
          height: fullscreen ? '100vh' : minHeight,
          border: 'none',
          display: 'block',
        }}
      />
    </Paper>
  );
}
