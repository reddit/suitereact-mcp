import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { SuiteletGeneratorInputSchema } from '../types.js';

export async function handleSuiteletGeneratorTool(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  try {
    const inputArgs = SuiteletGeneratorInputSchema.parse(arguments_);
    const { appId, appName, description } = inputArgs;
    const underScoreAppId = appId.replace(/-/g, '_').toLowerCase();
    const suiteletFileName = `sr_sui_${underScoreAppId}.ts`;
    const xmlFileName = `customscript_sr_sui_${underScoreAppId}.xml`;
    const nsWindowParamName = `custscript_sr_${underScoreAppId}_ns_window`;
    const docString = `/**\n *@NApiVersion 2.1\n *@NScriptType Suitelet\n *@NModuleScope Public\n */`;
    const suiteletContent = `${docString}

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
    .getParameter({ name: '${nsWindowParamName}' });

  const form = ui.createForm({ title: '${appName}' });
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
`;

    // XML generation
    const scriptId = `customscript_sr_sui_${underScoreAppId}`;
    const scriptName = `SR | SUI | ${appName}`;
    const scriptFilePath = `[/SuiteScripts/apps/${appId}/suitelet/sr_sui_${underScoreAppId}.js]`;
    const scriptDeploymentId = `customdeploy_sr_sui_${underScoreAppId}`;
    const scriptDeploymentName = `SR | SUI | ${appName}`;
    const scriptDeploymentNsWindowParam = nsWindowParamName;
    const xmlContent = `<suitelet scriptid="${scriptId}">
  <description>${description || ''}</description>
  <isinactive>F</isinactive>
  <name>${scriptName}</name>
  <notifyadmins>F</notifyadmins>
  <notifyemails></notifyemails>
  <notifyowner>T</notifyowner>
  <notifyuser>F</notifyuser>
  <scriptfile>${scriptFilePath}</scriptfile>
    <scriptcustomfields>
    <scriptcustomfield scriptid="${nsWindowParamName}">
      <accesslevel>2</accesslevel>
      <applyformatting>F</applyformatting>
      <checkspelling>F</checkspelling>
      <defaultchecked>F</defaultchecked>
      <defaultselection></defaultselection>
      <defaultvalue></defaultvalue>
      <description>Checking this box will cause the React App to be rendered within the NetSuite UI.</description>
      <displayheight></displayheight>
      <displaytype>NORMAL</displaytype>
      <displaywidth></displaywidth>
      <dynamicdefault></dynamicdefault>
      <fieldtype>CHECKBOX</fieldtype>
      <help></help>
      <isformula>F</isformula>
      <ismandatory>F</ismandatory>
      <label>Render NetSuite UI</label>
      <linktext></linktext>
      <maxlength></maxlength>
      <maxvalue></maxvalue>
      <minvalue></minvalue>
      <onparentdelete></onparentdelete>
      <searchlevel>2</searchlevel>
      <selectrecordtype></selectrecordtype>
      <setting></setting>
      <storevalue>T</storevalue>
    </scriptcustomfield>
  </scriptcustomfields>
  <scriptdeployments>
    <scriptdeployment scriptid="${scriptDeploymentId}">
      <allemployees>F</allemployees>
      <allpartners>F</allpartners>
      <allroles>F</allroles>
      <${scriptDeploymentNsWindowParam}>T</${scriptDeploymentNsWindowParam}>
      <audslctrole></audslctrole>
      <eventtype></eventtype>
      <isdeployed>F</isdeployed>
      <isonline>F</isonline>
      <loglevel>ERROR</loglevel>
      <status>TESTING</status>
      <title>${scriptDeploymentName}</title>
    </scriptdeployment>
  </scriptdeployments>
</suitelet>
`;

    return [
      {
        type: 'text',
        text: JSON.stringify(
          { filename: suiteletFileName, content: suiteletContent },
          null,
          2
        ),
      },
      {
        type: 'text',
        text: JSON.stringify(
          { filename: xmlFileName, content: xmlContent },
          null,
          2
        ),
      },
    ];
  } catch (error) {
    console.error('Error processing suitelet generator tool:', error);
    return [
      { type: 'text', text: 'Error: Invalid arguments for generate_suitelet' },
    ];
  }
}
