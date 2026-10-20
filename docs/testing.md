# Testing SuiteReact Apps

Use the smallest test mode that proves the change. UI rendering, deployed server behavior, and local server changes are separate kinds of evidence.

## Setup

```bash
npm ci
npm run setup
npx playwright install chromium
npm run doctor
```

Use `npm run doctor -- --live` only before tests that call NetSuite. Run `npm run review:app -- <app-name>` before browser testing.

## Direct RESTlet actions

Use `/suitereact-test-action <action>` when changing `sdf/actions/*.ts`. It builds and narrowly deploys the exact changed action and dependencies before calling the action-handler RESTlet.

```bash
npm run server
npm run test:action -- getUserProps
npm run test:action -- getRecordFieldSchema --data '{"recordType":"invoice"}'
```

Calling `npm run test:action` directly tests the version already deployed to NetSuite. It is not evidence for un-deployed local changes. Mutating actions require a named non-production environment and known payload and must not be blindly retried.

## Browser smoke tests

Start a managed UI-only session and use the Vite URL it returns:

```bash
npm run dev -- <app-name>
npm run test:app -- <app-name> --url http://127.0.0.1:<reported-port>
npm run dev:stop -- <app-name>
```

For automated tests, prefer the wrapper so cleanup also runs on failures and signals:

```bash
npm run dev:test -- <app-name> -- npm run test:app -- <app-name>
```

The runner verifies rendering, browser errors, and `apps/<app-name>/test/smoke.mjs` when that app owns a critical-path specification. Screenshots are stored under `.suitereact-testing/screenshots/`.

During a full-cycle workflow, write canonical evidence directly to its ignored state directory:

```bash
npm run test:app -- <app-name> \
  --url http://127.0.0.1:<reported-port> \
  --workflow-dir .workflows/<app-name>/<workflow-id>
```

Standalone test results are stored under `.suitereact-testing/test-results/`.

## Live NetSuite tests

```bash
npm run dev -- <app-name> --live
npm run test:app -- <app-name> --url http://127.0.0.1:<reported-port> --live
npm run dev:stop -- <app-name>
```

Live mode requires at least one successful `/api/handle-action` response. For workflows classified as `server-action`, it also requires a passing direct-action check after narrow deployment. Without deployment authorization, record server behavior as `unverified`; do not call stale deployed code a pass.

The managed live runner checks the configured TBA credentials and calls the
action-handler RESTlet before starting Vite. Follow the
[setup guide](setup.md#2-prepare-a-sandbox-for-live-applications) when that
readiness check reports a missing or unauthorized deployment.

## Evidence matrix

| Change                                | Required evidence                               |
| ------------------------------------- | ----------------------------------------------- |
| UI-only                               | App build, review, UI smoke                     |
| Server action without deployment      | Server build; live server behavior `unverified` |
| Server action with sandbox deployment | Narrow deploy, direct action, live UI           |
| Shared library                        | Library build and affected-app tests            |
| Deployment                            | Validation, dry run, deployment result          |

Stop managed sessions in cleanup paths even when tests fail. The session manager terminates only processes it owns.

## Production proxy safety

Keep `VITE_PROXY_SERVER_BASE_URL` and `VITE_PROXY_SERVER_TOKEN` in
`apps/<app>/.env.development.local`. Vite loads `.env` during production
builds, so production-mode files can leak local routing or authentication data.

Before validation or deployment, build and scan the production bundle:

```bash
npm run build:app <app-name>
npm run check:production-bundle -- <app-name>
```

`npm run validate:app -- <app-name>` runs the same scan automatically and fails on loopback URLs or the configured development proxy URL.
