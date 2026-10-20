# Changelog

## [Unreleased]

- Results show exactly what NetSuite returned. Values the shared SuiteQL action splits on a colon are rejoined, so `BUILTIN.DF` statuses read `Sales Order : Cancelled` instead of `Cancelled` and times keep their hours. Headers are the exact field names, and IDs are not thousands-grouped. Numbers and dates still sort correctly.
- Rows are keyed by position, so a query whose `id` column repeats (common with joins) no longer merges rows and shows another row's values.
- Only the latest run updates the results; a slower earlier run can no longer overwrite them.
- The results bar shows rows, columns, and elapsed time, flags **Edits not run** when the editor differs from the query that produced the results, and warns persistently when NetSuite returns its 5,000-row limit.
- Failed queries stay on screen with the NetSuite error code, message, hint, and expandable detail. The error code is now kept when the action reports the error in a successful response.
- Empty results say "The query returned no rows" instead of showing the first-run prompt.
- Assistant replies render as readable text; the previous HTML formatting appeared as raw tags because the chatbot's HTML mode is off. Plain text avoids enabling that mode for user and raw model messages.
- CSV export uses the raw values and exact field names, and prefixes formula-like text with an apostrophe so spreadsheets do not evaluate it.
- Inline status and alerts replace toast notifications.
- Redesigned to the shared workbench layout and tokens while keeping the app's purple accent: Run sits beside the editor, columns autosize to their content, and on small screens the assistant opens as a full-width overlay instead of squeezing the page.
- The assistant keeps its conversation, draft, and model when the window crosses the small-screen breakpoint. The small-screen overlay takes keyboard focus, keeps Tab inside, closes with Escape, and returns focus to the **Assistant** button.
- Date columns filter with date operators (before, after, is), and ISO timestamps sort by instant across time-zone offsets; cells still show the original text. Whitespace edits inside string literals count as **Edits not run**.
- Added fixture smoke steps for verbatim results, CSV, run ordering, the row limit, errors, date filtering, the breakpoint, and overlay focus, plus unit tests for result shaping.

## [2026-07-12]

- Made the SuiteQL query editor vertically resizable and the AI assistant width adjustable by pointer or keyboard
- Fixed GPT-5.4 and newer OpenAI requests failing when the app supplied a non-default temperature
- Replaced the AI assistant model selector with the approved ChatGPT and OpenRouter catalogs
- Changed the default assistant model to `gpt-5.6-sol`

## [2026-07-11]

- Added automatic SuiteQL formatting for manually entered, AI-generated, and history-loaded queries
- Persisted query history across browser sessions and added per-query removal
- Fixed hosted NetSuite builds attempting to call the local development proxy for LLM and SuiteQL requests
- Added concise, LLM-generated history titles based on each natural-language request
- Kept the full SuiteQL visible beneath each title and added table-based fallback titles for manually entered queries

## [2026-03-24]

- AI chatbot now formats structured query responses with syntax-highlighted SQL, confidence percentage, query type, and expected fields list
- Added `formatStructuredContent` prop to NsReactChatbot component for custom response formatting
- Enabled HTML rendering in the chatbot for rich response display
- Added Vite dev proxy for `/api` routes to simplify local development
- Updated theme primary color to purple (#7b1fa2) to match the app icon, giving SuiteQL Bot a distinct purple identity
- Upgraded theme to use the shared component style overrides (rounded buttons, paper borders, typography)
- Icon avatars now use theme `primary.main` instead of hardcoded hex

## [2026-03-22]

- AI assistant drawer now opens by default on app load
- AI-suggested queries auto-run immediately after the bot returns a structured response
- Fixed: structured responses from the LLM that don't include the `botExplanation` wrapper are now parsed as a fallback, so queries always populate and auto-run

## [2026-03-17]

- Improved error handling end-to-end: server-side `getResultsFromSuiteQl` now includes the failed query in error messages; action handler extracts the error code (`e.name`)
- Client parses the action handler's `{ success, error, message }` wrapper to extract error code and query preview
- Error alerts now show contextual hints for common error codes (UNEXPECTED_ERROR, SSS_SEARCH_ERROR_OCCURRED, INSUFFICIENT_PERMISSION, etc.)
- Failed query text is shown in the error detail area for easy debugging
- Added descriptive error handling: SuiteScript errors now display error code, message, and detail inline with a dismissible Alert, plus toast notifications with the error name and message
- Moved AI chatbot from fixed bottom panel to a collapsible right-side drawer with persistent layout, toggled via header button
- Main content area smoothly resizes when the AI drawer opens/closes

## [2026-03-21]

- Renamed from suiteql-assistant to suiteql-bot (SuiteQL Bot)
- Changed header icon background from gradient to solid purple
