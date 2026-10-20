#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

const args = process.argv.slice(2);
const appFlag = args.indexOf('--app');
const selectedApp = appFlag >= 0 ? args[appFlag + 1] : null;
if (appFlag >= 0 && (!selectedApp || selectedApp.startsWith('--'))) {
  console.error('--app requires an application name');
  process.exit(2);
}
const requestedModes = new Set(
  args.filter(argument =>
    ['--build', '--live', '--mcp', '--deploy'].includes(argument)
  )
);
const supportedModes = new Set(['--build', '--live', '--mcp', '--deploy']);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--app') {
    index += 1;
  } else if (argument.startsWith('--') && !supportedModes.has(argument)) {
    console.error(`Unknown option: ${argument}`);
    process.exit(2);
  }
}
const defaultBuild = requestedModes.size === 0;
const checkBuild = defaultBuild || requestedModes.has('--build');
const checkLive = requestedModes.has('--live');
const checkMcp = requestedModes.has('--mcp');
const checkDeploy = requestedModes.has('--deploy');
const root = process.cwd();
let errors = 0;
let warnings = 0;
let setupSuggested = false;

function ok(message) {
  console.log(`${colors.green}ok${colors.reset} ${message}`);
}

function warn(message) {
  warnings += 1;
  console.log(`${colors.yellow}warn${colors.reset} ${message}`);
}

function fail(message) {
  errors += 1;
  console.log(`${colors.red}fail${colors.reset} ${message}`);
}

function info(message) {
  console.log(`${colors.blue}info${colors.reset} ${message}`);
}

function section(title) {
  console.log(`\n${colors.bold}${title}${colors.reset}`);
}

function commandOutput(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function parseEnv(filePath) {
  if (!existsSync(filePath)) return null;

  const env = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }

  return env;
}

function requireEnvKeys(env, keys, label, strict) {
  if (!env) {
    const message = `${label} is missing`;
    if (strict) fail(message);
    else warn(`${message}; live NetSuite calls will not work`);
    return;
  }

  const missing = keys.filter(key => !env[key]);
  if (missing.length > 0) {
    const message = `${label} is missing required key(s): ${missing.join(', ')}`;
    if (strict) fail(message);
    else warn(message);
  } else {
    ok(`${label} has required keys`);
  }
}

function discoverApps() {
  const appsDir = join(root, 'apps');
  if (!existsSync(appsDir)) return [];

  return readdirSync(appsDir)
    .filter(item => {
      const appPath = join(appsDir, item);
      return (
        statSync(appPath).isDirectory() &&
        existsSync(join(appPath, 'package.json'))
      );
    })
    .sort();
}

console.log(`\n${colors.bold}SuiteReact Doctor${colors.reset}`);
console.log(
  `Checks: ${[
    checkBuild && 'build',
    checkLive && 'live app',
    checkMcp && 'MCP',
    checkDeploy && 'deployment',
  ]
    .filter(Boolean)
    .join(', ')}.`
);

section('Runtime');
const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split('.')[0]);
if (nodeMajor >= 22) ok(`Node ${nodeVersion}`);
else fail(`Node ${nodeVersion}; Node.js 22 LTS is required`);

const npmVersion = commandOutput('npm', ['--version']);
if (npmVersion) {
  const npmMajor = Number(npmVersion.split('.')[0]);
  if (npmMajor >= 10) ok(`npm ${npmVersion}`);
  else fail(`npm ${npmVersion}; npm 10 or newer is required`);
} else fail('npm is not available on PATH');

if (existsSync(join(root, 'node_modules'))) ok('root node_modules exists');
else warn('root node_modules is missing; run npm ci');

if (checkDeploy) {
  section('SuiteCloud deployment');
  const suitecloudVersion = commandOutput('suitecloud', ['--version']);
  if (suitecloudVersion)
    ok(`SuiteCloud CLI ${suitecloudVersion.split('\n')[0]}`);
  else fail('SuiteCloud CLI is not available; install @oracle/suitecloud-cli');

  const javaVersion = commandOutput('java', ['-version']);
  if (javaVersion) ok('Java is available');
  else
    fail('Java is not available; SuiteCloud CLI requires Oracle JDK 17 or 21');

  if (existsSync(join(root, 'suitecloud.config.js')))
    ok('suitecloud.config.js exists');
  else fail('suitecloud.config.js is missing');
  info(
    'Confirm the intended sandbox with suitecloud account:setup before deployment.'
  );
}

