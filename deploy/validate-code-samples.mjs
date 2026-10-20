import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const requireFromMcp = createRequire(path.join(repoRoot, 'mcp/package.json'));
const ts = requireFromMcp('typescript');
const catalogPath = path.join(
  repoRoot,
  'mcp/src/resources/suitereact_code_samples.json'
);
const errors = [];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectSamples(value, samples = new Map()) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return samples;

  for (const [key, child] of Object.entries(value)) {
    if (
      child &&
      typeof child === 'object' &&
      !Array.isArray(child) &&
      typeof child.code === 'string'
    ) {
      if (samples.has(key)) errors.push(`Duplicate sample key: ${key}`);
      samples.set(key, child);
    } else {
      collectSamples(child, samples);
    }
  }

  return samples;
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (/\.(json|md|mdc|ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

let catalog;
try {
  catalog = JSON.parse(read(catalogPath));
} catch (error) {
  console.error(`Invalid sample catalog JSON: ${error.message}`);
  process.exit(1);
}

if (!catalog.metadata?.version) {
  errors.push('Sample catalog metadata.version is required');
}

const samples = collectSamples(catalog);
for (const [key, sample] of samples) {
  for (const field of ['title', 'description', 'code', 'notes']) {
    if (
      !sample[field] ||
      (field === 'notes' && !Array.isArray(sample[field]))
    ) {
      errors.push(`sample:${key} is missing ${field}`);
    }
  }

  for (const related of sample.relatedSamples ?? []) {
    if (!samples.has(related)) {
      errors.push(`sample:${key} references missing related sample:${related}`);
    }
  }

  const transpiled = ts.transpileModule(sample.code, {
    fileName: `${key}.tsx`,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });

  for (const diagnostic of transpiled.diagnostics ?? []) {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n'
    );
    errors.push(`sample:${key} has invalid TypeScript/TSX: ${message}`);
  }
}

const referenceRoots = [
  path.join(repoRoot, 'mcp/src'),
  path.join(repoRoot, '.cursor/rules'),
];
for (const filePath of referenceRoots.flatMap(walk)) {
  const relativePath = path.relative(repoRoot, filePath);
  const content = read(filePath);
  for (const match of content.matchAll(/sample:([A-Za-z][A-Za-z0-9]*)/g)) {
    if (!samples.has(match[1])) {
      errors.push(`${relativePath} references missing sample:${match[1]}`);
    }
  }
}

const planner = read(path.join(repoRoot, 'mcp/src/tools/analyzeAndPlan.ts'));
const removedSampleIds = [
  'savedSearchTable',
  'tableWithSuiteQL',
  'serverAction',
  'suiteQLAction',
  'netSuiteDataQuery',
  'suiteQLTablePopulation',
  'dynamicQueryWithFilters',
  'basicForm',
  'dataTable',
  'multiClientChatbot',
  'chatbotStructuredResponse',
  'selectField',
];
for (const sampleId of removedSampleIds) {
  if (planner.includes(sampleId)) {
    errors.push(
      `analyzeAndPlan.ts still references removed sample ${sampleId}`
    );
  }
}

const scaffold = read(
  path.join(repoRoot, 'mcp/src/tools/actionScaffoldGenerator.ts')
);
if (scaffold.includes('yourServerActionName')) {
  errors.push(
    'Action scaffold still contains the placeholder yourServerActionName'
  );
}
if (scaffold.includes("import { REST, toastService } from 'suitereact'")) {
  errors.push(
    'Action scaffold still generates production-only REST.post clients'
  );
}

const dataGridSample = samples.get('dataGridBasic')?.code ?? '';
if (dataGridSample.includes('GridToolbar')) {
  errors.push('sample:dataGridBasic uses deprecated GridToolbar');
}
if (!dataGridSample.includes('showToolbar')) {
  errors.push('sample:dataGridBasic must use the MUI X v8 showToolbar API');
}

const zipSample = samples.get('blobZipExport')?.code ?? '';
for (const required of [
  'bufferedWrite: true',
  'document.body.appendChild(anchor)',
  'anchor.remove()',
]) {
  if (!zipSample.includes(required)) {
    errors.push(`sample:blobZipExport is missing ${required}`);
  }
}

const restSample = samples.get('restPostServerAction')?.code ?? '';
if (restSample.includes('payload?.data')) {
  errors.push(
    'sample:restPostServerAction double-unwraps the RESTlet response'
  );
}

const chatbotSample = samples.get('chatbotPanelStructured')?.code ?? '';
if (!chatbotSample.includes('apiBaseUrl={proxyBase}')) {
  errors.push('sample:chatbotPanelStructured is missing the local proxy URL');
}
if (!chatbotSample.includes('import.meta.env.DEV')) {
  errors.push(
    'sample:chatbotPanelStructured must guard the local proxy with import.meta.env.DEV'
  );
}

if (errors.length > 0) {
  console.error(
    `Code sample validation failed with ${errors.length} issue(s):`
  );
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Validated ${samples.size} SuiteReact code samples and their references.`
);
