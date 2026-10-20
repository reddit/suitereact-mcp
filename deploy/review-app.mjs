#!/usr/bin/env node

import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative } from 'path';

const args = process.argv.slice(2);
const appName = args.find(arg => !arg.startsWith('--'));
const strict = args.includes('--strict');
const json = args.includes('--json');
const live = args.includes('--live');
const docsRequired = args.includes('--docs-required');

function usage() {
  console.error(
    'Usage: npm run review:app -- <app-name> [--strict] [--live] [--docs-required] [--json]'
  );
}

if (!appName) {
  usage();
  process.exit(1);
}

const repoRoot = process.cwd();
const appDir = join(repoRoot, 'apps', appName);
const findings = [];

function addFinding(severity, message, file, detail) {
  findings.push({
    severity,
    message,
    file: file ? relative(repoRoot, file) : undefined,
    detail,
  });
}

async function readText(file) {
  return readFile(file, 'utf8');
}

async function readJson(file) {
  return JSON.parse(await readText(file));
}

async function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const files = [];

  for (const entry of entries) {
    if (
      entry === 'node_modules' ||
      entry === 'client' ||
      entry === 'dist' ||
      entry.startsWith('.')
    ) {
      continue;
    }

    const path = join(dir, entry);
    const pathStat = await stat(path);

    if (pathStat.isDirectory()) {
      files.push(...(await walk(path, extensions)));
    } else if (extensions.some(ext => path.endsWith(ext))) {
      files.push(path);
    }
  }

  return files;
}

function checkRequiredFile(path, message) {
  if (!existsSync(path)) {
    addFinding('error', message, path);
  }
}

