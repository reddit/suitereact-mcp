/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 *@NModuleScope Public
 */

import * as runtime from 'N/runtime';
import { EntryPoints } from 'N/types';
import * as ui from 'N/ui/serverWidget';
import * as url from 'N/url';

import { getClient } from '../utils/index';

const onRequest: EntryPoints.Suitelet.onRequest = (
  context: EntryPoints.Suitelet.onRequestContext
) => {
  const response = context.response;
  const request = context.request;
  const showNav = runtime
    .getCurrentScript()
    .getParameter({ name: 'custscript_sr_suiteql_bot_ns_window' });

  const form = ui.createForm({ title: 'SuiteQL Bot' });
  const bodyAreaField = form.addField({
    id: 'custpage_bodyareafield',
    type: ui.FieldType.INLINEHTML,
    label: 'Body Area Field',
  });

  if (request.parameters.iframe !== 'T' && showNav) {
    const scriptObj = runtime.getCurrentScript();
    const scriptUrl = url.resolveScript({
      scriptId: scriptObj.id,
      deploymentId: scriptObj.deploymentId,
    });
    bodyAreaField.defaultValue =
      '<iframe src="' +
      scriptUrl +
      '&iframe=T" style="margin-top: -50px; position: absolute; height: 100%; width: 100%; border: none; right:0px;"></iframe>';
    response.writePage(form);
  } else {
    response.write(getClient());
  }
};

export { onRequest };
