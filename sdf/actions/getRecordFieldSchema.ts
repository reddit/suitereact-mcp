import * as log from 'N/log';
import * as record from 'N/record';

import { getTransactionLineFields } from './_dataViewer/transactionLineSchema';

/**
 * Maps the data-viewer's generic record names to SuiteScript record.Type
 * values that can be used with `record.create()`.
 */
const NS_TYPE_MAP: Record<string, string> = {
  customer: 'customer',
  employee: 'employee',
  vendor: 'vendor',
  partner: 'partner',
  contact: 'contact',
  // Generic 'transaction' uses salesorder as a representative since
  // record.create() requires a specific transaction subtype.
  transaction: 'salesorder',
  salesorder: 'salesorder',
  invoice: 'invoice',
  purchaseorder: 'purchaseorder',
  vendorbill: 'vendorbill',
  journalentry: 'journalentry',
  creditmemo: 'creditmemo',
  estimate: 'estimate',
  opportunity: 'opportunity',
  expensereport: 'expensereport',
  item: 'inventoryitem',
  inventoryitem: 'inventoryitem',
  noninventoryitem: 'noninventoryresaleitem',
  serviceitem: 'serviceresaleitem',
};

/**
 * Maps SuiteScript FieldType values to the simplified type strings
 * expected by the client-side filter builder.
 */
const FIELD_TYPE_MAP: Record<string, string> = {
  checkbox: 'boolean',
  currency: 'number',
  currency2: 'number',
  date: 'date',
  datetime: 'date',
  datetimetz: 'date',
  float: 'number',
  integer: 'number',
  percent: 'number',
  decimalnumber: 'number',
  rate: 'number',
  ratehighprecision: 'number',
  select: 'enum',
  multiselect: 'enum',
};

const CUSTOM_PREFIX_RE =
  /^(cust|custentity|custbody|custrecord|custevent|custitem|custcol)/;
const MAX_ENUM_OPTIONS = 50;

interface SchemaFieldResult {
  field: string;
  label: string;
  type: string;
  required: boolean;
  custom: boolean;
  enumValues?: string[];
}

export const getRecordFieldSchema = ({
  recordType,
  includeTransactionLineFields = false,
}: {
  recordType: string;
  includeTransactionLineFields?: boolean;
}): {
  recordType: string;
  recordTitle: string;
  fieldCount: number;
  fields: SchemaFieldResult[];
  transactionLineFieldsIncluded?: boolean;
  warnings?: string[];
} => {
  log.debug('getRecordFieldSchema', recordType);

  const nsType = NS_TYPE_MAP[recordType.toLowerCase()] || recordType;

  const tempRec = record.create({
    type: nsType as record.Type,
    isDynamic: true,
  });

  const fieldIds: string[] = tempRec.getFields();
  log.debug('getRecordFieldSchema fieldIds', `${fieldIds.length} fields found`);

  const fields: SchemaFieldResult[] = [];

  for (const fieldId of fieldIds) {
    try {
      const field = tempRec.getField({ fieldId });
      if (!field) {
        fields.push({
          field: fieldId,
          label: fieldId,
          type: 'string',
          required: false,
          custom: CUSTOM_PREFIX_RE.test(fieldId),
        });
        continue;
      }

      const rawType = String(field.type || 'text').toLowerCase();
      const mappedType = FIELD_TYPE_MAP[rawType] || 'string';
      const isCustom = CUSTOM_PREFIX_RE.test(fieldId);

      const entry: SchemaFieldResult = {
        field: fieldId,
        label: field.label || fieldId,
        type: mappedType,
        required: !!field.isMandatory,
        custom: isCustom,
      };

      if (mappedType === 'enum') {
        try {
          const opts = field.getSelectOptions({
            filter: '',
            operator: 'contains',
          });
          if (opts && opts.length > 0 && opts.length <= MAX_ENUM_OPTIONS) {
            entry.enumValues = opts.map(
              (o: { value: string; text: string }) => o.text || String(o.value)
            );
          }
        } catch {
          // Some select fields don't support getSelectOptions
        }
      }

      fields.push(entry);
    } catch {
      fields.push({
        field: fieldId,
        label: fieldId,
        type: 'string',
        required: false,
        custom: CUSTOM_PREFIX_RE.test(fieldId),
      });
    }
  }

  const includeLines =
    recordType.toLowerCase() === 'transaction' && includeTransactionLineFields;
  const lineSchema = includeLines ? getTransactionLineFields() : null;
  if (lineSchema) fields.push(...lineSchema.fields);
  fields.sort((a, b) => a.label.localeCompare(b.label));

  return {
    recordType,
    recordTitle: nsType.charAt(0).toUpperCase() + nsType.slice(1),
    fieldCount: fields.length,
    fields,
    ...(lineSchema
      ? { transactionLineFieldsIncluded: true, warnings: lineSchema.warnings }
      : {}),
  };
};
