import type { PendingTransaction } from './types';

/** Builds a local calendar date, rejecting impossible components such as month 23. */
function calendarDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

/**
 * The queue query returns trandate as ISO `YYYY-MM-DD` (TO_CHAR), which is a
 * calendar date and is built in local time. M/D/YYYY is accepted for other
 * callers; anything that is not a valid calendar date is returned as null and
 * shown verbatim rather than rolled into a different date.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || !value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return calendarDate(Number(us[3]), Number(us[1]), Number(us[2]));
  return null;
}

export function formatDate(value: unknown): string {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : String(value || '');
}

export function relativeAge(value: unknown, now = Date.now()): string {
  const date = toDate(value);
  if (!date) return '';
  const days = Math.floor((now - date.getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 60) return `${days}d old`;
  if (days < 730) return `${Math.floor(days / 30)}mo old`;
  return `${Math.floor(days / 365)}y old`;
}

export function formatMoney(amount: number | null, currency?: string): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
      }).format(amount);
    } catch {
      /* fall through for codes Intl does not know */
    }
  }
  const number = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${number}` : number;
}

export const hasAmount = (row: PendingTransaction) =>
  row.amount != null && !Number.isNaN(row.amount) && !row.amountStatus;

/** Rows whose amount is still loading or unavailable are excluded from totals. */
export const missingAmountCount = (rows: PendingTransaction[]) =>
  rows.filter(row => !hasAmount(row)).length;

/** Amounts in different currencies are never summed together. */
export function totalsByCurrency(rows: PendingTransaction[]) {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    if (!hasAmount(row)) continue;
    const key = row.currency || '';
    const entry = totals.get(key) ?? { amount: 0, count: 0 };
    entry.amount += row.amount ?? 0;
    entry.count += 1;
    totals.set(key, entry);
  }
  return [...totals.entries()]
    .map(([currency, value]) => ({ currency, ...value }))
    .sort((a, b) => b.count - a.count);
}

export function formatTotals(rows: PendingTransaction[]): string {
  const parts = totalsByCurrency(rows).map(total =>
    formatMoney(total.amount, total.currency)
  );
  const missing = missingAmountCount(rows);
  if (missing) parts.push(`${missing.toLocaleString()} without amount`);
  return parts.join(' · ');
}

export const plural = (count: number, singular: string, label: string) =>
  `${count.toLocaleString()} ${count === 1 ? singular : label.toLowerCase()}`;
