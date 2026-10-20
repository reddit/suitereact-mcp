#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consumer = mkdtempSync(join(tmpdir(), 'suitereact-consumer-'));

function run(command, args, cwd = consumer) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`
    );
  }
  return result.stdout;
}

try {
  const [manifest] = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '--workspace=suitereact',
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        consumer,
      ],
      root
    )
  );
  const modules = join(consumer, 'node_modules');
  const installedPackage = join(modules, 'suitereact');
  mkdirSync(installedPackage, { recursive: true });
  run('tar', [
    '-xzf',
    join(consumer, manifest.filename),
    '-C',
    installedPackage,
    '--strip-components=1',
  ]);

  const packageJson = JSON.parse(
    readFileSync(join(installedPackage, 'package.json'), 'utf8')
  );
  const packedPaths = new Set(manifest.files.map(file => file.path));
  function checkExports(value) {
    if (typeof value === 'string') {
      assert.ok(
        packedPaths.has(value.replace(/^\.\//, '')),
        `Missing exported artifact: ${value}`
      );
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(checkExports);
    }
  }
  checkExports(packageJson.exports);

  // Use locked dependencies, but load SuiteReact only from its packed artifact.
  for (const name of readdirSync(join(root, 'node_modules'))) {
    if (name !== 'suitereact' && name !== '.bin') {
      symlinkSync(join(root, 'node_modules', name), join(modules, name));
    }
  }
  for (const format of ['commonjs', 'module']) {
    const source =
      format === 'commonjs'
        ? 'const { REST } = require("suitereact");'
        : 'import { REST } from "suitereact";';
    run(process.execPath, [
      '--input-type=' + format,
      '-e',
      `${source} if (typeof REST?.post !== "function") throw new Error("Missing REST.post export");`,
    ]);
  }

  writeFileSync(
    join(consumer, 'package.json'),
    '{"private":true,"type":"module"}\n'
  );
  const esSource =
    'import { REST, type NsReactActionProps } from "suitereact";\nconst action: NsReactActionProps = { action: "getUserProps" };\nvoid REST.post; void action;\n';
  const cjsSource =
    'import sr = require("suitereact");\nconst action: sr.NsReactActionProps = { action: "getUserProps" };\nvoid sr.REST.post; void action;\n';
  for (const [file, source, resolution, module] of [
    ['consumer.mts', esSource, 'NodeNext', 'NodeNext'],
    ['consumer.cts', cjsSource, 'NodeNext', 'NodeNext'],
    ['consumer.ts', esSource, 'Bundler', 'ESNext'],
  ]) {
    writeFileSync(join(consumer, file), source);
    run(process.execPath, [
      join(root, 'node_modules/typescript/bin/tsc'),
      file,
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      module,
      '--moduleResolution',
      resolution,
    ]);
  }
  assert.ok(manifest.files.some(file => file.path === 'dist/index.d.cts'));
  console.log(
    'SuiteReact packed consumers passed: CommonJS, ESM, NodeNext (CJS/ESM), and Bundler types'
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
