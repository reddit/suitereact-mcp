export interface LogFilters {
  search: string;
  /** 0 selects the custom from/to window (table action only). */
  hours: 0 | 1 | 24 | 168 | 720;
  /** Account-time bounds, YYYY-MM-DD HH:MM:SS; required only when hours is 0. */
  from?: string;
  to?: string;
  script: string;
  deployment: string;
  severity: '' | 'DEBUG' | 'AUDIT' | 'ERROR' | 'EMERGENCY';
}

export interface LogCursor {
  date: string;
  id: string;
  anchor: string;
}
export interface LogRequest extends LogFilters {
  cursor?: LogCursor;
  pageSize: number;
}
export interface LogRow {
  id: string;
  date: string;
  severity: string;
  title: string;
  script: string;
  deployment: string;
  deploymentLabel?: string;
}
export interface LogPage {
  rows: LogRow[];
  next: LogCursor | null;
}
export interface ScriptLogScript {
  value: string;
  label: string;
  scriptId: string;
  script?: string;
  scriptLabel?: string;
  parentScriptId?: string;
}
export interface ScriptLogScriptPage {
  options: ScriptLogScript[];
  hasMore: boolean;
}
export type LogResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'permission_denied' | 'query_error'; message: string };

export type LogSortField =
  | 'date'
  | 'severity'
  | 'scriptName'
  | 'deploymentName'
  | 'userName'
  | 'title'
  | 'preview';
export interface LogTableRequest extends LogFilters {
  page: number;
  pageSize: number;
  sort: { field: LogSortField; direction: 'asc' | 'desc' };
  anchor?: string;
}
export interface LogTableRow extends LogRow {
  scriptName: string;
  scriptId: string;
  deploymentName: string;
  userName: string;
  preview: string;
  previewTruncated: boolean;
}
export interface LogTablePage {
  rows: LogTableRow[];
  total: number;
  hasMore: boolean;
  capped: boolean;
  anchor: string | null;
}
