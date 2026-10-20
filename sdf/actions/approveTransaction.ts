import * as log from 'N/log';
import * as query from 'N/query';
import * as record from 'N/record';
import * as runtime from 'N/runtime';

import { actionDenied } from '../domain/actionDenial';

const APPROVAL_STATUS_PENDING = 1;
const APPROVAL_STATUS_APPROVED = 2;

/** NetSuite stores "no next approver" as empty or -1. */
const UNASSIGNED_APPROVER = new Set(['', '-1']);

/**
 * Record types Approval Manager approves, mapped to the body field naming the
 * employee the transaction is for, if any. That employee may not approve it.
 */
const SUPPORTED_TYPES: Record<string, string | null> = {
  journalentry: null,
  invoice: null,
  expensereport: 'entity',
  purchaseorder: 'employee',
};

const NOT_ASSIGNED_APPROVER =
  'This transaction is assigned to another approver. Only its assigned next approver can approve it.';
const SELF_APPROVAL_DENIED =
  'You cannot approve a transaction you created or that is for you. Ask another approver.';
const CREATOR_UNKNOWN =
  'Cannot confirm who created this transaction, so it cannot be approved here. Approve it in NetSuite.';

const NOT_PENDING =
  'This transaction is no longer pending approval. Refresh the queue.';

const text = (value: unknown) => (value == null ? '' : String(value));

/**
 * Creator from transaction.createdby, falling back to the record's creation
 * system note (createdby is empty on many integration-created transactions).
 */
function findCreator(transactionId: number): string {
  const row = query
    .runSuiteQL({
      query: `SELECT t.createdby AS createdby,
                (SELECT MIN(sn.name) FROM systemnote sn
                  WHERE sn.recordid = t.id AND sn.recordtypeid = -30
                    AND sn.type = 1) AS creatednote
              FROM transaction t WHERE t.id = ?`,
      params: [transactionId],
    })
    .asMappedResults()[0];
  return text(row?.createdby) || text(row?.creatednote);
}

/**
 * Approves a pending transaction by setting approvalstatus = 2 (Approved).
 *
 * Controls, all fail-closed:
 * - only supported record types, and only transactions pending approval;
 * - if NetSuite has assigned a next approver, only that user may approve;
 * - the approver may not be the creator, or the employee the transaction is
 *   for; with no assigned approver, an unknown creator denies approval;
 * - the save enforces mandatory fields.
 *
 * @param id - The internal ID of the transaction.
 * @param recordtype - The SuiteQL record-type string (e.g. 'journalentry').
 */
export const approveTransaction = ({
  id,
  recordtype,
}: {
  id: string | number;
  recordtype: string;
}): { success: boolean; id: string | number; message: string } => {
  if (!id) throw new Error('Missing required parameter: id');
  if (!recordtype) throw new Error('Missing required parameter: recordtype');
  const type = String(recordtype).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_TYPES, type)) {
    throw new Error(`Approval is not supported for record type ${recordtype}`);
  }
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    throw new Error('Invalid parameter: id');
  }

  const user = runtime.getCurrentUser();
  const userId = String(user.id);
  const rec = record.load({
    type: type as record.Type,
    id: transactionId,
    isDynamic: false,
  });

  const deny = (reason: string, message: string): never => {
    log.audit('approveTransaction denied', {
      transactionId,
      type,
      user: user.id,
      role: user.role,
      reason,
    });
    throw actionDenied(message);
  };

  const status = Number(rec.getValue({ fieldId: 'approvalstatus' }));
  if (status !== APPROVAL_STATUS_PENDING) {
    deny('not pending', NOT_PENDING);
  }

  const nextApprover = text(rec.getValue({ fieldId: 'nextapprover' }));
  const assigned = !UNASSIGNED_APPROVER.has(nextApprover);
  if (assigned && nextApprover !== userId) {
    deny('not the assigned approver', NOT_ASSIGNED_APPROVER);
  }

  const creator = findCreator(transactionId);
  const subjectField = SUPPORTED_TYPES[type];
  const subject = subjectField
    ? text(rec.getValue({ fieldId: subjectField }))
    : '';
  if (creator === userId || subject === userId) {
    deny('self-approval', SELF_APPROVAL_DENIED);
  }
  if (!creator && !assigned) {
    deny('creator unknown', CREATOR_UNKNOWN);
  }

  rec.setValue({ fieldId: 'approvalstatus', value: APPROVAL_STATUS_APPROVED });
  const savedId = rec.save();

  log.audit('approveTransaction', {
    transactionId: savedId,
    type,
    user: user.id,
    role: user.role,
    from: status,
    to: APPROVAL_STATUS_APPROVED,
    assignedApprover: assigned,
  });

  return {
    success: true,
    id: savedId,
    message: `Transaction ${savedId} approved`,
  };
};
