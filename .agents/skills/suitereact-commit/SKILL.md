---
name: suitereact-commit
description: 'Safely commits a verified SuiteReact workflow by checking the target branch and staging only exact files owned by that workflow. Use to finalize SuiteReact app work without pushing.'
---

# Commit SuiteReact work

**Usage:** `/suitereact-commit <app-name> --workflow-dir <path>`

Run autonomously, but never push unless explicitly requested.

1. Require `workflow.json` phase `ready_to_commit`, passing required checks, and a non-empty `ownedFiles` list.
2. Verify the active branch equals `targetBranch`. Do not infer a different destination from a temporary worktree name. The staging command reports when the target branch is checked out in another worktree.
3. Stage and verify only workflow-owned files:

```bash
npm run workflow -- stage <workflow-dir>
npm run workflow -- verify-stage <workflow-dir>
```

Never run `git add apps/<app>/`, `git add .`, or stage ignored workflow artifacts. Existing staged files outside ownership are blocking; preserve them and report the exact paths.

4. Review `git diff --cached --stat` and `git diff --cached`. Commit with an accurate conventional subject and this body metadata:

```text
Workflow: <workflow-id>
```

5. Record the resulting SHA after the commit:

```bash
npm run workflow -- finalize-commit <workflow-dir>
```

Report the branch, SHA, and exact committed files.
