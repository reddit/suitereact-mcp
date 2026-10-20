import {
  LogPage,
  LogRequest,
  LogRow,
  LogTablePage,
  LogTableRequest,
  LogTableRow,
} from '../../src/domain/types';
import { demoDeployments, demoScripts } from './options';

export const DEMO_ANCHOR = '2026-09-10 10:42:00';

export const incompleteArray =
  '[{"action":"c","period":0,"balance":1234.56,"audit":{"message":"Opening synthetic schedule"}},{"action":"c","period":1,"balance":1200,"flags":[true,false]},{"action":"c","period":2,"remaining_pay';

const nestedError = {
  type: 'error.SuiteScriptError',
  name: 'INVOICE_SYNC_FAILED',
  message:
    'Invoice sync stopped: the downstream request could not be completed.',
  stack: [
    'syncInvoice(/SuiteScripts/demo/invoiceSync.js:142:18)',
    'map(/SuiteScripts/demo/invoiceSync.js:61:9)',
    'execute(/SuiteScripts/demo/runner.js:24:5)',
  ],
  cause: {
    name: 'UPSTREAM_VALIDATION_ERROR',
    message: 'The destination rejected one invoice line.',
    response: {
      status: 422,
      requestId: 'demo-request-7f29',
      body: {
        errors: [
          {
            field: 'lines[2].taxCode',
            code: 'INVALID_TAX_CODE',
            message: 'Tax code DEMO-EXEMPT is not enabled for this subsidiary.',
            value: 'DEMO-EXEMPT',
          },
        ],
        retryable: false,
      },
    },
  },
  context: {
    invoice: 'DEMO-INV-1042',
    subsidiary: 'Demo US',
    attempt: 2,
    correlationId: 'demo-correlation-1042',
    lines: [
      { item: 'Demo service', amount: 1200 },
      { item: 'Demo support', amount: 300 },
      { item: 'Demo training', amount: 450 },
    ],
  },
  notifyOff: false,
};

export const demoLogs: (LogRow & { raw: string })[] = [
  {
    id: '9001',
    date: '2026-09-10 10:41:28',
    severity: 'ERROR',
    title: 'Invoice sync failed',
    script: '101',
    deployment: '201',
    raw: JSON.stringify(nestedError),
  },
  {
    id: '9000',
    date: '2026-09-10 10:39:12',
    severity: 'ERROR',
    title: 'Payment reconciliation timeout',
    script: '102',
    deployment: '203',
    raw: JSON.stringify({
      name: 'SSS_REQUEST_TIME_EXCEEDED',
      message: 'Demo payment service timed out after 45 seconds.',
      stack:
        'reconcile(/SuiteScripts/demo/payments.js:88:14)\nreduce(/SuiteScripts/demo/payments.js:32:7)',
      cause: {
        timeoutMs: 45000,
        attempts: [
          { attempt: 1, status: 503 },
          { attempt: 2, status: 504 },
        ],
        retryable: true,
      },
    }),
  },
  {
    id: '8999',
    date: '2026-09-10 10:36:05',
    severity: 'AUDIT',
    title: 'Customer export completed',
    script: '103',
    deployment: '204',
    raw: 'Export completed.\nProcessed: 42 synthetic customers\nSkipped: 0\nDuration: 2.4 seconds\nAll identifiers in this example are invented.',
  },
  {
    id: '8998',
    date: '2026-09-10 10:34:51',
    severity: 'ERROR',
    title: 'Truncated upstream error',
    script: '101',
    deployment: '202',
    raw: incompleteArray,
  },
  {
    id: '8997',
    date: '2026-09-10 10:30:00',
    severity: 'DEBUG',
    title: 'Large diagnostic payload',
    script: '103',
    deployment: '204',
    raw: JSON.stringify({
      name: 'DEMO_DIAGNOSTIC',
      message: 'Synthetic payload for responsiveness testing.',
      rows: Array.from({ length: 10000 }, (_, i) => ({
        index: i,
        note: 'Synthetic diagnostic entry; no private data.',
        status: 'pending',
      })),
    }),
  },
  ...Array.from({ length: 31 }, (_, i) => ({
    id: String(8996 - i),
    date: `2026-09-${i < 18 ? '10' : '09'} ${String(9 - (i % 9)).padStart(2, '0')}:20:00`,
    severity:
      i % 4 === 0
        ? 'ERROR'
        : i % 4 === 1
          ? 'AUDIT'
          : i % 4 === 2
            ? 'DEBUG'
            : 'EMERGENCY',
    title:
      i % 4 === 0
        ? `Invoice retry failed · batch ${i + 1}`
        : `Demo execution · batch ${i + 1}`,
    script: i % 2 ? '102' : '101',
    deployment: i % 2 ? '203' : '202',
    raw:
      i % 2
        ? `Demo batch ${i + 1} completed.\nThis is a plain-text execution log.`
        : JSON.stringify({
            name: 'DEMO_RETRY',
            message: 'Synthetic retry event',
            cause: {
              batch: i + 1,
              retryable: true,
              values: [null, false, 0, ''],
            },
          }),
  })),
].sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));

