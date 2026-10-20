# Workflow Contract

The canonical workflow state is `.workflows/<app>/<workflow-id>/workflow.json` and conforms to `deploy/schemas/suitereact-workflow.schema.json`. Workflow files are local, ignored evidence. Never stage them.

## State machine

`planning -> coding -> verifying -> ready_to_commit -> committed -> deployed`

Any active phase may move to `blocked`. A retry moves from `blocked` back to the phase being retried. Use at most four verification iterations.

## Commands

```bash
node deploy/workflow-state.mjs init <app> --goal '<goal>' [--target-branch <branch>] [--deploy <environment>]
node deploy/workflow-state.mjs transition <workflow-dir> <phase> [--outcome <outcome>]
node deploy/workflow-state.mjs iteration <workflow-dir>
node deploy/workflow-state.mjs own <workflow-dir> <repo-relative-file>...
node deploy/workflow-state.mjs classify <workflow-dir>
node deploy/workflow-state.mjs check <workflow-dir> <check> <status> [--detail '<text>']
node deploy/workflow-state.mjs stage <workflow-dir>
node deploy/workflow-state.mjs finalize-commit <workflow-dir>
node deploy/workflow-state.mjs deployment <workflow-dir> <validated|deployed|failed> [--files <file>...]
```

Record file ownership immediately after creating or editing files. `stage` refuses a branch mismatch, broad staging, an empty owned-file list, and staged files owned by another workflow or the user.

## Change classes

| Class            | Required pipeline                                                      |
| ---------------- | ---------------------------------------------------------------------- |
| `new-app`        | Scaffold, app and SDF builds, review, smoke test, setup docs           |
| `ui-only`        | App build, review, browser smoke; proxy only for live behavior         |
| `server-action`  | Server lint/typecheck; direct action test only after narrow deployment |
| `shared-library` | Library build and affected-app verification                            |
| `deployment`     | Validation, dry run, and explicit deployment                           |

Deployment intent is also recorded independently under `deployment`, because UI and server changes may both be deployed.

## Evidence policy

Never treat a call to stale deployed code as evidence for local server changes. When server code changed but deployment was not requested, record `server_live: unverified`. For an authorized sandbox deployment, record narrow deployment validation, the direct action result, and then the live UI result. Mutating actions require a named environment and known payload.
