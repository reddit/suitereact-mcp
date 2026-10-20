# SuiteQL Bot

A SuiteReact app for writing, running, and exploring SuiteQL queries against NetSuite — with an integrated AI assistant that can suggest queries and explain results.

## Features

- **SuiteQL editor** — write and execute queries directly against NetSuite, with a vertically resizable input area
- **Automatic query formatting** — formats SQL keywords, clauses, indentation, and logical operators when queries are generated, loaded, finished, or run
- **Results grid** — MUI X DataGrid showing values exactly as NetSuite returned them, with exact field names, content-sized columns, type-aware sorting, search, and filtering
- **Result status** — rows, columns, and elapsed time for the last run; an **Edits not run** flag when the editor no longer matches the results; and a warning when NetSuite returns its 5,000-row limit
- **AI assistant** — collapsible, width-adjustable right-side panel chatbot (`NsReactChatbot`, open by default) with NetSuite-focused system context that can suggest SuiteQL queries, auto-fill the editor, and auto-run the suggested query
- **Approved model catalog** — app-specific ChatGPT and OpenRouter choices, defaulting to `gpt-5.6-sol`
- **Query history** — browser-persisted drawer with LLM-generated titles, SQL previews, timestamps, result counts, and per-query removal (deduped and capped at 50). Handwritten SQL receives a table-based fallback title
- **CSV export** of raw values with exact field names; formula-like text is prefixed with an apostrophe
- **Descriptive error handling** — SuiteScript errors are parsed end-to-end (server wraps the query text; client extracts error code, message, and detail). The error alert shows contextual hints for common error codes and includes the failed query for easy debugging
- **Inline feedback** — errors and limits stay on screen until the next run

## Tech Stack

| Layer      | Details                                                            |
| ---------- | ------------------------------------------------------------------ |
| UI         | React 18, MUI 7, MUI X DataGrid                                    |
| Build      | Vite 6, TypeScript 5                                               |
| Data       | SuiteQL via `handleRestletAction` → local proxy → NetSuite RESTlet |
| AI         | `NsReactChatbot` with Zod-validated structured responses           |
| State      | TanStack React Query                                               |
| Shared lib | `suitereact` (column helpers, toast hooks, REST utilities)         |

## Getting Started

### Prerequisites

- Node.js 22+
- A sandbox prepared through the repository [setup guide](../../docs/setup.md),
  including the LLM proxy

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
| `VITE_PROXY_SERVER_BASE_URL` | `http://localhost:3001` | Development-only proxy that signs NetSuite REST calls with OAuth TBA and routes chatbot requests |
| `VITE_PROXY_SERVER_TOKEN`    | —                       | Must match `SUITEREACT_PROXY_TOKEN` in `server/.env`; development only                           |

Production builds ignore `VITE_PROXY_SERVER_BASE_URL` and use the hosted NetSuite RESTlets. Keep this value only in `.env.development.local`; `validate:app` rejects a deployed bundle containing a loopback URL or the configured development proxy URL.

### Development

```bash
# From the repo root; validates and starts both managed services
npm run dev -- suiteql-bot --live
```

Use `npm run dev:stop -- suiteql-bot` when finished.

### Build

```bash
# From repo root
npm run build:app -- suiteql-bot
```

Output goes to `apps/suiteql-bot/client/` for deployment to NetSuite File Cabinet.

## How It Works

1. Enter a SuiteQL query in the editor (a sample query is pre-filled). The editor formats it when editing finishes and again before execution.
2. Click **Run query** (or press ⌘/Ctrl + Enter) to execute the query via the `getTableRowsFromSuiteql` server action. Only the latest run updates the results.

   The action uses `query.runSuiteQL`, which returns at most 5,000 rows, and returns values unchanged. For older deployments that split strings containing exactly one colon into a value and label, the app rejoins those values (`Sales Order : Cancelled`, `10:30 am`); original whitespace around the colon is not recoverable on those deployments. The action runs only for roles with the SuiteAnalytics Workbook permission; see [Permissions and parameters](#permissions-and-parameters).

3. The AI assistant panel opens by default on the right on desktop; on small screens it opens as an overlay from the **Assistant** button, takes keyboard focus, keeps Tab inside, and closes with Escape. Drag its left edge, or focus the edge and use the arrow keys, to adjust its width. Ask it for query suggestions — the chatbot returns structured responses (validated with Zod) that auto-fill the editor **and auto-run the query**, displaying an explanation hint.
4. The history drawer stores past queries in the browser under concise request-based titles for quick re-use across sessions. The original SQL remains visible beneath each title, and individual entries can be removed from the drawer.

## Permissions and parameters

Queries need no SuiteReact role list. The AI assistant goes through the separate LLM proxy, which keeps its own role and model lists.

| Setting                                          | Where                         | Needed for                                                                                                                                      |
| ------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `customdeploy_sr_sui_suiteql_bot` audience       | Suitelet deployment           | Opening the app.                                                                                                                                |
| `customdeploy_sr_rl_rct_action_handler` audience | RESTlet deployment            | Every server action. Include only the roles that use the app, and leave **Run As Role** unset so actions run with the caller's own permissions. |
| SuiteAnalytics Workbook (View)                   | Role permission               | Running queries (`getTableRowsFromSuiteql`). Record permissions still apply to the results.                                                     |
| `customdeploy_sr_rl_llm_proxy` audience          | RESTlet deployment            | The AI assistant.                                                                                                                               |
| `custscript_sr_llm_role_ids`                     | LLM proxy parameter           | Roles allowed to use the assistant. Empty denies every role.                                                                                    |
| `custscript_sr_llm_models`                       | LLM proxy parameter           | Allowed `provider:model` pairs. Empty denies every route.                                                                                       |
| `custsecret_openai_api_key`                      | API secret                    | OpenAI models, including the default model.                                                                                                     |
| `custsecret_openrouter_api_key`                  | API secret                    | OpenRouter models.                                                                                                                              |
| `custscript_sr_suiteql_bot_ns_window`            | Suitelet parameter (checkbox) | Checked: the app opens inside NetSuite's navigation. Unchecked: it opens as a full page.                                                        |
