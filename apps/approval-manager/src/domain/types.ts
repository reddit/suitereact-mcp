/** Max rows returned per SuiteQL call (N/query.asMappedResults limit). */
export const PAGE_SIZE = 5000;

export interface TransactionTypeOption {
  id: string;
  label: string;
  singular: string;
  /** SuiteQL type value used in BUILTIN.DF(t.type) comparison */
  suiteqlType: string;
  /** Whether the queue has a meaningful entity (journals do not). */
  hasEntity: boolean;
}

export const TRANSACTION_TYPES: TransactionTypeOption[] = [
  {
    id: 'journal',
    label: 'Journal Entries',
    singular: 'journal entry',
    suiteqlType: 'Journal',
    hasEntity: false,
  },
  {
    id: 'invoice',
    label: 'Invoices',
    singular: 'invoice',
    suiteqlType: 'Invoice',
    hasEntity: true,
  },
  {
    id: 'expensereport',
    label: 'Expense Reports',
    singular: 'expense report',
    suiteqlType: 'Expense Report',
    hasEntity: true,
  },
  {
    id: 'purchaseorder',
    label: 'Purchase Orders',
    singular: 'purchase order',
    suiteqlType: 'Purchase Order',
    hasEntity: true,
  },
];

export interface PendingTransaction {
  id: string;
  tranid: string;
  recordtype: string;
  trandate: string;
  entity: string;
  memo: string;
  /** foreigntotal, or the sum of line debits for journals (whose foreigntotal is empty). */
  amount: number | null;
  /** Set while a missing header amount is being summed from lines, or when that failed. */
  amountStatus?: 'loading' | 'unavailable';
  /** ISO currency code from currency.symbol. */
  currency: string;
}

export interface ApprovedEntry {
  id: string;
  tranid: string;
  type: string;
  recordtype: string;
  entity: string;
  amount: number | null;
  currency: string;
  approvedAt: number;
}

export interface ApprovalOutcome {
  approved: PendingTransaction[];
  failed: { row: PendingTransaction; message: string }[];
}
