import { handleRestletAction } from 'suitereact';

import type { PendingTransaction, TransactionTypeOption } from '../types';

const LOCAL_PROXY_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const LOCAL_PROXY_TOKEN = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

const PENDING_WHERE = (suiteqlType: string) =>
  `BUILTIN.DF(t.approvalstatus) = 'Pending Approval' AND BUILTIN.DF(t.type) = '${escapeSql(suiteqlType)}'`;

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function extractNsErrorDetail(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    const details = obj?.['o:errorDetails'] ?? [];
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0];
      const code = first['o:errorCode'] ?? '';
      const detail = first.detail ?? '';
      return code ? `[${code}] ${detail}` : detail || raw;
    }
    return obj?.title ? `${obj.title}: ${obj.detail ?? raw}` : raw;
  } catch {
    const match = raw.match(/"detail"\s*:\s*"([^"]+)"/);
    return match?.[1] ?? raw;
  }
}

function isErrorPayload(
  value: unknown
): value is { error?: string; message?: string; success?: boolean } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export interface FetchPendingResult {
  rows: PendingTransaction[];
}

const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'label' in (value as object)) {
    const option = value as { label?: string; value?: string | number };
    return String(option.label ?? option.value ?? '');
  }
  return String(value);
};

const DEFAULT_QUERY_TIMEOUT_MS = 90_000;
const DEBIT_CHUNK = 200;

/** Tests shorten the timeout by setting `window.__approvalManagerQueryTimeoutMs` before load. */
function queryTimeoutMs(): number {
  const override = Number(
    (window as { __approvalManagerQueryTimeoutMs?: number })
      .__approvalManagerQueryTimeoutMs
  );
  return Number.isFinite(override) && override > 0
    ? override
    : DEFAULT_QUERY_TIMEOUT_MS;
}

/** A stalled RESTlet must surface as an error the user can retry, not an endless skeleton. */
export function withTimeout<T>(promise: Promise<T>): Promise<T> {
  const ms = queryTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `NetSuite didn't respond within ${Math.round(ms / 1000)} seconds. Try again; if it keeps happening, check the action handler's execution log.`
          )
        ),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Sum line debits per transaction (in transaction currency) for rows whose
 * header has no foreigntotal, e.g. journals. Non-correlated and chunked.
 */
export async function fetchDebitTotals(
  ids: string[]
): Promise<Record<string, number>> {
  const numeric = ids.map(Number).filter(id => Number.isInteger(id) && id > 0);
  const totals: Record<string, number> = {};
  for (let start = 0; start < numeric.length; start += DEBIT_CHUNK) {
    const chunk = numeric.slice(start, start + DEBIT_CHUNK);
    const query = `SELECT tl.transaction AS id, SUM(tl.debitforeignamount) AS amount FROM transactionline tl WHERE tl.transaction IN (${chunk.join(',')}) GROUP BY tl.transaction`;
    const raw = await withTimeout(
      handleRestletAction(
        'getTableRowsFromSuiteql',
        { query },
        LOCAL_PROXY_BASE_URL,
        LOCAL_PROXY_TOKEN
      )
    );
    if (isErrorPayload(raw) && raw.error)
      throw new Error(String(raw.message || raw.error));
    const { rows } = (raw ?? {}) as { rows?: Array<Record<string, unknown>> };
    if (!Array.isArray(rows)) throw new Error('Unexpected response shape');
    for (const row of rows) {
      const amount = Number(text(row.amount));
      if (Number.isFinite(amount)) totals[text(row.id)] = amount;
    }
  }
  return totals;
}

/**
 * Fetch the total count of pending-approval transactions for a given type.
 */
export async function fetchPendingCount(
  txnType: TransactionTypeOption
): Promise<number> {
  const query = `SELECT COUNT(*) AS cnt FROM transaction t WHERE ${PENDING_WHERE(txnType.suiteqlType)}`;
  const raw = await withTimeout(
    handleRestletAction(
      'getTableRowsFromSuiteql',
      { query },
      LOCAL_PROXY_BASE_URL,
      LOCAL_PROXY_TOKEN
    )
  );
  if (raw == null) return 0;
  const { rows } = raw as { rows?: Array<Record<string, unknown>> };
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0];
  return Number(first.cnt ?? first.CNT ?? 0);
}

