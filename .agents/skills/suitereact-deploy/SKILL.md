---
name: suitereact-deploy
description: 'Builds, validates, and deploys SuiteReact apps and SDF objects to NetSuite. Use when the user invokes /suitereact-deploy or asks to ship apps, scripts, or objects to their NetSuite environment.'
---

# suitereact-deploy

**Usage:** `/suitereact-deploy <app-name|all> [--workflow-dir <path>]`

**Critical: Autonomous Execution** — Run the full pipeline without prompting for account URLs or confirmation. NetSuite CLI uses the existing `suitecloud` project config. Surface errors verbatim and attempt automated recovery (see Error recovery).

## Default command path

For a single app, use the repo scripts first:

```bash
npm run validate:app -- <app-name>
npm run deploy:app -- <app-name>
```

`validate:app` creates a narrow `deploy.override` when missing, builds SDF and the app bundle, rejects embedded local URLs, applies overrides, checks deploy scope, runs SuiteCloud validation, and performs a dry run. `deploy:app` runs validation first, then deploys.

Only drop to manual SuiteCloud commands when recovering from validation errors.

During a full-cycle workflow, record validation and deployment after each command:

```bash
npm run workflow -- deployment <workflow-dir> validated
npm run workflow -- deployment <workflow-dir> deployed --files <exact-deployed-files>...
```

Record `failed` on an unrecoverable error. Never skip validation for a deployment.

## Non-negotiable production environment guardrail

- Store `VITE_PROXY_SERVER_BASE_URL` and `VITE_PROXY_SERVER_TOKEN` only in `apps/<app>/.env.development.local`.
- Never put a local proxy URL in `.env`, `.env.local`, `.env.production`, or shell environment used for a production build.
- Guard direct reads with `import.meta.env.DEV` so hosted bundles omit the proxy URL even if the developer environment is misconfigured.
- Run `npm run check:production-bundle -- <app-name>` after building. `validate:app` runs this automatically and must fail if a loopback URL or the configured development proxy URL is embedded.

## Non-negotiable deployment scope guardrail

Never deploy broad shared directories for a scoped app change. This is a SOX/change-control requirement, not just a preference.

- **Forbidden in `deploy.override`:** `~/FileCabinet/SuiteScripts/sdf/*`, `~/FileCabinet/SuiteScripts/sdfTs/*`, `~/FileCabinet/SuiteScripts/sdfReact/*`, `~/FileCabinet/SuiteScripts/sdfJs/*`, or any similarly broad shared directory wildcard.
- **Allowed:** the single app wildcard, e.g. `~/FileCabinet/SuiteScripts/apps/<app-name>/*`.
- **Shared code:** include only the exact compiled `.js` files that changed or are strictly required for the change.
- **Shared objects:** include RESTlet/shared script objects only when their XML changed or when deploying the corresponding changed shared script. Do not include shared RESTlet objects for a UI-only app bundle change.
- **Generated overrides are not automatically safe.** If a helper writes a broad shared wildcard, stop, edit `deploy.override` to the narrow scope, and re-run validation before deploying.
- **Manifest dependencies are not deploy scope.** Use `manifest.override` to satisfy references; do not deploy other apps or broad shared directories just to satisfy a dependency.

## Concepts

