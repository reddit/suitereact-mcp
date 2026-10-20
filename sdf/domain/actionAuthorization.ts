import * as runtime from 'N/runtime';

export const ROLE_NOT_AUTHORIZED =
  'This SuiteReact action is not authorized for the current role';

export type RoleAllowlistParameter = 'custscript_sr_statement_email_role_ids';

/**
 * NetSuite's native permission for ad hoc querying (SuiteAnalytics Workbook).
 * Query actions require it at View or above; record permissions still apply.
 */
export const QUERY_PERMISSION = 'REPO_ANALYTICS';

/**
 * Throws unless the current role is listed in the script parameter. Fails
 * closed: a missing or empty allowlist denies every role.
 */
export function assertRoleAllowed(parameter: RoleAllowlistParameter): void {
  const configuredRoles = String(
    runtime.getCurrentScript().getParameter({ name: parameter }) || ''
  )
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!configuredRoles.includes(String(runtime.getCurrentUser().role))) {
    throw new Error(ROLE_NOT_AUTHORIZED);
  }
}

/**
 * Throws unless the current role holds a native NetSuite permission at the
 * given level or above. Fails closed: an absent permission is NONE.
 */
export function assertPermission(
  name: string,
  minimum: runtime.Permission = runtime.Permission.VIEW
): void {
  if (runtime.getCurrentUser().getPermission({ name }) < minimum) {
    throw new Error(ROLE_NOT_AUTHORIZED);
  }
}

/** Throws unless the current role holds SuiteAnalytics Workbook at View. */
export function assertQueryPermission(): void {
  assertPermission(QUERY_PERMISSION);
}
