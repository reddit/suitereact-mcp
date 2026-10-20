---
name: suitereact-scaffold
description: 'Scaffolds a new freeform SuiteReact app in its own apps/ directory with Vite, MUI, and domain folders. Use when the user invokes /suitereact-scaffold or asks to create a new SuiteReact app from the template.'
---

# suitereact-scaffold

**Usage:** `/suitereact-scaffold <app-name>`

**Critical: Autonomous Execution** — Create the tree in one pass. Do not prompt for URLs. Copy patterns from sibling apps (e.g. `apps/data-viewer/`) for versions and `lint` scripts. Apply `.cursor/rules/react-patterns.mdc` and `.cursor/rules/global.mdc`.

## Path resolution

| Symbol       | Resolved path                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `<app-name>` | `apps/<app-name>/` (kebab-case; fail if directory already exists unless user explicitly asked to overwrite). |
| Package name | Use `private` + `"name": "rdt-sr-<app-name>"` or match nearest sibling `package.json` naming.                |

## Directory and files to create

Under `apps/<app-name>/`:

| Path                                  | Purpose                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                        | `dev`, `build`, `lint`, `lint:fix` — lint from monorepo root like existing apps (`cd ../.. && eslint 'apps/<app-name>/src/**/*.{ts,tsx}' ...`). |
| `tsconfig.json`                       | Strict React; `paths` for `N` / `@hitc/netsuite-types` like siblings.                                                                           |
| `tsconfig.node.json`                  | `composite` for Vite config (required for same layout as other apps).                                                                           |
| `vite.config.ts`                      | `@vitejs/plugin-react`, `vite-tsconfig-paths`, `outDir: './client'`, rollup `assets/` names.                                                    |
| `index.html`                          | Root div `#root`, script `/src/main.tsx`, title from humanized `<app-name>`.                                                                    |
| `example.env`                         | Documents the local proxy URL and token; users copy it to `.env.development.local`, never `.env`.                                               |
| `src/vite-env.d.ts`                   | `/// <reference types="vite/client" />`                                                                                                         |
| `src/main.tsx`                        | `ThemeProvider`, `CssBaseline`, `ToastProvider` from `suitereact`, render `App`.                                                                |
| `src/App/App.tsx`                     | Minimal MUI layout + placeholder content.                                                                                                       |
| `src/App/theme.ts`                    | MUI `createTheme` baseline consistent with siblings.                                                                                            |
| `src/domain/types.ts`                 | Shared types / empty export placeholder.                                                                                                        |
| `src/domain/actions/clientActions.ts` | Stub exporting typed helpers that use `handleRestletAction`, or an empty object until the app needs server actions.                             |
| `src/domain/views/`                   | Empty dir or `index.ts` re-export placeholder.                                                                                                  |

## NetSuite SDF objects (required for deployment)

Every new app needs three additional artifacts so it can be deployed and appear in the NetSuite navigation:

### 1. Suitelet script + utils (under `apps/<app-name>/`)

| Path                           | Purpose                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suitelet/sr_sui_<app_id>.ts`  | Suitelet entry point. Uses `N/runtime`, `N/ui/serverWidget`, `N/url`; imports `getClient` from `../utils/index`. The `<app_id>` is the app-name with dashes replaced by underscores (e.g. `data-viewer` → `data_viewer`). Copy the pattern from a sibling app (e.g. `apps/data-viewer/suitelet/sr_sui_data_viewer.ts`). |
| `utils/index.ts`               | Re-exports `renderingAndHelpers` and `response`.                                                                                                                                                                                                                                                                        |
| `utils/renderingAndHelpers.ts` | `getClient()` — loads `../client/index.html` from the File Cabinet, resolves static asset URLs via `N/file` + `N/search`, and returns the HTML string. Copy from a sibling app verbatim.                                                                                                                                |
| `utils/response.ts`            | `errorResponse` / `successResponse` helpers. Copy from a sibling app.                                                                                                                                                                                                                                                   |

These files are compiled by the root `tsc` (the root `tsconfig.json` includes `"**/suitelet/*.ts"`) and output to `dist/FileCabinet/SuiteScripts/apps/<app-name>/suitelet/` and `dist/FileCabinet/SuiteScripts/apps/<app-name>/utils/`.

### 2. SDF script object XML

Create `sdf/objects/suitelet/customscript_sr_sui_<app_id>.xml`. Use the `generate_suitelet` MCP tool or copy from a sibling XML and update:

- `scriptid` → `customscript_sr_sui_<app_id>`
- `name` → `SR | SUI | <App Name>`
- `scriptfile` → `[/SuiteScripts/apps/<app-name>/suitelet/sr_sui_<app_id>.js]`
- `scriptcustomfield scriptid` → `custscript_sr_<app_id>_ns_window`
- `scriptdeployment scriptid` → `customdeploy_sr_sui_<app_id>`

### 3. Center category link

Add a `<link>` entry to `sdf/objects/centerCategory/custcentercategory_suitereact.xml`:

```xml
<link>
  <linklabel>App Display Name</linklabel>
  <linkobject>[scriptid=customscript_sr_sui_<app_id>.customdeploy_sr_sui_<app_id>]</linkobject>
  <linktasktype>SCRIPT</linktasktype>
  <shortlist>F</shortlist>
</link>
```

Keep links in alphabetical order by `linklabel`.

## Post-create

For live local development, copy `example.env` to `.env.development.local`. Production validation rejects compiled bundles containing loopback URLs.

From repo root: `npm run build:app <app-name>`. Fix compile errors before finishing. Then run `npm run build:sdf` to verify the XML objects copy and the suitelet TS compiles correctly.

Run the app review gate before handing off:

```bash
npm run review:app -- <app-name>
```

For apps with large tables, bulk updates, PDFs, or zip/export flows, apply `docs/performance.md` during scaffold refinement. Prefer pagination, bounded batches, and Blob/ArrayBuffer file paths over large base64 payloads.

## Optional reference schema (scaffold manifest)

If you write `scaffold.json` beside `package.json` for tooling:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["appName", "createdAt", "template"],
  "properties": {
    "appName": { "type": "string" },
    "createdAt": { "type": "string" },
    "template": { "const": "freeform-suitereact" }
  }
}
```
