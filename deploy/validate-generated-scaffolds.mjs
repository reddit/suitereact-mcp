import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const requireFromMcp = createRequire(path.join(repoRoot, 'mcp/package.json'));
const ts = requireFromMcp('typescript');
const mcpDist = path.join(repoRoot, 'mcp/dist/tools');
const { handleActionScaffoldGeneratorTool } = await import(
  pathToFileURL(path.join(mcpDist, 'actionScaffoldGenerator.js'))
);
const { handleAppScaffoldGeneratorTool } = await import(
  pathToFileURL(path.join(mcpDist, 'appScaffoldGenerator.js'))
);

function assertSyntax(fileName, code, jsx = false) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  };
  if (jsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;

  const result = ts.transpileModule(code, {
    fileName,
    reportDiagnostics: true,
    compilerOptions,
  });
  const diagnostics = result.diagnostics ?? [];
  if (diagnostics.length === 0) return;

  const messages = diagnostics.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  );
  throw new Error(`${fileName}: ${messages.join('; ')}`);
}

for (const actionType of ['client', 'server']) {
  for (const includeAdvancedFeatures of [false, true]) {
    const output = await handleActionScaffoldGeneratorTool({
      actionName: 'loadInvoices',
      actionType,
      appId: 'invoice-pdf',
      includeAdvancedFeatures,
    });
    const result = JSON.parse(output[0].text);
    assertSyntax(result.fileName, result.content, actionType === 'client');

    if (result.content.includes('yourServerActionName')) {
      throw new Error(`${actionType} scaffold leaked placeholder action name`);
    }
  }
}

const appOutput = await handleAppScaffoldGeneratorTool({
  appName: 'Sample App',
  appId: 'sample-app',
  subheader: 'Sample workflow',
  clientActionsFile: 'clientActions.ts',
  landingPageFile: 'LandingPage.tsx',
  serverActionFile: 'loadInvoices.ts',
});
const generated = JSON.parse(appOutput[0].text);
for (const file of generated.files) {
  if (/\.tsx?$/.test(file.path) && !file.path.endsWith('.d.ts')) {
    assertSyntax(file.path, file.content, file.path.endsWith('.tsx'));
  }
  if (file.path.endsWith('.json')) JSON.parse(file.content);
}

console.log('Validated generated app files and four action scaffold variants.');
