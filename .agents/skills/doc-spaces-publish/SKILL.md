---
name: doc-spaces-publish
description: >-
  Author or refresh a plain NetSuite-themed HTML document with the
  scaffold_html_doc template and publish it to a doc-spaces space using the
  suitereact-mcp MCP tools. Use when the user asks to publish, upload, or
  refresh an HTML doc in NetSuite, or mentions "doc-spaces", "the docs app", or
  "snoo_docs in NetSuite". For rich, interactive create-html-doc-style
  documents, use doc-spaces-author instead.
---

# doc-spaces-publish

**Goal:** Author or refresh an HTML document and publish it to a doc-spaces
space inside NetSuite using the `suitereact-mcp` MCP tools.

**Use when:** the user asks you to publish, upload, or refresh an HTML doc in
NetSuite; mentions "doc-spaces", "the docs app", or "snoo_docs in NetSuite".

## Prerequisites

The `suitereact-mcp` MCP server must be authenticated against the target
NetSuite account (run `mcp_auth` once per session if necessary). The three
tools below are protected; `scaffold_html_doc` does not require auth.

## Tools

| Tool                | Purpose                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `scaffold_html_doc` | Returns a complete, NetSuite-themed HTML document. Use as a starting point.                                |
| `create_space`      | Creates a brand-new doc-spaces space. Skip if the space already exists.                                    |
| `upload_html_doc`   | Uploads (or overwrites) an HTML document into a space. Optionally publishes & sets it as the landing page. |

## Workflow

1. **Determine target space** — confirm the slug with the user. If the slug
   does not yet exist, call `create_space` first. Use `type: "adhoc"` unless
   the user specifies otherwise.
2. **Author the HTML**:
   - Prefer `scaffold_html_doc` and edit the returned HTML for the user's
     topic. Replace the placeholder Summary / Context / Approach / Reference
     sections with real content.
   - Alternatively, accept HTML the user already has — but always pass it
     through the `upload_html_doc` tool so it is sanitized and stored under
     the space's File Cabinet folder.
3. **Upload** with `upload_html_doc`:
   - Required: `space_slug`, `doc_slug`, `title`, `html_content`.
   - Optional: `set_as_landing: true` to make it the space landing page (also
     auto-publishes), or `publish: true` to publish without changing landing.
4. **Confirm** — the tool returns the new `docId` and `fileCabinetFileId`. The
   document is now visible at the space landing in the doc-spaces Suitelet.

## Slug rules

- Lowercase only, ASCII letters, digits, hyphens, underscores.
- ≤60 characters; the server will normalize and reject obviously unsafe input.
- Slug is reused as the File Cabinet file name (`<doc_slug>.html`).

## Example sequence

```
scaffold_html_doc({ topic: "Q4 Close runbook", style: "runbook" })
# (edit the returned HTML inline before uploading)
create_space({ slug: "fp-and-a", name: "FP&A", type: "team", description: "Finance team space" })
upload_html_doc({
  space_slug: "fp-and-a",
  doc_slug: "q4-close",
  title: "Q4 Close runbook",
  html_content: "<!DOCTYPE html>...",
  set_as_landing: true
})
```

## Failure modes

- `Forbidden: edit access is required to upload.` — the authenticated user
  lacks edit permission on the space. Escalate to the space admin.
- `Slug "<x>" is already in use.` — pick a different space slug.
- `Action ... failed: 401` — the OAuth token expired; the wrapper retries
  once. If it still fails, run `mcp_auth`.

## Non-goals

This skill does not deploy SDF objects or run the SuiteReact build. For
managing the app itself, see the `suitereact-full-cycle` skill.
