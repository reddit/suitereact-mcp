# Changelog

## [Unreleased]

- Redesigned the workspace: a single toolbar row holds record type, transaction view, and labeled Filters / Field filters / Columns toggles with active counts, replacing three rows of controls and status chips. Shares the cobalt workbench theme with Approval Manager and Script Logs.
- Load outcomes now stay on screen instead of in transient toasts: the results toolbar states "All N rows loaded", progress while paging, or "incomplete"; a persistent warning explains incomplete results and offers Load all; a failed load shows an error with Retry and notes when the visible rows are from the previous load.
- Switching record type or transaction view during background paging now marks the cached results incomplete instead of silently presenting a partial set as complete.
- The results toolbar describes the query that produced the rows and flags "Edits not applied" when filters or columns changed since loading.
- Flat-grid headers use readable labels (for example Transaction total instead of FOREIGNTOTAL); internal and line IDs no longer show thousands separators. CSV field names are unchanged.
- Removed the grid's built-in export so Export CSV is the only flat-view export (all loaded rows); compact rows with 50 per page.
- Small-screen layout: the header keeps the title, toolbar groups span the width, and the results toolbar wraps.

## [2026-09-05]

- Added ascending/descending column-header sorting across all matching transaction groups and each transaction's lines, with stable ties, blanks last, sort-aware page resets, and CSV exports in displayed order.
- Added Grouped transactions with expandable Community DataGrids, separate transaction/line column pickers, and transaction totals shown once with currency.
- Added matching/total line counts, Show all lines context highlighting, lazy line loading, independent 25-row parent and line pages, cached navigation, and retryable loading errors.
- Kept Flat lines for bulk browsing/export and added explicitly scoped transaction-page and line-page CSV exports.
- Added standard and custom transaction line fields to Extra Columns and Dynamic Field Filters, grouped separately from transaction header fields.
- Added line-level results with unique grid identities, transaction/line keyset pagination, correct row counts, CSV aliases, and links to the parent transaction.
- Line filters alone preserve one row per transaction and require all conditions to match the same line; boolean filters now work without a value.
- Added result-grain guidance, retryable field metadata warnings, and explicit incomplete-results messages for failed or capped background loads.
- Guarded the local proxy URL so production builds cannot embed the development setting.

## [2026-03-24]

- Updated theme primary color to blue (#1976d2) to match the app icon, giving Data Viewer a distinct blue identity
- Icon avatar now uses theme `primary.main` instead of hardcoded `info.main`

## [2026-03-22]

- Improved field sorting in Extra Columns and Dynamic Filter dropdowns — standard fields now appear first (alphabetically), followed by custom fields (alphabetically), matching the MUI Autocomplete group headers

## [2026-03-21]

- Fixed "View in NetSuite" links — ID parameter is now correctly inserted via URL API instead of string concatenation
- Loaded row data is now retained when switching between record-type tabs — no re-fetch required
- Each tab displays a count chip showing the number of loaded records (e.g. "Customers 38,168")
- "Load data" button changes to "Refresh data" (with refresh icon) when data is already loaded for the current tab
- Filters and dynamic columns are also preserved per tab
- Changed header icon background from gradient to solid blue
