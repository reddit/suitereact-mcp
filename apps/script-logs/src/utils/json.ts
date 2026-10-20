export const PARSE_LIMIT = 256 * 1024;
export const INDEX_LIMIT = 5000;
export const RENDER_LIMIT = 500;
export const RAW_PAGE_SIZE = 16 * 1024;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface JsonNode {
  path: string;
  label: string;
  value: JsonValue;
  parent: string | null;
  depth: number;
  container: boolean;
}
export interface Inspection {
  kind: 'json' | 'text' | 'invalid' | 'large';
  nodes: JsonNode[];
  truncated: boolean;
  value?: JsonValue;
  formatted?: string;
}

export function inspectJson(raw: string): Inspection {
  if (
    raw.length > PARSE_LIMIT ||
    new TextEncoder().encode(raw).length > PARSE_LIMIT
  ) {
    return { kind: 'large', nodes: [], truncated: false };
  }
  let value: JsonValue;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      kind: /^\s*[[{]/.test(raw) ? 'invalid' : 'text',
      formatted: /^\s*[[{]/.test(raw)
        ? (formatIncompleteJson(raw) ?? undefined)
        : undefined,
      nodes: [],
      truncated: false,
    };
  }
  const nodes: JsonNode[] = [];
  let truncated = false;
  const visit = (
    item: JsonValue,
    path: string,
    label: string,
    parent: string | null,
    depth: number
  ) => {
    if (nodes.length >= INDEX_LIMIT || depth > 40) {
      truncated = true;
      return;
    }
    const container = item !== null && typeof item === 'object';
    nodes.push({ path, label, value: item, parent, depth, container });
    if (container) {
      for (const key of Object.keys(item)) {
        if (nodes.length >= INDEX_LIMIT) {
          truncated = true;
          break;
        }
        const child = (item as { [key: string]: JsonValue })[key];
        visit(
          child,
          path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'),
          key,
          path,
          depth + 1
        );
      }
    }
  };
  visit(value, '$', '$', null, 0);
  return { kind: 'json', nodes, truncated, value };
}

export function matchingPaths(
  nodes: JsonNode[],
  search: string
): { matches: Set<string>; visible: Set<string> } {
  const matches = new Set<string>();
  const visible = new Set<string>();
  const term = search.trim().toLowerCase();
  const byPath = new Map(nodes.map(node => [node.path, node]));
  if (term)
    for (const node of nodes) {
      const text = node.container
        ? node.label
        : node.label + ' ' + JSON.stringify(node.value);
      if (text.toLowerCase().includes(term)) {
        matches.add(node.path);
        let current: JsonNode | undefined = node;
        while (current) {
          visible.add(current.path);
          current =
            current.parent === null ? undefined : byPath.get(current.parent);
        }
      }
    }
  return { matches, visible };
}

export function visibleNodes(
  nodes: JsonNode[],
  expanded: Set<string>,
  search: string,
  options: { offset?: number; focusPath?: string; collapsed?: Set<string> } = {}
) {
  const found = matchingPaths(nodes, search);
  const effectiveExpanded = new Set(expanded);
  if (search.trim()) {
    const byPath = new Map(nodes.map(node => [node.path, node]));
    for (const path of found.visible) {
      const parent = byPath.get(path)?.parent;
      if (parent) effectiveExpanded.add(parent);
    }
    for (const path of options.collapsed ?? []) effectiveExpanded.delete(path);
  }
  const shown = new Set<string>();
  const rows = nodes.filter(node => {
    const visible =
      node.parent === null ||
      (shown.has(node.parent) && effectiveExpanded.has(node.parent));
    if (visible) shown.add(node.path);
    return visible;
  });
  const focusIndex = options.focusPath
    ? rows.findIndex(node => node.path === options.focusPath)
    : -1;
  const offset =
    focusIndex >= 0
      ? Math.floor(focusIndex / RENDER_LIMIT) * RENDER_LIMIT
      : Math.min(
          options.offset ?? 0,
          Math.max(
            0,
            Math.floor((rows.length - 1) / RENDER_LIMIT) * RENDER_LIMIT
          )
        );
  return {
    rows: rows.slice(offset, offset + RENDER_LIMIT),
    offset,
    total: rows.length,
    expanded: effectiveExpanded,
    clipped: rows.length > RENDER_LIMIT,
    matches: found.matches,
  };
}

/**
 * Text for "Copy value": a root container copies the original payload
 * verbatim; strings, including a root string, copy as decoded text.
 */
export function copyValueText(node: JsonNode, raw: string) {
  return node.path === '$' && node.container
    ? raw
    : typeof node.value === 'string'
      ? node.value
      : JSON.stringify(node.value, null, 2);
}

export function errorSummary(value?: JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = typeof value.name === 'string' ? value.name.slice(0, 300) : '';
  const message =
    typeof value.message === 'string' ? value.message.slice(0, 2000) : '';
  const stack =
    typeof value.stack === 'string'
      ? value.stack
      : Array.isArray(value.stack)
        ? value.stack.filter(line => typeof line === 'string').join('\n')
        : '';
  return name || message || stack
    ? { name, message, stack }
    : null;
}

// Preserve every token, including unfinished strings and keys. Never repair or evaluate the payload.
export function formatIncompleteJson(raw: string): string | null {
  if (
    raw.length > PARSE_LIMIT ||
    new TextEncoder().encode(raw).length > PARSE_LIMIT
  )
    return null;
  const parts: string[] = [];
  let length = 0;
  let depth = 0;
  let lineStart = true;
  let pendingSpace = false;
  let previous = '';
  const append = (value: string) => {
    parts.push(value);
    length += value.length;
  };
  const newline = () => {
    if (!lineStart) append('\n');
    lineStart = true;
  };
  const emit = (token: string) => {
    if (lineStart) append('  '.repeat(depth));
    else if (pendingSpace && previous !== ':') append(' ');
    append(token);
    lineStart = false;
    pendingSpace = false;
    previous = token;
  };
  for (let index = 0; index < raw.length; ) {
    const char = raw[index];
    if (/\s/.test(char)) {
      pendingSpace = true;
      index++;
      continue;
    }
    if (char === '"') {
      const start = index++;
      while (index < raw.length) {
        if (raw[index] === '\\') {
          index = Math.min(index + 2, raw.length);
          continue;
        }
        if (raw[index++] === '"') break;
      }
      emit(raw.slice(start, index));
    } else if (char === '{' || char === '[') {
      emit(char);
      index++;
      depth++;
      if (depth > 40) return null;
      newline();
    } else if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1);
      newline();
      emit(char);
      index++;
    } else if (char === ',') {
      pendingSpace = false;
      emit(char);
      index++;
      newline();
    } else if (char === ':') {
      pendingSpace = false;
      emit(':');
      append(' ');
      index++;
    } else {
      const start = index++;
      while (index < raw.length && !/[\s{}[\],:"]/.test(raw[index])) index++;
      emit(raw.slice(start, index));
    }
    if (length > PARSE_LIMIT * 2) return null;
  }
  return parts.join('');
}
