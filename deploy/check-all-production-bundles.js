#!/usr/bin/env node

const { execFileSync } = require('child_process');
const { readdirSync, statSync, existsSync } = require('fs');
const { join } = require('path');

const root = process.cwd();
const appsRoot = join(root, 'apps');
const apps = readdirSync(appsRoot)
  .filter(name => {
    const directory = join(appsRoot, name);
    return (
      statSync(directory).isDirectory() &&
      existsSync(join(directory, 'package.json'))
    );
  })
  .sort();

for (const app of apps) {
  execFileSync(
    process.execPath,
    [join(root, 'deploy', 'check-production-bundle.js'), app],
    { cwd: root, stdio: 'inherit' }
  );
}
