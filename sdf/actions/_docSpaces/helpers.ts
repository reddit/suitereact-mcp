/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

import * as file from 'N/file';
import * as record from 'N/record';
import * as runtime from 'N/runtime';
import * as search from 'N/search';

import { getResultsFromSuiteQl } from '../../utils/nsQueryUtils';

export type SpaceType = 'adhoc' | 'team' | 'personal';
export type DocStatus = 'draft' | 'published';
export type PermissionLevel = 'view' | 'comment' | 'review' | 'edit' | 'admin';
export type PrincipalType = 'employee' | 'dyngroup' | 'everyone';
export type TargetType = 'space' | 'doc';

const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> = {
  view: 1,
  comment: 2,
  review: 3,
  edit: 4,
  admin: 5,
};

const ALLOWED_OPERATORS = new Set([
  'equals',
  'notEquals',
  'contains',
  'startsWith',
  'endsWith',
  'anyOf',
  'noneOf',
  'isEmpty',
  'isNotEmpty',
  'gt',
  'lt',
  'between',
  'before',
  'after',
  'is',
]);

const SAFE_FIELD_RE = /^[a-z][a-z0-9_]{0,63}$/i;

export const SR_SPACE = 'customrecord_sr_space' as record.Type;
export const SR_DOC = 'customrecord_sr_doc' as record.Type;
export const SR_PERMISSION = 'customrecord_sr_permission' as record.Type;
export const SR_DYNGROUP = 'customrecord_sr_dyngroup' as record.Type;
export const SR_USER_PREF = 'customrecord_sr_user_pref' as record.Type;

export const DEFAULT_FOLDER_NAME = 'doc-spaces';

/**
 * Returns the rank of a permission level (higher = stronger). Returns 0 for null.
 */
export const levelRank = (level: PermissionLevel | null): number =>
  level ? PERMISSION_LEVEL_RANK[level] : 0;

/**
 * Picks the strongest of two permission levels (null is weakest).
 */
export const maxLevel = (
  a: PermissionLevel | null,
  b: PermissionLevel | null
): PermissionLevel | null => {
  if (levelRank(a) >= levelRank(b)) return a;
  return b;
};

/**
 * Normalizes a slug to lowercase URL-safe ASCII.
 */
export const normalizeSlug = (raw: string): string =>
  String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * Returns the current employee internal ID, or null if unavailable.
 */
export const currentEmployeeId = (): string | null => {
  const u = runtime.getCurrentUser();
  if (u && Number(u.id) > 0) return String(u.id);
  return null;
};

export const assertDynGroupOwner = (ownerId: unknown): void => {
  const employeeId = currentEmployeeId();
  if (
    !employeeId ||
    (String(ownerId || '') !== employeeId &&
      String(runtime.getCurrentUser().role) !== '3')
  ) {
    throw new Error(
      'Forbidden: only the group owner or Administrator can change this group.'
    );
  }
};

/**
 * Escapes a value for safe inclusion in a SuiteQL string literal.
 * Always wraps in single quotes.
 */
export const sqlString = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return "'" + s.replace(/'/g, "''") + "'";
};

/**
 * Validates that a SuiteQL identifier (field/table name) is safe.
 * Throws if not.
 */
export const safeIdent = (name: string): string => {
  if (!SAFE_FIELD_RE.test(String(name || ''))) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return String(name).toLowerCase();
};

/**
 * Throws if an operator is not in the allow-list.
 */
export const safeOperator = (op: string): string => {
  if (!ALLOWED_OPERATORS.has(op)) {
    throw new Error(`Unsupported operator: ${op}`);
  }
  return op;
};

/**
 * Loads a space record by internal ID and returns a plain object.
 */