const serverEnvPath = join(root, 'server', '.env');
const serverEnv = checkLive ? parseEnv(serverEnvPath) : null;
if (checkLive) {
  section('Local NetSuite proxy');
  if (!serverEnv) setupSuggested = true;
  const serverKeys = [
    'SUITEREACT_PROXY_TOKEN',
    'REACT_APP_NS_ACCOUNT_ID',
    'REACT_APP_NS_CONSUMER_KEY',
    'REACT_APP_NS_CONSUMER_SECRET',
    'REACT_APP_NS_TOKEN_ID',
    'REACT_APP_NS_TOKEN_SECRET',
  ];

  requireEnvKeys(serverEnv, serverKeys, 'server/.env', true);

  if (
    serverEnv?.SUITEREACT_PROXY_TOKEN &&
    serverEnv.SUITEREACT_PROXY_TOKEN.length < 24
  ) {
    fail('server/.env: SUITEREACT_PROXY_TOKEN must be at least 24 characters');
  }

  if (serverEnv?.REACT_APP_NS_ACCOUNT_ID) {
    const accountHost = serverEnv.REACT_APP_NS_ACCOUNT_ID.replace(
      '_',
      '-'
    ).toLowerCase();
    info(`RESTlet host resolves to ${accountHost}.restlets.api.netsuite.com`);
  }
}

if (checkMcp) {
  section('MCP OAuth');
  const mcpEnv = parseEnv(join(root, 'mcp', '.env'));
  if (!mcpEnv) setupSuggested = true;
  requireEnvKeys(
    mcpEnv,
    ['NETSUITE_ACCOUNT_ID', 'NETSUITE_CLIENT_ID'],
    'mcp/.env',
    true
  );
  if (mcpEnv && !mcpEnv.NETSUITE_CLIENT_SECRET) {
    info('mcp/.env uses OAuth public-client mode (no client secret).');
  }
}

if (checkBuild || checkLive || selectedApp) {
  section('Applications');
  const apps = discoverApps();
  if (apps.length === 0) fail('no apps found under apps/');
  else ok(`found ${apps.length} app(s): ${apps.join(', ')}`);
  if (selectedApp && !apps.includes(selectedApp)) {
    fail(`App not found: apps/${selectedApp}`);
  }
  const appsToCheck = selectedApp ? [selectedApp] : apps;

  for (const app of appsToCheck) {
    const appPath = join(root, 'apps', app);
    if (existsSync(join(appPath, 'example.env')))
      ok(`${app}: example.env exists`);
    else fail(`${app}: example.env is missing`);

    if (checkLive) {
      const developmentEnvPath = join(appPath, '.env.development.local');
      const developmentEnv = parseEnv(developmentEnvPath);
      if (developmentEnv) {
        ok(`${app}: .env.development.local exists`);
        if (!developmentEnv.VITE_PROXY_SERVER_TOKEN) {
          fail(`${app}: VITE_PROXY_SERVER_TOKEN is missing`);
        } else if (
          serverEnv?.SUITEREACT_PROXY_TOKEN &&
          developmentEnv.VITE_PROXY_SERVER_TOKEN !==
            serverEnv.SUITEREACT_PROXY_TOKEN
        ) {
          fail(`${app}: proxy token does not match server/.env`);
        }
      } else {
        setupSuggested = true;
        fail(
          `${app}: .env.development.local missing; run npm run setup before live development`
        );
      }

      const broadEnv = parseEnv(join(appPath, '.env'));
      if (
        broadEnv?.VITE_PROXY_SERVER_BASE_URL ||
        broadEnv?.VITE_PROXY_SERVER_TOKEN
      ) {
        fail(
          `${app}: move proxy configuration from .env to .env.development.local so production builds cannot embed it`
        );
      }
    }
  }
}

section('Summary');
if (setupSuggested) {
  info('Run npm run setup to create ignored local configuration safely.');
}
if (errors > 0) {
  fail(`${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}

if (warnings > 0) {
  ok(`Requested setup checks passed with ${warnings} warning(s)`);
} else {
  ok('All requested setup checks passed');
}
