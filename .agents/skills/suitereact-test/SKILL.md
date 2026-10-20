---
name: suitereact-test
description: 'Runs generic or app-specific Playwright smoke tests for SuiteReact apps, records canonical workflow evidence, screenshots, REST responses, and performance metrics. Use for browser or live NetSuite verification.'
---

# Test a SuiteReact app

**Usage:** `/suitereact-test <app-name> [--workflow-dir <path>] [--live]`

## Procedure

1. Prefer the managed test wrapper. It injects the exact Vite URL and always cleans up owned processes:

```bash
npm run dev:test -- <app-name> [--live] -- \
  npm run test:app -- <app-name> [--workflow-dir <path>] [--live]
```

2. For an interactive session, start it separately and use its exact Vite URL:

```bash
npm run test:app -- <app-name> --url <vite-url> [--workflow-dir <path>] [--live]
```

The runner uses `apps/<app-name>/test/smoke.mjs` when present and falls back to render/error checks. See [smoke-spec.md](references/smoke-spec.md) when adding a critical-path specification.

3. In live mode, require at least one successful `/api/handle-action` response. For a `server-action` workflow, the runner also requires `checks.direct_action.status === "passed"`; otherwise it fails rather than validating stale deployed code.
4. Read `test-results.json` from the workflow directory. It conforms to `deploy/schemas/suitereact-test-results.schema.json`; the runner atomically records `ui_smoke` or `live_ui` in `workflow.json`.
5. Stop separately started sessions even after failure:

```bash
npm run dev:stop -- <app-name>
```

Do not accept network failures, silent errors, or an error toast as a passing data workflow. Iterate at most four total runs.
