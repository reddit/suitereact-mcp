---
name: suitereact-review
description: 'Reviews a SuiteReact app for product fit, React/MUI patterns, NetSuite integration, performance, testing, and deploy readiness. Use when the user invokes /suitereact-review or asks whether an app is ready.'
---

# suitereact-review

**Usage:** `/suitereact-review <app-name> [--strict]`

**Critical: Autonomous Execution** — Run the review without asking for URLs or confirmation. Do not modify app code unless the user explicitly asks for fixes. Produce findings first, ordered by severity, with file references where possible.

## Path resolution

| Symbol       | Path                                                   |
| ------------ | ------------------------------------------------------ |
| `<app-name>` | `apps/<app-name>/`                                     |
| Review JSON  | `.suitereact-testing/reviews/<app-name>-review.json`   |
| Docs         | `docs/app-quality-checklist.md`, `docs/performance.md` |

## Workflow

1. Run the automated review gate:

```bash
npm run review:app -- <app-name>
```

Use `--strict` when the invocation includes it:

```bash
npm run review:app -- <app-name> --strict
```

2. Read the generated review JSON.
3. Inspect the app source for issues the automated gate cannot fully judge.
4. Compare against:
   - `docs/app-quality-checklist.md`
   - `docs/performance.md`
   - `.cursor/rules/react-patterns.mdc`
   - `.cursor/rules/netsuite-integration.mdc`
5. Return a code-review-style response:
   - Findings first, ordered by severity.
   - Include file/line references where available.
   - Call out test gaps and performance risks.
   - If no issues are found, say so clearly and list residual risks.

## Manual Review Checklist

### Product and UX

- The first screen helps the target NetSuite user complete the task.
- Empty, loading, success, error, and partial-failure states are visible.
- Expensive buttons cannot be double-clicked.
- Labels use business/NetSuite language.

### React and MUI

- New UI uses freeform React + MUI, not `pageSchema`, `NsReactField`, or grid-form patterns.
- Request/response DTOs are typed.
- DataGrid/table state is explicit and not hidden in generic row mutation helpers.
- Text and controls fit on desktop and mobile widths.

### NetSuite

- Client helpers use `handleRestletAction`; low-level `REST.post` is limited to intentionally hosted-only clients.
- Server actions live in `sdf/actions` and contain NetSuite logic only.
- SuiteQL has been validated against NetSuite before commit/deploy.
- RESTlet responses are structured and JSON-friendly.

### Performance

- Large datasets are paginated or keyset-loaded.
- Bulk work has bounded concurrency and visible progress.
- PDF/file/zip export paths avoid `JSZip + atob` loops for large file sets.
- Large payloads are not kept in React state or localStorage.
- Server actions account for SuiteScript governance and partial failure.

### Deployability

- `npm run build:app <app-name>` passes.
- `npm run test:app -- <app-name> --url <vite-url>` passes.
- Live mode has been run when the app depends on RESTlet calls.
- `npm run validate:app -- <app-name>` passes before deployment.
- App README and CHANGELOG are updated.
