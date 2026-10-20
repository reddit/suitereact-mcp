---
name: suitereact-code
description: 'Implements a SuiteReact workflow plan, records exact file ownership, and runs checks appropriate to UI, SuiteScript, or shared-library changes. Use for planned changes under apps/, sdf/, or suitereact/.'
---

# Implement SuiteReact changes

**Usage:** `/suitereact-code <app-name> [--workflow-dir <path>]`

Implement autonomously from the workflow `plan.md`, or create a workflow from the user goal when none exists. Follow `.cursor/rules/react-patterns.mdc`, `.cursor/rules/netsuite-integration.mdc`, `.cursor/rules/global.mdc`, `docs/performance.md`, and `docs/app-quality-checklist.md`.

## Procedure

1. Move the canonical `workflow.json` to `coding`. See **suitereact-full-cycle** for its contract.
2. Implement the smallest maintainable change. Use typed request/response DTOs and `handleRestletAction` for environment-transparent app actions.
3. For SuiteQL, verify field names and syntax with the available NetSuite schema/query tools and execute read-only queries when credentials are available.
4. After every edit, record exact repo-relative paths:

```bash
npm run workflow -- own <workflow-dir> <file>...
```

Pre-existing dirty files require inspection and explicit `--allow-existing`. Preserve all unrelated worktree changes.

5. Reclassify with `npm run workflow -- classify <workflow-dir>`, then run only relevant checks:

| Change                    | Checks                                     |
| ------------------------- | ------------------------------------------ |
| App UI                    | Prettier, app typecheck, app ESLint        |
| `sdf/` or app SuiteScript | Prettier, root typecheck, exact SDF ESLint |
| `suitereact/`             | Library build plus affected app builds     |

6. Run `npm run review:app -- <app-name>`. Resolve errors and assess warnings; do not mark browser or live checks passed here.
7. Record checks through `npm run workflow -- check ...`. On failure, move to `blocked` with the exact command and error.
