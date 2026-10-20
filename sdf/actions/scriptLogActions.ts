import * as query from 'N/query';
import * as runtime from 'N/runtime';
import * as search from 'N/search';

import {
  LogPage,
  LogRequest,
  LogRow,
  LogTablePage,
  LogTableRequest,
  LogTableRow,
  ScriptLogScriptPage,
} from '../domain/scriptLogs';

const DATE_FORMAT = 'YYYY-MM-DD HH24:MI:SS';
const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** Calendar-valid account-time literal; only these strings may enter TO_DATE formulas. */
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const [y, mo, d, h, mi, se] = value.split(/[- :]/).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === se
  );
}
const referencePattern = /^[\w-]{0,100}$/;

function authorized(): boolean {
  try {
    return (
      runtime.getCurrentUser().getPermission({ name: 'ADMI_CUSTOMSCRIPT' }) >=
      runtime.Permission.VIEW
    );
  } catch {
    return false;
  }
}

function logError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function read<T>(operation: () => T): T {
  if (!authorized()) throw logError('SCRIPT_LOG_PERMISSION_DENIED');
  try {
    return operation();
  } catch (error) {
    const code = String((error as { name?: string }).name || '');
    if (/PERMISSION|AUTHORIZATION|ACCESS_DENIED/.test(code)) {
      throw logError('SCRIPT_LOG_PERMISSION_DENIED');
    }
    // Only stable codes escape this action; never include SQL or private details.
    throw logError('SCRIPT_LOG_QUERY_ERROR');
  }
}

function run(sql: string, params: (string | number)[]) {
  // Default SUITE_QL metadata handling fails on missing permissions; do not use STATIC.
  return query.runSuiteQL({ query: sql, params }).asMappedResults();
}

export function searchScriptLogScripts(request: {
  search: string;
}): ScriptLogScriptPage {
  return read(() => {
    if (
      typeof request?.search !== 'string' ||
      request.search.length > 100 ||
      request.search.trim().length < 2
    ) {
      throw new Error('Invalid script lookup');
    }
    const term = request.search.trim().toLowerCase();
    const rows = run(
      `SELECT * FROM (
        SELECT s.id, s.name, s.scriptid FROM Script s
        WHERE INSTR(LOWER(s.name), ?) > 0 OR INSTR(LOWER(s.scriptid), ?) > 0 OR TO_CHAR(s.id) = ?
        ORDER BY s.name, s.id
      ) WHERE ROWNUM <= 21`,
      [term, term, term]
    );
    return {
      options: rows.slice(0, 20).map(row => ({
        value: String(row.id),
        label: String(row.name || row.scriptid || `Script ${row.id}`),
        scriptId: String(row.scriptid || ''),
      })),
      hasMore: rows.length > 20,
    };
  });
}

export function searchScriptLogDeployments(request: {
  search: string;
  script?: string;
}): ScriptLogScriptPage {
  return read(() => {
    if (
      typeof request?.search !== 'string' ||
      request.search.length > 100 ||
      request.search.trim().length < 2 ||
      (request.script !== undefined &&
        (typeof request.script !== 'string' ||
          !/^\d{0,20}$/.test(request.script)))
    )
      throw new Error('Invalid deployment lookup');
    const term = request.search.trim().toLowerCase();
    const params = [term, term, term];
    if (request.script) params.push(request.script);
    const rows = run(
      `SELECT * FROM (
      SELECT d.primarykey AS id, d.title, d.scriptid, d.script, s.name AS scriptname, s.scriptid AS parentscriptid
      FROM ScriptDeployment d JOIN Script s ON s.id = d.script
      WHERE (INSTR(LOWER(d.title), ?) > 0 OR INSTR(LOWER(d.scriptid), ?) > 0 OR TO_CHAR(d.primarykey) = ?)
      ${request.script ? 'AND TO_CHAR(d.script) = ?' : ''}
      ORDER BY d.title, d.primarykey
    ) WHERE ROWNUM <= 21`,
      params
    );
    return {
      options: rows.slice(0, 20).map(row => ({
        value: String(row.id),
        label: String(row.title || row.scriptid),
        scriptId: String(row.scriptid || ''),
        script: String(row.script),
        scriptLabel: String(row.scriptname || row.script),
        parentScriptId: String(row.parentscriptid || ''),
      })),
      hasMore: rows.length > 20,
    };
  });
}

