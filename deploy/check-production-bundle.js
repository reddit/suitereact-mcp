#!/usr/bin/env node

const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const { join, relative, resolve, sep } = require('path');

const appName = process.argv[2];
const root = process.cwd();

if (!appName) {
  console.error('Usage: node deploy/check-production-bundle.js <app-name>');
  process.exit(1);
}

const bundleRootFlag = process.argv.indexOf('--bundle-root');
const configuredBundleRoot =
  bundleRootFlag >= 0 ? process.argv[bundleRootFlag + 1] : undefined;
if (bundleRootFlag >= 0 && !configuredBundleRoot) {
  console.error('--bundle-root requires a path');
  process.exit(1);
}
const bundleRoot = configuredBundleRoot
  ? resolve(root, configuredBundleRoot)
  : join(
      root,
      'dist',
      'FileCabinet',
      'SuiteScripts',
      'apps',
      appName,
      'client'
    );
const relativeBundleRoot = relative(root, bundleRoot);
if (relativeBundleRoot === '..' || relativeBundleRoot.startsWith(`..${sep}`)) {
  console.error('Bundle root must remain inside the repository');
  process.exit(1);
}

if (!existsSync(bundleRoot)) {
  console.error(`Production bundle not found: ${relative(root, bundleRoot)}`);
  process.exit(1);
}

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const loopbackUrl =
  /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?):\d+/gi;
const findings = [];
const developmentProxyUrls = new Set();
const developmentProxyTokens = new Set();

function readProxyUrl(envPath) {
  if (!existsSync(envPath)) return undefined;

  const match = readFileSync(envPath, 'utf8').match(
    /^\s*VITE_PROXY_SERVER_BASE_URL\s*=\s*['"]?([^\s'"#]+)['"]?\s*(?:#.*)?$/m
  );
  return match?.[1];
}

function readProxyToken(envPath) {
  if (!existsSync(envPath)) return undefined;
  const match = readFileSync(envPath, 'utf8').match(
    /^\s*VITE_PROXY_SERVER_TOKEN\s*=\s*['"]?([^\s'"#]+)['"]?\s*(?:#.*)?$/m
  );
  return match?.[1];
}

for (const envName of ['.env.development', '.env.development.local']) {
  const proxyUrl = readProxyUrl(join(root, 'apps', appName, envName));
  if (proxyUrl) developmentProxyUrls.add(proxyUrl);
  const proxyToken = readProxyToken(join(root, 'apps', appName, envName));
  if (proxyToken) developmentProxyTokens.add(proxyToken);
}

for (const envName of [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
]) {
  const envPath = join(root, 'apps', appName, envName);
  if (
    existsSync(envPath) &&
    /^\s*VITE_PROXY_SERVER_(?:BASE_URL|TOKEN)\s*=/m.test(
      readFileSync(envPath, 'utf8')
    )
  ) {
    findings.push({
      file: relative(root, envPath),
      urls: ['VITE_PROXY_SERVER_BASE_URL is production-visible'],
    });
  }
}

if (process.env.VITE_PROXY_SERVER_BASE_URL) {
  findings.push({
    file: 'build environment',
    urls: ['VITE_PROXY_SERVER_BASE_URL is set'],
  });
}
if (process.env.VITE_PROXY_SERVER_TOKEN) {
  findings.push({
    file: 'build environment',
    urls: ['VITE_PROXY_SERVER_TOKEN is set'],
  });
}

for (const file of walk(bundleRoot)) {
  if (!/\.(?:css|html|js|json|map|txt)$/i.test(file)) continue;

  const content = readFileSync(file, 'utf8');
  const matches = Array.from(content.matchAll(loopbackUrl), match => match[0]);
  for (const proxyUrl of developmentProxyUrls) {
    if (content.includes(proxyUrl)) matches.push(proxyUrl);
  }
  for (const proxyToken of developmentProxyTokens) {
    if (content.includes(proxyToken)) matches.push('development proxy token');
  }
  if (matches.length > 0) {
    findings.push({
      file: relative(root, file),
      urls: [...new Set(matches)],
    });
  }
}

if (findings.length > 0) {
  console.error(`Production bundle check failed for ${appName}:`);
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.urls.join(', ')}`);
  }
  console.error(
    'Keep VITE_PROXY_SERVER_BASE_URL and VITE_PROXY_SERVER_TOKEN in .env.development.local, never .env or a production env file. Guard direct reads with import.meta.env.DEV.'
  );
  process.exit(1);
}

console.log(`Production bundle OK for ${appName}: no local proxy URLs found`);
