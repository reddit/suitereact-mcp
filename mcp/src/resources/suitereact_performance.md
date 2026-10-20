# SuiteReact Performance Patterns

Use these patterns for exports, PDFs, bulk actions, SuiteQL dashboards, and apps that process many NetSuite records.

## Client Files and Zip Output

- Prefer Blob/ArrayBuffer paths over base64 strings for file data.
- For large client-side zip generation, use `@zip.js/zip.js` with `ZipWriter`, `BlobReader`, and `BlobWriter`.
- Avoid `JSZip + atob + Uint8Array` loops for many PDFs/files; this blocks the browser main thread and inflates memory.
- Convert data URLs to Blob/ArrayBuffer before adding files to a zip.
- Do not keep base64 PDFs in React state longer than needed.
- Use `URL.createObjectURL(blob)` for downloads and revoke the object URL after use.
- Batch large export sets and update progress between batches.

## RESTlet Payloads

- Return the smallest payload the UI needs.
- Prefer File Cabinet file IDs, download URLs, or metadata over inline file bytes.
- If inline file content is required, return batches with `{ name, mimeType, dataUrl | base64, recordId }`.
- Do not return the same file content twice.
- Make bulk responses resumable: include successes, failures, and next cursor/batch where applicable.

## NetSuite Governance

- `N/render` PDF generation is expensive; cap batch sizes and fail before governance is exhausted.
- Use Map/Reduce or scheduled scripts for truly large jobs.
- Cap client-triggered concurrency for record loads, PDF renders, and bulk updates.
- Return partial success details instead of failing the whole request when individual records fail.

## SuiteQL

- Select only fields needed by the UI.
- Parameterize user input.
- Use filters and `RowNum`/keyset pagination.
- Validate queries with `suiteql_query_assistant` and `execute_suiteql_query` before coding.
- Avoid fetching every row and slicing in React.

## UI Responsiveness

- Disable buttons while expensive actions run.
- Show progress, current batch, and failed item count.
- Keep partial results visible.
- Provide retry or resume behavior for failed batches.

## Red Flags

- `JSZip`, `atob`, or `btoa` in a PDF/export flow.
- Large `base64` strings stored in React state or localStorage.
- `Promise.all(records.map(...REST call...))` with no concurrency limit.
- RESTlets that return thousands of rows with no cursor, page, or limit.
- SuiteScript loops that render PDFs or load records without checking governance.
