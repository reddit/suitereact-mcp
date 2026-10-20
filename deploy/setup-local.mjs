#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootFlag = process.argv.indexOf('--root');
const rootArgument = rootFlag >= 0 ? process.argv[rootFlag + 1] : undefined;
if (rootFlag >= 0 && !rootArgument) {
  console.error('--root requires a directory');
  process.exit(2);
}
const targetRoot = rootArgument ? resolve(rootArgument) : sourceRoot;

const appsRoot = resolve(sourceRoot, 'apps');
const apps = readdirSync(appsRoot)
  .filter(app => {
    const appRoot = resolve(appsRoot, app);
    return (
      statSync(appRoot).isDirectory() &&
      existsSync(resolve(appRoot, 'example.env'))
    );
  })
  .sort();

function envValue(content, name) {
  const match = content.match(
    new RegExp(`^\\s*${name}\\s*=\\s*([^\\r\\n#]*)`, 'm')
  );
  return match?.[1].trim().replace(/^['"]|['"]$/g, '') || '';
}

function fileMode(relativePath) {
  return statSync(resolve(targetRoot, relativePath)).mode & 0o777;
}

function writeNew(relativePath, content, created, kept, secured) {
  const destination = resolve(targetRoot, relativePath);
  if (existsSync(destination)) {
    kept.push(relativePath);
    if (fileMode(relativePath) !== 0o600) {
      chmodSync(destination, 0o600);
      secured.push(relativePath);
    }
    return false;
  }
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  created.push(relativePath);
  return true;
}

const created = [];
const kept = [];
const secured = [];
const attention = [];
const serverPath = resolve(targetRoot, 'server/.env');
const existingServer = existsSync(serverPath)
  ? readFileSync(serverPath, 'utf8')
  : '';
const existingToken = envValue(existingServer, 'SUITEREACT_PROXY_TOKEN');
if (existingServer && existingToken.length < 24) {
  console.error(
    'server/.env exists but SUITEREACT_PROXY_TOKEN is missing or shorter than 24 characters. Fix it before rerunning setup.'
  );
  process.exit(1);
}

const existingAppTokens = apps
  .map(app => {
    const relativePath = `apps/${app}/.env.development.local`;
    const destination = resolve(targetRoot, relativePath);
    if (!existsSync(destination)) return null;
    return {
      relativePath,
      token: envValue(
        readFileSync(destination, 'utf8'),
        'VITE_PROXY_SERVER_TOKEN'
      ),
    };
  })
  .filter(Boolean);
const reusableAppTokens = [
  ...new Set(existingAppTokens.map(entry => entry.token).filter(Boolean)),
];
const proxyToken =
  existingToken ||
  (reusableAppTokens.length === 1 && reusableAppTokens[0].length >= 24
    ? reusableAppTokens[0]
    : randomBytes(32).toString('hex'));

for (const entry of existingAppTokens) {
  if (entry.token !== proxyToken) {
    attention.push(
      `${entry.relativePath}: proxy token does not match the token setup would use`
    );
  }
}

if (attention.length > 0) {
  console.error('Setup made no changes. Needs attention:');
  for (const message of attention) console.error(`- ${message}`);
  console.error(
    'Make every VITE_PROXY_SERVER_TOKEN match SUITEREACT_PROXY_TOKEN, then rerun setup.'
  );
  process.exit(1);
}

const serverTemplate = readFileSync(
  resolve(sourceRoot, 'server/example.env'),
  'utf8'
).replace('replace-with-a-long-random-value', proxyToken);
writeNew('server/.env', serverTemplate, created, kept, secured);

const mcpTemplate = readFileSync(
  resolve(sourceRoot, 'mcp/example.env'),
  'utf8'
).replace('OPENAI_API_KEY=your_openai_api_key_here', 'OPENAI_API_KEY=');
writeNew('mcp/.env', mcpTemplate, created, kept, secured);

for (const app of apps) {
  const relativePath = `apps/${app}/.env.development.local`;
  const template = readFileSync(
    resolve(sourceRoot, `apps/${app}/example.env`),
    'utf8'
  ).replace(
    'replace-with-the-same-value-as-SUITEREACT_PROXY_TOKEN',
    proxyToken
  );
  writeNew(relativePath, template, created, kept, secured);
}

console.log('SuiteReact local setup');
for (const file of created) console.log(`created  ${file}`);
for (const file of kept) console.log(`kept     ${file}`);
for (const file of secured) console.log(`secured  ${file} (permissions 0600)`);

console.log('\nNext steps:');
console.log('1. Build without NetSuite access: npm run build');
console.log(
  '2. Live app data: fill server/.env, then npm run doctor -- --live'
);
console.log('3. MCP tools: fill mcp/.env, then npm run build:mcp');
console.log('4. Detailed guide: docs/setup.md');
