#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const packages = [
  {
    workspace: 'suitereact',
    allowedRoots: ['dist/', 'LICENSE', 'README.md', 'package.json'],
    required: [
      'LICENSE',
      'README.md',
      'package.json',
      'dist/index.d.ts',
      'dist/index.d.cts',
      'dist/suitereact.es.js',
      'dist/suitereact.umd.cjs',
    ],
  },
  {
    workspace: 'mcp-server-netsuite',
    allowedRoots: [
      'dist/',
      'LICENSE',
      'README.md',
      'example.env',
      'package.json',
    ],
    required: [
      'LICENSE',
      'README.md',
      'package.json',
      'dist/index.js',
      'dist/server.js',
      'dist/resources/suitereact_action_docs.json',
    ],
  },
];

function isAllowed(path, allowedRoots) {
  return allowedRoots.some(root =>
    root.endsWith('/') ? path.startsWith(root) : path === root
  );
}

for (const packageConfig of packages) {
  const result = spawnSync(
    'npm',
    ['pack', '--dry-run', '--json', `--workspace=${packageConfig.workspace}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  if (result.status !== 0) process.exit(result.status || 1);

  let manifests;
  try {
    manifests = JSON.parse(result.stdout);
  } catch {
    console.error(`Invalid npm pack JSON for ${packageConfig.workspace}`);
    process.exit(1);
  }

  const manifest = manifests[0];
  if (!manifest || !Array.isArray(manifest.files)) {
    console.error(`Missing npm pack manifest for ${packageConfig.workspace}`);
    process.exit(1);
  }

  const paths = new Set(manifest.files.map(file => file.path));
  const missing = packageConfig.required.filter(path => !paths.has(path));
  const unexpected = [...paths].filter(
    path => !isAllowed(path, packageConfig.allowedRoots)
  );

  if (missing.length > 0 || unexpected.length > 0) {
    console.error(`Package contents invalid for ${packageConfig.workspace}`);
    for (const path of missing) console.error(`- missing: ${path}`);
    for (const path of unexpected) console.error(`- unexpected: ${path}`);
    process.exitCode = 1;
  } else {
    console.log(
      `${packageConfig.workspace}: ${paths.size} validated package files`
    );
  }
}