export const loadSpace = (spaceId: string): Record<string, unknown> | null => {
  try {
    const r = record.load({ type: SR_SPACE, id: spaceId, isDynamic: false });
    return {
      id: String(r.id),
      slug: String(r.getValue('custrecord_space_slug') || ''),
      name: String(r.getValue('name') || ''),
      type: String(r.getValue('custrecord_space_type') || ''),
      description: String(r.getValue('custrecord_space_description') || ''),
      ownerId: String(r.getValue('custrecord_space_owner') || ''),
      landingDocId: String(r.getValue('custrecord_space_landing_doc') || ''),
      fcFolderId: r.getValue('custrecord_space_fc_folder'),
      archived: r.getValue('custrecord_space_archived') === true,
    };
  } catch {
    return null;
  }
};

/**
 * Resolves a list-type select value to its display value (for type fields).
 * Returns the lowercase text or '' if not present.
 */
export const getListText = (rec: record.Record, fieldId: string): string => {
  try {
    return String(rec.getText({ fieldId }) || '').toLowerCase();
  } catch {
    return '';
  }
};

/**
 * Like getListText, but resolves the stored list id through SuiteQL when the
 * record refuses getText. Standard-mode records in user events throw on
 * getText for values written with setText or setValue.
 */
export const getListValueText = (
  rec: record.Record,
  fieldId: string,
  listId: string
): string => {
  const text = getListText(rec, fieldId);
  if (text) return text;
  const id = Number(rec.getValue({ fieldId }));
  if (!Number.isSafeInteger(id) || id <= 0) return '';
  const rows = getResultsFromSuiteQl(
    `SELECT name FROM ${listId} WHERE id = ${id}`
  );
  return String(rows[0]?.name ?? '').toLowerCase();
};

/**
 * Searches the customrecord_sr_space table by slug. Returns the record id or null.
 */
export const findSpaceIdBySlug = (slug: string): string | null => {
  const rows = getResultsFromSuiteQl(
    `SELECT id FROM customrecord_sr_space WHERE custrecord_space_slug = ${sqlString(
      slug
    )}`
  );
  if (rows.length === 0) return null;
  const id = (rows[0] as Record<string, unknown>).id;
  return id === null || id === undefined ? null : String(id);
};

/**
 * Searches a doc by slug within a space. Returns null if missing.
 */
export const findDocIdBySlug = (
  spaceId: string,
  slug: string
): string | null => {
  const rows = getResultsFromSuiteQl(
    `SELECT id FROM customrecord_sr_doc WHERE custrecord_doc_space = ${sqlString(
      spaceId
    )} AND custrecord_doc_slug = ${sqlString(slug)}`
  );
  if (rows.length === 0) return null;
  const id = (rows[0] as Record<string, unknown>).id;
  return id === null || id === undefined ? null : String(id);
};

/**
 * Ensures a File Cabinet folder exists for a space, creating it if needed.
 * Returns the folder internal ID.
 */
export const ensureSpaceFolder = (slug: string): number => {
  const root = ensureRootFolder();
  const existingId = findFolderId(root, slug);
  if (existingId) return existingId;
  const folder = record.create({
    type: record.Type.FOLDER,
    isDynamic: false,
  });
  folder.setValue({ fieldId: 'name', value: slug });
  folder.setValue({ fieldId: 'parent', value: root });
  return Number(folder.save({ ignoreMandatoryFields: true }));
};

const ensureRootFolder = (): number => {
  const existing = findFolderId(-15, DEFAULT_FOLDER_NAME);
  if (existing) return existing;
  const folder = record.create({
    type: record.Type.FOLDER,
    isDynamic: false,
  });
  folder.setValue({ fieldId: 'name', value: DEFAULT_FOLDER_NAME });
  return Number(folder.save({ ignoreMandatoryFields: true }));
};

const findFolderId = (parent: number, name: string): number | null => {
  const filters: search.Filter[] = [
    search.createFilter({
      name: 'name',
      operator: search.Operator.IS,
      values: name,
    }),
  ];
  if (parent && parent !== -15) {
    filters.push(
      search.createFilter({
        name: 'parent',
        operator: search.Operator.ANYOF,
        values: [String(parent)],
      })
    );
  } else {
    filters.push(
      search.createFilter({
        name: 'parent',
        operator: search.Operator.ANYOF,
        values: ['@NONE@'],
      })
    );
  }
  const r = search
    .create({ type: search.Type.FOLDER, filters, columns: ['internalid'] })
    .run()
    .getRange({ start: 0, end: 1 });
  if (r.length === 0) return null;
  return Number(r[0].id);
};

