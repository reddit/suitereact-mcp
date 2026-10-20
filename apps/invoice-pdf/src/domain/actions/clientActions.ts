import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js';
import dayjs from 'dayjs';
import {
  handleRestletAction,
  type NsReactTableHeaderProps,
  type NsReactTableRowProps,
} from 'suitereact';

import type {
  GeneratePdfsResponse,
  InvoiceFilters,
  InvoiceRow,
} from '../types';

const LOCAL_PROXY_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const LOCAL_PROXY_TOKEN = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildInvoiceQuery(filters: InvoiceFilters, afterId?: number): string {
  const clauses: string[] = [];

  if (filters.dateFrom.trim()) {
    clauses.push(`t.trandate >= DATE '${filters.dateFrom.trim()}'`);
  }
  if (filters.dateTo.trim()) {
    clauses.push(`t.trandate <= DATE '${filters.dateTo.trim()}'`);
  }
  if (filters.customerContains.trim()) {
    clauses.push(
      `UPPER(BUILTIN.DF(t.entity)) LIKE UPPER('%${escapeSql(filters.customerContains.trim())}%')`
    );
  }
  if (filters.statusContains.trim()) {
    clauses.push(
      `UPPER(BUILTIN.DF(t.status)) LIKE UPPER('%${escapeSql(filters.statusContains.trim())}%')`
    );
  }
  if (filters.tranIdContains.trim()) {
    clauses.push(
      `UPPER(t.tranid) LIKE UPPER('%${escapeSql(filters.tranIdContains.trim())}%')`
    );
  }
  if (afterId != null) {
    clauses.push(`t.id > ${afterId}`);
  }

  const where = clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';

  return `SELECT t.id, t.tranid, TO_CHAR(t.trandate, 'YYYY-MM-DD') AS trandate, BUILTIN.DF(t.entity) AS customer, REPLACE(BUILTIN.DF(t.status), 'Invoice : ', '') AS status, t.foreigntotal AS amount, BUILTIN.DF(t.currency) AS currency, TO_CHAR(t.duedate, 'YYYY-MM-DD') AS duedate, t.memo FROM transaction t INNER JOIN transactionline tl ON (tl.transaction = t.id) AND (tl.mainline = 'T') WHERE t.type = 'CustInvc'${where} ORDER BY t.trandate DESC, t.id DESC`;
}

function buildCountQuery(filters: InvoiceFilters): string {
  const clauses: string[] = [];

  if (filters.dateFrom.trim()) {
    clauses.push(`t.trandate >= DATE '${filters.dateFrom.trim()}'`);
  }
  if (filters.dateTo.trim()) {
    clauses.push(`t.trandate <= DATE '${filters.dateTo.trim()}'`);
  }
  if (filters.customerContains.trim()) {
    clauses.push(
      `UPPER(BUILTIN.DF(t.entity)) LIKE UPPER('%${escapeSql(filters.customerContains.trim())}%')`
    );
  }
  if (filters.statusContains.trim()) {
    clauses.push(
      `UPPER(BUILTIN.DF(t.status)) LIKE UPPER('%${escapeSql(filters.statusContains.trim())}%')`
    );
  }
  if (filters.tranIdContains.trim()) {
    clauses.push(
      `UPPER(t.tranid) LIKE UPPER('%${escapeSql(filters.tranIdContains.trim())}%')`
    );
  }

  const where = clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';

  return `SELECT COUNT(*) AS cnt FROM transaction t INNER JOIN transactionline tl ON (tl.transaction = t.id) AND (tl.mainline = 'T') WHERE t.type = 'CustInvc'${where}`;
}

function isErrorPayload(
  value: unknown
): value is { error?: string; message?: string; success?: boolean } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function fetchInvoiceCount(
  filters: InvoiceFilters
): Promise<number> {
  const query = buildCountQuery(filters);
  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    { query },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );
  if (raw == null) return 0;
  const { rows } = raw as { rows?: Array<Record<string, unknown>> };
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  return Number(rows[0].cnt ?? rows[0].CNT ?? 0);
}

export async function searchInvoices(
  filters: InvoiceFilters,
  afterId?: number
): Promise<{ rows: InvoiceRow[] }> {
  const query = buildInvoiceQuery(filters, afterId);

  const raw = await handleRestletAction(
    'getTableRowsFromSuiteql',
    { query },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  if (raw == null) {
    throw new Error('Empty response from server');
  }

  if (isErrorPayload(raw) && raw.success === false) {
    throw new Error(String(raw.message || raw.error || 'Unknown server error'));
  }

  const { headers, rows } = raw as {
    headers?: NsReactTableHeaderProps[];
    rows?: NsReactTableRowProps[];
  };

  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new Error('Unexpected response shape from getTableRowsFromSuiteql');
  }

  return { rows: rows.map(normalizeRow) };
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'label' in value)
    return String((value as { label?: unknown }).label ?? '');
  return String(value);
}

function normalizeRow(raw: NsReactTableRowProps, index: number): InvoiceRow {
  const amount = text(raw.amount);
  return {
    id: String(raw.id ?? index),
    tranid: text(raw.tranid),
    trandate: text(raw.trandate),
    customer: text(raw.customer),
    status: text(raw.status),
    amount: amount === '' ? null : Number(amount),
    currency: text(raw.currency),
    duedate: text(raw.duedate),
    memo: text(raw.memo),
  };
}

export async function generateInvoicePdfs(
  invoices: Array<{ id: number; tranId: string }>
): Promise<GeneratePdfsResponse> {
  const raw = await handleRestletAction(
    'generateInvoicePdfs',
    { invoices },
    LOCAL_PROXY_BASE_URL,
    LOCAL_PROXY_TOKEN
  );

  if (raw == null) {
    throw new Error('Empty response from server');
  }

  if (isErrorPayload(raw) && raw.success === false) {
    throw new Error(
      String(raw.message || raw.error || 'PDF generation failed')
    );
  }

  return raw as GeneratePdfsResponse;
}

const RESERVED_FILE_CHARS = '\\/:*?"<>|';

function safeFileStem(value: string): string {
  return [...value]
    .map(ch =>
      ch.charCodeAt(0) < 32 || RESERVED_FILE_CHARS.includes(ch) ? '-' : ch
    )
    .join('')
    .replace(/-{2,}/g, '-');
}

/**
 * File names for ZIP entries: path and reserved characters become "-" so an
 * invoice number cannot create folders or invalid names, and repeated numbers
 * get " (2)", " (3)" so no PDF overwrites another.
 */
export function zipEntryNames(
  pdfs: Array<{ id: number | string; tranId: string }>
): string[] {
  const used = new Set<string>();
  return pdfs.map(pdf => {
    const base =
      safeFileStem(pdf.tranId).replace(/^[.\s-]+|[.\s]+$/g, '') ||
      `invoice-${pdf.id}`;
    let name = `${base}.pdf`;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      name = `${base} (${n}).pdf`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Builds and downloads the ZIP; returns the archive file name. */
export async function downloadPdfsAsZip(
  pdfs: Array<{ id: number | string; tranId: string; base64: string }>
): Promise<string> {
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    bufferedWrite: true,
  });
  const names = zipEntryNames(pdfs);

  for (const [index, pdf] of pdfs.entries()) {
    const response = await fetch(`data:application/pdf;base64,${pdf.base64}`);
    const pdfBlob = await response.blob();
    await zipWriter.add(names[index], new BlobReader(pdfBlob));
  }

  const blob = await zipWriter.close();
  const fileName = `invoices-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  try {
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    URL.revokeObjectURL(url);
  }
  return fileName;
}
