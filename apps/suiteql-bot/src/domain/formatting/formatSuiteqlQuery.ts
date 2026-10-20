import { formatDialect, sql } from 'sql-formatter';

export function formatSuiteqlQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';

  try {
    return formatDialect(trimmed, {
      dialect: sql,
      keywordCase: 'upper',
      logicalOperatorNewline: 'before',
      tabWidth: 2,
    }).replace(
      /\bBUILTIN\.([A-Z_][A-Z0-9_]*)\s+\(/gi,
      (_match, functionName: string) => `BUILTIN.${functionName}(`
    );
  } catch {
    return trimmed;
  }
}
