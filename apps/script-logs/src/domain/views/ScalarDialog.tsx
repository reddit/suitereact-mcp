import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';

import Highlight from './Highlight';

const PAGE_SIZE = 8192;
export default function ScalarDialog({
  text,
  path,
  initialSearch,
  onClose,
  onCopy,
}: {
  text: string;
  path: string;
  initialSearch: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  const [search, setSearch] = useState(initialSearch);
  const first = Math.max(
    0,
    text.toLowerCase().indexOf(initialSearch.trim().toLowerCase())
  );
  const [page, setPage] = useState(Math.floor(first / PAGE_SIZE));
  const [position, setPosition] = useState(first);
  const content = useRef<HTMLPreElement>(null);
  const pages = Math.ceil(text.length / PAGE_SIZE) || 1;
  const term = search.trim().toLowerCase();
  const start = page * PAGE_SIZE;
  // Include overlap so a match across the page boundary is readable in full.
  const displayed = text.slice(
    start,
    start + PAGE_SIZE + Math.max(0, term.length - 1)
  );
  const find = (direction: -1 | 1) => {
    const lower = text.toLowerCase();
    let next =
      direction === 1
        ? lower.indexOf(term, position + 1)
        : position > 0
          ? lower.lastIndexOf(term, position - 1)
          : -1;
    if (next < 0)
      next = direction === 1 ? lower.indexOf(term) : lower.lastIndexOf(term);
    setPosition(next);
    if (next >= 0) setPage(Math.floor(next / PAGE_SIZE));
  };
  const revealMatch = useCallback(() => {
    const marks = content.current?.querySelectorAll('mark');
    if (term && marks) {
      let offset = displayed.toLowerCase().indexOf(term);
      for (const mark of marks) {
        if (offset + start === position) {
          const pane = content.current;
          if (pane) {
            const match = mark.getBoundingClientRect();
            pane.scrollTop +=
              match.top -
              pane.getBoundingClientRect().top -
              (pane.clientHeight - match.height) / 2;
          }
          break;
        }
        offset = displayed.toLowerCase().indexOf(term, offset + term.length);
      }
    } else if (content.current) content.current.scrollTop = 0;
  }, [displayed, start, position, term]);
  useEffect(revealMatch, [revealMatch]);
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="full-value-title"
      slotProps={{ transition: { onEntered: revealMatch } }}
    >
      <DialogTitle id="full-value-title" sx={{ overflowWrap: 'anywhere' }}>
        Full value{' '}
        <Typography component="span" fontSize={12}>
          {path}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Stack
          direction="row"
          gap={0.5}
          alignItems="center"
          mt={0.5}
          flexWrap="wrap"
        >
          <TextField
            label="Find in full value"
            value={search}
            slotProps={{ htmlInput: { maxLength: 200 } }}
            sx={{ flex: 1, minWidth: 160 }}
            onChange={event => {
              const value = event.target.value;
              setSearch(value);
              const next = value.trim()
                ? text.toLowerCase().indexOf(value.trim().toLowerCase())
                : 0;
              setPosition(next);
              setPage(Math.max(0, Math.floor(next / PAGE_SIZE)));
            }}
          />
          <Button disabled={!term || position < 0} onClick={() => find(-1)}>
            Previous value match
          </Button>
          <Button disabled={!term || position < 0} onClick={() => find(1)}>
            Next value match
          </Button>
        </Stack>
        <Typography variant="caption" role="status">
          {term && position < 0 ? 'No matches · ' : ''}Search covers the full
          value · {text.length.toLocaleString()} characters
        </Typography>
        <Box
          component="pre"
          ref={content}
          data-testid="full-value-text"
          tabIndex={0}
          sx={{
            bgcolor: '#142137',
            color: '#dce6f5',
            m: 0,
            p: 1.5,
            borderRadius: 1,
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            overflow: 'auto',
            height: 'min(45dvh, 420px)',
            minHeight: 100,
          }}
        >
          <Highlight text={displayed} search={search} />
        </Box>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Button disabled={!page} onClick={() => setPage(value => value - 1)}>
            Previous value page
          </Button>
          <Typography variant="caption">
            Value page {page + 1} of {pages}
          </Typography>
          <Button
            disabled={page + 1 >= pages}
            onClick={() => setPage(value => value + 1)}
          >
            Next value page
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCopy}>Copy value</Button>
        <Button onClick={onClose}>Close full value</Button>
      </DialogActions>
    </Dialog>
  );
}
