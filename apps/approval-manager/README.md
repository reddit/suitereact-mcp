# Approval Manager

A SuiteReact app for reviewing and approving pending NetSuite transactions. Supports Journal Entries, Invoices, Expense Reports, and Purchase Orders.

## Features

- **Queue tabs** with live pending counts per transaction type, loaded in parallel; a failed queue never blocks the others
- **Review columns** — number (opens the record in NetSuite), date with age, name, memo, and amount with its currency code; journal amounts are the sum of line debits because journals have no transaction total. They load in a separate non-correlated query after the rows appear, so a slow amount lookup never blocks the queue. The queue query deliberately avoids `createdby` and correlated subqueries, which stall N/query at queue scale
- **Selection totals grouped by currency** — amounts in different currencies are never summed together
- **Confirmed bulk approval** — a dialog lists the selection and per-currency totals before anything is written; Cancel is the default focus. Approvals run with up to 5 in parallel, and failures stay selected with their NetSuite error so they can be reviewed and retried
- **Keyset pagination** — loads all pending transactions, even beyond the 5,000-row SuiteQL limit, via background page fetching
- **Session approval log** — drawer listing every transaction approved in the current tab (NetSuite record history remains the system of record)
- **Search and CSV export** of the visible queue from the grid toolbar
- **Empty and error states** per queue, with retry
- **Mobile layout** keeps number, date, and amount visible without horizontal scrolling

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
npm run dev -- approval-manager --live
```

Use `npm run dev:stop -- approval-manager` when finished.

### Build

```bash
# From repo root
npm run build:app -- approval-manager
```

Output goes to `apps/approval-manager/client/` for deployment to NetSuite File Cabinet.

## How It Works

1. On mount, the app fetches pending transactions for all four types in parallel using keyset pagination (`WHERE t.id > lastId ORDER BY t.id ASC`).
2. A `COUNT(*)` query runs alongside each type to show progress (e.g. "5,000 of 8,350 pending").
3. Cached results populate the grid instantly when switching tabs; the refresh button re-fetches the current queue.
4. Approving calls the `approveTransaction` server action for each confirmed row, which sets `approvalstatus = Approved` on the record.

## Approval controls

The `approveTransaction` server action enforces these checks, all fail-closed. A denied approval changes nothing and shows its reason on the row. The action handler returns the reason for these expected denials only; any other failure stays a generic error.

- **Supported records only.** Journal entries, invoices, expense reports and purchase orders that are pending approval. Approved or rejected transactions can't be approved again.
- **Assigned approver.** If NetSuite has assigned a next approver, only that user can approve.
- **No self-approval.** You can't approve a transaction you created, or an expense report or purchase order that is for you. The creator comes from `createdby`, or from the record's creation system note when `createdby` is empty (common for integration-created transactions).
- **Unknown creator.** With no assigned approver and no recorded creator, the app can't confirm segregation of duties, so it refuses. Approve those in NetSuite.
- **Mandatory fields.** The save enforces required fields; a transaction missing one fails with NetSuite's error.
- **Audit log.** Every approval and denial writes a script audit log entry with the user, role and transaction. NetSuite's system notes record the status change. The action handler deployment must log at `AUDIT` or `DEBUG`; at `ERROR` these entries are dropped. The repository deployment ships at `AUDIT`.

> **Approval workflows:** setting the approval status directly records a single approval. In accounts that route approvals through a multi-level workflow (for example the General Approval Workflow SuiteApp), this may skip later approval tiers. Don't enable the app's approve action in those accounts without confirming how the workflow handles it.

## Permissions and parameters

The app needs no SuiteReact role list. NetSuite's own permissions decide who can load and approve, and the approval controls above add segregation of duties.

| Setting                                                                         | Where                         | Needed for                                                                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `customdeploy_sr_sui_approval_manager` audience                                 | Suitelet deployment           | Opening the app.                                                                                                                                |
| `customdeploy_sr_rl_rct_action_handler` audience                                | RESTlet deployment            | Every server action. Include only the roles that use the app, and leave **Run As Role** unset so actions run with the caller's own permissions. |
| SuiteAnalytics Workbook (View)                                                  | Role permission               | Loading the approval queues, which run SuiteQL.                                                                                                 |
| Transaction permissions (Edit, or the approval permission for each record type) | Role permission               | Approving. Without them the save fails with NetSuite's error.                                                                                   |
| `custscript_sr_approval_manager_ns_window`                                      | Suitelet parameter (checkbox) | Checked: the app opens inside NetSuite's navigation. Unchecked: it opens as a full page.                                                        |

## Testing

The browser test intercepts every API call with synthetic data, so it needs no NetSuite session:

```bash
# With the Vite dev server running for this app
SUITEREACT_VITE_URL=http://localhost:5173/ node apps/approval-manager/test/browser.mjs <evidence-dir>
```

It covers queue counts, confirmation, partial failure and retry selection, select-all, empty and error queues, and the mobile layout. The fixture never answers a row query containing a nested `SELECT`, or selecting `createdby`, mirroring how both stall N/query in NetSuite, and also covers journal amounts loaded from lines, a failed amount lookup, and a stalled queue timing out.