/**
 * Creates an HTML file in the File Cabinet under the given folder.
 * Returns the new file internal ID.
 */
export const writeHtmlFile = (params: {
  fileName: string;
  html: string;
  folderId: number;
  description?: string;
}): number => {
  const f = file.create({
    name: params.fileName.endsWith('.html')
      ? params.fileName
      : `${params.fileName}.html`,
    fileType: file.Type.HTMLDOC,
    contents: sanitizeHtml(params.html),
    folder: params.folderId,
    description: params.description,
  });
  return Number(f.save());
};

/**
 * Loads HTML contents from a File Cabinet file ID.
 */
export const readHtmlFile = (fileId: number): string => {
  const f = file.load({ id: fileId });
  return f.getContents();
};

/**
 * Stores document HTML verbatim, including <script>, event handlers, and
 * inline JS, so docs can be fully interactive.
 *
 * This function intentionally does NOT strip scripts. The security boundary is
 * the render-side iframe sandbox: doc-spaces renders every document in an
 * iframe with `allow-scripts` but WITHOUT `allow-same-origin` (an opaque
 * origin), so a document's scripts cannot reach the NetSuite session, cookies,
 * the action-handler RESTlet, or the host DOM. See
 * `apps/doc-spaces/src/domain/docSandbox.ts` for the rationale.
 *
 * INVARIANT: document HTML is untrusted and must ONLY ever be rendered inside
 * that opaque-origin sandbox (DocFrame / the DocEditor preview). Never render
 * stored doc HTML on the NetSuite origin (same-origin iframe, innerHTML, a
 * raw Suitelet write-out, etc.) — doing so re-opens stored XSS.
 */
export const sanitizeHtml = (html: string): string => String(html || '');

/**
 * Returns the strongest permission level for the current user against the
 * given target. Returns null when there is no grant.
 */
export const evaluateAccess = (params: {
  targetType: TargetType;
  targetId: string;
}): PermissionLevel | null => {
  const userId = currentEmployeeId();
  const grants = listGrants(params.targetType, params.targetId);
  let best: PermissionLevel | null = null;
  if (params.targetType === 'space' && userId) {
    const space = loadSpace(params.targetId);
    if (space && String(space.ownerId || '') === userId) {
      best = 'admin';
    }
  }
  for (const g of grants) {
    let principalApplies = false;
    if (g.principalType === 'everyone') {
      principalApplies = true;
    } else if (g.principalType === 'employee') {
      principalApplies = !!userId && g.principalId === userId;
    } else if (g.principalType === 'dyngroup') {
      principalApplies =
        !!userId && evaluateDynGroupContains(g.principalId, userId);
    }
    if (principalApplies) {
      best = maxLevel(best, g.level);
    }
  }
  if (params.targetType === 'doc' && !best) {
    const space = getSpaceForDoc(params.targetId);
    if (space) {
      return evaluateAccess({ targetType: 'space', targetId: space });
    }
  }
  return best;
};

interface GrantRow {
  principalType: PrincipalType;
  principalId: string;
  level: PermissionLevel;
}

const listGrants = (targetType: TargetType, targetId: string): GrantRow[] => {
  const rows = getResultsFromSuiteQl(
    `SELECT
       BUILTIN.DF(custrecord_perm_principal_type) AS principal_type,
       custrecord_perm_principal_id AS principal_id,
       BUILTIN.DF(custrecord_perm_level) AS level
     FROM customrecord_sr_permission
     WHERE BUILTIN.DF(custrecord_perm_target_type) = ${sqlString(targetType)}
       AND custrecord_perm_target_id = ${sqlString(targetId)}`
  );
  return rows.map(r => ({
    principalType: String(
      (r as Record<string, unknown>).principal_type || ''
    ).toLowerCase() as PrincipalType,
    principalId: String((r as Record<string, unknown>).principal_id || ''),
    level: String(
      (r as Record<string, unknown>).level || ''
    ).toLowerCase() as PermissionLevel,
  }));
};

