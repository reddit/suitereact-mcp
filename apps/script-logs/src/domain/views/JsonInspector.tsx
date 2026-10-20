import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toastService } from 'suitereact';

import { tokens } from '../../App/theme';
import {
  copyValueText,
  errorSummary,
  inspectJson,
  JsonNode,
  matchingPaths,
  RAW_PAGE_SIZE,
  RENDER_LIMIT,
  visibleNodes,
} from '../../utils/json';
import Highlight from './Highlight';
import { Icon, IconAction } from './icons';
import ScalarDialog from './ScalarDialog';

export interface InspectorState {
  view: string;
  expanded: Set<string>;
  searchExpanded: Set<string>;
  collapsed: Set<string>;
  search: string;
  matchIndex: number;
  selectedPath: string;
  focusPath?: string;
  offset: number;
  rawPage: number;
  wrap: boolean;
  scrollTop: number;
}

const mono = tokens.mono;
const surface = {
  bgcolor: tokens.code.surface,
  color: tokens.code.text,
  fontFamily: mono,
  fontSize: 13,
  borderRadius: 1,
  overflow: 'auto',
  flex: 1,
  minHeight: 120,
};
/** One dark surface that holds the tree, its pager and the selected-node actions. */
const codeFrame = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 160,
  bgcolor: tokens.code.surface,
  borderRadius: 1,
  overflow: 'hidden',
  '& > [role="tree"]': { borderRadius: 0 },
} as const;
const codeBar = {
  px: 1,
  py: 0.25,
  minHeight: 36,
  bgcolor: tokens.code.surfaceRaised,
  borderTop: `1px solid ${tokens.code.border}`,
  flexShrink: 0,
  '& .MuiButton-root': { color: tokens.code.key },
  '& .MuiButton-root.Mui-disabled': { color: tokens.code.muted, opacity: 0.6 },
  '& .MuiTypography-caption': { color: tokens.code.muted },
} as const;

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toastService.showSuccess(`${label} copied`);
  } catch {
    toastService.showError(
      'Clipboard unavailable. Select original text or download the details.'
    );
  }
}

