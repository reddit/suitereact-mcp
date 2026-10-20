#!/usr/bin/env node
/**
 * add-missing-dependencies.js
 *
 * Runs `suitecloud project:validate --server --accountspecificvalues WARNING` with logging,
 * parses the output for missing dependencies, and creates/updates manifest.override.
 *
 * Logic:
 *   - If manifest.override exists in project root → update it with new dependencies
 *   - If it doesn't exist → copy dist/manifest.xml to project root as manifest.override,
 *     then add the missing dependencies to this new file
 *
 * Usage:
 *   node sdfDeploy/add-missing-dependencies.js [options]
 *   cat validate-output.txt | node sdfDeploy/add-missing-dependencies.js --stdin
 *
 * Options:
 *   --dry-run    Print what would be added without modifying files
 *   --log-file   Path to existing validate log (skips running validate command)
 *   --stdin      Read validation output from stdin (for pasted terminal output)
 *   --help       Show this help message
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const useStdin = args.includes('--stdin');
const showHelp = args.includes('--help') || args.includes('-h');
const logFileArgIndex = args.indexOf('--log-file');
const providedLogFile =
  logFileArgIndex !== -1 ? args[logFileArgIndex + 1] : null;

// Show help
if (showHelp) {
  console.log(`
Add Missing Dependencies Utility

Runs 'suitecloud project:validate --server --accountspecificvalues WARNING' with logging,
parses the output for missing dependencies, and creates/updates manifest.override.

Logic:
  - If manifest.override exists in project root → update it with new dependencies
  - If it doesn't exist → copy dist/manifest.xml to project root as manifest.override,
    then add the missing dependencies to this new file
  - Sets the <projectname> to the current git branch name (XML-escaped)

Usage:
  npm run override:dependencies [-- options]
  node sdfDeploy/add-missing-dependencies.js [options]

Options:
  --dry-run      Print what would be added without modifying files
  --log-file     Path to existing validate log (skips running validate command)
  --stdin        Read validation output from stdin (for pasted terminal output)
  --help, -h     Show this help message

Examples:
  # Run validation and auto-add dependencies
  npm run override:dependencies

  # Preview changes without modifying files
  npm run override:dependencies:dry

  # Use existing log file
  node sdfDeploy/add-missing-dependencies.js --log-file ./my-validate-log.txt

  # Pipe terminal output
  suitecloud project:validate 2>&1 | node sdfDeploy/add-missing-dependencies.js --stdin
`);
  process.exit(0);
}

// Paths
const projectRoot = path.resolve(__dirname, '..');
const distManifestPath = path.join(projectRoot, 'dist', 'manifest.xml');
const manifestOverridePath = path.join(projectRoot, 'manifest.override');
const validateLogPath =
  providedLogFile || path.join(projectRoot, 'validate-log.txt');

/**
 * Gets the current git branch name
 * @returns {string} Branch name or 'unknown' if not in a git repo
 */
function getCurrentBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return branch;
  } catch (error) {
    console.warn('Warning: Could not determine git branch');
    return 'unknown';
  }
}

/**
 * Escapes special XML characters in a string
 * @param {string} str String to escape
 * @returns {string} XML-safe string
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Updates the projectname element in manifest content
 * @param {string} manifestContent Manifest XML content
 * @param {string} projectName New project name value
 * @returns {string} Updated manifest content
 */
function updateProjectName(manifestContent, projectName) {
  const xmlSafeName = escapeXml(projectName);
  const pattern = /<projectname>[^<]*<\/projectname>/;

  if (pattern.test(manifestContent)) {
    return manifestContent.replace(
      pattern,
      `<projectname>${xmlSafeName}</projectname>`
    );
  }

  console.warn('Warning: Could not find <projectname> element in manifest');
  return manifestContent;
}

/**
 * Runs the suitecloud project:validate command with logging
 */
function runValidate() {
  console.log(
    'Running suitecloud project:validate --server --accountspecificvalues WARNING...\n'
  );

  try {
    // Run validate with server validation and log output
    execSync(
      `suitecloud project:validate --server --accountspecificvalues WARNING --log "${validateLogPath}"`,
      {
        cwd: projectRoot,
        stdio: 'inherit',
        encoding: 'utf8',
      }
    );
  } catch (error) {
    // Validation often exits with non-zero when there are missing dependencies
    // That's expected - we'll parse the log for those
    console.log(
      '\nValidation completed (with errors - this is expected if there are missing dependencies)'
    );
  }
}

/**
 * Parses the validate log file for missing dependency references
 * @returns {Set<string>} Set of missing scriptids
 */
function parseMissingDependencies(logContent) {
  const missingDeps = new Set();

  // Pattern to match: "The object reference [scriptid=XXXXX] is missing"
  const pattern = /The object reference \[scriptid=([^\]]+)\] is missing/g;

  let match;
  while ((match = pattern.exec(logContent)) !== null) {
    const scriptId = match[1].trim();
    missingDeps.add(scriptId);
  }

  return missingDeps;
}

/**
 * Reads and parses the manifest XML file
 * @param {string} filePath Path to manifest file
 * @returns {string} File content
 */
function readManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Manifest file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Extracts existing object dependencies from manifest XML
 * @param {string} manifestContent Manifest XML content
 * @returns {Set<string>} Set of existing object scriptids
 */
function getExistingDependencies(manifestContent) {
  const existing = new Set();

  // Match <object>scriptid</object> patterns
  const pattern = /<object>([^<]+)<\/object>/g;

  let match;
  while ((match = pattern.exec(manifestContent)) !== null) {
    existing.add(match[1].trim());
  }

  return existing;
}

