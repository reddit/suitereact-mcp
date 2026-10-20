# SuiteReact App Quality Bar

Use this checklist before considering an app complete. A build passing is not enough.

## Commands

```bash
npm run doctor
npm run review:app -- <app-name>
npm run build:app <app-name>
npm run test:app -- <app-name> --url http://localhost:5173
npm run test:app -- <app-name> --url http://localhost:5173 --live
npm run validate:app -- <app-name>
```

Use `npm run review:app -- <app-name> --strict` when warnings should fail.

## Product Fit

- The first screen supports the actual NetSuite workflow.
- Labels use business/NetSuite terms.
- Empty, loading, success, error, and partial-failure states are visible.
- Expensive or destructive actions cannot be double-submitted.

## React and MUI

- Use freeform React + MUI. Do not create new page schemas or `NsReactField` form grids.
- Keep request/response DTOs typed.
- Use MUI DataGrid or MUI tables for tabular data.
- Use clear progress, error summaries, and retry flows for long-running work.

## NetSuite Integration

- Client helpers use `handleRestletAction` by default so the same code works in local Vite and hosted NetSuite environments.
- Server actions live in `sdf/actions`, contain NetSuite logic only, and return a typed DTO or throw.
- SuiteQL is validated against NetSuite before committing.
- The action-handler RESTlet owns the outer success/data/error envelope; action modules do not add another transport wrapper.

## Performance

- Large datasets are paginated or keyset-loaded.
- Bulk work has a concurrency limit.
- PDF/file export paths use Blob/stream-oriented flows and avoid base64 loops.
- RESTlet payloads are limited to what the UI needs.

## Deployability

- App README and CHANGELOG are updated.
- `deploy.override` is app-scoped for app deploys.
- Shared SDF files are listed exactly only when they changed.
- `validate:app` passes before `deploy:app`.
