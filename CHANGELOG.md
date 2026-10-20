# Changelog

All notable changes to this project will be documented here. The project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Protected version-tag and trusted SSH-signature verification before npm publication.
- An active Doc Spaces backing-record guard, explicit native permission lists,
  and a sandbox authorization checklist.
- Packed-package runtime and declaration checks for CommonJS, ESM, NodeNext,
  and TypeScript Bundler consumers.
- A safe, idempotent `npm run setup` command and task-oriented setup guide for
  first-time contributors.
- Task-specific doctor modes and managed live-start readiness checks.
- Reproducible npm workspace installation with a committed lockfile.
- CI, CodeQL, dependency updates, secret scanning, and package-content checks.
- Local proxy authentication, origin restrictions, rate limiting, request
  limits, and security tests.
- NetSuite role and model allowlists with disabled least-privilege deployment
  defaults.
- Public contribution, security, support, release, provenance, and third-party
  notice documentation.

### Changed

- SuiteQL Bot now offers eight approved OpenAI and OpenRouter models, defaults
  to GPT-6.1 Sol, and labels each choice with its route and intended role. The
  LLM proxy omits sampling controls for direct GPT-6 requests.

- **Authorization uses native NetSuite permissions.** The action handler's
  deployment audience decides who can call it. Query actions require
  SuiteAnalytics Workbook (View) instead of `custscript_sr_query_role_ids`, and
  writes rely on native record permissions plus each action's own checks
  instead of `custscript_sr_mutation_role_ids`. Both parameters are removed.
  Doc Spaces dynamic-group previews run caller-supplied employee criteria, so
  they are classified as queries and also require Workbook.
  Customer statement email, which sends as the configured sender employee,
  keeps a single-purpose list, `custscript_sr_statement_email_role_ids`.
  **Upgrading:** grant Workbook to roles that query, list statement senders in
  the new parameter, and restrict the RESTlet audience to the roles that use
  the apps.
- Every app README has a **Permissions and parameters** section listing the
  deployment audiences, native permissions, and script parameters it needs.
- Dependency update: `npm audit` reports 0 vulnerabilities, down from 28
  (1 critical, 20 high, 7 moderate). Notable upgrades: `@modelcontextprotocol/sdk`
  1.32, `express`' `proxy-addr`, `hono`, `fast-uri`, `ip-address`,
  `brace-expansion`, `source-map-js`, `@typescript-eslint` 8.72 everywhere, and
  `vite-plugin-dts` 5 (whose `rollupTypes` option is now `bundleTypes`). axios
  ranges now start at the first fixed release, `^1.15.0`.
- The root lockfile includes the Script Log Explorer workspace again, so
  `npm ci` installs. It previously failed because the lockfile was out of sync.
- `suitereact`'s published type declarations no longer contain a broken
  `../../../node_modules/@hitc/netsuite-types/N/search` import. Table header
  `summary` is typed as the local `NsReactSearchSummary` string union.
- Script Log Explorer server tests mock the action handler's authorization
  and denial modules again; they had stopped loading after those modules were
  added.
- `approveTransaction` enforces segregation of duties: only the assigned next
  approver can approve a routed transaction, the creator (from `createdby` or
  the creation system note) or the employee it is for cannot approve it, and
  an unknown creator with no assigned approver is refused. It saves with
  mandatory-field validation, accepts only pending journal entries, invoices,
  expense reports and purchase orders, and writes audit log entries.
- The action handler returns the message of expected denials (errors named
  `ACTION_DENIED`, such as approval segregation-of-duties checks) to the client;
  every other failure stays generic. Its deployment logs at `AUDIT` so approval
  audit entries are kept, and the per-request action entry moved to debug.
- Invoice PDF sends the selection as requests of 5 invoices, 3 at a time,
  instead of one request for the whole download, and retries requests NetSuite
  rejects for its concurrency limit. In a sandbox account, 50 PDFs took about
  40s.
- App smoke specs can return `expectedConsoleErrors` (regular expressions) for
  console errors a fixture causes on purpose. Matches are listed in the result
  notes instead of failing the run.
- `getTableRowsFromSuiteql` returns SuiteQL values unchanged. It previously
  turned any string containing exactly one colon into a `{ value, label }`
  option, so statuses such as `Sales Order : Cancelled`, times, and memos
  displayed only the text after the colon.
- The action-handler bridge serves `getTableRowsFromSuiteql` from this tree and
  runs it only for roles with the SuiteAnalytics Workbook permission
  (`REPO_ANALYTICS`), matching the canonical handler's query policy. Other roles
  get the standard authorization error and no query runs. Role-allowlist and permission checks share
  `sdf/domain/actionAuthorization.ts`.
- The LLM proxy's `custscript_sr_llm_models` parameter is a text area, so model
  allowlists longer than 300 characters are stored in full.
- Every callable action has an explicit, type-checked authorization policy;
  unclassified names are denied. Queries, statements, email searches, invoice
  PDF reads, selects, and schemas require SuiteAnalytics Workbook.
- OAuth coordination atomically publishes directory leases and retires only the
  observed lease, preventing stale cleanup from deleting a new owner's lock.
- Dynamic-group changes require ownership or the Administrator role. Group
  membership rejects invalid/empty criteria and correctly scopes OR conditions.
- SuiteReact publishes CommonJS as `.cjs` and exposes bundled declarations for
  both module formats; the nonexistent stylesheet export has been removed.
- Managed development synchronizes fallback Vite origins with proxy CORS, and
  MCP authentication provides portable browser launch with a printed fallback URL.
- MCP startup is non-interactive; NetSuite tool calls authenticate lazily with
  cross-process locking and a failed-attempt cooldown.
- Setup preflights existing tokens before writing and reports permission repairs.
- Builds are non-interactive and never offer to deploy.
- SuiteReact client helpers and scaffolds support authenticated local proxy
  requests.
- SuiteQL Bot renders LLM responses as text, and NetSuite authorizes explicit
  provider/model routes before forwarding prompts.
- Application builds guard proxy credentials behind development mode and scan
  each browser bundle before copying it into deployable output.
- Browser diagnostics omit Axios objects and payloads so proxy credentials and
  prompts do not persist in developer-console history.
- Legacy fields and data grids propagate the local proxy token, while local
  approvals now go through the RESTlet's authorization path.
- RESTlet callers receive stable failure responses while exception details
  remain confined to protected NetSuite script logs.
- Doc Spaces filters space metadata by view access, protects document listings,
  and restricts employee-directory searches to administrators of the target space.
- Published SuiteReact and MCP artifacts carry the repository's canonical
  BSD-3-Clause license text.
- Package validation now enforces required and forbidden contents, and a manual
  protected workflow provides preview and approved npm publication paths.
- MCP runtime diagnostics use stderr so they cannot corrupt stdio protocol
  responses.

### Removed

- Unused build tooling: `vite-plugin-linter` (its glob matched no files and no
  app config loaded it; linting runs through `eslint`), `shx` (replaced by
  `fs.rmSync`), the root `vite-plugin-dts@1`, and `suitereact`'s inactive
  husky/`lint-staged` hook. New app scaffolds no longer include
  `vite-plugin-linter`.
- Committed browser bundles, semantic embeddings, and generated HTML design
  exports; these are reproducible local artifacts.