/**
 * Fetch transactions with approvalstatus = 'Pending Approval' for a given type.
 * Uses keyset pagination via `afterId` (WHERE t.id > afterId ORDER BY t.id ASC).
 * Journals have no foreigntotal; their amounts come from `fetchDebitTotals`.
 * Keep this query to cheap header columns. In SB1, BUILTIN.DF(t.createdby)
 * (resolved per row from system notes) and a correlated SUM over
 * transactionline both stall the RESTlet at queue scale (~575 journals).
 */
export async function fetchPendingApprovals(
  txnType: TransactionTypeOption,
  afterId?: number
): Promise<FetchPendingResult> {
  const cursorSql =
    afterId != null && Number.isFinite(afterId)
      ? ` AND t.id > ${Math.trunc(afterId)}`
      : '';
  const query = `
    SELECT t.id,
           t.tranid,
           t.recordtype,
           TO_CHAR(t.trandate, 'YYYY-MM-DD') AS trandate,
           BUILTIN.DF(t.entity) AS entity,
           t.memo,
           t.foreigntotal AS amount,
           c.symbol AS currency
    FROM transaction t
    LEFT JOIN currency c ON c.id = t.currency
    WHERE ${PENDING_WHERE(txnType.suiteqlType)}${cursorSql}
    ORDER BY t.id ASC
  `
    .replace(/\s+/g, ' ')
    .trim();

  const raw = await withTimeout(
    handleRestletAction(
      'getTableRowsFromSuiteql',
      { query },
      LOCAL_PROXY_BASE_URL,
      LOCAL_PROXY_TOKEN
    )
  );

  if (raw == null) throw new Error('Empty response from server');

  if (isErrorPayload(raw) && raw.success === false) {
    throw new Error(String(raw.message || raw.error || 'Unknown server error'));
  }
  if (isErrorPayload(raw) && raw.error && !('headers' in raw)) {
    throw new Error(String(raw.error));
  }

  const { rows } = raw as { rows: Array<Record<string, unknown>> };
  if (!Array.isArray(rows)) throw new Error('Unexpected response shape');

  return {
    rows: rows.map(row => {
      const amount = text(row.amount);
      return {
        id: text(row.id),
        tranid: text(row.tranid),
        recordtype: text(row.recordtype),
        trandate: text(row.trandate),
        entity: text(row.entity),
        memo: text(row.memo),
        amount: amount === '' ? null : Number(amount),
        currency: text(row.currency),
      };
    }),
  };
}

/**
 * Resolve NetSuite record URL templates via the `resolveRecordUrls` server
 * action (uses N/url.resolveDomain + N/url.resolveRecord on the server).
 */
export async function fetchRecordUrlTemplates(
  recordTypes: string[]
): Promise<Record<string, string>> {
  const raw = await handleRestletAction(
    'resolveRecordUrls',
    { recordTypes },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  if (raw == null) return {};

  const result = raw as { domain?: string; templates?: Record<string, string> };
  return result.templates ?? {};
}

/**
 * Approve a single transaction by internal ID.
 * Calls the `approveTransaction` server action which sets approvalstatus = Approved.
 *
 * @param transactionId - Internal ID of the transaction.
 * @param recordtype - SuiteQL record-type string (e.g. 'journalentry', 'invoice').
 */
export async function approveTransaction(
  transactionId: string,
  recordtype: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const raw = await handleRestletAction(
      'approveTransaction',
      { id: transactionId, recordtype },
      LOCAL_PROXY_BASE_URL,
      LOCAL_PROXY_TOKEN
    );

    if (raw == null) throw new Error('Empty response from server');

    if (isErrorPayload(raw) && raw.error) {
      throw new Error(String(raw.message || raw.error));
    }

    return { success: true, message: `Transaction ${transactionId} approved` };
  } catch (err: unknown) {
    const axiosData = (err as any)?.response?.data;
    if (typeof axiosData?.error?.message === 'string') {
      throw new Error(axiosData.error.message);
    }
    if (axiosData?.error) {
      const raw =
        typeof axiosData.error === 'string'
          ? axiosData.error
          : JSON.stringify(axiosData.error);
      const nsDetail = extractNsErrorDetail(raw);
      throw new Error(nsDetail);
    }
    throw err;
  }
}
