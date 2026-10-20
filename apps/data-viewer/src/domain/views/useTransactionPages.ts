import { useCallback, useEffect, useRef, useState } from 'react';

import type { DataViewerCursor, TransactionPage } from '../types';

export function useTransactionPages<T extends TransactionPage>(
  fetchPage: (cursor?: DataViewerCursor) => Promise<T>
) {
  const [result, setResult] = useState<T>();
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cache = useRef(new Map<number, T>());
  const cursors = useRef(new Map<number, DataViewerCursor>());
  const sequence = useRef(0);
  const requested = useRef(0);

  const go = useCallback(
    async (index: number) => {
      const request = ++sequence.current;
      requested.current = index;
      setLoading(true);
      setError('');
      try {
        const cursor = cursors.current.get(index);
        if (index > 0 && !cursor)
          throw new Error('Missing page cursor. Refresh data.');
        const next = cache.current.get(index) ?? (await fetchPage(cursor));
        if (request !== sequence.current) return;
        if (next.hasMore && !next.nextCursor)
          throw new Error('Missing next page cursor');
        cache.current.delete(index);
        cache.current.set(index, next);
        if (cache.current.size > 8)
          cache.current.delete(cache.current.keys().next().value!);
        if (next.nextCursor) cursors.current.set(index + 1, next.nextCursor);
        setResult(next);
        setPage(index);
      } catch (cause) {
        if (request === sequence.current)
          setError(
            `Could not load page ${index + 1}: ${cause instanceof Error ? cause.message : String(cause)}`
          );
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    cache.current.clear();
    cursors.current.clear();
    setResult(undefined);
    setPage(0);
    void go(0);
    return () => {
      sequence.current++;
    };
  }, [go]);

  return {
    result,
    page,
    loading,
    error,
    go,
    retry: () => go(requested.current),
  };
}