| Term           | Meaning                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dist/`        | Build output root. `dist/FileCabinet/SuiteScripts/` holds compiled JS; `dist/Objects/` holds XML script objects. `dist/deploy.xml` and `dist/manifest.xml` control what gets deployed.                                                     |
| `deploy.xml`   | Tells SuiteCloud CLI **which** files and objects to deploy. Default (`~/FileCabinet/*` + `~/Objects/*`) deploys everything. A `deploy.override` at repo root scopes it to specific paths.                                                  |
| `manifest.xml` | Declares project metadata, required NetSuite features, and object dependencies. A `manifest.override` at repo root overrides the generated one.                                                                                            |
| Override files | `deploy.override` and `manifest.override` in repo root are **not** committed (gitignored). `validate:app` / `deploy:app` copy them into `dist/` after builds, replacing the defaults. The agent creates/updates them to scope deployments. |

## Path mapping (repo → dist → deploy.xml)

Paths in `deploy.xml` use the `~` prefix which maps to the `dist/` directory:

| Repo source                 | dist output                                               | deploy.xml path                                    |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| `apps/<name>/client/`       | `dist/FileCabinet/SuiteScripts/apps/<name>/client/`       | `~/FileCabinet/SuiteScripts/apps/<name>/*`         |
| `apps/<name>/suitelet/*.ts` | `dist/FileCabinet/SuiteScripts/apps/<name>/suitelet/*.js` | included in app wildcard above                     |
| `apps/<name>/utils/*.ts`    | `dist/FileCabinet/SuiteScripts/apps/<name>/utils/*.js`    | included in app wildcard above                     |
| `sdf/scripts/**/*.ts`       | `dist/FileCabinet/SuiteScripts/sdf/scripts/**/*.js`       | `~/FileCabinet/SuiteScripts/sdf/scripts/<path>.js` |
| `sdf/actions/**/*.ts`       | `dist/FileCabinet/SuiteScripts/sdf/actions/**/*.js`       | `~/FileCabinet/SuiteScripts/sdf/actions/*.js`      |
| `sdf/domain/**/*.ts`        | `dist/FileCabinet/SuiteScripts/sdf/domain/**/*.js`        | `~/FileCabinet/SuiteScripts/sdf/domain/<path>.js`  |
| `sdf/objects/**/*.xml`      | `dist/Objects/*.xml`                                      | `~/Objects/<filename>.xml`                         |

### Deploying an entire app

To deploy an app and all its dependencies in one `<path>`, use a wildcard:

```xml
<path>~/FileCabinet/SuiteScripts/apps/<app-name>/*</path>
```

This covers `client/`, `suitelet/`, and `utils/` subdirectories.

### Deploying shared SDF files alongside an app

Apps may depend on shared scripts (RESTlet action handler, LLM proxy, domain helpers, etc.), but scoped deploys must list only exact shared files that changed or are strictly required. Do not deploy the whole shared directory.

```xml
<path>~/FileCabinet/SuiteScripts/sdf/scripts/sr_rl_rct_action_handler.js</path>
<path>~/FileCabinet/SuiteScripts/sdf/actions/index.js</path>
```

### Deploying one action for direct testing

When iterating on `sdf/actions/<action>.ts`, follow **suitereact-test-action**. Build SDF, then deploy only the compiled action:

```xml
<deploy>
  <files>
    <path>~/FileCabinet/SuiteScripts/sdf/actions/<action>.js</path>
  </files>
</deploy>
```

Add `sdf/actions/index.js` only for a new, renamed, removed, or changed export. Add exact changed imported dependencies only when the action needs their new version. Include the action-handler script or RESTlet XML object only when that specific file changed. Validate and dry-run this override before deployment, then call the action with `npm run test:action -- <action> ...`.

## Workflow

### Step 0 — Format, Lint, and Review (MANDATORY before build)

Run prettier and eslint from the repo root on files owned by the workflow. Never format or lint-fix the whole dirty repository during a scoped deployment.

```bash
# Format exact changed source files
npx prettier --write <owned-source-files>

# Lint-fix exact changed SDF server-side files
npx eslint --fix <owned-sdf-files>

# Lint-fix app source (per-app or all apps)
npx eslint --fix 'apps/<app-name>/src/**/*.{ts,tsx}' --max-warnings 0

# Review app quality/performance basics
npm run review:app -- <app-name>
```

If eslint reports unfixable errors, resolve them before proceeding to Step 1.

### Step 1 — Build

```bash
# Single app (builds app + shared SDF)
npm run build:app <app-name>

# All apps
npm run build:all

