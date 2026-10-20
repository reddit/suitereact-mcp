/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 *@NModuleScope Public
 */

import * as log from 'N/log';
import { EntryPoints } from 'N/types';

import * as legacy from '/SuiteScripts/sdfTs/application/scripts/restlet/sr_rl_rct_action_handler';

import { getTableRowsFromSuiteql } from '../actions/getTableRowsFromSuiteql';
import {
  getScriptLogDetail,
  listScriptLogs,
  listScriptLogTable,
  searchScriptLogDeployments,
  searchScriptLogScripts,
} from '../actions/scriptLogActions';
import {
  assertQueryPermission,
  ROLE_NOT_AUTHORIZED,
} from '../domain/actionAuthorization';
import { LogRequest, LogTableRequest } from '../domain/scriptLogs';
import { errorResponse, successResponse } from '../domain/suitereact';

function handleLogAction(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const request = input as Record<string, unknown>;
  const action =
    typeof request?.action === 'string' ? request.action.toLowerCase() : '';
  if (
    ![
      'listscriptlogs',
      'listscriptlogtable',
      'getscriptlogdetail',
      'searchscriptlogscripts',
      'searchscriptlogdeployments',
    ].includes(action)
  )
    return null;
  try {
    const data =
      action === 'listscriptlogtable'
        ? listScriptLogTable(request as unknown as LogTableRequest)
        : action === 'listscriptlogs'
          ? listScriptLogs(request as unknown as LogRequest)
          : action === 'getscriptlogdetail'
            ? getScriptLogDetail(request as { id: string })
            : action === 'searchscriptlogdeployments'
              ? searchScriptLogDeployments(
                  request as { search: string; script?: string }
                )
              : searchScriptLogScripts(request as { search: string });
    return JSON.stringify({ success: true, data });
  } catch (error) {
    const code =
      (error as Error)?.name === 'SCRIPT_LOG_PERMISSION_DENIED'
        ? 'SCRIPT_LOG_PERMISSION_DENIED'
        : 'SCRIPT_LOG_QUERY_ERROR';
    return JSON.stringify({ success: false, error: code, message: code });
  }
}

type ActionError = {
  name?: string;
  error?: string;
  message?: string;
  details?: string;
  cause?: { details?: string };
};

/**
 * Serves getTableRowsFromSuiteql from this tree, which returns SuiteQL values
 * unchanged (the legacy copy splits strings containing a colon). It applies
 * the canonical handler's query policy: the deployment audience decides who can
 * call this RESTlet, and only roles holding SuiteAnalytics Workbook
 * (REPO_ANALYTICS) can query; record permissions still apply. Payloads keep
 * the legacy handler's shape.
 */
function handleSuiteqlTableAction(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const request = input as Record<string, unknown>;
  const action = typeof request.action === 'string' ? request.action : '';
  if (action.toLowerCase() !== 'gettablerowsfromsuiteql') return null;
  try {
    assertQueryPermission();
  } catch {
    log.audit('SuiteReact action denied', { action });
    return errorResponse(
      `ACTION: ${action}: ${ROLE_NOT_AUTHORIZED}`,
      ROLE_NOT_AUTHORIZED
    );
  }
  try {
    return successResponse(
      getTableRowsFromSuiteql(request as unknown as { query: string })
    );
  } catch (e) {
    log.error(`ACTION: ${action}`, e);
    const err = (e ?? {}) as ActionError;
    const name = err.name || err.error || '';
    const message = err.message || '';
    const details = err.cause?.details || err.details || '';
    return errorResponse(
      `ACTION: ${action}: ${name ? `[${name}] ` : ''}${message || 'Unknown error'}`,
      details || message || JSON.stringify(e)
    );
  }
}

// Keep legacy dependencies, action policies and transport behavior at their existing path.
export const get: EntryPoints.RESTlet.get = request =>
  handleLogAction(request) ??
  handleSuiteqlTableAction(request) ??
  legacy.get(request);
export const post: EntryPoints.RESTlet.post = request =>
  handleLogAction(request) ??
  handleSuiteqlTableAction(request) ??
  legacy.post(request);
