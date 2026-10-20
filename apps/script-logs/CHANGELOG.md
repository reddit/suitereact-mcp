# Changelog

## Unreleased

- Add a **Custom range…** time window with From/To account-time inputs. The table action accepts `hours: 0` only with calendar-valid `from < to` literals, still applies the query anchor and 30-day retention bounds, and rejects stray bounds on fixed windows. The legacy list action is unchanged.
- Inspect side by side on desktop: opening a log turns the table into a compact worklist (time, severity, title, script · deployment) beside a full-height inspector, so neighboring logs stay visible while reading a payload. The vertical divider resizes the list (Left/Right, Home/End); the full seven-column table returns when details are collapsed.
- Consolidate inspector chrome: an error-name/message callout, one toolbar (view tabs, find with inline match count, icon actions with tooltips), and the selected path with Copy value/Copy path attached to the code surface. Notices no longer use alert semantics.
- Restyle query and result chrome: flush filter band with a highlighted unapplied-changes state, inline Density/Rows selects, icon pagination, shared severity badges and centered empty/denied/error states. Centralize colors in semantic theme tokens; inline the small icon set to keep the hosted app a single bundle.

- Fit the full-width desktop table and resizable bottom inspector into the viewport; support pointer/keyboard resizing, density choices and remembered column widths.
- Reveal and highlight long JSON string matches beyond the preview cutoff, with a paged full-value viewer and exact value copy.
- Expose script/deployment lookups directly on desktop; consolidate coverage/time guidance, add explicit refresh and last-checked time, and simplify narrow-screen filters.
- Navigate neighboring logs across bounded result pages, preserve selection where possible on sort/refresh, and restore up to five recent inspection states in memory. Clear protected rows/details/history on denied access.
- Improve scan text and query highlighting; show all seven log fields in stacked narrow-screen rows with sorting and return focus/scroll.

- Open directly in Live NetSuite; remove the synthetic demo switch, scenario controls and fixture data from production. Keep invented examples in a test-only intercepted browser harness.
- Format incomplete or invalid JSON objects/arrays with bounded, best-effort indentation. Preserve unfinished tokens and string contents, expose the exact Original, and provide a separate Copy formatted text action. Never fabricate missing content; retain plain-text and oversized-payload fallbacks.

- Replace the narrow execution list with a full-width sortable table showing timestamp, log type, script, deployment, execution user, title and bounded detail preview. Sort across server-side pages, with 10/25/50-row choices and explicit deployment-linked log coverage.
- Add a collapsible bottom inspector and a focused detail view; retain selected payload, JSON expansion and find state when collapsed. Preserve plain-text and malformed-payload inspection.

- Enable live deployment lookup, exact deployment filtering and deployment labels using the native deployment-to-execution-log search join. Use SuiteQL `primarykey` for native deployment IDs; keep missing/ambiguous links unassigned and preserve raw ScriptNote details.

- Add script/deployment type-ahead lookups with name/ID matching, keyboard selection, clearing, and consistent parent/deployment selection in demo mode. Add a bounded, permission-gated live script metadata action with debounce, stale-response protection, and retry states.

- Keep active JSON and text matches in view after width or height changes, with a small scroll margin; disable match navigation when there is only one match.

- Make text and JSON equal investigation paths, with shared find, original copy and download; show JSON/stack controls only when applicable.
- Give details more desktop space and open a dedicated narrow-screen detail view with Back restoring result context.
- Keep JSON branches browsable during search; add match navigation, bounded tree pages, keyboard navigation, selected-value copy and JSON Pointer copy.
- Distinguish unapplied filters, unavailable results and permission rechecks; show script references in result rows.

- Add a read-only Script Log Explorer with searchable paginated results and execution details.
- Add syntax-colored JSON inspection, collapsible objects/arrays, payload search, and full/value clipboard controls.
- Preserve malformed JSON and plain text; bound tree rendering and page oversized raw payloads.
- Add an explicit synthetic demo and recording walkthrough.
- Add a role-gated ScriptNote reader.
- Require native SuiteScript View permission for fixed log reads and preserve legacy shared actions through a compatibility handler.
- Resolve hosted assets through File Cabinet URLs and include a single JavaScript bundle for NetSuite hosting.
