---
name: doc-spaces-search
description: Search available doc-spaces documents in NetSuite for context. Discovers spaces and docs via SuiteQL (titles, slugs, descriptions, status) using the execute_suiteql_query MCP tool, then reads the full HTML of selected docs through the local proxy's dsGetDocHtml action. Use when the user asks to find, search, look up, or pull context from doc-spaces docs, NetSuite docs, snoo_docs, or the docs app — or when you need background knowledge that an existing published doc likely contains.
---

# doc-spaces-search

**Goal:** Find relevant doc-spaces documents by their metadata, then read their
contents so you can use them as context for the current task.

**Two phases, two transports:**

1. **Discover** metadata with the `execute_suiteql_query` MCP tool (queries the
   account directly).
2. **Read** a doc's HTML through the **local proxy** RESTlet action
   `dsGetDocHtml` (`POST http://localhost:3001/api/handle-action`).

## Prerequisites

- The `suitereact-mcp` MCP server must be authenticated (`mcp_auth` once per
  session) for phase 1 SuiteQL.
- The **local proxy must be running** for phase 2: check with
  `lsof -ti :3001`; start with `npm run server` if absent. Content reads are
  authenticated by the proxy's OAuth TBA user (`server/.env`), so you can only
  read docs that user has at least view access to.

## Data model

| Record | Key fields |
| --- | --- |
| `customrecord_sr_space` | `name`, `custrecord_space_slug`, `custrecord_space_type` (list), `custrecord_space_description`, `custrecord_space_landing_doc`, `custrecord_space_fc_folder`, `custrecord_space_archived` |
| `customrecord_sr_doc` | `name` (title), `custrecord_doc_slug`, `custrecord_doc_space` (→ space id), `custrecord_doc_fc_file` (File Cabinet file id), `custrecord_doc_status` (list: draft/published), `custrecord_doc_is_landing`, `custrecord_doc_archived` |

Checkbox fields compare against `'T'` / `'F'`. Use `BUILTIN.DF(...)` to read the
display text of list/select fields.

## Workflow

```
Task Progress:
- [ ] 1. List spaces (or search docs by keyword) via SuiteQL
- [ ] 2. Pick the doc(s); capture the doc `id`
- [ ] 3. Ensure the proxy is running (lsof -ti :3001)
- [ ] 4. Read each doc's HTML via dsGetDocHtml through the proxy
- [ ] 5. Use the content as context (summarize / cite the space + doc slug)
```

### Step 1 — Discover via SuiteQL (`execute_suiteql_query`)

List spaces:

```sql
SELECT id, name, custrecord_space_slug AS slug,
       BUILTIN.DF(custrecord_space_type) AS type,
       custrecord_space_description AS description
FROM customrecord_sr_space
WHERE custrecord_space_archived = 'F'
ORDER BY name
```

Search docs by keyword across title + slug (join the space for its slug):

```sql
SELECT d.id, d.name AS title, d.custrecord_doc_slug AS slug,
       s.custrecord_space_slug AS space_slug,
       d.custrecord_doc_fc_file AS fc_file_id,
       BUILTIN.DF(d.custrecord_doc_status) AS status,
       d.custrecord_doc_is_landing AS is_landing
FROM customrecord_sr_doc d
  JOIN customrecord_sr_space s ON s.id = d.custrecord_doc_space
WHERE d.custrecord_doc_archived = 'F'
  AND ( LOWER(d.name) LIKE '%KEYWORD%'
        OR LOWER(d.custrecord_doc_slug) LIKE '%KEYWORD%' )
ORDER BY d.name
```

List every doc in a known space (by space slug):

```sql
SELECT d.id, d.name AS title, d.custrecord_doc_slug AS slug,
       BUILTIN.DF(d.custrecord_doc_status) AS status
FROM customrecord_sr_doc d
  JOIN customrecord_sr_space s ON s.id = d.custrecord_doc_space
WHERE s.custrecord_space_slug = 'SPACE_SLUG'
  AND d.custrecord_doc_archived = 'F'
ORDER BY d.custrecord_doc_is_landing DESC, d.name
```

Lowercase the keyword and the column (`LOWER(...) LIKE '%...%'`) for
case-insensitive matching. Prefer `status = 'published'` docs unless the user
asks for drafts.

### Step 2 — Pick the doc

From the results, keep the doc `id` (needed for the read) and the
`space_slug` + doc `slug` (use these when you cite the source back to the user).

### Step 3 — Ensure the proxy is running

```bash
lsof -ti :3001 || npm run server
```

`npm run server` builds and starts the Express proxy; give it a few seconds to
come up before the first read.

### Step 4 — Read HTML via `dsGetDocHtml` (through the proxy)

The proxy expects the `handleRestletAction` envelope:
`params.actionProps.action` + `inputData`. Write the response to a temp file
(doc HTML can be large), then read that file.

```bash
curl -s http://localhost:3001/api/handle-action \
  -H 'Content-Type: application/json' \
  -d '{"params":{"actionProps":{"action":"dsGetDocHtml"}},"inputData":{"docId":"DOC_ID"}}' \
  | jq -r '.html // .error' > /tmp/doc-DOC_ID.html
```

- Success returns `{ "html": "<!DOCTYPE html>..." }` → the command writes the
  HTML to the temp file. Open it with the Read tool to use as context.
- A missing file ref returns `{ "html": "" }` (empty doc).
- Errors return `{ "error": ... }` with HTTP 400 — `jq` writes the error string
  instead; inspect and handle per **Failure modes**.

Pass `"draft": true` in `inputData` to read the draft instead of the published
version.

### Step 5 — Use the content

Summarize or extract what the task needs and cite the source as
`space-slug / doc-slug`. Do not paste the entire HTML back unless asked.

## Failure modes

- **`Forbidden: you do not have access to this document.`** — the proxy's TBA
  user lacks view access on the doc/space. Report it; you cannot bypass access.
- **`curl: ... Connection refused` on :3001** — the proxy isn't running. Start
  it with `npm run server`, wait, retry.
- **SuiteQL `INVALID_PARAMETER` / unknown column** — verify the field id
  against the Data model table above; list/select fields need `BUILTIN.DF(...)`.
- **`Action ... failed: 401`** — proxy OAuth expired; check `server/.env`, then
  for the MCP SuiteQL phase run `mcp_auth`.

## Non-goals

This skill is read-only. To author or publish docs, use `doc-spaces-author` or
`doc-spaces-publish`. It does not deploy SDF objects or modify spaces/docs.
