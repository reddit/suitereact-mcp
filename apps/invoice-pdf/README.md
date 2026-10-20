# Invoice PDF Generator

A SuiteReact app for searching NetSuite invoices, selecting them, and downloading a ZIP archive of individual invoice PDFs.

## Features

- **Invoice search** with filters — date range, customer name, status, and invoice number (all substring/range matching)
- **DataGrid with checkbox selection** — sort, filter, search, and paginate results; select individual invoices or use select all, and the selection bar shows the count and per-currency totals
- **Batch PDF generation** — generates a PDF for each selected invoice using NetSuite's `N/render` module (up to 50 per download), sent as requests of 5 invoices with 3 in flight at once
- **ZIP download** — all generated PDFs are packaged into a single ZIP file using a buffered browser ZIP writer and auto-downloaded
- **Progress indicator** — a dialog shows how many invoices NetSuite has rendered so far
- **Visible outcomes** — capped results, search errors, and download results stay on screen; failed invoices are listed with reasons and can be retried
- **Safe ZIP names** — reserved characters in invoice numbers become `-`, and duplicates get ` (2)`

## Tech Stack

| Layer      | Details                                                            |
| ---------- | ------------------------------------------------------------------ |
| UI         | React 18, MUI 7, MUI X DataGrid                                    |
| Build      | Vite 6, TypeScript 5                                               |
| Data       | SuiteQL via `handleRestletAction` → local proxy → NetSuite RESTlet |
| PDF render | Server-side `N/render.transaction()` (SuiteScript 2.1)             |
| ZIP        | Client-side [`zip.js`](https://gildas-lormeau.github.io/zip.js/)   |
| Shared lib | `suitereact` (column helpers, toast hooks, REST utilities)         |

## Getting Started

### Prerequisites

- Node.js 22+
- A sandbox prepared through the repository [setup guide](../../docs/setup.md)

### Setup

```bash
# From the repo root
npm run setup
```

Setup creates the app file and a matching proxy token without overwriting
existing configuration. Fill the NetSuite credentials in `server/.env` before
starting the proxy.

Local development uses these variables:

| Variable                     | Default                 | Purpose                                                                                          |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `VITE_PROXY_SERVER_BASE_URL` | `http://localhost:3001` | Development-only proxy; keep it in `.env.development.local` so production builds cannot embed it |
| `VITE_PROXY_SERVER_TOKEN`    | —                       | Must match `SUITEREACT_PROXY_TOKEN` in `server/.env`; development only                           |

### Development

```bash
# From the repo root; validates and starts both managed services
npm run dev -- invoice-pdf --live
```

Use `npm run dev:stop -- invoice-pdf` when finished.

### Build

```bash
# From repo root
npm run build:app -- invoice-pdf
```

Output goes to `apps/invoice-pdf/client/` for deployment to NetSuite File Cabinet.

## How It Works

1. Enter optional search filters (date range, customer, status, invoice number) and click **Search invoices** (or press Enter). Results show the newest 5,000 matches; a warning appears when more exist.
2. The app runs a SuiteQL query against the `transaction` table filtered to `type = 'CustInvc'` and `mainline = 'T'`.
3. Results appear in the DataGrid. Select invoices using the checkboxes.
4. Click **Download PDFs** (up to 50 per download). The app splits the selection into requests of 5 invoices (`PDF_CHUNK_SIZE`) and sends them to the `generateInvoicePdfs` server action, 3 at a time (`PDF_CONCURRENCY`).
5. The server renders each invoice as a PDF using `N/render.transaction()` and returns the base64-encoded content.
6. The client converts each base64 PDF to a `Blob`, adds it to a buffered `zip.js` writer, and triggers a browser download.

## Server Action

The `generateInvoicePdfs` action (in `sdf/actions/`) accepts an array of invoice objects `{ id, tranId }` and returns:

```json
{
  "pdfs": [{ "id": 123, "tranId": "INV-001", "base64": "..." }],
  "successCount": 5,
  "errorCount": 0
}
```

Individual invoice failures are reported per-item (with an `error` field) and don't block the rest of the batch.

### Request sizing and concurrency

Each request renders 5 invoices, so it finishes in seconds rather than approaching NetSuite's RESTlet time limit. The client keeps 3 requests in flight. If NetSuite rejects a request for its concurrency limit (HTTP 429 / `SSS_REQUEST_LIMIT_EXCEEDED`), the client retries it with backoff (1s, 2s, 4s); after that, only that request's invoices are reported as failed and can be retried. Any other request failure marks only that request's invoices as failed. Results keep the selection order.

RESTlet concurrency is shared across the whole account, including production integrations. Check the account's limit and current usage before raising `PDF_CONCURRENCY`.

## Permissions and parameters

The app needs no SuiteReact role list.

| Setting                                          | Where                         | Needed for                                                                                                                                      |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `customdeploy_sr_sui_invoice_pdf` audience       | Suitelet deployment           | Opening the app.                                                                                                                                |
| `customdeploy_sr_rl_rct_action_handler` audience | RESTlet deployment            | Every server action. Include only the roles that use the app, and leave **Run As Role** unset so actions run with the caller's own permissions. |
| SuiteAnalytics Workbook (View)                   | Role permission               | Searching invoices and generating PDFs (`getTableRowsFromSuiteql`, `generateInvoicePdfs`).                                                      |
| Invoice view permission                          | Role permission               | Rendering each invoice's PDF.                                                                                                                   |
| `custscript_sr_invoice_pdf_ns_window`            | Suitelet parameter (checkbox) | Checked: the app opens inside NetSuite's navigation. Unchecked: it opens as a full page.                                                        |
