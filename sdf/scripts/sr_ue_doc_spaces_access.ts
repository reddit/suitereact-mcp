/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */

import * as record from 'N/record';
import * as runtime from 'N/runtime';
import { EntryPoints } from 'N/types';

import {
  assertDynGroupOwner,
  buildEmployeeSuiteQL,
  currentEmployeeId,
  evaluateAccess,
  levelRank,
  SR_DOC,
  SR_DYNGROUP,
  SR_PERMISSION,
  SR_SPACE,
  SR_USER_PREF,
  type TargetType,
} from '../actions/_docSpaces/helpers';

const deny = (): never => {
  throw new Error(
    'Forbidden: this Doc Spaces record change is not authorized.'
  );
};

const requireAccess = (
  targetType: TargetType,
  targetId: string,
  rank: number
) => {
  if (!targetId || levelRank(evaluateAccess({ targetType, targetId })) < rank)
    deny();
};

export const beforeSubmit: EntryPoints.UserEvent.beforeSubmit = context => {
  // UI, CSV and record APIs must not become alternate application write paths.
  if (runtime.executionContext !== runtime.ContextType.RESTLET) deny();
  const employeeId = currentEmployeeId();
  if (!employeeId) deny();

  const next = context.newRecord;
  const creating = context.type === context.UserEventType.CREATE;
  const deleting = context.type === context.UserEventType.DELETE;
  if (
    !creating &&
    !deleting &&
    context.type !== context.UserEventType.EDIT &&
    context.type !== context.UserEventType.XEDIT
  )
    deny();

  // Persisted values prevent partial submitFields updates from hiding ownership.
  const previous = creating
    ? null
    : record.load({ type: next.type, id: next.id });
  const changedFields = new Set(next.getFields());
  const value = (fieldId: string): string =>
    String(
      (!deleting && changedFields.has(fieldId) ? next : previous)?.getValue({
        fieldId,
      }) ?? ''
    );
  const unchanged = (...fields: string[]) => {
    if (!previous || deleting) return;
    for (const fieldId of fields) {
      if (value(fieldId) !== String(previous.getValue({ fieldId }) ?? ''))
        deny();
    }
  };

  switch (next.type) {
    case SR_PERMISSION: {
      // Grants are added or revoked, never retargeted or edited in place.
      if (!creating && !deleting) deny();
      const source = creating ? next : previous!;
      const targetType = String(
        source.getText({ fieldId: 'custrecord_perm_target_type' })
      ).toLowerCase();
      if (targetType !== 'space' && targetType !== 'doc') deny();
      requireAccess(
        targetType as TargetType,
        String(source.getValue({ fieldId: 'custrecord_perm_target_id' }) || ''),
        5
      );
      break;
    }
    case SR_SPACE:
      if (creating) {
        if (value('custrecord_space_owner') !== employeeId) deny();
      } else {
        requireAccess('space', String(next.id), 5);
        unchanged(
          'custrecord_space_owner',
          'custrecord_space_slug',
          'custrecord_space_fc_folder'
        );
      }
      break;
    case SR_DOC:
      if (creating) {
        requireAccess('space', value('custrecord_doc_space'), 4);
        if (value('custrecord_doc_author') !== employeeId) deny();
      } else {
        requireAccess('doc', String(next.id), deleting ? 5 : 4);
        unchanged(
          'custrecord_doc_space',
          'custrecord_doc_author',
          'custrecord_doc_slug'
        );
        if (
          !deleting &&
          value('custrecord_doc_is_landing') !==
            String(
              previous!.getValue({ fieldId: 'custrecord_doc_is_landing' }) ?? ''
            )
        ) {
          requireAccess('space', value('custrecord_doc_space'), 5);
        }
      }
      break;
    case SR_DYNGROUP:
      if (creating) {
        if (value('custrecord_dyngroup_owner') !== employeeId) deny();
      } else {
        assertDynGroupOwner(
          previous!.getValue({ fieldId: 'custrecord_dyngroup_owner' })
        );
        unchanged('custrecord_dyngroup_owner');
      }
      if (!deleting) {
        const criteria = JSON.parse(value('custrecord_dyngroup_criteria'));
        if (!buildEmployeeSuiteQL(criteria)) deny();
      }
      break;
    case SR_USER_PREF:
      unchanged('custrecord_userpref_employee');
      if (value('custrecord_userpref_employee') !== employeeId) deny();
      break;
    default:
      deny();
  }
};
