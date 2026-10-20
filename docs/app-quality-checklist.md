# SuiteReact App Quality Checklist

Use this before calling an app "done." Passing build is necessary, but it is not the quality bar.

Run the automated baseline first:

```bash
npm run review:app -- <app-name>
npm run build:app <app-name>
npm run test:app -- <app-name> --url <reported-vite-url>
npm run test:app -- <app-name> --url <reported-vite-url> --live
```

Use `npm run review:app -- <app-name> --strict` when you want warnings to fail the check.

## Product Fit

- The first screen solves the user's task directly; it is not a marketing page or placeholder.
- Labels match NetSuite/business vocabulary.
- Common actions are one click away and visually distinct.
- Empty, loading, success, partial failure, and error states are visible.

## React and UI

- UI is freeform React + MUI; no new `pageSchema`, `NsReactField`, or form-grid patterns.
- State is explicit and typed with small DTOs.
- Long lists use `DataGrid` pagination/filtering/sorting instead of hand-built tables.
- Buttons cannot double-submit expensive actions.
- Text fits inside its container across desktop and mobile widths.

## NetSuite Integration

- Local proxy configuration lives only in `.env.development.local`, never `.env` or a production-mode env file.
- Direct `VITE_PROXY_SERVER_BASE_URL` and `VITE_PROXY_SERVER_TOKEN` reads are guarded with `import.meta.env.DEV`.
- `npm run check:production-bundle -- <app-name>` passes with no loopback URLs or configured development proxy URL before deployment.

- Client calls go through typed action helpers using `handleRestletAction`; use low-level `REST.post` only for intentionally hosted-only clients.
- Server actions live in `sdf/actions` and contain NetSuite logic only.
- SuiteQL is tested against NetSuite before it is committed.
- RESTlet responses are structured: `{ success, data?, error? }`.
- Authorization uses native NetSuite permissions (deployment audiences, record permissions, SuiteAnalytics Workbook for queries). Add a role-list script parameter only for capabilities no native permission governs, such as acting as a configured employee.
- The app README has a **Permissions and parameters** section listing every deployment audience, native permission, and script parameter it depends on.
- Large data or file flows follow `docs/performance.md`.

## Performance

- Large datasets are paginated or keyset-loaded.
- Bulk work has a concurrency limit and progress feedback.
- File/PDF export paths avoid `JSZip + atob` loops and unnecessary base64 storage.
- RESTlet payloads are no larger than the UI actually needs.
- Expensive NetSuite work has a retry or resume path.

## Deployability

- `npm run doctor` passes, or warnings are understood.
- `npm run validate:app -- <app-name>` passes before deployment.
- `deploy.override` is narrow for app-scoped deploys.
- Shared SDF files are deployed only when they changed or are strictly required.
- App README and CHANGELOG reflect the user-facing behavior.

## Rookie Reviewer Prompts

Ask these out loud during review:

- "What happens when NetSuite returns zero rows?"
- "What happens when one record fails in a bulk run?"
- "What is the largest payload this app can return?"
- "Can the same action be clicked twice?"
- "Would a finance/admin user know what to do next from the screen alone?"
- "Can another developer deploy this without guessing?"
