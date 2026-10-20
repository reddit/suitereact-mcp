---
name: suitereact-full-cycle
description: 'Builds or updates a SuiteReact app from a plain-language goal, then runs the smallest applicable build, review, test, documentation, commit, and optional NetSuite deployment pipeline. Use for end-to-end SuiteReact feature work or new apps.'
---

# Build a SuiteReact app

**Usage:** `/suitereact-full-cycle <app-name> <goal> [--deploy <environment>] [--no-commit] [--strict] [--target-branch <branch>]`

Run autonomously. The app name and goal are the only normal inputs. Generate workflow IDs internally. Deploy only when explicitly requested.

## Workflow

1. Initialize state and report the starting and target branches:

```bash
npm run workflow -- init <app-name> --goal '<verbatim goal>' [--target-branch <branch>] [--deploy <environment>]
```

Read [workflow-contract.md](references/workflow-contract.md) for the state machine, evidence rules, and change-class matrix.

2. Write `plan.md` in the returned workflow directory. Name expected files, REST actions, UX, performance risks, review criteria, and relevant rules from `.cursor/rules/`, `docs/performance.md`, and `docs/app-quality-checklist.md`.
3. Move to `coding`. Scaffold only when the app is new; otherwise implement using **suitereact-code**. Record every created or edited file immediately with `npm run workflow -- own <workflow-dir> <file>...`. Do not claim pre-existing dirty files without inspecting them and using `--allow-existing` intentionally.
   - For live local calls, store `VITE_PROXY_SERVER_BASE_URL` and `VITE_PROXY_SERVER_TOKEN` only in `.env.development.local` and guard reads with `import.meta.env.DEV`.
4. Classify and inspect the required pipeline:

```bash
npm run workflow -- classify <workflow-dir>
npm run workflow -- pipeline <workflow-dir>
```

5. Move to `verifying` and run only the returned stages. Always build changed code and run `npm run review:app -- <app-name>`; add `--strict` when requested.
6. For server changes, follow **suitereact-test-action**. Without an authorized narrow deployment, record `server_live` as `unverified`; never test stale deployed code as evidence for local changes.
7. For browser testing, prefer the managed wrapper so signals and failures always clean up owned processes:

```bash
npm run dev:test -- <app-name> [--live] -- \
  npm run test:app -- <app-name> --workflow-dir <workflow-dir> [--live]
```

Use the app's `test/smoke.mjs` when present. Iterate at most four total verification runs. Record every check in `workflow.json`; move unresolved work to `blocked` with the exact reason.

8. Update `CHANGELOG.md` only for user-visible behavior. Update `README.md` only when behavior, setup, configuration, or operations changed.
9. Unless `--no-commit`, move to `ready_to_commit` and delegate to **suitereact-commit**. It must stage exact owned files and finalize the workflow with the commit SHA. Never push automatically.
10. With `--deploy`, delegate to **suitereact-deploy** only after validation and dry run pass. Keep deployment scope exact and record `validated`, `deployed`, or `failed` with `npm run workflow -- deployment ...`.
    - Deployment validation must pass the production-bundle check; a compiled loopback URL is blocking.

## Completion standard

Report the target branch, change class, checks run and intentionally skipped, live NetSuite evidence, commit SHA, deployment result, and remaining risk. A build alone is not completion.
