import type { QueryHistoryEntry } from '../types';

const QUERY_HISTORY_STORAGE_KEY = 'suitereact:suiteql-bot:query-history:v1';
export const MAX_QUERY_HISTORY_ENTRIES = 50;

function isQueryHistoryEntry(value: unknown): value is QueryHistoryEntry {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<QueryHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.query === 'string' &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp) &&
    typeof entry.resultCount === 'number' &&
    Number.isFinite(entry.resultCount)
  );
}

export function loadQueryHistory(): QueryHistoryEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(QUERY_HISTORY_STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isQueryHistoryEntry)
      .slice(0, MAX_QUERY_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

export function saveQueryHistory(entries: QueryHistoryEntry[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      QUERY_HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_QUERY_HISTORY_ENTRIES))
    );
  } catch {
    // History remains available for the current session when storage is blocked.
  }
}