function attributeDeployments(rows: LogRow[]): void {
  if (!rows.length) return;
  const logId = search.createColumn({
    name: 'internalid',
    join: 'executionlog',
  });
  const matches = search
    .create({
      type: search.Type.SCRIPT_DEPLOYMENT,
      filters: [['executionlog.internalid', 'anyof', rows.map(row => row.id)]],
      columns: ['internalid', 'scriptid', logId],
    })
    .run()
    .getRange({ start: 0, end: 100 });
  for (const row of rows) {
    const found = matches.filter(
      match => String(match.getValue(logId)) === row.id
    );
    // Never turn an ambiguous association into an asserted originating deployment.
    if (found.length === 1) {
      row.deployment = String(found[0].getValue({ name: 'internalid' }));
      row.deploymentLabel = String(found[0].getValue({ name: 'scriptid' }));
    }
  }
}

function listDeploymentLogs(request: LogRequest): LogPage {
  const cursor = request.cursor;
  // Only validated dates, numeric IDs and enum hours enter the formula. Search text stays in native filters.
  const anchor = cursor
    ? `TO_DATE('${cursor.anchor}', '${DATE_FORMAT}')`
    : 'SYSDATE';
  let condition = `{executionlog.date} >= ${anchor} - ${request.hours}/24 AND {executionlog.date} <= ${anchor} AND {executionlog.date} >= SYSDATE - 30 AND {executionlog.date} <= SYSDATE`;
  if (cursor)
    condition += ` AND ({executionlog.date} < TO_DATE('${cursor.date}', '${DATE_FORMAT}') OR ({executionlog.date} = TO_DATE('${cursor.date}', '${DATE_FORMAT}') AND {executionlog.internalid} < ${cursor.id}))`;
  const filters: search.Filter[] = [
    search.createFilter({
      name: 'internalid',
      operator: search.Operator.ANYOF,
      values: request.deployment,
    }),
    search.createFilter({
      name: 'formulanumeric',
      formula: `CASE WHEN ${condition} THEN 1 ELSE 0 END`,
      operator: search.Operator.EQUALTO,
      values: 1,
    }),
  ];
  if (request.script)
    filters.push(
      search.createFilter({
        name: 'script',
        operator: search.Operator.ANYOF,
        values: request.script,
      })
    );
  if (request.severity)
    filters.push(
      search.createFilter({
        name: 'formulatext',
        formula: 'UPPER({executionlog.type})',
        operator: search.Operator.IS,
        values: request.severity,
      })
    );
  const date = search.createColumn({
    name: 'date',
    join: 'executionlog',
    sort: search.Sort.DESC,
  });
  const id = search.createColumn({
    name: 'internalid',
    join: 'executionlog',
    sort: search.Sort.DESC,
  });
  const timestamp = search.createColumn({
    name: 'formulatext',
    formula: `TO_CHAR({executionlog.date}, '${DATE_FORMAT}')`,
  });
  const upper = search.createColumn({
    name: 'formulatext',
    formula: `TO_CHAR(SYSDATE, '${DATE_FORMAT}')`,
  });
  const title = search.createColumn({ name: 'title', join: 'executionlog' });
  const severity = search.createColumn({ name: 'type', join: 'executionlog' });
  const operation = search.create({
    type: search.Type.SCRIPT_DEPLOYMENT,
    filters,
    columns: [
      'internalid',
      'scriptid',
      'script',
      date,
      id,
      timestamp,
      upper,
      title,
      severity,
    ],
  });
  if (request.search.trim())
    operation.filterExpression = [
      operation.filterExpression,
      'AND',
      [
        ['executionlog.title', 'contains', request.search.trim()],
        'OR',
        ['executionlog.detail', 'contains', request.search.trim()],
      ],
    ];
  const found = operation
    .run()
    .getRange({ start: 0, end: request.pageSize + 1 });
  const rows: LogRow[] = found.slice(0, request.pageSize).map(row => ({
    id: String(row.getValue(id)),
    date: String(row.getValue(timestamp)),
    severity: String(row.getValue(severity) || '').toUpperCase(),
    title: String(row.getValue(title) || '(untitled)').slice(0, 200),
    script: String(row.getValue({ name: 'script' })),
    deployment: String(row.getValue({ name: 'internalid' })),
    deploymentLabel: String(row.getValue({ name: 'scriptid' })),
  }));
  const last = rows[rows.length - 1];
  return {
    rows,
    next:
      found.length > request.pageSize && last
        ? {
            id: last.id,
            date: last.date,
            anchor: cursor?.anchor || String(found[0].getValue(upper)),
          }
        : null,
  };
}

