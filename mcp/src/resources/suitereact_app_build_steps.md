# SuiteReact App Build Steps

Use this flow when adding or maintaining a SuiteReact app in the `apps/` directory. UIs are **freeform React + MUI**; there is **no** declarative 12-column grid schema and **no** `validateSuiteReactPage` step.

## 1. Create the app directory

- Example: `apps/my-app/`
- Prefer the scaffold / generator tools in this repo to produce `package.json`, Vite config, `src/main.tsx`, `src/App/`, and `suitelet/`—do not copy `node_modules` or generated `client/` folders.

## 2. Suitelet (SuiteScript)

- Add the Suitelet entry under `apps/<app-id>/suitelet/` (e.g. `sr_sui_my_app.ts`).
- Add the corresponding SDF Suitelet object XML under `sdf/objects/suitelet/` when deploying.

## 3. React application structure

Organize code around standard React patterns:

| Area                  | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `src/main.tsx`        | `createRoot`, providers (`ThemeProvider`, `CssBaseline`, `ToastProvider`, etc.) |
| `src/App/App.tsx`     | Shell layout, routing or tabs                                                   |
| `src/App/theme.ts`    | `createTheme` — palette, typography, component overrides                        |
| `src/domain/views/`   | Page components (e.g. landing, settings)                                        |
| `src/domain/actions/` | Typed `handleRestletAction` wrappers and UI handlers                            |
| `src/domain/types.ts` | Shared types and Zod schemas (e.g. chatbot structured output)                   |
| `src/utils/`          | General helpers                                                                 |

Build screens with **MUI** (`@mui/material`, `@mui/icons-material`, `@mui/x-data-grid`, `@mui/x-date-pickers` as needed). Pull in **`suitereact`** only for shared NetSuite/UI utilities: `REST`, `handleRestletAction`, `ToastProvider` / `useToastHelpers`, `NsReactDataGrid`, `NsReactChatbot`, `NsReactHal`, etc.

## 4. Server actions (NetSuite)

- Implement REST-callable actions under `sdf/actions/`.
- Export them from `sdf/actions/index.ts`.
- Server code uses SuiteScript modules (`N/query`, `N/record`, `N/log`, …). Return a typed JSON-friendly DTO or throw; the action-handler RESTlet owns the transport envelope.

## 5. Wire the client to NetSuite

- From React, guard both `VITE_PROXY_SERVER_BASE_URL` and `VITE_PROXY_SERVER_TOKEN` with `import.meta.env.DEV`, then call `handleRestletAction(name, payload, proxyBase, proxyToken)`.
- Use `REST.post` directly only for hosted-only client code that does not need the Vite proxy.
- In production (Suitelet-hosted bundle), omit the proxy base URL so requests use the built-in REST client.

## 6. Build

From the **repository root**:

```bash
npm run build:app <app-name>
```

Example: `npm run build:app data-viewer`

This builds the SuiteReact library (as needed), runs the app build (lint, typecheck, Vite), and prepares output for deployment.

## 7. Review quality and performance

From the repo root:

```bash
npm run review:app -- <app-name>
```

Resolve errors before commit. Warnings are prompts for human review; use `--strict` when you want warnings to fail.

For large datasets, bulk updates, PDFs, and zip/export flows, review `suitereact_performance.md` before finalizing the implementation:

- Prefer paginated/keyset data loading over returning every row.
- Cap concurrency for bulk NetSuite work.
- Prefer Blob/ArrayBuffer file flows over large base64 payloads.
- Avoid `JSZip + atob + Uint8Array` loops for large client-side zips.
- Show progress and partial failure details for long-running actions.

## 8. Develop locally

1. Optionally start the NetSuite proxy (when you need live REST calls):

   ```bash
   npm run server
   ```

2. In the app’s `.env.development.local`, set `VITE_PROXY_SERVER_BASE_URL` and the token matching `SUITEREACT_PROXY_TOKEN`. Never place them in `.env` or a production-mode env file.

3. Start the app dev workflow:

   ```bash
   npm run dev <app-name>
   ```

   This builds/validates the app, then runs Vite in the app directory.

## 9. Test

Test changed server actions directly before spending time on browser flows. The action must be deployed to NetSuite first; use a narrow override containing the exact compiled action file and `sdf/actions/index.js` only when its export changed:

```bash
npm run test:action -- <action-name> --data '{"key":"value"}'
```

For complex payloads, use `--data-file .suitereact-testing/action-payloads/<action-name>.json`. The command records timing and the full response under `.suitereact-testing/action-results/`.

With Vite running:

```bash
npm run test:app -- <app-name> --url http://localhost:5173
npm run test:app -- <app-name> --url http://localhost:5173 --live
```

Use smoke mode for UI render checks and live mode when local proxy credentials are configured.

## 10. Deploy

From the repo root:

```bash
npm run validate:app -- <app-name>
npm run deploy:app -- <app-name>
```

This creates a narrow app deploy override when missing, rejects production bundles containing loopback URLs, runs scope checks, validates with SuiteCloud, dry-runs deployment, then deploys to the configured NetSuite account. If shared `sdf/actions` files changed, add only the exact compiled shared files to `deploy.override`; do not use broad shared wildcards.

## Lint failures

If the build fails on ESLint:

1. `cd apps/<app-name>`
2. `npm run lint:fix`
3. Fix remaining issues (unused imports/vars, `no-console`, etc.)
4. `npm run lint`

## Separation of concerns

- **React / MUI**: layout, state, and presentation.
- **suitereact**: NetSuite I/O helpers and optional SuiteReact components (grid, chatbot, toasts).
- **sdf/actions**: NetSuite-only business logic and data access—return a typed DTO or throw; keep UI and transport envelopes out of server actions.
- **quality gate**: `npm run review:app -- <app-name>` plus `suitereact_app_quality.md` before commit/deploy.