function scanSourceFile(file, content) {
  const legacyPatterns = [
    {
      regex: /NsReact(Field|FormGrid|FormGridRow|FormGridElementProps)/,
      message: 'Legacy grid/form components found',
      detail:
        'New apps should use freeform React + MUI controls instead of grid-schema fields.',
    },
    {
      regex: /\bpageSchema\b/,
      message: 'Legacy pageSchema pattern found',
      detail:
        'New SuiteReact apps should compose normal React components, not page schema arrays.',
    },
    {
      regex: /validate_suitereact_page/,
      message: 'Deprecated page validator referenced',
      detail:
        'validate_suitereact_page is migration guidance only and should not gate new apps.',
    },
  ];

  for (const pattern of legacyPatterns) {
    if (pattern.regex.test(content)) {
      addFinding('error', pattern.message, file, pattern.detail);
    }
  }

  if (/getElementValue\s*\(/.test(content)) {
    addFinding(
      'warning',
      'Legacy element-array helper found',
      file,
      'Use typed request DTOs for new apps; keep getElementValue only for maintaining old grid-schema apps.'
    );
  }

  if (/from ['"]jszip['"]|new JSZip\s*\(|import\s+JSZip/.test(content)) {
    addFinding(
      'warning',
      'JSZip usage found',
      file,
      'For large client-side exports, prefer @zip.js/zip.js with BlobReader/BlobWriter to avoid main-thread base64 inflation.'
    );
  }

  if (/\batob\s*\(/.test(content) || /\bbtoa\s*\(/.test(content)) {
    addFinding(
      'warning',
      'Manual base64 conversion found',
      file,
      'Avoid atob/btoa loops for PDFs/files; convert data URLs to Blob/ArrayBuffer and stream zip output where possible.'
    );
  }

  const lower = content.toLowerCase();
  if (
    lower.includes('base64') &&
    (lower.includes('pdf') || lower.includes('zip') || lower.includes('file'))
  ) {
    addFinding(
      'warning',
      'Base64 file payload path found',
      file,
      'Review payload size and conversion cost. Prefer File Cabinet URLs/file IDs, Blob responses, or chunked/batched generation for large exports.'
    );
  }

  if (/Promise\.all\s*\([^)]*\.map\s*\(/s.test(content)) {
    addFinding(
      'warning',
      'Potential unbounded parallel work found',
      file,
      'For NetSuite calls or PDF rendering, cap concurrency and show progress instead of launching every item at once.'
    );
  }

  if (
    /localStorage\./.test(content) &&
    /(rows|data|pdf|zip|file)/i.test(content)
  ) {
    addFinding(
      'warning',
      'Potential large data stored in localStorage',
      file,
      'Avoid persisting large result sets or file payloads in browser storage.'
    );
  }
}

async function run() {
  if (!existsSync(appDir)) {
    addFinding('error', `App directory not found: apps/${appName}`, appDir);
  } else {
    checkRequiredFile(join(appDir, 'package.json'), 'Missing app package.json');
    checkRequiredFile(join(appDir, 'index.html'), 'Missing app index.html');
    checkRequiredFile(join(appDir, 'src/main.tsx'), 'Missing src/main.tsx');
    checkRequiredFile(
      join(appDir, 'src/App/App.tsx'),
      'Missing src/App/App.tsx'
    );
    checkRequiredFile(
      join(appDir, 'src/domain/types.ts'),
      'Missing src/domain/types.ts'
    );
    checkRequiredFile(join(appDir, 'example.env'), 'Missing example.env');

    if (live && !existsSync(join(appDir, '.env.development.local'))) {
      addFinding(
        'warning',
        'Missing local development env',
        join(appDir, '.env.development.local'),
        'Create .env.development.local from example.env when live local RESTlet testing is needed.'
      );
    }

    if (existsSync(join(appDir, '.env'))) {
      const broadEnv = await readText(join(appDir, '.env'));
      if (broadEnv.includes('VITE_PROXY_SERVER_BASE_URL')) {
        addFinding(
          'error',
          'Local proxy URL is configured for production builds',
          join(appDir, '.env'),
          'Move VITE_PROXY_SERVER_BASE_URL to .env.development.local.'
        );
      }
    }

    if (docsRequired && !existsSync(join(appDir, 'README.md'))) {
      addFinding(
        'warning',
        'Missing app README.md',
        join(appDir, 'README.md'),
        'Document purpose, setup, NetSuite actions, testing, and deployment notes.'
      );
    }

    if (docsRequired && !existsSync(join(appDir, 'CHANGELOG.md'))) {
      addFinding(
        'warning',
        'Missing app CHANGELOG.md',
        join(appDir, 'CHANGELOG.md'),
        'Track user-facing changes by date so app behavior is reviewable.'
      );
    }

    if (existsSync(join(appDir, 'package.json'))) {
      try {
        const packageJson = await readJson(join(appDir, 'package.json'));
        for (const script of ['build', 'lint']) {
          if (!packageJson.scripts?.[script]) {
            addFinding(
              'warning',
              `Missing package script: ${script}`,
              join(appDir, 'package.json')
            );
          }
        }
      } catch (error) {
        addFinding(
          'error',
          'Could not parse app package.json',
          join(appDir, 'package.json'),
          String(error)
        );
      }
    }

    if (existsSync(join(appDir, 'example.env'))) {
      const envExample = await readText(join(appDir, 'example.env'));
      if (
        !envExample.includes('VITE_PROXY_SERVER_BASE_URL=http://localhost:3001')
      ) {
        addFinding(
          'warning',
          'example.env does not define the local proxy URL',
          join(appDir, 'example.env')
        );
      }
    }

    const sourceFiles = await walk(join(appDir, 'src'), ['.ts', '.tsx']);
    let hasServerCall = false;
    let hasToast = false;

    for (const file of sourceFiles) {
      const content = await readText(file);
      scanSourceFile(file, content);
      hasServerCall =
        hasServerCall ||
        /REST\.(post|get|put|delete)\s*\(|handleRestletAction\s*\(/.test(
          content
        );
      hasToast =
        hasToast || /toastService|useToastHelpers|ToastProvider/.test(content);
    }

    if (!hasServerCall) {
      addFinding(
        'info',
        'No SuiteReact REST call found in app source',
        join(appDir, 'src'),
        'This is fine for UI-only apps. Data apps should use handleRestletAction through typed client actions; reserve REST.post for hosted-only clients.'
      );
    }

    if (!hasToast) {
      addFinding(
        'info',
        'No toast feedback found in app source',
        join(appDir, 'src'),
        'For actions that take more than a moment, use ToastProvider/useToastHelpers or another visible status pattern.'
      );
    }
  }

  const counts = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 }
  );

  const passed = counts.error === 0 && (!strict || counts.warning === 0);
  const result = {
    appName,
    reviewedAt: new Date().toISOString(),
    strict,
    live,
    docsRequired,
    passed,
    counts,
    findings,
  };

  await mkdir(join(repoRoot, '.suitereact-testing', 'reviews'), {
    recursive: true,
  });
  const resultPath = join(
    repoRoot,
    '.suitereact-testing',
    'reviews',
    `${appName}-review.json`
  );
  await writeFile(resultPath, JSON.stringify(result, null, 2));

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`SuiteReact app review: ${appName}`);
    console.log(
      `Result: ${passed ? 'passed' : 'failed'} (${counts.error} errors, ${counts.warning} warnings, ${counts.info} info)`
    );
    console.log(`Results: ${relative(repoRoot, resultPath)}`);

    for (const severity of ['error', 'warning', 'info']) {
      const items = findings.filter(finding => finding.severity === severity);
      if (items.length === 0) continue;

      console.log(`\n${severity.toUpperCase()}`);
      for (const finding of items) {
        const location = finding.file ? ` [${finding.file}]` : '';
        console.log(`- ${finding.message}${location}`);
        if (finding.detail) console.log(`  ${finding.detail}`);
      }
    }

    console.log('\nRecommended verification:');
    console.log(`- npm run build:app ${appName}`);
    console.log(`- npm run dev -- ${appName}`);
    console.log(`- npm run test:app -- ${appName} --url <reported-vite-url>`);
    console.log(`- npm run dev:stop -- ${appName}`);
  }

  process.exit(passed ? 0 : 1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
