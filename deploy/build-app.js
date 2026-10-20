#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync, rmSync, cpSync } = require('fs');
const { join, resolve } = require('path');

// ANSI color codes for better console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Helper functions for formatted output
const log = {
  info: msg => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: msg => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: msg => console.error(`${colors.red}❌${colors.reset} ${msg}`),
  warning: msg => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  step: (step, total, msg) =>
    console.log(
      `${colors.cyan}[${step}/${total}]${colors.reset} ${colors.bright}${msg}${colors.reset}`
    ),
  subStep: msg => console.log(`  ${colors.magenta}→${colors.reset} ${msg}`),
};

// Get app name from command line arguments
const appName = process.argv[2];

if (!appName) {
  log.error('App name is required');
  console.log('Usage: npm run build:app <app-name>');
  console.log('Example: npm run build:app demo-app');
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(appName)) {
  log.error(
    'App name may contain only lowercase letters, numbers, and hyphens'
  );
  process.exit(1);
}

// Define paths
const projectRoot = process.cwd();
const appPath = join(projectRoot, 'apps', appName);
const targetPath = join(
  projectRoot,
  'dist',
  'FileCabinet',
  'SuiteScripts',
  'apps',
  appName,
  'client'
);

console.log(`\n${colors.bright}🚀 SuiteReact App Build Process${colors.reset}`);
console.log(
  `${colors.bright}================================${colors.reset}\n`
);

log.info(`Building app: ${colors.bright}${appName}${colors.reset}`);
log.info(`App path: ${appPath}`);
log.info(`Target path: ${targetPath}\n`);

// Check if app directory exists
if (!existsSync(appPath)) {
  log.error(`App directory does not exist: ${appPath}`);
  log.info('Available apps:');
  try {
    const apps = execSync('ls apps', { encoding: 'utf8' }).trim().split('\n');
    apps.forEach(app => console.log(`  - ${app}`));
  } catch (error) {
    console.log('  No apps found in apps directory');
  }
  process.exit(1);
}

// Function to run command with proper error handling
function runCommand(command, description, cwd = null) {
  try {
    log.subStep(description);
    const options = {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    };
    if (cwd) options.cwd = cwd;

    const result = execSync(command, options);

    // Show abbreviated output for successful commands
    if (result && result.trim()) {
      const lines = result.trim().split('\n');
      if (lines.length > 5) {
        console.log(`    ${lines[0]}`);
        console.log(`    ... (${lines.length - 2} more lines)`);
        console.log(`    ${lines[lines.length - 1]}`);
      } else {
        lines.forEach(line => console.log(`    ${line}`));
      }
    }

    return result;
  } catch (error) {
    log.error(`Failed: ${description}`);
    console.error(`\n${colors.red}Command:${colors.reset} ${command}`);

    if (error.stdout) {
      console.error(`\n${colors.yellow}STDOUT:${colors.reset}`);
      console.error(error.stdout.toString());
    }

    if (error.stderr) {
      console.error(`\n${colors.red}STDERR:${colors.reset}`);
      console.error(error.stderr.toString());
    }

    console.error(`\n${colors.red}Exit code:${colors.reset} ${error.status}`);
    throw error;
  }
}

try {
  const totalSteps = 6;
  let currentStep = 1;

  // Step 1: Navigate to app directory
  log.step(currentStep++, totalSteps, 'Preparing app directory');
  process.chdir(appPath);
  log.subStep(`Changed to directory: ${appPath}`);

  // Step 2: Ensure the shared package has been built before consumers typecheck.
  log.step(currentStep++, totalSteps, 'Preparing shared SuiteReact package');
  const suiteReactTypes = join(projectRoot, 'suitereact', 'dist', 'index.d.ts');
  if (!existsSync(suiteReactTypes)) {
    runCommand(
      'npm run build:suitereact',
      'Building the shared SuiteReact package',
      projectRoot
    );
  } else {
    log.subStep('Shared SuiteReact package is already built');
  }

  // Step 3: Run TypeScript compilation
  log.step(currentStep++, totalSteps, 'Running TypeScript compilation');
  runCommand('npx tsc --noEmit', 'Type checking with TypeScript');

  // Step 4: Run linting
  log.step(currentStep++, totalSteps, 'Running code quality checks');

  try {
    // Run linting from project root to use universal config
    runCommand(
      `eslint 'apps/${appName}/src/**/*.{ts,tsx}' --max-warnings 0`,
      'Running ESLint from project root',
      projectRoot
    );
  } catch (lintError) {
    log.warning(
      'ESLint found issues that could not be auto-fixed. Please review and fix manually.'
    );
    throw lintError;
  }

  // Step 5: Build the app
  log.step(currentStep++, totalSteps, 'Building application');
  runCommand('npx vite build', 'Running Vite build');

  const clientPath = join(appPath, 'client');
  if (!existsSync(clientPath)) {
    log.error(`Client directory not found after build: ${clientPath}`);
    log.error('Make sure the build process creates a "client" directory');
    process.exit(1);
  }

  runCommand(
    `node deploy/check-production-bundle.js ${appName} --bundle-root apps/${appName}/client`,
    'Checking the production bundle before copying artifacts',
    projectRoot
  );

  // Step 6: Deploy to target directory
  log.step(currentStep++, totalSteps, 'Deploying build artifacts');

  // Create target directory if it doesn't exist
  const targetDir = resolve(targetPath);
  if (existsSync(targetDir)) {
    log.subStep('Removing existing target directory');
    rmSync(targetDir, { recursive: true, force: true });
  }

  // Copy client directory to target
  log.subStep('Copying client directory to target');
  cpSync(clientPath, targetDir, { recursive: true });

  console.log(`\n${colors.bright}🎉 Build Complete!${colors.reset}`);
  console.log(`${colors.bright}=================\n${colors.reset}`);
  log.success(`Successfully built ${colors.bright}${appName}${colors.reset}`);
  log.success(`Deployed to: ${colors.bright}${targetPath}${colors.reset}`);
} catch (error) {
  console.log(`\n${colors.bright}💥 Build Failed!${colors.reset}`);
  console.log(`${colors.bright}===============\n${colors.reset}`);
  log.error(
    `Build process failed for app: ${colors.bright}${appName}${colors.reset}`
  );
  log.error(`Error: ${error.message}`);
  console.log(`\n${colors.yellow}💡 Troubleshooting tips:${colors.reset}`);
  console.log('  - Check that all dependencies are properly installed');
  console.log('  - Ensure TypeScript compilation passes without errors');
  console.log('  - Verify that ESLint rules are satisfied');
  console.log('  - Make sure the Vite build completes successfully');
  process.exit(1);
}
