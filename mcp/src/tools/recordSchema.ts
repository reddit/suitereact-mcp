import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import {
  RecordCatalogClient,
  RecordSchemaTimeoutError,
} from './recordCatalog.js';

const catalog = new RecordCatalogClient();

interface CatalogItem {
  name: string;
  links?: { rel: string; href: string }[];
}

interface CatalogListResponse {
  items?: CatalogItem[];
  count?: number;
  hasMore?: boolean;
}

interface FieldSchema {
  title?: string;
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  nullable?: boolean;
  readOnly?: boolean;
  'x-ns-custom-field'?: boolean;
  'x-ns-filterable'?: boolean;
  'x-ns-sortable'?: boolean;
  properties?: Record<string, FieldSchema>;
  items?: FieldSchema;
  $ref?: string;
  [key: string]: unknown;
}

interface RecordSchemaResponse {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, FieldSchema>;
  [key: string]: unknown;
}

interface FieldSummary {
  field: string;
  label: string;
  type: string;
  required: boolean;
  readOnly: boolean;
  custom: boolean;
  filterable: boolean;
  sortable: boolean;
  enumValues?: string[];
  description?: string;
}

function resolveFieldType(schema: FieldSchema): string {
  if (schema.enum) return 'enum';
  if (schema.$ref) {
    const refParts = schema.$ref.split('/');
    return `ref:${refParts[refParts.length - 1]}`;
  }
  if (Array.isArray(schema.type)) {
    return schema.type.filter(t => t !== 'null').join(' | ');
  }
  if (schema.type === 'array' && schema.items) {
    const inner = resolveFieldType(schema.items);
    return `array<${inner}>`;
  }
  if (schema.type === 'object' && schema.properties) {
    return 'object';
  }
  return schema.type ?? 'unknown';
}

function summarizeField(
  fieldId: string,
  schema: FieldSchema,
  requiredSet: Set<string>
): FieldSummary {
  const summary: FieldSummary = {
    field: fieldId,
    label: schema.title ?? fieldId,
    type: resolveFieldType(schema),
    required: requiredSet.has(fieldId),
    readOnly: schema.readOnly === true,
    custom: schema['x-ns-custom-field'] === true,
    filterable: schema['x-ns-filterable'] !== false,
    sortable: schema['x-ns-sortable'] !== false,
  };
  if (schema.enum && schema.enum.length <= 30) {
    summary.enumValues = schema.enum.map(String);
  }
  if (schema.description) {
    summary.description = schema.description;
  }
  return summary;
}

function matchesFilter(field: FieldSummary, filter: string): boolean {
  const lower = filter.toLowerCase();
  return (
    field.field.toLowerCase().includes(lower) ||
    field.label.toLowerCase().includes(lower) ||
    (field.description?.toLowerCase().includes(lower) ?? false)
  );
}

export async function handleRecordSchemaTool(
  args: Record<string, unknown>,
  client: Pick<RecordCatalogClient, 'get'> = catalog
): Promise<TextContent[]> {
  try {
    const rawAccountId = process.env.NETSUITE_ACCOUNT_ID;
    const accountId = rawAccountId?.replace(/_/g, '-');
    if (!accountId) {
      throw new Error('NETSUITE_ACCOUNT_ID environment variable is not set');
    }

    const recordType = args.recordType as string | undefined;
    const fieldFilter = args.fieldFilter as string | undefined;
    const customFieldsOnly = args.customFieldsOnly === true;
    const refreshCache = args.refreshCache === true;

    // ── List mode ──
    if (!recordType) {
      const data = (await client.get(
        accountId,
        '',
        refreshCache
      )) as CatalogListResponse;

      const names = (data.items ?? []).map(i => i.name).sort();
      const output = {
        mode: 'list',
        totalRecordTypes: names.length,
        recordTypes: names,
        hint: 'Pass a recordType (e.g. "customer", "salesOrder") to get its field schema.',
      };

      return [{ type: 'text', text: JSON.stringify(output, null, 2) }];
    }

    // ── Detail mode ──
    const schema = (await client.get(
      accountId,
      recordType,
      refreshCache
    )) as RecordSchemaResponse;

    const requiredSet = new Set<string>(
      Array.isArray((schema as any).required) ? (schema as any).required : []
    );

    const properties = schema.properties ?? {};
    let fields = Object.entries(properties).map(([id, def]) =>
      summarizeField(id, def, requiredSet)
    );

    if (customFieldsOnly) {
      fields = fields.filter(f => f.custom);
    }
    if (fieldFilter) {
      fields = fields.filter(f => matchesFilter(f, fieldFilter));
    }

    fields.sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? 1 : -1;
      return a.field.localeCompare(b.field);
    });

    const output = {
      mode: 'detail',
      recordType,
      recordTitle: schema.title ?? recordType,
      description: schema.description,
      fieldCount: fields.length,
      ...(customFieldsOnly && { filter: 'customFieldsOnly' }),
      ...(fieldFilter && { fieldFilter }),
      fields,
    };

    return [{ type: 'text', text: JSON.stringify(output, null, 2) }];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in record schema tool:', error);
    return [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: 'Record schema lookup failed',
            details: message,
            ...(error instanceof RecordSchemaTimeoutError && {
              code: error.code,
              recordType: error.recordType,
              timeoutMs: error.timeoutMs,
              retryable: true,
            }),
          },
          null,
          2
        ),
      },
    ];
  }
}
