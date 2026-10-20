# SuiteReact MCP agent guide

SuiteReact builds React applications hosted inside NetSuite, with a local development proxy and an MCP server. Use this file as the repository entry point; read the linked rules and skills relevant to the task before changing code.

## Repository map

| Path           | Responsibility                                                                |
| -------------- | ----------------------------------------------------------------------------- |
| `apps/<name>/` | React + MUI applications, app Suitelets, and app-specific smoke tests         |
| `suitereact/`  | Shared client transport, toast, data-grid, and chatbot utilities              |
| `sdf/`         | SuiteScript actions, shared scripts, domain helpers, and SDF objects          |
| `server/`      | Express OAuth proxy for local calls to NetSuite                               |
| `mcp/`         | TypeScript MCP server, tool implementations, and packaged knowledge resources |
| `deploy/`      | Build, validation, deployment, managed development, and test tooling          |
| `dist/`        | Generated NetSuite deployment output; edit source files and rebuild           |

See [README.md](README.md) for setup and architecture, [mcp/README.md](mcp/README.md) for MCP details, and [suitereact/README.md](suitereact/README.md) for shared component APIs.

## Working conventions

- Inspect the current branch and worktree changes before editing; preserve unrelated work and stage only files belonging to the task.
- Use npm and the scripts in the relevant `package.json`; run the commands below from the repository root.
- Keep changes scoped to the requested behavior and follow nearby TypeScript and naming patterns.
- Keep credentials, token caches, local environment files, and generated workflow evidence out of commits.
- Update setup or behavior documentation when the change affects how someone uses or operates the project.

## Commands and validation

Run checks appropriate to the changed component. Report failures and unavailable checks explicitly; a build alone does not establish browser behavior or live NetSuite correctness.

| Change or task                 | Commands                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Local prerequisites            | `npm run doctor`; add `-- --live` before live NetSuite calls                                                  |
| App UI                         | `npm run build:app -- <name>` and `npm run review:app -- <name>`                                              |
| App browser behavior           | `npm run test:app -- <name> --url <reported-vite-url>`; use the app's `test/smoke.mjs` when present           |
| SuiteScript or app Suitelets   | `npx tsc --noEmit` and `npx eslint <changed-server-files>`; follow the action-testing skill for live evidence |
| Shared client library          | `npm run build:suitereact`, then build and verify affected apps                                               |
| MCP server                     | `npm run build:mcp` (includes sample and generated-scaffold validation)                                       |
| Local proxy                    | `npm --prefix server run build`, then verify the affected proxy behavior                                      |
| Development/deployment tooling | `npm run test:toolkit` and relevant scaffold/sample checks                                                    |
| Documentation only             | `npx prettier --check <changed-markdown-files>`, verify relative links, and run `git diff --check`            |

`npm run build` formats the whole repository. `build:app` runs app lint fixes, and `build:suitereact` formats and lint-fixes library source. These scripts can also install dependencies or replace generated output. Inspect their effects before staging; use targeted checks when broad build side effects would affect unrelated work.

Start managed development with `npm run dev -- <name>`; add `--live` only for NetSuite integration work. Use the reported Vite URL and stop owned processes with `npm run dev:stop -- <name>`. UI-only tests do not need the OAuth proxy.

## Application and server contracts

- Build freeform React + MUI interfaces. Use shared SuiteReact utilities where appropriate; avoid introducing legacy grid-schema forms.
- Use `handleRestletAction(action, payload, apiBaseUrl)` for client/server calls across local and hosted runtimes. Reserve direct `REST.post` calls for hosted-only clients.
- Server actions in `sdf/actions/` return typed JSON-serializable data and throw `Error` on failure. The shared action-handler RESTlet owns the outer `{ success, data, error }` envelope; do not wrap action results again.
- Keep the local proxy URL in `apps/<name>/.env.development.local` and guard access with `import.meta.env.DEV`. Hosted builds must leave `apiBaseUrl` undefined.
- Validate SuiteQL tables, fields, and joins with the NetSuite schema/query tools and verify read-only query results against the configured account. Record missing live validation explicitly; do not infer SuiteQL fields from `N/search` names.
- Paginate large datasets, cap concurrency and SuiteScript work, and prefer file IDs/URLs or Blob/ArrayBuffer paths over large inline file payloads.

Read [React patterns](.cursor/rules/react-patterns.mdc), [NetSuite integration rules](.cursor/rules/netsuite-integration.mdc), [performance guidance](docs/performance.md), and the [app quality checklist](docs/app-quality-checklist.md) for the detailed contracts.

## NetSuite operations

- Local proxy and authenticated MCP calls reach the configured NetSuite account. Treat record mutations and action tests with side effects as account operations, even when the browser runs on localhost.
- Deploy only when the task authorizes deployment to the target environment. Follow the [deployment skill](.agents/skills/suitereact-deploy/SKILL.md).
- Run `npm run validate:app -- <name>` before `npm run deploy:app -- <name>`; validation includes production-bundle checks, scope checks, SuiteCloud validation, and a dry run.
- Keep app deployments narrow: include the app and exact required shared files/objects. Never use broad shared SuiteScript wildcards to satisfy dependencies; manifest dependencies do not define deployment scope.
- Never count tests against stale deployed server code as evidence for local changes. Report live server behavior as unverified until the changed code has been narrowly deployed and tested.

## Skills and further guidance

Skills live in `.agents/skills/`, the single version-controlled source for every harness. Prefer the skills from the current checkout and load companion skills from that same source. Read the relevant `SKILL.md` directly if the client does not discover it; see [installation adapters](docs/setup.md#install-or-refresh-agent-skills) for other discovery directories. Optional `agents/openai.yaml` files provide UI metadata without changing the portable instructions.

| Task                      | Read                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end app work       | [suitereact-full-cycle](.agents/skills/suitereact-full-cycle/SKILL.md) and its [workflow contract](.agents/skills/suitereact-full-cycle/references/workflow-contract.md)                                                                                                   |
| New app scaffolding       | [suitereact-scaffold](.agents/skills/suitereact-scaffold/SKILL.md)                                                                                                                                                                                                         |
| Planned implementation    | [suitereact-code](.agents/skills/suitereact-code/SKILL.md)                                                                                                                                                                                                                 |
| Managed local development | [suitereact-dev](.agents/skills/suitereact-dev/SKILL.md)                                                                                                                                                                                                                   |
| Review and verification   | [suitereact-review](.agents/skills/suitereact-review/SKILL.md), [suitereact-test](.agents/skills/suitereact-test/SKILL.md), [suitereact-test-action](.agents/skills/suitereact-test-action/SKILL.md), and [suitereact-analyze](.agents/skills/suitereact-analyze/SKILL.md) |
| App workflow commits      | [suitereact-commit](.agents/skills/suitereact-commit/SKILL.md)                                                                                                                                                                                                             |
| Doc Spaces work           | [doc-spaces-search](.agents/skills/doc-spaces-search/SKILL.md), [doc-spaces-author](.agents/skills/doc-spaces-author/SKILL.md), and [doc-spaces-publish](.agents/skills/doc-spaces-publish/SKILL.md)                                                                       |

For SuiteQL query writing, debugging, and optimization, read [suiteql-cookbook](.agents/skills/suiteql-cookbook/SKILL.md). It uses the authenticated NetSuite MCP tools for query guidance, schema lookup, and validation.

For SuiteReact app workflows, use the documented helpers for `.workflows/<app>/<workflow-id>/workflow.json` and exact file ownership. Keep this guide consistent with [.cursor/rules/global.mdc](.cursor/rules/global.mdc) when shared conventions change.
