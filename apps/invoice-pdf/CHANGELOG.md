# Changelog

## [Unreleased]

- PDFs are generated faster: the selection is sent as requests of 5 invoices with 3 in flight, instead of one request for the whole download. In SB1, 50 invoices took about 40s end to end, and each request stayed under 20s. Requests NetSuite rejects for its concurrency limit are retried with backoff, and any failed request affects only its own invoices.
- The progress dialog shows how many invoices NetSuite has rendered so far, then when the PDFs are being zipped.
- Fixed selection so downloads contain exactly the checked invoices. Before, header "select all" counted as nothing selected, and select all followed by unchecking some invoices generated PDFs for only the unchecked ones.
- Kept readable column names and amount formatting after a search; the grid no longer switches to raw field names (`Tranid`, `Duedate`).
- Amounts show their transaction currency (the query adds `BUILTIN.DF(t.currency)`), and the selection bar totals the selection per currency without adding currencies together.
- A persistent warning appears when results are capped ("Showing the newest 5,000 of 152,638 invoices"), noting that selection and downloads include only the invoices shown.
- Download outcomes stay on screen, name each failed invoice with its reason, and offer Retry failed; search errors stay on screen with Retry. These replace transient toasts.
- ZIP entries use safe, unique file names: path and reserved characters become `-`, and repeated invoice numbers get ` (2)` instead of overwriting each other.
- Selecting more than 50 invoices explains the per-download limit inline instead of silently disabling the action.
- Redesigned to the shared workbench layout and theme: one filter row (Enter searches), results toolbar with selection, totals, search and Download PDFs, empty states, and a small-screen layout.
- Replaced the controls-only smoke test with a fixture suite covering search, selection, limits, partial failures, ZIP names and search errors.

## [2026-07-05]

- Replaced JSZip plus manual base64 byte-copying with `zip.js` `BlobReader`/`BlobWriter` ZIP creation for faster client-side PDF archive generation.
- Kept NetSuite PDF rendering and invoice search behavior unchanged.

## [2026-03-28]

- Fixed SuiteQL query: `mainline` is a `TransactionLine` field, not `Transaction` — now uses `INNER JOIN transactionline tl ON (tl.transaction = t.id) AND (tl.mainline = 'T')` for header-level rows
- Cleaned up invoice status display with `REPLACE(BUILTIN.DF(t.status), 'Invoice : ', '')`
- Verified queries against live NetSuite instance via MCP SuiteQL tools

## [2026-03-27]

- Initial release of Invoice PDF Generator app
- Invoice search with SuiteQL — filters for date range, customer, status, and invoice number
- DataGrid with checkbox selection, sorting, filtering, and pagination
- Batch PDF generation using `N/render.transaction()` (max 50 per batch)
- Client-side ZIP creation with JSZip and auto-download
- Progress dialog during PDF generation
- Toast notifications for success, warning, and error states
- SDF objects: Suitelet, script deployment, center category link
- Server action: `generateInvoicePdfs` for batch PDF rendering
