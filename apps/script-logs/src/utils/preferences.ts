import { useState } from 'react';

export function usePreference<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(`script-logs:${key}`) || 'null'
      );
      return valid(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(`script-logs:${key}`, JSON.stringify(next));
    } catch {
      /* Storage can be disabled in hosted browsers. */
    }
  };
  return [value, update] as const;
}
