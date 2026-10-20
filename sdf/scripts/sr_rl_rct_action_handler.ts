/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 *@NModuleScope Public
 */

import * as log from 'N/log';
import { EntryPoints } from 'N/types';

import * as allActions from '../actions/index';
import {
  assertQueryPermission,
  assertRoleAllowed,
  ROLE_NOT_AUTHORIZED,
} from '../domain/actionAuthorization';
import { ACTION_DENIED } from '../domain/actionDenial';
import { errorResponse, successResponse } from '../domain/suitereact';
import * as R from '../libs/ramda';

/**
 * read: fixed reads; native permissions apply inside the action.
 * query: caller-shaped reads; requires SuiteAnalytics Workbook.
 * mutation: writes; native record permissions plus the action's own checks.
 * sendAs: acts as a configured employee, which no native permission governs;
 *   requires a role in custscript_sr_statement_email_role_ids.
 */
type ActionPolicy = 'read' | 'query' | 'mutation' | 'sendAs';

// Adding an exported action requires an explicit policy at typecheck time.
const ACTION_POLICIES: Record<
  Lowercase<keyof typeof allActions>,
  ActionPolicy
> = {
  getuserdomainurl: 'read',
  // These fixed reads enforce native SuiteScript View inside each action.
  listscriptlogs: 'read',
  listscriptlogtable: 'read',
  getscriptlogdetail: 'read',
  searchscriptlogscripts: 'read',
  searchscriptlogdeployments: 'read',
  getuserprops: 'read',
  getusertimezone: 'read',
  resolverecordurls: 'read',
  dsgetspaces: 'read',
  dsgetspacedocs: 'read',
  dsgetdochtml: 'read',
  dslistpermissions: 'read',
  dsgetemployees: 'read',
  dslistdyngroups: 'mutation',
  dscheckaccess: 'read',
  dsgetuserprefs: 'read',
  getrecordfieldschema: 'query',
  getselectoptionsfromstring: 'query',
  gettablerowsfromsavedsearch: 'query',
  gettablerowsfromsuiteql: 'query',
  getstatementdata: 'query',
  getlastemailattachedtorecord: 'query',
  getlastemailtoprimaryrecipientsearch: 'query',
  getlastemailtoprimaryrecipientquery: 'query',
  generateinvoicepdfs: 'query',
  saveexcelfile: 'mutation',
  sendstatementemail: 'sendAs',
  approvetransaction: 'mutation',
  dscreatespace: 'mutation',
  dsupdatespace: 'mutation',
  dsarchivespace: 'mutation',
  dssavedocdraft: 'mutation',
  dspublishdoc: 'mutation',
  dssetlandingdoc: 'mutation',
  dsaddpermission: 'mutation',
  dsrevokepermission: 'mutation',
  // Runs caller-supplied employee criteria, so it is a query, not a write.
  dsevaluatedyngroup: 'query',
  dssavedyngroup: 'mutation',
  dssetuserdefaultspace: 'mutation',
  dsuploadhtmlfile: 'mutation',
};

const assertAuthorizedAction = (action: string) => {
  const normalized = action.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ACTION_POLICIES, normalized)) {
    throw new Error('This SuiteReact action has no authorization policy');
  }

  const policy = ACTION_POLICIES[normalized as keyof typeof ACTION_POLICIES];
  // The deployment audience decides who can call this RESTlet. Run As Role is
  // unset, so reads and writes run under the caller's native permissions.
  if (policy === 'read' || policy === 'mutation') return;
  if (policy === 'query') return assertQueryPermission();
  assertRoleAllowed('custscript_sr_statement_email_role_ids');
};

const onRequest = (p: any) => {
  const actionName = typeof p?.action === 'string' ? p.action : '';
  try {
    log.debug('SuiteReact Action', { action: actionName });
    assertAuthorizedAction(actionName);
    const action = getAction(actionName);
    return successResponse(action(p));
  } catch (e: any) {
    if (e?.name === ACTION_DENIED) {
      return errorResponse(ACTION_DENIED, String(e.message));
    }
    if (
      [
        'listscriptlogs',
        'listscriptlogtable',
        'getscriptlogdetail',
        'searchscriptlogscripts',
        'searchscriptlogdeployments',
      ].includes(actionName.toLowerCase())
    ) {
      const denied =
        e?.name === 'SCRIPT_LOG_PERMISSION_DENIED' ||
        e?.message === ROLE_NOT_AUTHORIZED;
      const code = denied
        ? 'SCRIPT_LOG_PERMISSION_DENIED'
        : 'SCRIPT_LOG_QUERY_ERROR';
      log.error('Script log reader failed', code);
      return errorResponse(code, code);
    }
    log.error(`ACTION: ${actionName}`, e);
    return errorResponse(
      'SUITEREACT_ACTION_FAILED',
      'The action failed; review the protected NetSuite script log'
    );
  }
};

const getAction = (action = '') => {
  const toLowerKey = (num: any, key: any) =>
    R.assoc(key.toLowerCase(), num, {});

  const actions = R.compose(
    R.mergeAll,
    R.values,
    R.mapObjIndexed(toLowerKey)
  )(allActions);
  const actionMatch = actions[action.toLowerCase()];

  if (!actionMatch || !action) return noActionFound(action);

  return actionMatch;
};

const noActionFound = (action: any) =>
  errorResponse(`Cannot find action ${action && ':' + action}`);

export const post: EntryPoints.RESTlet.post = onRequest;
export const get: EntryPoints.RESTlet.get = onRequest;
