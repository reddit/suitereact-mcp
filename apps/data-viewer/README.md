# Data Viewer

A SuiteReact app for browsing NetSuite records — customers, transactions, and employees — with filtering, dynamic columns, and background pagination.

## Features

- **Record type switching** between customers, transactions, and employees — loaded data is retained when switching tabs, so you can flip between record types without re-fetching
- **Basic filters** — date range, status, transaction type (dropdown), internal ID, tran ID
- **Dynamic filters** — use query-authorized field metadata to add field-level rules with operators by type (string/number/date/boolean/enum); transaction line filters can find matching transactions without duplicating them
- **Dynamic columns** — choose header fields and standard/custom transaction line fields in separate alphabetized groups
- **Grouped transactions** — expandable parent rows with lazy line grids, matching/total counts, context highlighting, and independent parent/line pages; built entirely with MUI Community components
- **Grouped sorting** — click transaction or line column headers to sort the full matching result set, with independent line ordering per expanded transaction
- **Transaction lines** — adding a line column shows one row per matching line, including a separate Line ID; transaction IDs still open the parent record in NetSuite
- **Flat-view keyset pagination** — loads an initial 5,000 rows, then continues fetching in the background with progress in the results toolbar until all records are loaded
- **Visible load outcomes** — the results toolbar always states whether every row loaded; incomplete or failed loads stay on screen with Load all / Retry, and unapplied filter or column edits are flagged
- **View in NetSuite** — each row links directly to the record using dynamically resolved URL templates
- **Column type inference** — automatically detects date, number, and string types for native DataGrid sorting, filtering, and formatting
- **CSV export** — Export CSV writes all loaded rows in Flat lines (raw field names as headers); explicitly labeled transaction-page and line-page exports in Grouped transactions

## Tech Stack

