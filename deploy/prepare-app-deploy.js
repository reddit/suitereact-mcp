#!/usr/bin/env node

const { existsSync, writeFileSync } = require('fs');
const { join } = require('path');

const appName = process.argv[2];
const force = process.argv.includes('--force');
const ifMissing = process.argv.includes('--if-missing');
const root = process.cwd();

function usage() {
  console.error(
    'Usage: node deploy/prepare-app-deploy.js <app-name> [--if-missing|--force]'
  );
}

if (!appName) {
  usage();
  process.exit(1);
}

const appPath = join(root, 'apps', appName);
if (!existsSync(appPath)) {
  console.error(`App does not exist: apps/${appName}`);
  process.exit(1);
}

const deployOverridePath = join(root, 'deploy.override');
if (existsSync(deployOverridePath) && !force) {
  if (ifMissing) {
    console.log('deploy.override already exists; leaving it unchanged');
    process.exit(0);
  }

  console.error('deploy.override already exists. Use --force to replace it.');
  process.exit(1);
}

const appScriptId = appName.replace(/-/g, '_');
const suiteletObject = `customscript_sr_sui_${appScriptId}.xml`;
const suiteletObjectPath = join(
  root,
  'sdf',
  'objects',
  'suitelet',
  suiteletObject
);
const centerCategoryPath = join(
  root,
  'sdf',
  'objects',
  'centerCategory',
  'custcentercategory_suitereact.xml'
);

const objects = [];
if (existsSync(suiteletObjectPath)) {
  objects.push(`    <path>~/Objects/${suiteletObject}</path>`);
} else {
  console.warn(
    `Warning: ${suiteletObjectPath} does not exist; app object not included`
  );
}

if (existsSync(centerCategoryPath)) {
  objects.push('    <path>~/Objects/custcentercategory_suitereact.xml</path>');
}

const xml = `<deploy>
  <files>
    <path>~/FileCabinet/SuiteScripts/apps/${appName}/*</path>
  </files>
  <objects>
${objects.join('\n')}
  </objects>
</deploy>
`;

writeFileSync(deployOverridePath, xml);
console.log(`Wrote scoped deploy.override for ${appName}`);
