---
name: suitereact-analyze
description: 'Evaluates SuiteReact workflow checks and test evidence, then moves canonical workflow state to ready_to_commit or blocked. Use after review, browser, direct-action, or deployment tests.'
---

# Analyze SuiteReact evidence

**Usage:** `/suitereact-analyze <app-name> --workflow-dir <path>`

1. Read `workflow.json`, `plan.md`, `test-results.json`, and the app review artifact when present.
2. Compare evidence with `npm run workflow -- pipeline <workflow-dir>`. A required failed or missing check blocks completion.
3. Never infer that local server code passed from a UI call to an older deployed version. `server_live: unverified` is honest evidence when deployment was not authorized.
4. On failure, write `fix-plan.md` with observed failures, likely root causes, exact files, and verification commands. Run `npm run workflow -- iteration <workflow-dir>` and move to `blocked`. Stop after four total verification runs.
5. On success, write a concise `next-steps.md` only when useful, set `outcome: passed`, and move to `ready_to_commit`.
6. Do not maintain a second status schema or separate commit record. `workflow.json` is authoritative.
