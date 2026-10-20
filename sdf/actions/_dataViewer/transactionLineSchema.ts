import * as query from 'N/query';

export interface TransactionLineField {
  field: string;
  label: string;
  type: string;
  required: boolean;
  custom: boolean;
}

const STANDARD_FIELDS: Array<[string, string, string]> = [
  ['id', 'Line ID', 'number'],
  ['uniquekey', 'Unique Key', 'number'],
  ['mainline', 'Main Line', 'boolean'],
  ['taxline', 'Tax Line', 'boolean'],
  ['item', 'Item', 'enum'],
  ['quantity', 'Quantity', 'number'],
  ['rate', 'Rate', 'number'],
  ['netamount', 'Net Amount', 'number'],
  ['foreignamount', 'Foreign Amount', 'number'],
  ['memo', 'Memo', 'string'],
  ['subsidiary', 'Subsidiary', 'enum'],
  ['department', 'Department', 'enum'],
  ['class', 'Class', 'enum'],
  ['location', 'Location', 'enum'],
];

const CUSTOM_TYPES: Record<string, string> = {
  checkbox: 'boolean',
  currency: 'number',
  'decimal number': 'number',
  'integer number': 'number',
  percent: 'number',
  date: 'date',
  'date/time': 'date',
  'list/record': 'enum',
};

function lineField(
  field: string,
  label: string,
  type: string,
  custom: boolean
): TransactionLineField {
  return {
    field: `transactionline.${field}`,
    label: `Line: ${label}`,
    type,
    custom,
    required: false,
  };
}

export function getTransactionLineFields(): {
  fields: TransactionLineField[];
  warnings: string[];
} {
  // N/record sublist IDs (for example, amount) are not SuiteQL column IDs.
  const fields = STANDARD_FIELDS.map(([id, label, type]) =>
    lineField(id, label, type, false)
  );
  const warnings: string[] = [];
  try {
    const customFields = query
      .runSuiteQL({
        query:
          "SELECT scriptid, name, fieldvaluetype FROM CustomField WHERE fieldtype = 'COLUMN' ORDER BY scriptid",
      })
      .asMappedResults();
    for (const custom of customFields) {
      const id = String(custom.scriptid).toLowerCase();
      if (!/^custcol[a-z0-9_]+$/.test(id)) continue;
      fields.push(
        lineField(
          id,
          String(custom.name || id),
          CUSTOM_TYPES[String(custom.fieldvaluetype).toLowerCase()] || 'string',
          true
        )
      );
    }
  } catch {
    warnings.push(
      'Custom transaction line fields could not be loaded. Standard line fields are available. Retry or ask your administrator to check field metadata permissions.'
    );
  }
  return { fields, warnings };
}
