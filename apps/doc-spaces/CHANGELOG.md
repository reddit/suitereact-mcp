# Changelog

## [2026-05-31]

- Enabled fully interactive documents (scripts, theme toggles, search, Mermaid)
  by rendering doc HTML in an opaque-origin sandbox. `DocFrame` and the
  `DocEditor` preview now use `sandbox="allow-scripts"` (without
  `allow-same-origin`), so a document's JS runs but cannot reach the NetSuite
  session, cookies, the action-handler RESTlet, or the host DOM. Sandbox
  constants/helpers live in the new `src/domain/docSandbox.ts`.
- `sanitizeHtml` (server) no longer strips `<script>`/`<iframe>`/`on*`/`javascript:`;
  it stores HTML verbatim. The render-side iframe sandbox is now the security
  boundary — stored doc HTML must only ever be rendered inside it.
- Switched the doc/landing viewers from the `blob:` object URL back to `srcDoc`
  (an opaque origin can't load the parent's blob URL) and replaced the
  `useHtmlObjectUrl` hook with `augmentDocHtml`, which injects an in-page
  anchor-scroll helper so `#section` links still scroll instead of white-out.
- Note: inside the sandbox `localStorage`/`sessionStorage`/`document.cookie`
  access throws, so interactive docs must guard or avoid persistence.

## [2026-05-29]

- Made rendered docs much larger and added a Full Screen toggle. New shared
  `DocFrame` component renders the doc/landing iframe taller (landing fills
  ~`calc(100vh - 280px)`, viewer `calc(100vh - 160px)`) and overlays a
  Fullscreen/FullscreenExit button that expands the doc to cover the entire
  app width and height; Esc or a second click restores the inline layout. The
  iframe element is reused across modes so scroll position is preserved.

- Fixed a white-out when clicking in-document anchor links (e.g. sidebar nav):
  the doc/landing viewers now render HTML from a `blob:` object URL via a new
  `useHtmlObjectUrl` hook instead of the `srcDoc` attribute. With `srcDoc` the
  base URL is `about:srcdoc`, so `#section` links reloaded the sandboxed frame
  as a blank page; a real blob URL makes them scroll within the document.
- Verified the end-to-end flow in a sandbox account through REST and the app
  UI: creating a space, publishing a document, and setting it as the space
  landing page and the user's default space.
- Documented that `sanitizeHtml` strips `<script>`/`<iframe>` and the viewer
  iframe runs without scripts, so embedded mermaid/theme-toggle are inert by
  design while static content and CSS render fully.

## [2026-05-27]

- Initial scaffold of the `doc-spaces` SuiteReact app per the
  [TDD](../../docs/doc-spaces-tdd.html).
- Added five custom records (`customrecord_sr_space`, `_doc`, `_permission`,
  `_dyngroup`, `_user_pref`) and five supporting custom lists.
- Added 18 RESTlet actions under the `ds*` namespace covering the full v1
  API surface (spaces, docs, permissions, dyngroups, prefs, file uploads).
- Added in-app Monaco-based HTML editor with live preview, draft/publish
  lifecycle, and File Cabinet persistence.
- Added members panel with employee autocomplete and dyngroup grant flow.
- Added dynamic-group editor with criteria builder and live preview count.
- Added per-user default landing space preference.
- Registered three MCP tools: `upload_html_doc`, `create_space`,
  `scaffold_html_doc`.
- Added `.cursor/skills/doc-spaces-publish/SKILL.md` to orchestrate scaffold →
  upload via the MCP tools.
- Added Suitelet `customscript_sr_sui_doc_spaces` and a "Doc Spaces" link in
  the SuiteReact center category.