export function listScriptLogs(request: LogRequest): LogPage {
  return read(() => {
    if (
      !request ||
      ![1, 24, 168, 720].includes(request.hours) ||
      typeof request.search !== 'string' ||
      request.search.length > 200 ||
      typeof request.script !== 'string' ||
      !referencePattern.test(request.script) ||
      typeof request.deployment !== 'string' ||
      !/^\d{0,20}$/.test(request.deployment) ||
      !['', 'DEBUG', 'AUDIT', 'ERROR', 'EMERGENCY'].includes(
        request.severity
      ) ||
      !Number.isInteger(request.pageSize) ||
      request.pageSize < 1 ||
      request.pageSize > 50
    ) {
      throw new Error('Invalid log request');
    }
    const params: (string | number)[] = [];
    const cursor = request.cursor;
    if (
      cursor &&
      (!datePattern.test(cursor.date) ||
        !datePattern.test(cursor.anchor) ||
        !/^\d{1,20}$/.test(cursor.id))
    ) {
      throw new Error('Invalid cursor');
    }
    if (request.deployment) return listDeploymentLogs(request);
    const anchor = cursor ? `TO_DATE(?, '${DATE_FORMAT}')` : 'SYSDATE';
    const where: string[] = ['n.date >= SYSDATE - 30', 'n.date <= SYSDATE'];
    where.push(`n.date >= ${anchor} - ? / 24`);
    if (cursor) params.push(cursor.anchor);
    params.push(request.hours);
    where.push(`n.date <= ${anchor}`);
    if (cursor) params.push(cursor.anchor);
    if (request.search.trim()) {
      where.push(
        '(INSTR(LOWER(n.title), ?) > 0 OR INSTR(LOWER(n.detail), ?) > 0)'
      );
      params.push(
        request.search.trim().toLowerCase(),
        request.search.trim().toLowerCase()
      );
    }
    if (request.script) {
      where.push('TO_CHAR(n.scripttype) = ?');
      params.push(request.script);
    }
    if (request.severity) {
      where.push('UPPER(n.type) = ?');
      params.push(request.severity);
    }
    if (cursor) {
      where.push(
        `(n.date < TO_DATE(?, '${DATE_FORMAT}') OR (n.date = TO_DATE(?, '${DATE_FORMAT}') AND n.internalid < ?))`
      );
      params.push(cursor.date, cursor.date, cursor.id);
    }
    params.push(request.pageSize + 1);
    const rows = run(
      `SELECT * FROM (
      SELECT n.internalid AS id, TO_CHAR(n.date, '${DATE_FORMAT}') AS loggedat,
        TO_CHAR(SYSDATE, '${DATE_FORMAT}') AS anchor, n.type AS severity,
        SUBSTR(n.title, 1, 200) AS title, n.scripttype AS script
      FROM ScriptNote n WHERE ${where.join(' AND ')}
      ORDER BY n.date DESC, n.internalid DESC
    ) WHERE ROWNUM <= ?`,
      params
    );
    const visible = rows.slice(0, request.pageSize);
    const mapped: LogRow[] = visible.map(row => ({
      id: String(row.id),
      date: String(row.loggedat),
      severity: String(row.severity || '').toUpperCase(),
      title: String(row.title || '(untitled)'),
      script: String(row.script ?? ''),
      deployment: '',
    }));
    attributeDeployments(mapped);
    const last = mapped[mapped.length - 1];
    return {
      rows: mapped,
      next:
        rows.length > request.pageSize && last
          ? {
              id: last.id,
              date: last.date,
              anchor: cursor?.anchor || String(visible[0].anchor),
            }
          : null,
    };
  });
}