| Layer      | Details                                                            |
| ---------- | ------------------------------------------------------------------ |
| UI         | React 18, MUI 7, MUI X DataGrid                                    |
| Build      | Vite 6, TypeScript 5                                               |
| Data       | SuiteQL via `handleRestletAction` → local proxy → NetSuite RESTlet |
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
npm run dev -- data-viewer --live
```

Use `npm run dev:stop -- data-viewer` when finished.

### Build

```bash
# From repo root
npm run build:app -- data-viewer
```

Output goes to `apps/data-viewer/client/` for deployment to NetSuite File Cabinet.

## How It Works

The following describes the flat grid used by customers, employees, and **Flat lines**. Grouped transaction paging is described below.

1. Selecting a record type restores any previously loaded data for that type. The field schema is fetched through the query-authorized action handler (and cached) when filter or column panels are opened. Header fields come from the existing `N/record` schema action; line fields use verified SuiteQL column IDs plus `CustomField` metadata for `custcol_*` fields.
2. Clicking "Load data" (or "Refresh data" if data is already loaded) builds a SuiteQL query from the active filters and columns, fetches up to 5,000 rows, and displays them in the DataGrid. Each tab shows a count chip with the number of loaded records.
3. If there are more than 5,000 rows, background pagination kicks in automatically. Header queries advance by record ID; line queries advance by `(transaction ID, line ID)` so a page ending inside a transaction does not skip its remaining lines. Loading stops after 200 additional pages. Page failures and the page cap show an incomplete-results message.
4. A `COUNT(*)` query runs in parallel to show accurate progress (e.g. "5,000 of 38,169 records").
5. URL templates for the "View" column are resolved via the `resolveRecordUrls` server action using `N/url.resolveDomain` and `N/url.resolveRecord`.

## Grouped Transactions

**Transactions** defaults to **Grouped transactions**. Load data, then expand a parent to browse its lines. **Flat lines** retains the original grid and bulk export. Extra Columns has separate **Transaction columns** and **Line columns** selectors; apply changes with **Apply & Load** or **Refresh data**. Memo, department, and net amount are selected initially for lines. Clearing line columns leaves Line ID in the expanded view.

- Parent pages contain up to 25 transactions, regardless of the number of lines. Only visible parents receive a batched line-count query. Child pages contain up to 25 lines, fetched on expansion. Default order is internal ID for parents and line ID for children. No line-detail queries run for unexpanded parents.
- Click a transaction column header to toggle ascending/descending order across all matching parents. Click a line column header to sort that transaction's matching lines. Numeric and date columns sort by their native values; reference fields sort by their displayed names. Blank values stay last, and IDs break ties consistently. Line counts and match/context badges are not sortable.
- Changing a sort returns that pager to page one and clears its cached pages. Each expanded transaction has its own line sort; **Show all lines** / **Show matching lines** keeps the chosen line order. Changing parent sort reloads its page and closes the expanded grids. Refreshing data resets both levels to their default ID order.
- Line filters select parents through a same-line `EXISTS` condition. Badges show matching and total line counts. **Show all lines** stays within that parent and highlights **Matches**, with other rows marked **Context**; **Show matching lines** restores the filtered view.
- Transaction totals appear once on the parent, next to currency. Missing totals display a dash, not zero. Child rows contain line values only; no totals are summed across transactions or currencies.
- Collapsing retains the expanded grid and its pages. Up to eight visited pages per active parent/line pager are cached; leaving a parent page discards its expanded grids. Switching record tabs or view modes retains the grouped result snapshot. Refreshing or applying filters/columns resets the grouped snapshot and caches; late responses from the prior snapshot cannot replace it.
- Parent and child pagination use an extra lookahead row, never exposing it or using it as the next cursor. Default ID order uses keyset paging. Other sorts apply deterministic ordering before a bounded row-number window; only the current page and lookahead are returned. A transaction can span many child pages without splitting across parent pages. Page errors have an explicit retry; an unsuccessful navigation leaves the last successful page visible.
- **Export transaction page** exports the visible parent page with totals once. **Export line page** exports the current line page and includes match flags when showing context. Both exports preserve the selected sort order and omit internal paging metadata. Use **Flat lines → Export CSV** for all loaded flat results. Use the query filters for the full dataset; client-only grid filtering is disabled on line pages.

Sorting custom/unindexed fields or navigating deep sorted pages can cost more than default ID paging. Apply filters to narrow large queries. Pages are not a database snapshot; refresh after concurrent record changes. Sorting transaction totals uses each transaction's currency without currency conversion.

This uses MUI `Table` / `Collapse` and `@mui/x-data-grid` Community. It does not require MUI X Pro detail panels or Premium row grouping.

## Transaction Line Fields

In **Transactions → Extra Columns → Line columns**, select fields from **Transaction Line Fields** or **Custom Transaction Line Fields**. Standard choices include item, quantity, rate, net/foreign amount, memo, subsidiary, department, class, location, main line, tax line, line ID, and unique key. Line fields use `transactionline.<field>` identifiers and `line_<field>` CSV columns to keep them distinct from headers.

- In **Flat lines**, a line column expands results to one row per matching line. Header values, including `foreigntotal`, repeat on every line; use **Line: Net Amount** or **Line: Foreign Amount** for line amounts. Do not sum repeated header totals.
- In **Flat lines**, line filters without line columns return one row per matching transaction. All line filters must match the same line. With line columns selected, only the matching lines are returned. Counts follow the selected result grain.
- All line types are included by default. Apply **Line: Main Line** and **Line: Tax Line** boolean filters when needed. Journal lines can be marked as main lines; blindly excluding main lines can hide journal entries.
- Boolean filters need no value. Reference fields (item, department, etc.) display names in columns; their filter values use internal IDs.
- Custom fields follow the current role's metadata/query permissions. A metadata failure leaves standard line fields available and offers **Retry fields**. A field that is not exposed to SuiteQL can still be rejected by NetSuite when queried.

## Permissions and parameters

The app needs no SuiteReact role list.

| Setting                                          | Where                         | Needed for                                                                                                                                      |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `customdeploy_sr_sui_data_viewer` audience       | Suitelet deployment           | Opening the app.                                                                                                                                |
| `customdeploy_sr_rl_rct_action_handler` audience | RESTlet deployment            | Every server action. Include only the roles that use the app, and leave **Run As Role** unset so actions run with the caller's own permissions. |
| SuiteAnalytics Workbook (View)                   | Role permission               | Loading data and field metadata (`getTableRowsFromSuiteql`, `getRecordFieldSchema`).                                                            |
| View permission on each record type browsed      | Role permission               | Rows and fields the role can't see are omitted by NetSuite.                                                                                     |
| `custscript_sr_data_viewer_ns_window`            | Suitelet parameter (checkbox) | Checked: the app opens inside NetSuite's navigation. Unchecked: it opens as a full page.                                                        |

## Validation and Deployment

```bash
node --test apps/data-viewer/test/transaction-lines.test.mjs
VITE_PROXY_SERVER_BASE_URL=http://localhost:3001 \
VITE_PROXY_SERVER_TOKEN=fixture-token \
  npm run dev:test -- data-viewer -- npm run test:app -- data-viewer
```

The browser regression spec intercepts REST requests with fixtures. It verifies 5,001 flat lines across a page boundary, CSV contents, record links, metadata retry, tab caching, boolean filters, lazy grouping, matching/context rows, independent pagination, collapsed-grid caching, line error retry, and stale-response handling on refresh. Sorting coverage includes both directions, ties/blanks across pages, independently sorted line grids, matching/context transitions, ordered page exports, sorted-query retry, and stale sort responses. It does not validate deployed server code; it rejects `--live` rather than using fixtures as live evidence.

Deploy the app together with the updated `sdf/actions/getRecordFieldSchema.ts` and its new `sdf/actions/_dataViewer/transactionLineSchema.ts` dependency. The existing action export and handler are unchanged. Validate exact compiled paths before an explicitly requested deployment. Older clients remain supported; the updated UI reports when the field service lacks line support. After deployment, verify the schema action and run real queries under the intended NetSuite role before relying on live results.
