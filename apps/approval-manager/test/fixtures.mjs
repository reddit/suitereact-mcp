// Synthetic, invented transactions for intercepted browser tests only. No account data.
const entities = [
  'Northwind Logistics Holdings — EMEA Shared Services',
  'Contoso Ltd.',
  'Fabrikam Cloud Platform (Annual Prepay)',
  'Adventure Works',
  'Tailspin Toys GmbH',
  '',
];
const memos = [
  'Accrue September cloud hosting — true-up after usage review',
  'Reclass marketing spend to Brand cost center',
  '',
  'Quarterly prepaid amortization',
  'Vendor credit applied; see attached support',
];
const currencies = ['USD', 'USD', 'GBP', 'EUR'];

function make(prefix, recordtype, count, start, base, withEntity) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(start + i),
    tranid: `${prefix}-${String(10420 + i)}`,
    recordtype,
    // The queue query returns TO_CHAR(t.trandate, 'YYYY-MM-DD').
    trandate: `${i % 5 === 0 ? 2019 : 2026}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
    entity: withEntity ? entities[i % entities.length] : '',
    memo: memos[i % memos.length],
    amount: Math.round((base + i * 137.31) * 100) / 100,
    currency: currencies[i % currencies.length],
  }));
}

export function createData({ journalCount = 42 } = {}) {
  const invoices = make('INV', 'invoice', 7, 12000, 18400.5, true);
  invoices[0].trandate = '2026-09-10'; // ISO date-only, to catch UTC parsing
  invoices[1].trandate = '23/09/2026'; // D/M/YYYY must not roll into another date
  return {
    Journal: make('JE', 'journalentry', journalCount, 9000, 1250, false),
    Invoice: invoices,
    'Expense Report': [],
    'Purchase Order': make('PO', 'purchaseorder', 3, 15000, 98000, true),
  };
}
export const failIds = new Set(['9003']);
export const PAGE_SIZE = 5000;
const fields = [
  'id',
  'tranid',
  'recordtype',
  'trandate',
  'entity',
  'memo',
  'amount',
  'currency',
];

/**
 * Mirrors SB1: a correlated subquery or BUILTIN.DF(t.createdby) in a queue-scale
 * row query stalls N/query until the RESTlet dies.
 */
export const stallsLikeNetSuite = query =>
  /\(\s*SELECT/i.test(query) || /createdby/i.test(query);

/** Answers the app's SuiteQL with the same headers/rows shape as getTableRowsFromSuiteql. */
export function answerSuiteql(data, query, approved) {
  if (/GROUP BY tl\.transaction/i.test(query)) {
    const ids = new Set(query.match(/IN \(([^)]*)\)/)[1].split(','));
    const journals = Object.values(data)
      .flat()
      .filter(row => ids.has(row.id));
    return {
      headers: [
        { id: 'id', label: 'id' },
        { id: 'amount', label: 'amount' },
      ],
      rows: journals.map(row => ({ id: row.id, amount: row.amount })),
    };
  }
  const type = Object.keys(data).find(t => query.includes(`'${t}'`));
  const pending = (data[type] || []).filter(row => !approved.has(row.id));
  if (/COUNT\(\*\)/i.test(query))
    return {
      headers: [{ id: 'cnt', label: 'cnt' }],
      rows: [{ cnt: pending.length }],
    };
  const after = Number(query.match(/t\.id > (\d+)/)?.[1] ?? -Infinity);
  return {
    headers: fields.map(id => ({ id, label: id })),
    // Journals have no header total in NetSuite; the app must sum their lines.
    rows: pending
      .filter(row => Number(row.id) > after)
      .slice(0, PAGE_SIZE)
      .map(row =>
        row.recordtype === 'journalentry' ? { ...row, amount: null } : row
      ),
  };
}
