#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

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

// Function to run command with proper error handling
function runCommand(command, description, options = {}) {
  try {
    log.subStep(description);
    const defaultOptions = {
      stdio: 'inherit',
      encoding: 'utf8',
    };
    const execOptions = { ...defaultOptions, ...options };

    execSync(command, execOptions);
    return true;
  } catch (error) {
    log.error(`Failed: ${description}`);
    console.error(`\n${colors.red}Command:${colors.reset} ${command}`);
    console.error(`\n${colors.red}Exit code:${colors.reset} ${error.status}`);
    throw error;
  }
}

// Function to discover all apps in the apps directory
function discoverApps() {
  const projectRoot = process.cwd();
  const appsDir = join(projectRoot, 'apps');

  if (!existsSync(appsDir)) {
    log.error('Apps directory does not exist');
    return [];
  }

  try {
    const items = readdirSync(appsDir);
    const apps = items.filter(item => {
      const itemPath = join(appsDir, item);
      const isDirectory = statSync(itemPath).isDirectory();
      const hasPackageJson = existsSync(join(itemPath, 'package.json'));
      return isDirectory && hasPackageJson;
    });

    return apps.sort(); // Sort alphabetically for consistent order
  } catch (error) {
    log.error(`Failed to read apps directory: ${error.message}`);
    return [];
  }
}

// Main execution
async function main() {
  console.log(`\n${colors.bright}🚀 SuiteReact Build All Apps${colors.reset}`);
  console.log(
    `${colors.bright}==============================${colors.reset}\n`
  );

  try {
    // Discover all apps
    log.info('Discovering apps...');
    const apps = discoverApps();

    if (apps.length === 0) {
      log.warning('No apps found in apps directory');
      process.exit(0);
    }

    log.success(`Found ${apps.length} app${apps.length === 1 ? '' : 's'}:`);
    apps.forEach(app => console.log(`  - ${app}`));
    console.log();

    const totalSteps = 4 + apps.length;
    let currentStep = 1;

    // Step 1: Clean dist directory
    log.step(currentStep++, totalSteps, 'Cleaning dist directory');
    runCommand('npm run delete:dist', 'Removing existing dist directory');

    // Step 2: Build SDF objects
    log.step(currentStep++, totalSteps, 'Building SDF objects');
    runCommand('npm run build:sdf', 'Building SuiteScript objects');

    // Step 3: Build SuiteReact library
    log.step(currentStep++, totalSteps, 'Building SuiteReact library');
    runCommand('npm run build:suitereact', 'Building component library');

    // Step 4: Build MCP server
    log.step(currentStep++, totalSteps, 'Building MCP server');
    runCommand('npm run build:mcp', 'Building MCP server');

    // Build each app
    for (const app of apps) {
      log.step(currentStep++, totalSteps, `Building app: ${app}`);
      runCommand(`npm run build:app ${app}`, `Building ${app}`);
    }

    console.log(`\n${colors.bright}✅ Build Complete${colors.reset}`);
    console.log(`${colors.bright}=================\n${colors.reset}`);
    log.success(
      `Successfully built ${apps.length} app${apps.length === 1 ? '' : 's'}`
    );
    apps.forEach(app => log.success(`✓ ${app}`));
    log.info(
      'Deployment is a separate, explicit operation: npm run deploy:app -- <app-name>'
    );
  } catch (error) {
    console.log(`\n${colors.bright}💥 Build Failed!${colors.reset}`);
    console.log(`${colors.bright}===============\n${colors.reset}`);
    log.error('Build and deploy process failed');
    log.error(`Error: ${error.message}`);

    console.log(`\n${colors.yellow}💡 Troubleshooting tips:${colors.reset}`);
    console.log('  - Check that all app dependencies are properly installed');
    console.log('  - Ensure all apps pass TypeScript compilation and linting');
    console.log('  - Verify that all app builds complete successfully');
    console.log('  - Check SDF deployment configuration');

    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  log.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