const getSpaceForDoc = (docId: string): string | null => {
  try {
    const lookup = search.lookupFields({
      type: SR_DOC,
      id: docId,
      columns: ['custrecord_doc_space'],
    });
    const v = lookup.custrecord_doc_space as Array<{ value: string }> | string;
    if (Array.isArray(v) && v.length > 0) return String(v[0].value);
    if (typeof v === 'string') return v;
    return null;
  } catch {
    return null;
  }
};

/**
 * Evaluates whether an employee matches the saved criteria of a dyngroup.
 */
export const evaluateDynGroupContains = (
  groupId: string,
  employeeId: string
): boolean => {
  if (!groupId || !employeeId) return false;
  let criteriaJson: string;
  try {
    const lk = search.lookupFields({
      type: SR_DYNGROUP,
      id: groupId,
      columns: ['custrecord_dyngroup_criteria'],
    });
    criteriaJson = String(lk.custrecord_dyngroup_criteria || '');
  } catch {
    return false;
  }
  if (!criteriaJson) return false;
  let criteria: { logic: 'and' | 'or'; rules: unknown[] };
  try {
    criteria = JSON.parse(criteriaJson);
  } catch {
    return false;
  }
  const sql = buildEmployeeSuiteQL(criteria, {
    where: `id = ${sqlString(employeeId)}`,
  });
  if (!sql) return false;
  try {
    const rows = getResultsFromSuiteQl(sql);
    return rows.length > 0;
  } catch {
    return false;
  }
};

interface DynRule {
  field: string;
  op: string;
  value?: unknown;
  value2?: unknown;
}

interface DynCriteria {
  logic: 'and' | 'or';
  rules: DynRule[] | unknown[];
}

/**
 * Translates a saved-search-style criteria JSON object into a SuiteQL query
 * over the employee table. Returns null for empty or invalid rules. The optional
 * `where` parameter merges an additional sql fragment with AND.
 */
export const buildEmployeeSuiteQL = (
  criteria: DynCriteria,
  opts?: { select?: string; where?: string; limit?: number }
): string | null => {
  const select =
    opts?.select ||
    'id, entityid, firstname, lastname, email, title, department, subsidiary';
  const logic = criteria && criteria.logic === 'or' ? 'OR' : 'AND';
  const rules: DynRule[] = Array.isArray(criteria?.rules)
    ? (criteria.rules as DynRule[])
    : [];
  const conditions: string[] = [];
  for (const rule of rules) {
    const c = ruleToSuiteQL(rule);
    if (!c) return null;
    conditions.push(`(${c})`);
  }
  if (conditions.length === 0) return null;
  const whereParts = [`(${conditions.join(` ${logic} `)})`];
  if (opts?.where) whereParts.push(opts.where);
  let sql = `SELECT ${select} FROM employee WHERE ${whereParts.join(' AND ')}`;
  if (opts?.limit && opts.limit > 0) {
    sql += ` AND ROWNUM <= ${Math.floor(opts.limit)}`;
  }
  return sql;
};

