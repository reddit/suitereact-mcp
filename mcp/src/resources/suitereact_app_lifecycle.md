# SuiteReact App Lifecycle Commands

Commands for building, developing, validating, and deploying SuiteReact apps. Run **npm scripts from the repository root** unless noted.

## Setup doctor

```bash
npm run doctor
npm run doctor -- --live
```

Use the normal doctor during setup and the live doctor before debugging RESTlet calls. The live check treats missing NetSuite proxy credentials as blocking.

## Build a single app

```bash
npm run build:app <app-name>
```

Builds the shared `suitereact` package and the specified app (`apps/<app-name>/`). Use this when you need a production bundle or before running the dev script (which also builds first).

## Local development

**Option A — Full dev flow (recommended):**

1. Start the local proxy when the app must talk to NetSuite RESTlets from your machine:

   ```bash
   npm run server
   ```

2. Point the app at the proxy via `.env.development.local`:

   ```
   VITE_PROXY_SERVER_BASE_URL=http://localhost:3001
   VITE_PROXY_SERVER_TOKEN=<same value as SUITEREACT_PROXY_TOKEN>
   ```

3. Start the app:

   ```bash
   npm run dev <app-name>
   ```

   This runs a build of the app, then starts Vite in `apps/<app-name>/`.

**Option B — UI-only work:** run Vite directly inside `apps/<app-name>/` with `npm run dev` if you do not need NetSuite calls (no proxy).

**Production / hosted Suitelet:** the app runs inside NetSuite; `handleRestletAction` falls back to the SuiteReact REST client. Do **not** set `VITE_PROXY_SERVER_BASE_URL` in `.env`, `.env.local`, `.env.production`, or the production shell environment. `validate:app` rejects bundles containing loopback URLs.

## App review gate

```bash
npm run review:app -- <app-name>
npm run review:app -- <app-name> --strict
```

Run this before commit. It checks for missing app basics, legacy grid-schema patterns, and common performance hazards such as `JSZip`, `atob`, large base64 file paths, and unbounded `Promise.all(records.map(...))` work. Use `--strict` when warnings should fail.

## Smoke and live tests

```bash
npm run test:app -- <app-name> --url http://localhost:5173
npm run test:app -- <app-name> --url http://localhost:5173 --live
```

UI smoke mode verifies that the app renders without browser/page errors. Live mode additionally requires at least one `/api/handle-action` call and fails on non-2xx action responses.

## Pre-deploy validation

```bash
npm run validate:app -- <app-name>
```

Builds SDF and the app bundle, rejects embedded local URLs, applies overrides, checks deploy scope, runs SuiteCloud validation, and performs a dry-run deployment. The deploy script runs validation automatically.

## Deploy

```bash
npm run deploy:app -- <app-name>
```

This validates the app, then deploys the scoped SuiteCloud project to the account configured in `suitecloud.config.js`.

## Full monorepo build

```bash
npm run build
```

Runs formatting, SDF build, `suitereact` build, and the default app build pipeline—use when you need the entire project built.

## Notes

- Replace `<app-name>` with the directory name under `apps/` (e.g. `suiteql-bot`, `data-viewer`).
- Keep secrets and API keys on the server; the chatbot and RESTlets use NetSuite-side configuration.
- For SuiteQL development, use the MCP SuiteQL assistant tools to test queries before embedding them in server actions.
- For scoped app deploys, never include broad shared wildcards such as `~/FileCabinet/SuiteScripts/sdf/*`; list only exact changed shared files.
- For large tables, bulk work, PDFs, and zip/export flows, follow `suitereact_performance.md` before coding.
- Before calling an app done, use `suitereact_app_quality.md` and run `npm run review:app -- <app-name>`.