export function getScriptLogDetail(request: {
  id: string;
}): { raw: string } | null {
  return read(() => {
    if (
      !request ||
      typeof request.id !== 'string' ||
      !/^\d{1,20}$/.test(request.id)
    )
      throw new Error('Invalid log ID');
    const row = run(
      'SELECT n.detail FROM ScriptNote n WHERE n.internalid = ? AND ROWNUM <= 1',
      [request.id]
    )[0];
    return row ? { raw: String(row.detail ?? '') } : null;
  });
}

export function listScriptLogTable(request: LogTableRequest): LogTablePage {
  return read(() => {
    const specs: Record<
      LogTableRequest['sort']['field'],
      Parameters<typeof search.createColumn>[0]
    > = {
      date: { name: 'date', join: 'executionlog' },
      severity: { name: 'type', join: 'executionlog' },
      scriptName: { name: 'name', join: 'script' },
      deploymentName: { name: 'title' },
      userName: { name: 'user', join: 'executionlog' },
      title: { name: 'title', join: 'executionlog' },
      preview: {
        name: 'formulatext',
        formula: 'SUBSTR({executionlog.detail}, 1, 500)',
      },
    };
    const custom = request?.hours === 0;
    if (
      !request ||
      ![0, 1, 24, 168, 720].includes(request.hours) ||
      (custom
        ? !validDate(request.from) ||
          !validDate(request.to) ||
          request.from >= request.to
        : request.from !== undefined || request.to !== undefined) ||
      typeof request.search !== 'string' ||
      request.search.length > 200 ||
      typeof request.script !== 'string' ||
      !/^\d{0,20}$/.test(request.script) ||
      typeof request.deployment !== 'string' ||
      !/^\d{0,20}$/.test(request.deployment) ||
      !['', 'DEBUG', 'AUDIT', 'ERROR', 'EMERGENCY'].includes(
        request.severity
      ) ||
      !Number.isInteger(request.pageSize) ||
      ![10, 25, 50].includes(request.pageSize) ||
      !Number.isInteger(request.page) ||
      request.page < 0 ||
      request.page > 999 ||
      !request.sort ||
      !Object.prototype.hasOwnProperty.call(specs, request.sort.field) ||
      !['asc', 'desc'].includes(request.sort.direction) ||
      (request.anchor !== undefined &&
        (typeof request.anchor !== 'string' ||
          !datePattern.test(request.anchor)))
    )
      throw new Error('Invalid table request');
    const anchor =
      request.anchor ||
      String(
        run(
          `SELECT TO_CHAR(SYSDATE, '${DATE_FORMAT}') AS anchor FROM DUAL`,
          []
        )[0].anchor
      );
    const time = `TO_DATE('${anchor}', '${DATE_FORMAT}')`;
    // Custom bounds are validated literals; the anchor and 30-day retention bounds still apply.
    const window = custom
      ? `{executionlog.date} >= TO_DATE('${request.from}', '${DATE_FORMAT}') AND {executionlog.date} <= TO_DATE('${request.to}', '${DATE_FORMAT}')`
      : `{executionlog.date} >= ${time} - ${request.hours}/24`;
    const filters: search.Filter[] = [
      search.createFilter({
        name: 'formulanumeric',
        formula: `CASE WHEN ${window} AND {executionlog.date} <= ${time} AND {executionlog.date} >= SYSDATE - 30 AND {executionlog.date} <= SYSDATE THEN 1 ELSE 0 END`,
        operator: search.Operator.EQUALTO,
        values: 1,
      }),
    ];
    if (request.script)
      filters.push(
        search.createFilter({
          name: 'script',
          operator: search.Operator.ANYOF,
          values: request.script,
        })
      );
    if (request.deployment)
      filters.push(
        search.createFilter({
          name: 'internalid',
          operator: search.Operator.ANYOF,
          values: request.deployment,
        })
      );
    if (request.severity)
      filters.push(
        search.createFilter({
          name: 'formulatext',
          formula: 'UPPER({executionlog.type})',
          operator: search.Operator.IS,
          values: request.severity,
        })
      );
    const primary = search.createColumn({
      ...specs[request.sort.field],
      sort:
        request.sort.direction === 'asc' ? search.Sort.ASC : search.Sort.DESC,
    });
    const id = search.createColumn({
      name: 'internalid',
      join: 'executionlog',
      sort: search.Sort.DESC,
    });
    const deployment = search.createColumn({
      name: 'internalid',
      sort: search.Sort.ASC,
    });
    const fields = {
      date: search.createColumn({
        name: 'formulatext',
        formula: `TO_CHAR({executionlog.date}, '${DATE_FORMAT}')`,
      }),
      severity: search.createColumn(specs.severity),
      script: search.createColumn({ name: 'script' }),
      scriptName: search.createColumn(specs.scriptName),
      scriptId: search.createColumn({ name: 'scriptid', join: 'script' }),
      deploymentName: search.createColumn(specs.deploymentName),
      deploymentLabel: search.createColumn({ name: 'scriptid' }),
      user: search.createColumn(specs.userName),
      title: search.createColumn(specs.title),
      preview: search.createColumn({
        name: 'formulatext',
        formula: 'SUBSTR({executionlog.detail}, 1, 501)',
      }),
    };
    const operation = search.create({
      type: search.Type.SCRIPT_DEPLOYMENT,
      filters,
      columns: [primary, id, deployment, ...Object.values(fields)],
    });
    if (request.search.trim())
      operation.filterExpression = [
        operation.filterExpression,
        'AND',
        [
          ['executionlog.title', 'contains', request.search.trim()],
          'OR',
          ['executionlog.detail', 'contains', request.search.trim()],
        ],
      ];
    const paged = operation.runPaged({ pageSize: request.pageSize });
    // NetSuite supports at most 1,000 native search pages. Never walk or materialize all rows.
    const total = Math.min(paged.count, request.pageSize * 1000);
    const data =
      request.page * request.pageSize < total
        ? paged.fetch({ index: request.page }).data
        : [];
    const rows: LogTableRow[] = data.map(row => {
      const value = (column: search.Column) =>
        String(row.getValue(column) ?? '');
      const preview = value(fields.preview);
      return {
        id: value(id),
        date: value(fields.date),
        severity: value(fields.severity).toUpperCase(),
        title: value(fields.title) || '(untitled)',
        script: value(fields.script),
        scriptName: value(fields.scriptName),
        scriptId: value(fields.scriptId),
        deployment: value(deployment),
        deploymentName: value(fields.deploymentName),
        deploymentLabel: value(fields.deploymentLabel),
        userName: value(fields.user),
        preview: preview.slice(0, 500),
        previewTruncated: preview.length > 500,
      };
    });
    return {
      rows,
      total,
      hasMore: (request.page + 1) * request.pageSize < total,
      capped: paged.count > total,
      anchor,
    };
  });
}