export function listDemoLogs(request: LogRequest): LogPage {
  const anchor = Date.parse(DEMO_ANCHOR.replace(' ', 'T') + 'Z');
  const filtered = demoLogs.filter(row => {
    const time = Date.parse(row.date.replace(' ', 'T') + 'Z');
    return (
      time >= anchor - request.hours * 3600000 &&
      time <= anchor &&
      (!request.search.trim() ||
        (row.title + '\n' + row.raw)
          .toLowerCase()
          .includes(request.search.trim().toLowerCase())) &&
      (!request.severity || row.severity === request.severity) &&
      (!request.script || row.script === request.script) &&
      (!request.deployment || row.deployment === request.deployment) &&
      (!request.cursor ||
        row.date < request.cursor.date ||
        (row.date === request.cursor.date &&
          Number(row.id) < Number(request.cursor.id)))
    );
  });
  const rows = filtered
    .slice(0, request.pageSize)
    .map(({ id, date, severity, title, script, deployment }) => ({
      id,
      date,
      severity,
      title,
      script,
      deployment,
    }));
  const last = rows[rows.length - 1];
  return {
    rows,
    next:
      filtered.length > request.pageSize && last
        ? { date: last.date, id: last.id, anchor: DEMO_ANCHOR }
        : null,
  };
}

export function getDemoDetail(id: string) {
  const row = demoLogs.find(row => row.id === id);
  return row ? { raw: row.raw } : null;
}

export function listDemoLogTable(request: LogTableRequest): LogTablePage {
  const anchor = Date.parse(DEMO_ANCHOR.replace(' ', 'T') + 'Z');
  const rows: LogTableRow[] = demoLogs
    .filter(row => {
      const time = Date.parse(row.date.replace(' ', 'T') + 'Z');
      const parse = (value = '') => Date.parse(value.replace(' ', 'T') + 'Z');
      return (
        (request.hours === 0
          ? time >= parse(request.from) && time <= parse(request.to)
          : time >= anchor - request.hours * 3600000) &&
        time <= anchor &&
        (!request.search.trim() ||
          (row.title + '\n' + row.raw)
            .toLowerCase()
            .includes(request.search.trim().toLowerCase())) &&
        (!request.severity || row.severity === request.severity) &&
        (!request.script || row.script === request.script) &&
        (!request.deployment || row.deployment === request.deployment)
      );
    })
    .map(({ raw, ...row }) => ({
      ...row,
      scriptName: demoScripts.find(s => s.value === row.script)?.label || '',
      scriptId: demoScripts.find(s => s.value === row.script)?.scriptId || '',
      deploymentName:
        demoDeployments.find(d => d.value === row.deployment)?.label || '',
      deploymentLabel:
        demoDeployments.find(d => d.value === row.deployment)?.scriptId || '',
      userName:
        row.id === '8998'
          ? ''
          : Number(row.id) % 2
            ? 'Demo operator'
            : 'Demo integration user',
      preview: raw.slice(0, 500),
      previewTruncated: raw.length > 500,
    }));
  const { field, direction } = request.sort;
  rows.sort(
    (a, b) =>
      a[field].localeCompare(b[field]) * (direction === 'asc' ? 1 : -1) ||
      Number(b.id) - Number(a.id)
  );
  const start = request.page * request.pageSize;
  return {
    rows: rows.slice(start, start + request.pageSize),
    total: rows.length,
    hasMore: start + request.pageSize < rows.length,
    capped: false,
    anchor: DEMO_ANCHOR,
  };
}