const ruleToSuiteQL = (rule: DynRule): string | null => {
  if (!rule || !rule.field) return null;
  let field: string;
  let op: string;
  try {
    field = safeIdent(rule.field);
    op = safeOperator(rule.op);
  } catch {
    return null;
  }
  switch (op) {
    case 'equals':
      return `${field} = ${sqlString(rule.value)}`;
    case 'notEquals':
      return `${field} != ${sqlString(rule.value)}`;
    case 'contains':
      return `LOWER(${field}) LIKE ${sqlString(`%${String(rule.value || '').toLowerCase()}%`)}`;
    case 'startsWith':
      return `LOWER(${field}) LIKE ${sqlString(`${String(rule.value || '').toLowerCase()}%`)}`;
    case 'endsWith':
      return `LOWER(${field}) LIKE ${sqlString(`%${String(rule.value || '').toLowerCase()}`)}`;
    case 'isEmpty':
      return `${field} IS NULL`;
    case 'isNotEmpty':
      return `${field} IS NOT NULL`;
    case 'gt':
      return `${field} > ${Number(rule.value)}`;
    case 'lt':
      return `${field} < ${Number(rule.value)}`;
    case 'between':
      return `${field} BETWEEN ${Number(rule.value)} AND ${Number(rule.value2)}`;
    case 'before':
      return `${field} < TO_DATE(${sqlString(String(rule.value || ''))}, 'YYYY-MM-DD')`;
    case 'after':
      return `${field} > TO_DATE(${sqlString(String(rule.value || ''))}, 'YYYY-MM-DD')`;
    case 'is':
      return `${field} = ${rule.value === true ? "'T'" : "'F'"}`;
    case 'anyOf': {
      const list = Array.isArray(rule.value) ? rule.value : [rule.value];
      const parts = list
        .filter(v => v !== undefined && v !== null && v !== '')
        .map(v => sqlString(v));
      if (parts.length === 0) return null;
      return `${field} IN (${parts.join(', ')})`;
    }
    case 'noneOf': {
      const list = Array.isArray(rule.value) ? rule.value : [rule.value];
      const parts = list
        .filter(v => v !== undefined && v !== null && v !== '')
        .map(v => sqlString(v));
      if (parts.length === 0) return null;
      return `${field} NOT IN (${parts.join(', ')})`;
    }
    default:
      return null;
  }
};

/**
 * Returns the list of permissions on a target as plain JSON.
 */
export const listPermissionsRows = (params: {
  targetType: TargetType;
  targetId: string;
}): Array<{
  id: string;
  targetType: TargetType;
  targetId: string;
  principalType: PrincipalType;
  principalId: string;
  principalLabel: string;
  level: PermissionLevel;
  grantedBy: string;
}> => {
  const rows = getResultsFromSuiteQl(
    `SELECT
       p.id AS id,
       BUILTIN.DF(p.custrecord_perm_principal_type) AS principal_type,
       p.custrecord_perm_principal_id AS principal_id,
       BUILTIN.DF(p.custrecord_perm_level) AS level,
       p.custrecord_perm_granted_by AS granted_by
     FROM customrecord_sr_permission p
     WHERE BUILTIN.DF(p.custrecord_perm_target_type) = ${sqlString(params.targetType)}
       AND p.custrecord_perm_target_id = ${sqlString(params.targetId)}
     ORDER BY p.id DESC`
  );
  return rows.map(r => {
    const row = r as Record<string, unknown>;
    const ptype = String(
      row.principal_type || ''
    ).toLowerCase() as PrincipalType;
    const pid = String(row.principal_id || '');
    return {
      id: String(row.id),
      targetType: params.targetType,
      targetId: params.targetId,
      principalType: ptype,
      principalId: pid,
      principalLabel: lookupPrincipalLabel(ptype, pid),
      level: String(row.level || '').toLowerCase() as PermissionLevel,
      grantedBy: String(row.granted_by || ''),
    };
  });
};

const lookupPrincipalLabel = (type: PrincipalType, id: string): string => {
  if (type === 'everyone') return 'everyone';
  if (!id) return '';
  try {
    if (type === 'employee') {
      const r = getResultsFromSuiteQl(
        `SELECT entityid, firstname, lastname FROM employee WHERE id = ${sqlString(id)}`
      );
      if (r.length > 0) {
        const row = r[0] as Record<string, unknown>;
        const fn = String(row.firstname || '');
        const ln = String(row.lastname || '');
        const e = `${fn} ${ln}`.trim();
        return e || String(row.entityid || id);
      }
    } else if (type === 'dyngroup') {
      const r = getResultsFromSuiteQl(
        `SELECT name FROM customrecord_sr_dyngroup WHERE id = ${sqlString(id)}`
      );
      if (r.length > 0) {
        return String((r[0] as Record<string, unknown>).name || id);
      }
    }
  } catch {
    // fall through to id
  }
  return id;
};
