#!/usr/bin/env node

const { copyFileSync, existsSync } = require('fs');
const { join } = require('path');

const root = process.cwd();
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('dist/ does not exist. Run npm run build:sdf first.');
  process.exit(1);
}

const overrides = [
  ['deploy.override', join('dist', 'deploy.xml')],
  ['manifest.override', join('dist', 'manifest.xml')],
];

for (const [source, target] of overrides) {
  const sourcePath = join(root, source);
  const targetPath = join(root, target);

  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, targetPath);
    console.log(`Applied ${source} -> ${target}`);
  } else {
    console.log(`No ${source}; using generated ${target}`);
  }
}
