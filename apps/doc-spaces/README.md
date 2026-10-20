# doc-spaces

A NetSuite-native HTML document workspace embedded in a SuiteReact Suitelet.
Users create ad-hoc spaces, author HTML documents in an in-app Monaco editor,
publish them to the File Cabinet, and grant access to specific employees or
to live-evaluated dynamic groups.

doc-spaces is intentionally a simpler sibling to the standalone snoo_docs
service: it lives entirely inside NetSuite and reuses NetSuite-native
identities, file storage, and SuiteQL.

## Features

- **Ad-hoc spaces** with three flavors (`adhoc`, `team`, `personal`).
- **Document authoring** with a side-by-side Monaco editor + live preview.
- **Draft → published** lifecycle. Document HTML is stored verbatim as HTML
  files in the File Cabinet and rendered in a sandboxed iframe (see
  [Document rendering & security](#document-rendering--security)).
- **Landing pages**: each space can pin a published doc as its landing view.
- **Per-user default landing space** in the in-app preferences view.
- **Permissions** at space or doc level, with five levels (`view` → `admin`).
  Principals can be a specific employee, a dynamic group, or `everyone`.
- **Dynamic permission groups** built from a saved-search-style criteria UI
  (`AND`/`OR`, operators per field type) and evaluated live on access.
- **NetSuite-friendly theming** (navy `#0a3d62`).

## Tech stack

- **Front end**: React 18 + MUI 7 + `@monaco-editor/react`, hash routing.
- **Server**: SuiteScript 2.1 RESTlet actions dispatched by
  `customscript_sr_rl_rct_action_handler`.
- **Storage**: 5 custom records (`customrecord_sr_space`, `_doc`, `_permission`,
  `_dyngroup`, `_user_pref`) plus 5 supporting custom lists; document HTML is
  stored as `*.html` files in `/SuiteScripts/.../doc-spaces/<slug>/`.
- **Build**: Vite + TypeScript; deployed via SDF.

## Setup (local)

1. From repo root:
   ```bash
   npm ci                      # one-time, locked root dependencies
   npm run setup               # safe, ignored local configuration
   npm run build:suitereact    # builds the shared library
   npm run build:app doc-spaces
   ```
2. Fill the NetSuite credentials in `server/.env`. Setup generated the proxy
   token and copied it into the app configuration already.
3. Prepare the sandbox as described in the repository
   [setup guide](../../docs/setup.md), then start the managed services:
   ```bash
   npm run dev -- doc-spaces --live
   ```
4. Open the reported application URL. Run
   `npm run dev:stop -- doc-spaces` when finished.

## Build & deploy (NetSuite)

```bash
npm run build:app -- doc-spaces # ships client/ to dist/FileCabinet/...
npm run build:sdf              # copies SDF objects (incl. custom records / lists)
npm run deploy:app -- doc-spaces # validates, dry-runs, then deploys this app
```

Center-category link `Doc Spaces` is added under the SuiteReact menu.

## File layout

```
apps/doc-spaces/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App/
│   │   ├── App.tsx           # shell + sidebar + hash routing
│   │   └── theme.ts
│   └── domain/
│       ├── types.ts
│       ├── actions/
│       │   └── clientActions.ts
│       └── views/
│           ├── SpaceLandingView.tsx
│           ├── DocViewer.tsx
│           ├── DocEditor.tsx        # Monaco editor + preview
│           ├── SpaceSettings.tsx
│           ├── MembersPanel.tsx
│           ├── DynGroupEditor.tsx
│           └── UserPrefsView.tsx
├── suitelet/
│   └── sr_sui_doc_spaces.ts
└── utils/
    ├── index.ts
    ├── renderingAndHelpers.ts
    └── response.ts
```

Server-side actions live in `sdf/actions/ds*.ts` (with shared helpers in
`sdf/actions/_docSpaces/helpers.ts`). They're auto-registered through
`sdf/actions/index.ts`.

## How permissions are resolved

`evaluateAccess(target)` in `sdf/actions/_docSpaces/helpers.ts` is the single
entry point. It:

1. Loads all permission grants for the target.
2. For each grant whose principal type applies to the current user
   (`everyone`, the matching `employee`, or a `dyngroup` whose criteria the
   user satisfies via SuiteQL), takes its level.
3. Returns the strongest level. Doc lookups also fall back to the parent
   space's grants when no doc-level grant exists.

`view < comment < review < edit < admin`. Server actions enforce minimum
levels per the design doc:
[`docs/doc-spaces-tdd.html` §08](../../docs/doc-spaces-tdd.html).

## Document rendering & security

Document HTML is **untrusted** (any space editor can author it; published docs
are shown to every reader) yet docs may be fully interactive — scripts, theme
toggles, search, Mermaid diagrams. To allow both, HTML is stored verbatim and
rendered in an iframe whose sandbox grants `allow-scripts` but deliberately
omits `allow-same-origin` (`DOC_IFRAME_SANDBOX` in
`src/domain/docSandbox.ts`, used by `DocFrame` and the `DocEditor` preview).

That forces every document into an **opaque origin**: its scripts run, but they
cannot read the NetSuite session/cookies, call the action-handler RESTlet as the
viewer, or touch the host DOM. `allow-popups`, `allow-forms`, and
`allow-top-navigation` are also withheld.

Consequences:

- `sanitizeHtml` (server) stores HTML as-is; the iframe sandbox — not stripping
  — is the security boundary. **Never** render stored doc HTML on the NetSuite
  origin (same-origin iframe, `innerHTML`, raw Suitelet write-out).
- **Never** add `allow-same-origin` next to `allow-scripts`; the pair lets a doc
  remove its own sandbox and re-opens stored XSS.
- Docs render via `srcDoc` (opaque origin precludes the same-origin `blob:` URL
  trick); `augmentDocHtml` injects an in-page anchor-scroll helper so
  `#section` links don't white-out the frame.
- Inside the sandbox, `localStorage`/`sessionStorage`/`document.cookie` access
  throws — interactive docs must guard or avoid persistence.

## Permissions and parameters

The app needs no SuiteReact role list. Reads and writes run under each role's native permissions on the Doc Spaces custom records, and the app's own grants and group ownership checks apply on top. See [Doc Spaces authorization setup](../../docs/doc-spaces-security.md).

| Setting                                          | Where                         | Needed for                                                                                                                                      |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `customdeploy_sr_sui_doc_spaces` audience        | Suitelet deployment           | Opening the app.                                                                                                                                |
| `customdeploy_sr_rl_rct_action_handler` audience | RESTlet deployment            | Every server action. Include only the roles that use the app, and leave **Run As Role** unset so actions run with the caller's own permissions. |
| Doc Spaces custom record permissions             | Role permission               | Viewing and editing spaces, documents, grants and dynamic groups.                                                                               |
| Employee view permission                         | Role permission               | Employee pickers.                                                                                                                               |
| SuiteAnalytics Workbook (View)                   | Role permission               | Live match counts in the dynamic-group editor (`dsEvaluateDynGroup`), which run caller-supplied employee criteria.                              |
| `custscript_sr_doc_spaces_ns_window`             | Suitelet parameter (checkbox) | Checked: the app opens inside NetSuite's navigation. Unchecked: it opens as a full page.                                                        |

## Related

- TDD: [`docs/doc-spaces-tdd.html`](../../docs/doc-spaces-tdd.html)
- MCP tools: `upload_html_doc`, `create_space`, `scaffold_html_doc`
  (registered in `mcp/src/server.ts`).
- Skills:
  [`doc-spaces-author`](../../.agents/skills/doc-spaces-author/SKILL.md) (rich,
  interactive create-html-doc-style docs) and
  [`doc-spaces-publish`](../../.agents/skills/doc-spaces-publish/SKILL.md) (plain
  template docs).
