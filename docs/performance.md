# SuiteReact Performance Guide

Performance problems in NetSuite apps usually come from moving too much data, converting binary payloads on the browser main thread, or asking SuiteScript to do high-governance work inside a single synchronous request.

Use this guide when building exports, PDF generation, bulk updates, SuiteQL dashboards, or any app that may process hundreds of records.

## Golden Rules

- Return the smallest useful payload from RESTlets.
- Keep binary data out of React state.
- Prefer `Blob`, `ArrayBuffer`, File Cabinet file IDs, or download URLs over large base64 strings.
- Page large datasets; do not fetch every row because the grid can technically render it.
- Cap concurrency for NetSuite calls and long-running browser work.
- Show progress for anything that can take more than a few seconds.
- Validate SuiteQL with the MCP SuiteQL tools before embedding it in a server action.

## Client-Side Files and Zip Generation

For PDF/file export flows:

- Prefer `@zip.js/zip.js` with `ZipWriter`, `BlobReader`, and `BlobWriter` for large client-side zip files.
- Avoid `JSZip + atob + Uint8Array` loops for many PDFs; that path inflates memory and blocks the main thread.
- Convert data URLs to `Blob`/`ArrayBuffer` before writing zip entries.
- Do not store PDF/base64 payloads in React state longer than needed.
- Use `URL.createObjectURL(blob)` for downloads and revoke object URLs after use.
- Batch large export sets and update progress between batches so the UI stays responsive.

The `invoice-pdf` fix is the reference pattern: it moved zipping to a Blob-oriented client path instead of repeatedly decoding base64 strings into typed arrays.

## RESTlet Payloads

Prefer this response shape for large files:

```typescript
{
  success: true,
  files: [
    { id: 123, name: 'invoice-1001.pdf', url: '/core/media/media.nl?id=123&...' }
  ]
}
```

Only return inline file data when the browser must assemble the final artifact locally. If inline data is unavoidable:

- Return one file batch at a time.
- Include file names, MIME types, and record IDs.
- Keep payloads JSON-serializable and easy to resume/retry.
- Avoid sending the same PDF/file content twice.

## SuiteScript and Governance

- PDF rendering with `N/render` is expensive; batch work and fail with a resumable error before governance is exhausted.
- Bulk updates should cap concurrency or move to Map/Reduce for truly large jobs.
- Use clear server-side validation before loading records.
- Log enough context to debug support cases, but do not log full payloads or secrets.
- Return partial success details when bulk work can continue after individual record failures.

## SuiteQL

- Select only fields needed by the UI.
- Add filters early and parameterize user input.
- Use `RowNum` or keyset-style pagination; do not rely on fetching everything and slicing in React.
- Use `BUILTIN.DF()` only for display values the UI actually needs.
- Test syntax, fields, joins, and row counts with `suiteql_query_assistant` and `execute_suiteql_query`.

## UI Responsiveness

- Disable destructive or expensive buttons while work is running.
- Show progress count, current batch, and failed item count for bulk work.
- Keep the grid usable while background data loads.
- Provide a retry path for failed batches.
- Avoid global full-screen spinners for operations where partial results are useful.

## Review Questions

- What is the largest realistic record count?
- What is the largest realistic RESTlet response size?
- Does the app handle a slow NetSuite response without looking broken?
- Can the user recover from partial failure?
- Does the browser do binary conversion in a tight loop?
- Should this be a synchronous RESTlet, a File Cabinet download, or Map/Reduce?
