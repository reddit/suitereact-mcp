---
name: suitereact-test-action
description: 'Builds, narrowly deploys, and calls SuiteReact server actions through the action-handler RESTlet without opening an app UI, then captures timing and raw responses for rapid refinement. Use when the user invokes /suitereact-test-action, asks to test or debug an sdf/actions function directly, or wants to verify a RESTlet action independently of browser testing.'
---

# suitereact-test-action

**Usage:** `/suitereact-test-action <action-name> [--data <json> | --data-file <path>] [--workflow-dir <path>] [--no-deploy]`

**Critical: Test the intended code** - When local files for the target action have changed, build, validate, and narrowly deploy those files before calling the RESTlet. Without a deployment, the command tests only the version already in NetSuite. Never report stale deployed code as validation of local changes.

## Safety and scope

- Read `server/.env` only through existing commands. Never print, copy, edit, or expose its values.
- Run `npm run doctor -- --live` to validate proxy configuration and identify the account. The first RESTlet call is the credential check.
- Read-only actions may be called and retried autonomously.
- For mutating actions, require a user-named target environment and known payload. The request authorizes one invocation. Retry only when the action is known to be idempotent or the user explicitly authorizes another mutation.
- Never use guessed internal IDs for mutations.
- Preserve unrelated worktree changes. Do not deploy a changed shared file merely because it is dirty.
- Never deploy a broad shared wildcard such as `sdf/*`, `sdfTs/*`, `sdfReact/*`, or `sdfJs/*`.

## Workflow

1. Inspect `sdf/actions/<action>.ts`, its imports, and its client caller when one exists. Confirm the function is exported from `sdf/actions/index.ts`.
2. Derive the smallest valid JSON payload from the TypeScript signature. Store reusable or complex payloads at `.suitereact-testing/action-payloads/<action>.json`; this directory is gitignored.
3. Check whether the target action or any required local dependency differs from the deployed baseline:

```bash
git status --short -- sdf/actions/<action>.ts sdf/actions/index.ts sdf/domain sdf/scripts/sr_rl_rct_action_handler.ts
git diff -- sdf/actions/<action>.ts sdf/actions/index.ts
```

4. Unless `--no-deploy` was requested, deploy local changes using the exact-file procedure below.
5. Start `npm run server` from the repo root if port 3001 is not listening. Wait for `Proxy server listening on port 3001`.
6. Call the action directly:

```bash
npm run test:action -- <action-name> --data-file .suitereact-testing/action-payloads/<action-name>.json
```

Pass `--workflow-dir <path>` during a full-cycle run so the command records canonical `direct_action` evidence for later live UI testing.

For a small payload:

```bash
npm run test:action -- <action-name> --data '{"key":"value"}'
```

Actions without input use `{}` automatically:

```bash
npm run test:action -- getUserProps
```

7. Read the full result under `.suitereact-testing/action-results/`. Terminal output intentionally truncates large strings and arrays.
8. For read-only actions, fix and repeat up to three times. For mutations, inspect NetSuite state after every call before considering another invocation.

## Exact-file deployment

Use this procedure only for files required by the target action.

1. Format, lint, type-check, and compile:

```bash
npx prettier --write sdf/actions/<action>.ts
npx eslint --fix sdf/actions/<action>.ts
npx tsc --noEmit
npm run build:sdf
```

2. Build `deploy.override` at the repo root with the smallest valid scope:

```xml
<deploy>
  <files>
    <path>~/FileCabinet/SuiteScripts/sdf/actions/<action>.js</path>
  </files>
</deploy>
```

Add exact paths only when required:

- Add `~/FileCabinet/SuiteScripts/sdf/actions/index.js` when the action is new, renamed, removed, or its export changed. An edit to an existing exported action does not require `index.js`.
- Add an exact compiled `sdf/domain/...js`, `sdf/utils/...js`, or other imported shared file only when that dependency changed and the action requires the new version.
- Add `~/FileCabinet/SuiteScripts/sdf/scripts/sr_rl_rct_action_handler.js` only when the handler itself changed.
- Add an `<objects>` block containing `~/Objects/customscript_sr_rl_rct_action_handler.xml` only when its XML changed. Do not include the RESTlet object for an action-only code change.
- Inspect every included source with `git diff`. Exclude unrelated dirty files.

3. Copy the override and validate before deployment:

```bash
cp deploy.override dist/deploy.xml
suitecloud project:adddependencies
suitecloud project:validate --server --accountspecificvalues WARNING
suitecloud project:deploy --accountspecificvalues WARNING --dryrun
```

4. If validation reports missing object dependencies, update `manifest.override` with `node deploy/add-missing-dependencies.js`; do not widen `deploy.override`. Copy the manifest into `dist/` and re-run validation and dry-run.
5. Deploy only after validation and dry-run pass:

```bash
suitecloud project:deploy --accountspecificvalues WARNING
```

6. Re-run `cp deploy.override dist/deploy.xml` after any build command because builds can regenerate `dist/deploy.xml`.

## Diagnose results

- Connection failure: proxy is not running or the URL is wrong.
- HTTP 401/403: OAuth credentials, role permissions, or RESTlet deployment access.
- HTTP 400 with `Cannot find action`: deployed `sdf/actions/index.js` lacks the export or deployed files are inconsistent.
- HTTP 400 with `ACTION: <name>`: inspect the nested action error and `message`.
- Success with the wrong shape: compare the response to the action return type and client DTO.
- A timeout on a mutation is an unknown outcome, not proof of failure. Inspect NetSuite state before retrying.

## Command reference

List locally exported functions:

```bash
npm run test:action -- --list
```

Pipe JSON without creating a file:

```bash
printf '%s' '{"recordType":"invoice"}' | npm run test:action -- getRecordFieldSchema --stdin
```

Use `--timeout <ms>` for slow PDF, export, or bulk actions. Use `--json` for machine-readable output and `--no-save` only when no local artifact is needed. Set `SUITEREACT_PROXY_URL` or pass `--proxy-url` when the proxy is not on `http://localhost:3001`.

## Result standard

Report the action and target account/environment, exact files deployed, validation and dry-run outcome, HTTP status, elapsed milliseconds, pass/fail, relevant response fields, artifact path, and remaining governance or data risk.
