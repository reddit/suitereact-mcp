---
name: doc-spaces-author
description: >-
  Generate a polished, self-contained interactive HTML document (FIP-style
  dark/light theme, sidebar nav, collapsible sections) and automatically publish
  it to the doc-spaces app in NetSuite via the upload_html_doc MCP tool. Use
  when the user wants to create an HTML doc and upload/publish it to doc-spaces,
  mentions "doc-spaces", "the docs app", or asks for a create-html-doc-style
  document that ends up in NetSuite.
---

# doc-spaces-author

**Usage:** `/doc-spaces-author <title>` — then specify the target space slug.

**Goal:** Author a rich HTML document in the spirit of the `create-html-doc`
skill, then publish it straight into a doc-spaces space using the
`suitereact-mcp` MCP tools.

This is the rich-authoring sibling of the existing `doc-spaces-publish` skill:
that skill uses the plain `scaffold_html_doc` template; this one produces a
polished, FIP-themed document and adapts it so it survives doc-spaces
sanitization.

## Prerequisites

The `suitereact-mcp` MCP server must be authenticated against the target
NetSuite account. If `upload_html_doc` returns a 401, run `mcp_auth` once and
retry.

## Interactive docs run in a sandbox

doc-spaces stores document HTML verbatim (scripts included) and renders it in an
iframe sandboxed with `allow-scripts` but **without** `allow-same-origin` — an
opaque origin. So the full `create-html-doc` FIP experience works: theme toggle,
Cmd+K search, scroll-spy, JS collapsibles, Mermaid via CDN, etc. JavaScript runs
but is walled off from the NetSuite session.

You may freely emit `<script>` blocks, `on*` handlers, inline JS, and external
`<link>`/`<script>` CDNs (Google Fonts, Mermaid). Keep these sandbox limits in
mind — anything needing the parent page or persistent storage will silently fail:

| Works in the sandbox                                   | Blocked by the sandbox (avoid or guard)                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `<script>`, event handlers, DOM APIs                   | `localStorage` / `sessionStorage` / `document.cookie` — access **throws** |
| External CDNs (Google Fonts, Mermaid) — uncredentialed | `window.open`, popups, `target="_blank"` (no `allow-popups`)              |
| `<details>`/`<summary>`, CSS, `prefers-color-scheme`   | Form submission to a server (no `allow-forms`); top-window navigation     |
| In-page `#anchor` links (host injects a scroll helper) | Reading the NetSuite session or calling RESTlets as the viewer            |

Practical adaptations to the stock FIP theme:

- **Theme toggle:** default from `@media (prefers-color-scheme: …)`. A JS toggle
  is fine, but wrap any `localStorage` persistence in `try { … } catch {}` — it
  throws in an opaque origin, so the toggle must still work without it.
- **Anchor nav:** just use normal `<a href="#section-id">`; the host injects an
  in-page scroll helper, so no white-out and no custom scroll script needed.
- Everything else from `create-html-doc` (sidebar, search, callouts, cards,
  badges, Mermaid) can be used as-is.

## Workflow

```
- [ ] 1. Gather requirements (title, type, space slug, publish/landing)
- [ ] 2. Author the HTML (FIP theme; mind the sandbox limits above)
- [ ] 3. Save a local copy for review (optional but recommended)
- [ ] 4. Publish with upload_html_doc
- [ ] 5. Confirm docId / fileCabinetFileId and report the doc-spaces location
```

### 1. Gather requirements

- **Title** and **type** (TDD, runbook, RFC, overview, …).
- **Target space slug** — confirm with the user. If it does not exist,
  `upload_html_doc` auto-creates an `adhoc` space; pass `space_name` to set a
  friendly name on creation. Use `create_space` first only if the user wants a
  `team`/`personal` space or specific `everyoneView` settings.
- **doc_slug** — derive from the title (slug rules below).
- **Publish / landing** — ask whether to publish now and whether to pin it as
  the space landing page.

### 2. Author the HTML

Use a FIP-style theme: dark-first `:root` tokens, Inter + JetBrains Mono,
rounded surfaces, callouts, status badges, and card grids. If the optional
`create-html-doc` skill is available in the agent's skill catalog, read it for
the full theme and component markup. It is not bundled or required; otherwise
start with the shell below and choose accessible foreground/background colors
for both themes. Apply the **sandbox adaptations** from the table above.

Minimum shell:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{TITLE}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        /* FIP dark tokens */
      }
      @media (prefers-color-scheme: light) {
        :root {
          /* FIP light tokens */
        }
      }
      html {
        scroll-behavior: smooth;
        scroll-padding-top: 80px;
      }
      /* layout: fixed .sidebar + .main; responsive: hide sidebar on mobile */
    </style>
  </head>
  <body>
    <nav class="sidebar"><!-- <a href="#overview">Overview</a> … --></nav>
    <main class="main">
      <section class="hero" id="top"><h1>{TITLE}</h1></section>
      <section class="section" id="overview">
        <h2>Overview</h2>
        …
      </section>
      <details>
        <summary>Details</summary>
        …
      </details>
    </main>
  </body>
</html>
```

Verify sidebar `href="#…"` anchors match the `id` on each `<section>`.

### 3. Save a local copy (optional)

Write the HTML to `docs/<doc_slug>.html` (or a path the user names) so it can be
reviewed/diffed before or after publishing. This is optional; the source of
truth after publish is the File Cabinet copy.

### 4. Publish with `upload_html_doc`

| Argument         | Required | Notes                                                     |
| ---------------- | -------- | --------------------------------------------------------- |
| `space_slug`     | yes      | Target space; auto-created (`adhoc`) if missing           |
| `doc_slug`       | yes      | Becomes the File Cabinet file name `<doc_slug>.html`      |
| `title`          | yes      | Display title (defaults to `doc_slug` if omitted)         |
| `html_content`   | yes      | The full HTML string                                      |
| `set_as_landing` | no       | `true` publishes the doc **and** pins it as space landing |
| `publish`        | no       | `true` publishes without changing the landing page        |
| `space_name`     | no       | Friendly name used only when the space is auto-created    |

### 5. Confirm

`upload_html_doc` returns `docId` and `fileCabinetFileId`. Report them and tell
the user the doc is viewable in the doc-spaces Suitelet (at the space landing if
`set_as_landing` was used, otherwise under the space's document list).

## Slug rules

- Lowercase ASCII letters, digits, hyphens, underscores only.
- ≤ 60 characters; the server normalizes and rejects unsafe input.
- `doc_slug` is reused as the File Cabinet file name (`<doc_slug>.html`).

## Example sequence

```
upload_html_doc({
  space_slug: "eng-runbooks",
  space_name: "Engineering Runbooks",
  doc_slug: "q4-close-runbook",
  title: "Q4 Close Runbook",
  html_content: "<!DOCTYPE html>… (sanitizer-safe FIP doc) …",
  set_as_landing: true
})
```

## Failure modes

- `Forbidden: edit access is required to upload.` — the authenticated user
  lacks edit permission on the space; escalate to the space admin.
- `Slug "<x>" is already in use.` — pick a different space slug.
- `Action … failed: 401` — OAuth token expired; run `mcp_auth` and retry.
- A script silently does nothing after publish — it likely hit a sandbox limit
  (`localStorage`, popups, form submit, top-nav). Guard or drop it per the
  sandbox table above.

## Non-goals

This skill does not deploy SDF objects or run the SuiteReact build. To author a
plain (non-FIP) doc, use `doc-spaces-publish`. To manage the doc-spaces app
itself, use `suitereact-full-cycle`.
