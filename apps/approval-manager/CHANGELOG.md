# Changelog

## [Unreleased]

- Approval now enforces segregation of duties on the server: only the assigned next approver can approve a routed transaction, and nobody can approve a transaction they created or that is for them. With no assigned approver and no recorded creator, approval is refused. Denials change nothing and show their reason on the row
- Approvals save with mandatory-field validation; they no longer pass `ignoreMandatoryFields`
- Only pending journal entries, invoices, expense reports and purchase orders can be approved; other record types and already-approved or rejected transactions are refused
- Every approval and denial writes a script audit log entry; the action handler deployment now logs at `AUDIT` so these are kept
- Denial reasons reach the row, including through the local development proxy, instead of a generic failure
- Fixed pending queues never loading (counts shown, no rows): the row query no longer selects `createdby` or uses a correlated subquery, both of which stall N/query at queue scale. Removed the Created by column. Journal amounts are now summed from lines in a separate query and fill in after the rows appear
- A queue that NetSuite doesn't answer within 90 seconds now shows an error with Retry instead of loading forever
- Rows whose amount can't be loaded show "Unavailable"; selection and approval totals say how many transactions they exclude
- Redesigned around queue tabs with live counts, replacing the type dropdown and "Load pending" button
- Added a confirmation dialog before approving, with the selection, per-currency totals, and an irreversible-action warning; Cancel is the default focus
- Failed approvals now stay selected with their NetSuite error instead of disappearing in a toast
- Added amount with currency code (journal amount is the sum of line debits) and transaction age; removed the duplicate status, type, and raw ID columns
- Selection totals are grouped by currency
- Fixed "select all" approving nothing: selection is now resolved through the grid API instead of the include-only model size
- Fixed refreshing one queue cancelling background loads for other queues
- Moved the session log into a drawer, and search/export into a single grid toolbar
- Neutral cobalt theme, with green reserved for approve and success
- Mobile layout keeps number, date, and amount visible
- Added an intercepted browser test (`test/browser.mjs`) with synthetic fixtures

## [2026-03-24]

- Updated theme primary color to green (#2e7d32) to match the app icon, giving Approval Manager a distinct green identity
- Icon avatar now uses theme `primary.main` instead of hardcoded `success.main`

## [2026-03-23]

- Parallelized approval requests with a concurrency limit of 5, dramatically reducing time to approve multiple transactions
- Replaced full data reload after approving with optimistic row removal — approved rows are instantly removed from the grid and cache
- Added real-time approval progress indicator in the button (e.g. "Approving 3/10…")

## [2026-03-22]

- Created `approveTransaction` SuiteScript action (`N/record.load` + set `approvalstatus = 2` + save)
- Added local proxy handler for `approveTransaction` using SuiteTalk REST API (PATCH)
- Client now passes `recordtype` alongside transaction ID for correct record loading
- Improved approval error messages: extracts and displays NetSuite `o:errorDetails` instead of raw JSON
- Error snackbar shows per-transaction failure detail (ID + human-readable reason)

## [2026-03-21]

- Fixed "View in NetSuite" links — ID parameter is now correctly inserted via URL API instead of string concatenation
- Changed header icon background from gradient to solid green