/**
 * Updates manifest content with new dependencies
 * @param {string} manifestContent Original manifest content
 * @param {Set<string>} newDeps New dependencies to add
 * @returns {string} Updated manifest content
 */
function updateManifestWithDependencies(manifestContent, newDeps) {
  const existingDeps = getExistingDependencies(manifestContent);

  // Filter out duplicates
  const depsToAdd = [...newDeps].filter(dep => !existingDeps.has(dep)).sort();

  if (depsToAdd.length === 0) {
    console.log('No new dependencies to add (all are already present)');
    return manifestContent;
  }

  console.log(`\nAdding ${depsToAdd.length} new dependencies:`);
  depsToAdd.forEach(dep => console.log(`  - ${dep}`));

  // Build the new object entries
  const newObjectEntries = depsToAdd
    .map(dep => `      <object>${dep}</object>`)
    .join('\n');

  // Check if <objects> section exists
  if (manifestContent.includes('</objects>')) {
    // Add before closing </objects> tag
    return manifestContent.replace(
      '</objects>',
      `${newObjectEntries}\n    </objects>`
    );
  } else if (manifestContent.includes('</dependencies>')) {
    // No objects section exists, create one before </dependencies>
    const objectsSection = `    <objects>\n${newObjectEntries}\n    </objects>\n  `;
    return manifestContent.replace(
      '</dependencies>',
      `${objectsSection}</dependencies>`
    );
  } else {
    throw new Error(
      'Could not find appropriate location to insert dependencies in manifest'
    );
  }
}

/**
 * Reads all input from stdin
 * @returns {Promise<string>} stdin content
 */
function readStdin() {
  return new Promise(resolve => {
    let data = '';

    // Check if stdin is being piped
    if (process.stdin.isTTY) {
      console.log('Paste validation output below (press Ctrl+D when done):');
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => resolve(data));
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Add Missing Dependencies Utility ===\n');

  let logContent = '';
  let cleanupLog = false;

  // Step 1: Get validation output
  if (useStdin) {
    // Read from stdin
    console.log('Reading from stdin...');
    logContent = await readStdin();
  } else if (providedLogFile) {
    // Read from provided log file
    if (!fs.existsSync(providedLogFile)) {
      console.error(`Error: Log file not found at ${providedLogFile}`);
      process.exit(1);
    }
    logContent = fs.readFileSync(providedLogFile, 'utf8');
  } else {
    // Run validate command
    runValidate();
    cleanupLog = true;

    if (!fs.existsSync(validateLogPath)) {
      console.error(`Error: Log file not found at ${validateLogPath}`);
      console.log(
        'Make sure the validate command ran successfully or provide a log file with --log-file'
      );
      process.exit(1);
    }
    logContent = fs.readFileSync(validateLogPath, 'utf8');
  }

  // Step 2: Parse for missing dependencies
  const missingDeps = parseMissingDependencies(logContent);

  if (missingDeps.size === 0) {
    console.log('\nNo missing dependencies found in the validation log.');

    // Clean up log file if we created it
    if (cleanupLog && fs.existsSync(validateLogPath)) {
      fs.unlinkSync(validateLogPath);
    }
    return;
  }

  console.log(`\nFound ${missingDeps.size} unique missing dependencies:`);
  [...missingDeps].sort().forEach(dep => console.log(`  • ${dep}`));

  // Step 3: Get or create manifest.override
  let manifestContent;
  let createdNewOverride = false;

  if (fs.existsSync(manifestOverridePath)) {
    // manifest.override exists - use it
    console.log(`\nUsing existing manifest.override`);
    manifestContent = readManifest(manifestOverridePath);
  } else {
    // manifest.override doesn't exist - copy from dist/manifest.xml
    if (!fs.existsSync(distManifestPath)) {
      console.error(
        `\nError: dist/manifest.xml not found at ${distManifestPath}`
      );
      console.log(
        'Make sure to run a build first (npm run build:local) to generate the dist directory.'
      );
      process.exit(1);
    }

    console.log(`\nNo manifest.override found. Copying from dist/manifest.xml`);
    manifestContent = readManifest(distManifestPath);
    createdNewOverride = true;
  }

  const existingDeps = getExistingDependencies(manifestContent);
  console.log(`Existing dependencies in manifest: ${existingDeps.size}`);

  // Step 4: Update manifest with new dependencies
  let updatedManifest = updateManifestWithDependencies(
    manifestContent,
    missingDeps
  );

  // Step 5: Update projectname with current branch
  const branchName = getCurrentBranch();
  console.log(`\nSetting projectname to branch: ${branchName}`);
  updatedManifest = updateProjectName(updatedManifest, branchName);

  // Step 6: Write to manifest.override
  if (dryRun) {
    const action = createdNewOverride ? 'create' : 'update';
    console.log(
      `\n[DRY RUN] Would ${action} manifest.override with the following content:\n`
    );
    console.log(updatedManifest);
  } else {
    fs.writeFileSync(manifestOverridePath, updatedManifest, 'utf8');
    const action = createdNewOverride ? 'Created' : 'Updated';
    console.log(`\n✓ ${action} manifest.override`);

    // Show summary
    const finalDeps = getExistingDependencies(updatedManifest);
    console.log(`  Total dependencies: ${finalDeps.size}`);
    console.log(
      `  New dependencies added: ${finalDeps.size - existingDeps.size}`
    );
  }

  // Clean up log file if we created it
  if (cleanupLog && fs.existsSync(validateLogPath)) {
    fs.unlinkSync(validateLogPath);
    console.log('  Cleaned up temporary log file');
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