# Full project build (format + clean dist + SDF objects + suitereact lib + all apps)
npm run build
```

`build:app` does: install deps → tsc type-check → eslint fix → vite build → copy client to dist. The root `tsc` compiles suitelet/utils TS into `dist/`.

`build:sdf` copies XML objects from `sdf/objects/` into `dist/Objects/` and compiles all SuiteScript TS.

### Step 2 — Create deploy.override (scoped deployment)

If the user wants to deploy specific apps or files (not everything), create a `deploy.override` at **repo root**:

```xml
<deploy>
  <files>
    <!-- Deploy the full app bundle -->
    <path>~/FileCabinet/SuiteScripts/apps/<app-name>/*</path>
  </files>
  <objects>
    <!-- App suitelet script object -->
    <path>~/Objects/customscript_sr_sui_<app_id>.xml</path>
    <!-- App navigation object -->
    <path>~/Objects/custcentercategory_suitereact.xml</path>
  </objects>
</deploy>
```

If shared server-side code actually changed, add only those compiled files and corresponding objects:

```xml
<deploy>
  <files>
    <!-- App client bundle (wildcard OK here — scoped to one app) -->
    <path>~/FileCabinet/SuiteScripts/apps/<app-name>/*</path>
    <!-- Only the specific shared file(s) you changed -->
    <path>~/FileCabinet/SuiteScripts/sdf/scripts/sr_rl_rct_action_handler.js</path>
    <path>~/FileCabinet/SuiteScripts/sdf/actions/index.js</path>
  </files>
  <objects>
    <path>~/Objects/customscript_sr_sui_<app_id>.xml</path>
    <!-- Include shared RESTlet/script objects only when deploying changed shared scripts. -->
    <path>~/Objects/customscript_sr_rl_rct_action_handler.xml</path>
    <path>~/Objects/custcentercategory_suitereact.xml</path>
  </objects>
</deploy>
```

**Multiple apps** — add additional `<path>` entries for each app:

```xml
<deploy>
  <files>
    <path>~/FileCabinet/SuiteScripts/apps/data-viewer/*</path>
    <path>~/FileCabinet/SuiteScripts/apps/approval-manager/*</path>
    <!-- List each specific shared file if needed — never use sdf/*, sdfTs/*, sdfReact/*, or sdfJs/* -->
    <path>~/FileCabinet/SuiteScripts/sdf/scripts/specific_script.js</path>
  </files>
  <objects>
    <path>~/Objects/customscript_sr_sui_data_viewer.xml</path>
    <path>~/Objects/customscript_sr_sui_approval_manager.xml</path>
    <path>~/Objects/customscript_sr_rl_rct_action_handler.xml</path>
    <path>~/Objects/custcentercategory_suitereact.xml</path>
  </objects>
</deploy>
```

**Deploy everything** — use wildcards (this is the default `deploy.xml`):

Use this only when the user explicitly asks to deploy everything, or when the reviewed change set intentionally includes everything. Do not use it to work around missing dependencies for a scoped app deploy.

```xml
<deploy>
  <files>
    <path>~/FileCabinet/*</path>
  </files>
  <objects>
    <path>~/Objects/*</path>
  </objects>
</deploy>
```

After creating `deploy.override`, copy it into dist:

```bash
cp deploy.override dist/deploy.xml
```

### Step 3 — Create manifest.override (if needed)

The default `manifest.xml` is usually sufficient for a first attempt. Only create `manifest.override` if validation fails with missing dependencies or features. See **Error recovery** below.

If you do need to create one, copy from `dist/manifest.xml` and add entries:

```bash
cp dist/manifest.xml manifest.override
```

Then add missing `<feature>` or `<object>` entries as needed. After editing, copy into dist:

```bash
cp manifest.override dist/manifest.xml
```

### Step 4 — Validate

```bash
npm run validate:app -- <app-name>
```

This runs the supported app-scoped validation pipeline:

1. narrow `deploy.override` creation when missing
2. SDF and app build
3. override application
4. deploy scope checks
5. `suitecloud project:adddependencies`
6. server-side validation
7. dry-run deployment

If validation passes, proceed to deploy. If it fails, see **Error recovery**.

### Step 5 — Deploy

```bash
npm run deploy:app -- <app-name>
```

This runs validate first (built into the script), then:

```bash
suitecloud project:deploy --accountspecificvalues WARNING
```

## Error recovery

### Missing object dependencies

**Symptom:** Validation output contains `The object reference [scriptid=XXXXX] is missing`.

**Fix:** Use the automated dependency resolver:

```bash
node deploy/add-missing-dependencies.js
```

This script:

1. Runs `suitecloud project:validate --server --accountspecificvalues WARNING`
2. Parses the output for missing `[scriptid=...]` references
3. Creates or updates `manifest.override` at repo root with the missing `<object>` dependencies
4. Sets `<projectname>` to the current git branch

Options:

- `--dry-run` — preview changes without writing
- `--log-file <path>` — use an existing validation log instead of re-running
- `--stdin` — pipe validation output directly

After running, copy the updated manifest into dist and re-validate:

```bash
cp manifest.override dist/manifest.xml
suitecloud project:validate --server --accountspecificvalues WARNING
```

### Missing features

**Symptom:** Validation output contains `The following features must be enabled` or `feature [FEATURE_NAME] is required`.

**Fix:** Edit `manifest.override` (create from `dist/manifest.xml` if it doesn't exist) and add the missing `<feature>` inside `<features>`:

```xml
<feature required="false">FEATURE_NAME</feature>
```

Common features for SuiteReact apps:

| Feature               | When needed                              |
| --------------------- | ---------------------------------------- |
| `SERVERSIDESCRIPTING` | Always (required for Suitelets/RESTlets) |
| `CUSTOMRECORDS`       | Custom record types                      |
| `ACCOUNTING`          | Transactions, GL                         |
| `RECEIVABLES`         | Invoices, customer payments              |
| `PAYABLES`            | Bills, vendor payments                   |
| `EXPREPORTS`          | Expense reports                          |
| `CRM`                 | Cases, campaigns, leads                  |
| `ADVRECEIVING`        | Advanced receiving                       |
| `CUSTOMTRANSACTIONS`  | Custom transaction types                 |

### File not found in FileCabinet

**Symptom:** `File [/SuiteScripts/...] was not found`.

**Fix:** Ensure the file exists in `dist/FileCabinet/SuiteScripts/` and that `deploy.xml` includes it. Rebuild if necessary.

### Script object references nonexistent file

**Symptom:** XML object references a `.js` file that doesn't exist in dist.

**Fix:** Verify the `<scriptfile>` path in the XML object matches the actual compiled output path in `dist/`. Common issue: the suitelet TS wasn't compiled — run `npm run build:sdf` from repo root.

## Iterative recovery loop

When errors occur, follow this cycle (up to 3 iterations):

1. Read the error output carefully
2. If missing dependencies → run `node deploy/add-missing-dependencies.js`
3. If missing features → edit `manifest.override`
4. Copy overrides into dist: `cp manifest.override dist/manifest.xml` and/or `cp deploy.override dist/deploy.xml`
5. Re-validate: `npm run validate:app -- <app-name>` (or the raw SuiteCloud command only when isolating a specific failure)
6. If validation passes: `npm run deploy:app -- <app-name>`

## Quick reference — common app deployments

Deploy a single UI app with only its app bundle and app objects:

```bash
npm run review:app -- data-viewer
npm run validate:app -- data-viewer
npm run deploy:app -- data-viewer
```

## `deploy-log.json` (optional artifact)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["appName", "startedAt", "steps"],
  "properties": {
    "appName": { "type": "string" },
    "startedAt": { "type": "string", "description": "ISO-8601 UTC" },
    "finishedAt": { "type": "string" },
    "success": { "type": "boolean" },
    "deployOverrideCreated": { "type": "boolean" },
    "manifestOverrideCreated": { "type": "boolean" },
    "dependencyFixIterations": { "type": "integer" },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "exitCode"],
        "properties": {
          "name": {
            "type": "string",
            "enum": [
              "build",
              "create-deploy-override",
              "validate",
              "add-dependencies",
              "deploy"
            ]
          },
          "exitCode": { "type": "integer" },
          "logExcerpt": { "type": "string" }
        }
      }
    }
  }
}
```
