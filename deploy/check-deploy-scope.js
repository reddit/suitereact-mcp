#!/usr/bin/env node

const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const args = process.argv.slice(2);
const root = process.cwd();

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const appName = readArg('--app');
const deployFile = readArg('--file') ?? join('dist', 'deploy.xml');
const allowAll = args.includes('--allow-all');
const deployPath = join(root, deployFile);

if (!existsSync(deployPath)) {
  console.error(`Deploy file not found: ${deployFile}`);
  process.exit(1);
}

const xml = readFileSync(deployPath, 'utf8');
const paths = Array.from(xml.matchAll(/<path>\s*([^<]+?)\s*<\/path>/g)).map(
  match => match[1].replace(/\\/g, '/').trim()
);

const errors = [];

function addError(message) {
  errors.push(message);
}

function isSharedPath(path) {
  return /^~\/FileCabinet\/SuiteScripts\/(sdf|sdfTs|sdfReact|sdfJs)(\/|$)/.test(
    path
  );
}

for (const path of paths) {
  const isWildcard = path.includes('*');

  if (isSharedPath(path) && isWildcard) {
    addError(`Broad shared SuiteScript wildcard is forbidden: ${path}`);
  }

  if (!appName) continue;

  if ((path === '~/FileCabinet/*' || path === '~/Objects/*') && !allowAll) {
    addError(
      `Broad deploy path is not allowed for app-scoped deployment: ${path}`
    );
  }

  const appPathMatch = path.match(
    /^~\/FileCabinet\/SuiteScripts\/apps\/([^/]+)(\/|$)/
  );
  if (appPathMatch && appPathMatch[1] !== appName) {
    addError(
      `Deploy path references a different app (${appPathMatch[1]}) during ${appName} deploy: ${path}`
    );
  }
}

if (appName) {
  const expectedAppPath = `~/FileCabinet/SuiteScripts/apps/${appName}/*`;
  if (!paths.includes(expectedAppPath)) {
    addError(`Missing app bundle path: ${expectedAppPath}`);
  }
}

if (errors.length > 0) {
  console.error('Deploy scope check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(appName ? `Deploy scope OK for ${appName}` : 'Deploy scope OK');