function token(node: JsonNode, search: string) {
  if (node.container)
    return Array.isArray(node.value)
      ? `Array(${node.value.length})`
      : `{ ${Object.keys(node.value as object).length} keys }`;
  const text = JSON.stringify(node.value);
  if (text.length <= 220) return text;
  const match = search.trim()
    ? text.toLowerCase().indexOf(search.trim().toLowerCase())
    : -1;
  const start = Math.max(0, match - 60);
  const end = Math.max(start + 220, match + search.trim().length + 60);
  return (
    (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  );
}

export default function LogInspector({
  raw,
  logId,
  stateCache,
}: {
  raw: string;
  logId?: string;
  stateCache?: Map<string, InspectorState>;
}) {
  const saved = useRef(logId ? stateCache?.get(logId) : undefined).current;
  const [fullValue, setFullValue] = useState(false);
  const inspection = useMemo(() => inspectJson(raw), [raw]);
  const summary = useMemo(() => errorSummary(inspection.value), [inspection]);
  const [view, setView] = useState(saved?.view || 'content');
  const [expanded, setExpanded] = useState(saved?.expanded || new Set(['$']));
  const [searchExpanded, setSearchExpanded] = useState(
    saved?.searchExpanded || new Set<string>()
  );
  const [collapsed, setCollapsed] = useState(
    saved?.collapsed || new Set<string>()
  );
  const [search, setSearch] = useState(saved?.search || '');
  const [matchIndex, setMatchIndex] = useState(saved?.matchIndex || 0);
  const [selectedPath, setSelectedPath] = useState(saved?.selectedPath || '$');
  const [focusPath, setFocusPath] = useState<string | undefined>(
    saved?.focusPath
  );
  const [offset, setOffset] = useState(saved?.offset || 0);
  const [rawPage, setRawPage] = useState(saved?.rawPage || 0);
  const [wrap, setWrap] = useState(saved?.wrap ?? true);
  const contentRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const rememberScroll = (top: number) => {
    const current = logId ? stateCache?.get(logId) : undefined;
    if (current) current.scrollTop = top;
  };
  useEffect(() => {
    if (!logId || !stateCache) return;
    stateCache.delete(logId);
    stateCache.set(logId, {
      view,
      expanded,
      searchExpanded,
      collapsed,
      search,
      matchIndex,
      selectedPath,
      focusPath,
      offset,
      rawPage,
      wrap,
      scrollTop: contentRef.current?.scrollTop || 0,
    });
    while (stateCache.size > 5)
      stateCache.delete(stateCache.keys().next().value!);
  }, [
    logId,
    stateCache,
    view,
    expanded,
    searchExpanded,
    collapsed,
    search,
    matchIndex,
    selectedPath,
    focusPath,
    offset,
    rawPage,
    wrap,
  ]);
  useEffect(() => {
    const element = contentRef.current;
    const frame = requestAnimationFrame(() => {
      if (element && saved) element.scrollTop = saved.scrollTop;
    });
    return () => {
      cancelAnimationFrame(frame);
      const current = logId ? stateCache?.get(logId) : undefined;
      if (current && element?.isConnected)
        current.scrollTop = element.scrollTop;
    };
  }, [logId, stateCache, saved]);
  const isTree = inspection.kind === 'json' && view === 'content';
  const isStack = view === 'stack';
  const isFormatted = inspection.formatted !== undefined && view === 'content';
  const text = isStack
    ? summary?.stack || ''
    : isFormatted
      ? inspection.formatted!
      : raw;
  const pages = Math.max(1, Math.ceil(text.length / RAW_PAGE_SIZE));
  const pageText = text.slice(
    rawPage * RAW_PAGE_SIZE,
    (rawPage + 1) * RAW_PAGE_SIZE
  );
  const matches = useMemo(
    () => [...matchingPaths(inspection.nodes, search).matches],
    [inspection, search]
  );
  const visible = useMemo(
    () =>
      visibleNodes(
        inspection.nodes,
        search.trim() ? searchExpanded : expanded,
        search,
        { collapsed, offset, focusPath }
      ),
    [inspection, expanded, searchExpanded, search, collapsed, offset, focusPath]
  );
  const selected = inspection.nodes.find(node => node.path === selectedPath);
  const textMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const positions: number[] = [];
    if (term) {
      const lower = pageText.toLowerCase();
      for (
        let i = lower.indexOf(term);
        i !== -1;
        i = lower.indexOf(term, i + term.length)
      )
        positions.push(i);
    }
    return positions;
  }, [pageText, search]);
  const matchCount = isTree ? matches.length : textMatches.length;
  const activeIndex = matchCount ? matchIndex % matchCount : 0;

  useEffect(() => {
    if (!search.trim()) return;
    let frame = 0;
    const reveal = () => {
      const match = isTree
        ? nodes.current.get(matches[activeIndex])
        : contentRef.current?.querySelector('[data-active-match="true"]');
      match?.scrollIntoView({ block: 'nearest' });
    };
    const scheduleReveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
    };
    scheduleReveal();
    const resize = new ResizeObserver(scheduleReveal);
    if (contentRef.current) resize.observe(contentRef.current);
    // A shorter viewport can hide a match without resizing the content box.
    window.addEventListener('resize', scheduleReveal);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('resize', scheduleReveal);
    };
  }, [search, view, isTree, activeIndex, matches, visible.offset, rawPage]);

  const changeSearch = (value: string) => {
    setSearch(value);
    setMatchIndex(0);
    setCollapsed(new Set());
    setSearchExpanded(new Set(['$']));
    setOffset(0);
    const first = [...matchingPaths(inspection.nodes, value).matches][0];
    setFocusPath(first);
    if (first) setSelectedPath(first);
  };
  const moveMatch = (delta: number) => {
    if (!matchCount) return;
    const index = (activeIndex + delta + matchCount) % matchCount;
    setMatchIndex(index);
    if (isTree) {
      setCollapsed(new Set());
      setFocusPath(matches[index]);
      setSelectedPath(matches[index]);
    }
  };
  const toggle = (path: string) => {
    const open = visible.expanded.has(path);
    const update = new Set(search.trim() ? searchExpanded : expanded);
    if (open) update.delete(path);
    else update.add(path);
    if (search.trim()) {
      setSearchExpanded(update);
      const closed = new Set(collapsed);
      if (open) closed.add(path);
      else closed.delete(path);
      setCollapsed(closed);
    } else setExpanded(update);
    setFocusPath(undefined);
  };
  const focusNode = (path: string) => {
    setSelectedPath(path);
    nodes.current.get(path)?.focus();
  };
  const treeKey = (event: KeyboardEvent, node: JsonNode, index: number) => {
    let target: JsonNode | undefined;
    switch (event.key) {
      case 'ArrowDown':
        target = visible.rows[index + 1];
        break;
      case 'ArrowUp':
        target = visible.rows[index - 1];
        break;
      case 'Home':
        target = visible.rows[0];
        break;
      case 'End':
        target = visible.rows[visible.rows.length - 1];
        break;
      case 'ArrowRight':
        if (node.container && !visible.expanded.has(node.path))
          toggle(node.path);
        else if (node.container) target = visible.rows[index + 1];
        break;
      case 'ArrowLeft':
        if (node.container && visible.expanded.has(node.path))
          toggle(node.path);
        else target = visible.rows.find(row => row.path === node.parent);
        break;
      case 'Enter':
      case ' ':
        if (node.container) toggle(node.path);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target) focusNode(target.path);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'text/plain;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'script-log-details.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const highlighted = () => {
    const parts = [];
    let previous = 0;
    textMatches.forEach((start, index) => {
      parts.push(pageText.slice(previous, start));
      parts.push(
        <mark
          key={start}
          data-active-match={index === activeIndex}
          style={{
            scrollMarginBlock: '8px',
            background: index === activeIndex ? '#ffd27a' : '#354d70',
            color: index === activeIndex ? '#142137' : '#fff',
          }}
        >
          {pageText.slice(start, start + search.trim().length)}
        </mark>
      );
      previous = start + search.trim().length;
    });
    parts.push(pageText.slice(previous));
    return parts;
  };

  const expandAll = () => {
    const all = new Set(
      inspection.nodes.filter(node => node.container).map(node => node.path)
    );
    if (search.trim()) {
      setSearchExpanded(all);
      setCollapsed(new Set());
    } else setExpanded(all);
  };
  const collapseAll = () => {
    if (search.trim()) {
      setSearchExpanded(new Set(['$']));
      setCollapsed(
        new Set(
          inspection.nodes
            .filter(node => node.container && node.path !== '$')
            .map(node => node.path)
        )
      );
    } else setExpanded(new Set(['$']));
    setOffset(0);
    setFocusPath(undefined);
  };
  const scopeNote = isTree
    ? inspection.truncated
      ? 'Find covers indexed values only'
      : ''
    : pages > 1
      ? 'Paged text · find searches this page only'
      : '';

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
      {summary && (summary.name || summary.message) && (
        <Box
          data-testid="error-summary"
          sx={{
            borderLeft: '3px solid',
            borderColor: tokens.severity.ERROR,
            bgcolor: `${tokens.severity.ERROR}0a`,
            borderRadius: '0 6px 6px 0',
            px: 1.25,
            py: 0.75,
            flexShrink: 0,
          }}
        >
          <Typography
            component="div"
            sx={{
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 700,
              color: tokens.severity.ERROR,
              overflowWrap: 'anywhere',
            }}
          >
            {summary.name || 'Message'}
          </Typography>
          {summary.message && (
            <Typography
              variant="body2"
              sx={{
                mt: 0.25,
                overflowWrap: 'anywhere',
                maxHeight: 60,
                overflow: 'auto',
              }}
            >
              {summary.message}
            </Typography>
          )}
        </Box>
      )}
      <Stack
        direction="row"
        alignItems="center"
        columnGap={0.5}
        rowGap={0.5}
        flexWrap="wrap"
        sx={{ borderBottom: `1px solid ${tokens.border}`, flexShrink: 0 }}
      >
        <Tabs
          value={view}
          onChange={(_, value: string) => {
            setView(value);
            setRawPage(0);
            setMatchIndex(0);
          }}
          aria-label="Detail view"
          sx={{
            minHeight: 36,
            mr: 'auto',
            flex: { xs: '1 0 100%', sm: '0 0 auto' },
            '& .MuiTab-root': {
              minHeight: 36,
              minWidth: 0,
              px: 1.25,
              fontSize: 13,
            },
          }}
        >
          <Tab
            value="content"
            label={
              inspection.kind === 'json'
                ? 'JSON'
                : inspection.formatted !== undefined
                  ? 'Formatted'
                  : 'Text'
            }
          />
          {(inspection.kind === 'json' ||
            inspection.formatted !== undefined) && (
            <Tab value="original" label="Original" />
          )}
          {summary?.stack && <Tab value="stack" label="Stack trace" />}
        </Tabs>
        <TextField
          placeholder="Find in details"
          value={search}
          onChange={e => changeSearch(e.target.value)}
          slotProps={{
            htmlInput: { maxLength: 200, 'aria-label': 'Find in details' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Icon name="search" sx={{ fontSize: 16 }} />
                </InputAdornment>
              ),
              endAdornment: search.trim() ? (
                <InputAdornment position="end" sx={{ gap: 0.25 }}>
                  <Typography
                    role="status"
                    variant="caption"
                    color={matchCount ? 'text.secondary' : tokens.warningText}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {matchCount
                      ? `${activeIndex + 1} of ${matchCount} matches`
                      : 'No matches'}
                  </Typography>
                  <IconAction
                    label="Clear find"
                    icon="close"
                    shortcut="Esc"
                    onClick={() => changeSearch('')}
                    sx={{ p: 0.25 }}
                  />
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{
            flex: { xs: '1 0 100%', sm: '0 1 300px' },
            minWidth: 0,
            my: 0.5,
            '& .MuiInputBase-root': { height: 32, pr: 0.5 },
            '& .MuiInputBase-input': { fontSize: 13 },
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              moveMatch(event.shiftKey ? -1 : 1);
            }
            if (event.key === 'Escape') changeSearch('');
          }}
        />
        <IconAction
          label="Previous match"
          icon="up"
          shortcut="Shift+Enter"
          disabled={matchCount < 2}
          onClick={() => moveMatch(-1)}
        />
        <IconAction
          label="Next match"
          icon="down"
          shortcut="Enter"
          disabled={matchCount < 2}
          onClick={() => moveMatch(1)}
        />
        <Divider orientation="vertical" flexItem sx={{ my: 1, mx: 0.25 }} />
        {isTree ? (
          <>
            <IconAction
              label="Expand all"
              icon="expandAll"
              onClick={expandAll}
            />
            <IconAction
              label="Collapse all"
              icon="collapseAll"
              onClick={collapseAll}
            />
          </>
        ) : (
          <IconAction
            label="Wrap text"
            icon="wrap"
            aria-pressed={wrap}
            color={wrap ? 'primary' : 'default'}
            onClick={() => setWrap(!wrap)}
          />
        )}
        {isFormatted && (
          <Button
            size="small"
            startIcon={
              <Icon name="copy" sx={{ fontSize: '16px !important' }} />
            }
            onClick={() => void copy(text, 'Formatted text')}
          >
            Copy formatted text
          </Button>
        )}
        <IconAction
          label="Copy original"
          icon="copy"
          onClick={() => void copy(raw, 'Original details')}
        />
        <IconAction label="Download" icon="download" onClick={download} />
      </Stack>
      {inspection.kind === 'invalid' && (
        <Alert
          role="note"
          severity="warning"
          sx={{ py: 0, fontSize: 12.5, flexShrink: 0 }}
        >
          {inspection.formatted !== undefined
            ? 'Incomplete or invalid JSON. Formatting changes whitespace only; missing content cannot be recovered.'
            : 'Incomplete or invalid JSON. Too complex to format safely; original text is preserved.'}
        </Alert>
      )}
      {inspection.kind === 'large' && (
        <Alert
          role="note"
          severity="info"
          sx={{ py: 0, fontSize: 12.5, flexShrink: 0 }}
        >
          Large details · paged text keeps this view responsive. Copy and
          download include everything.
        </Alert>
      )}
      {scopeNote && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
          {scopeNote}
        </Typography>
      )}
      {isTree ? (
        <>
          {inspection.truncated && (
            <Typography variant="caption" color="text.secondary">
              Tree limited to 5,000 values and 40 levels. Original view retains
              everything.
            </Typography>
          )}
          <Box sx={codeFrame}>
            <Box
              ref={contentRef}
              onScroll={event => rememberScroll(event.currentTarget.scrollTop)}
              role="tree"
              aria-label="JSON details"
              data-testid="json-tree"
              sx={{
                ...surface,
                py: 0.75,
                px: 0.5,
                '& :focus-visible': {
                  outline: `2px solid ${tokens.code.focus}`,
                  outlineOffset: -2,
                },
              }}
            >
              {visible.rows.map((node, index) => (
                <Box
                  key={node.path}
                  ref={(element: HTMLDivElement | null) => {
                    if (element) nodes.current.set(node.path, element);
                    else nodes.current.delete(node.path);
                  }}
                  role="treeitem"
                  aria-level={node.depth + 1}
                  aria-expanded={
                    node.container ? visible.expanded.has(node.path) : undefined
                  }
                  aria-selected={selectedPath === node.path}
                  aria-label={`${node.label}: ${token(node, search)}`}
                  tabIndex={
                    selectedPath === node.path ||
                    (!visible.rows.some(row => row.path === selectedPath) &&
                      index === 0)
                      ? 0
                      : -1
                  }
                  data-json-path={node.path}
                  onFocus={() => setSelectedPath(node.path)}
                  onClick={() => focusNode(node.path)}
                  onKeyDown={event => treeKey(event, node, index)}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    minHeight: 26,
                    lineHeight: '22px',
                    borderRadius: 0.5,
                    scrollMarginBlock: '8px',
                    gap: 0.5,
                    pl: {
                      xs: Math.min(node.depth, 3),
                      sm: Math.min(node.depth, 12) * 1.25,
                    },
                    py: 0.25,
                    cursor: 'pointer',
                    borderLeft: '2px solid',
                    borderColor:
                      selectedPath === node.path
                        ? tokens.code.focus
                        : 'transparent',
                    bgcolor:
                      matches[activeIndex] === node.path
                        ? tokens.code.activeMatch
                        : visible.matches.has(node.path)
                          ? tokens.code.match
                          : selectedPath === node.path
                            ? tokens.code.selected
                            : 'transparent',
                    '&:hover': {
                      bgcolor:
                        selectedPath === node.path ||
                        visible.matches.has(node.path)
                          ? undefined
                          : '#18273f',
                    },
                  }}
                >
                  {node.container ? (
                    <Button
                      tabIndex={-1}
                      aria-label={`${visible.expanded.has(node.path) ? 'Collapse' : 'Expand'} ${node.path}`}
                      onClick={event => {
                        event.stopPropagation();
                        focusNode(node.path);
                        toggle(node.path);
                      }}
                      sx={{
                        color: tokens.code.muted,
                        minWidth: 22,
                        height: 22,
                        p: 0,
                        fontSize: 12,
                      }}
                    >
                      {visible.expanded.has(node.path) ? '▾' : '▸'}
                    </Button>
                  ) : (
                    <Box sx={{ width: 22, flexShrink: 0 }} />
                  )}
                  <Box
                    component="span"
                    sx={{
                      color: tokens.code.key,
                      overflowWrap: 'anywhere',
                      flexShrink: 0,
                      maxWidth: '40%',
                    }}
                  >
                    <Highlight text={node.label} search={search} />:
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      color: node.container
                        ? tokens.code.container
                        : typeof node.value === 'string'
                          ? tokens.code.string
                          : node.value === null
                            ? tokens.code.nil
                            : tokens.code.number,
                      overflowWrap: 'anywhere',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <Highlight text={token(node, search)} search={search} />
                  </Box>
                </Box>
              ))}
            </Box>
            {visible.clipped && (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={codeBar}
              >
                <Button
                  size="small"
                  disabled={visible.offset === 0}
                  onClick={() => {
                    setOffset(visible.offset - RENDER_LIMIT);
                    setFocusPath(undefined);
                  }}
                >
                  Previous tree page
                </Button>
                <Typography variant="caption">
                  Rows {visible.offset + 1}–
                  {Math.min(visible.offset + RENDER_LIMIT, visible.total)} of{' '}
                  {visible.total}
                </Typography>
                <Button
                  size="small"
                  disabled={visible.offset + RENDER_LIMIT >= visible.total}
                  onClick={() => {
                    setOffset(visible.offset + RENDER_LIMIT);
                    setFocusPath(undefined);
                  }}
                >
                  Next tree page
                </Button>
              </Stack>
            )}
            <Stack
              direction="row"
              alignItems="center"
              gap={0.5}
              flexWrap="wrap"
              sx={codeBar}
            >
              <Typography
                title={selectedPath}
                fontFamily={selectedPath === '$' ? 'inherit' : mono}
                fontSize={12}
                color={tokens.code.muted}
                sx={{
                  display: {
                    xs: selectedPath === '$' ? 'none' : 'block',
                    sm: 'block',
                  },
                  flex: '1 1 120px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedPath === '$'
                  ? 'Select a value to copy · arrow keys navigate'
                  : selectedPath}
              </Typography>
              {selected &&
                !selected.container &&
                typeof selected.value === 'string' &&
                selected.value.length > 220 && (
                  <Button size="small" onClick={() => setFullValue(true)}>
                    Show full value
                  </Button>
                )}
              <Button
                size="small"
                disabled={!selected}
                onClick={() => {
                  if (selected) {
                    try {
                      void copy(copyValueText(selected, raw), 'Value');
                    } catch {
                      toastService.showError(
                        'Value too deeply nested. Copy the original details.'
                      );
                    }
                  }
                }}
              >
                Copy value
              </Button>
              <Button
                size="small"
                onClick={() =>
                  void copy(
                    selectedPath === '$' ? '' : selectedPath.slice(1),
                    'JSON pointer'
                  )
                }
              >
                Copy path
              </Button>
            </Stack>
          </Box>
        </>
      ) : (
        <>
          <Box
            ref={contentRef}
            onScroll={event => rememberScroll(event.currentTarget.scrollTop)}
            component="pre"
            tabIndex={0}
            aria-label={
              isStack
                ? 'Stack trace text'
                : isFormatted
                  ? 'Formatted incomplete JSON'
                  : 'Original details'
            }
            data-testid={
              isStack
                ? 'stack-trace'
                : isFormatted
                  ? 'formatted-details'
                  : 'raw-details'
            }
            sx={{
              ...surface,
              m: 0,
              p: 2,
              lineHeight: 1.8,
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              overflowWrap: wrap ? 'anywhere' : 'normal',
            }}
          >
            {text ? highlighted() : '(Empty details)'}
          </Box>
          {isFormatted && rawPage === pages - 1 && (
            <Typography variant="caption" color="text.secondary">
              End of captured details · incomplete or invalid JSON
            </Typography>
          )}
          {pages > 1 && (
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Button
                size="small"
                disabled={rawPage === 0}
                onClick={() => {
                  setRawPage(value => value - 1);
                  setMatchIndex(0);
                }}
              >
                Previous text page
              </Button>
              <Chip
                size="small"
                variant="outlined"
                label={`Text page ${rawPage + 1} of ${pages}`}
              />
              <Button
                size="small"
                disabled={rawPage + 1 >= pages}
                onClick={() => {
                  setRawPage(value => value + 1);
                  setMatchIndex(0);
                }}
              >
                Next text page
              </Button>
            </Stack>
          )}
        </>
      )}
      {fullValue && selected && typeof selected.value === 'string' && (
        <ScalarDialog
          text={selected.value}
          path={selectedPath}
          initialSearch={search}
          onClose={() => setFullValue(false)}
          onCopy={() => void copy(copyValueText(selected, raw), 'Value')}
        />
      )}
    </Stack>
  );
}
