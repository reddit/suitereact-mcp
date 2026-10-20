# Setup Guide

Choose the smallest setup path that matches what you want to do. Building and
reviewing the project does not require a NetSuite account.

## 1. Build and inspect locally

Required: Node.js 22 (the CI baseline; packages support 22+) and npm 10 or newer.
Use a Bash-capable terminal for the managed development and deployment commands.
Clone or download this repository from its Code menu, then run these commands
from the repository root:

```bash
npm ci
npm run setup
npm run doctor
npm run build:app -- data-viewer
```

`npm run setup` creates ignored configuration templates, generates a strong
local proxy token, and copies the same token to every reference app. It never
asks for credentials, overwrites an existing file, connects to NetSuite, or
deploys anything. It reports any existing files whose permissions it tightens.

The app build creates `apps/data-viewer/client/` and copies the checked bundle
into `dist/FileCabinet/SuiteScripts/apps/data-viewer/client/`. Run `npm run build`
when you want to build every reference app, the shared scripts, MCP, and proxy.

For a frontend-only preview, run `npm run dev -- data-viewer` and open the printed
`vite.url`. Reference apps need the live setup below to load account data; this
preview does not provide sample records. Stop it with
`npm run dev:stop -- data-viewer`.

## 2. Prepare a sandbox for live applications

Skip this section when a maintainer has already installed and enabled the
SuiteReact scripts in your sandbox.

Required for a clean account:

- Node.js 22 and Oracle JDK 17 or 21, following the
  [SuiteCloud CLI prerequisites](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1558708810.html);
- SuiteCloud CLI for Node.js;
- permission to deploy SDF projects and configure script deployments;
- SuiteScript, SDF, and the custom-record features required by `manifest.xml`;
- your organization's approval and segregation-of-duties process.

```bash
npm install --global @oracle/suitecloud-cli
suitecloud account:setup
npm run doctor -- --deploy
npm run build:sdf
```

Select the intended sandbox during account setup. Building SDF produces local
artifacts; it does not install the backend in that account.

### Install the shared backend

**A clean account needs a reviewed SDF bootstrap before an app deploy.**
The generated app-scoped `deploy.override` includes the app and center category;
it does not enumerate the shared action-handler RESTlet, its modules, or Doc
Spaces controls. There is currently no one-command clean-account installer.

Have the account's SDF maintainer prepare an exact deployment scope for:

| Source                                                                                                                    | Built artifact / purpose                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `sdf/scripts/sr_rl_rct_action_handler.ts` and its transitive imports under `sdf/actions/`, `sdf/domain/`, and `sdf/libs/` | JavaScript under `dist/FileCabinet/SuiteScripts/sdf/`; the shared action handler and its dependencies                            |
| `sdf/objects/restlet/customscript_sr_rl_rct_action_handler.xml`                                                           | `dist/Objects/customscript_sr_rl_rct_action_handler.xml`; the RESTlet definition and deployment                                  |
| Doc Spaces custom records, lists, and record guard                                                                        | Install the shared [Doc Spaces controls](doc-spaces-security.md#install-the-shared-controls-first) before exposing those actions |
| LLM proxy script, imports, and RESTlet object, if using AI apps                                                           | Install separately with its role, provider/model, and secret configuration                                                       |

Enumerate shared files and objects explicitly in `deploy.override`, alongside
the selected app scope, then use `npm run validate:app -- data-viewer` to build,
check the scope, run server validation, and dry-run that reviewed change. The
command reuses an existing override. Do not deploy the broad root `deploy.xml`
or assume automatic dependency discovery selects all required shared files.

After reviewing the validation result, deploy the same scope with
`npm run deploy:app -- data-viewer`. These validation and deployment commands
contact the selected account. For Doc Spaces, complete its native-permission
and active-guard checks before granting application access.

### Configure audiences and authorization

Enable the account features needed for the selected path: SuiteScript and SDF
for application installation, Token-Based Authentication for the local proxy,
and REST Web Services, SuiteAnalytics Workbook, and OAuth 2.0 for MCP account
queries. Grant the integration role native permissions only for the records it
needs.

Public Suitelet and RESTlet deployments ship disabled with no default audience.
The Doc Spaces record guard is intentionally active. In NetSuite:

1. enable `customdeploy_sr_rl_rct_action_handler`;
2. grant its audience only to the least-privilege role used by your TBA token;
3. leave **Run as Role** unset;
4. grant that role SuiteAnalytics Workbook (View) for Data Viewer and other
   generic query/schema actions, and the native record permissions for the
   data it reads or writes;
5. only if you send customer statements, list the sending roles in
   `custscript_sr_statement_email_role_ids`;
6. for SuiteQL Bot, separately enable and authorize
   `customdeploy_sr_rl_llm_proxy`, including explicit role and provider/model
   allowlists.

Use comma-separated internal role IDs. Empty lists deny those action classes.
For deployed browser access, also enable the chosen app's Suitelet deployment
and configure its audience. Keep production logging at `ERROR`.

## 3. Run an app against live NetSuite data

Create a least-privilege Token-Based Authentication integration and access
token. Fill the blank `REACT_APP_NS_*` values in `server/.env`; keep the
generated `SUITEREACT_PROXY_TOKEN` unchanged.

```dotenv
REACT_APP_NS_ACCOUNT_ID=your_account_id
REACT_APP_NS_CONSUMER_KEY=your_tba_consumer_key
REACT_APP_NS_CONSUMER_SECRET=your_tba_consumer_secret
REACT_APP_NS_TOKEN_ID=your_tba_token_id
REACT_APP_NS_TOKEN_SECRET=your_tba_token_secret
```

Use the account ID shown by NetSuite, including the sandbox suffix where
applicable. The TBA token's role needs the RESTlet audience, the applicable
query/mutation allowlist, and native record permissions. Local Data Viewer schema
requests also go through the query-authorized RESTlet and use its SuiteScript
field metadata, matching the hosted app. MCP's Record Catalog tool is a separate
OAuth 2.0 integration. Setup already copied the proxy token to each app's ignored
`.env.development.local` file.

```bash
npm run doctor -- --live
npm run dev -- data-viewer --live
```

Live startup validates local credentials, synchronizes the selected Vite origin
with proxy CORS, and verifies the action-handler RESTlet before starting the UI.
It reports the application and proxy URLs. Stop both managed processes with:

```bash
npm run dev:stop -- data-viewer
```

## 4. Enable MCP tools

Packaged guidance and scaffolding need no account connection. For live queries
and metadata, create an OAuth 2.0 integration record with Authorization Code
Grant and PKCE. Enable the scopes requested in `NETSUITE_SCOPES`; the supplied
template requests both `restlets` and `rest_webservices`. Use this redirect URI:

```text
http://localhost:57432/callback
```

Fill `NETSUITE_ACCOUNT_ID`, `NETSUITE_CLIENT_ID`, and—unless intentionally
using a public client—`NETSUITE_CLIENT_SECRET` in `mcp/.env`.

The login role needs **Log in using OAuth 2.0 Access Tokens**, **REST Web
Services**, **SuiteAnalytics Workbook**, and the relevant native data
permissions. Follow Oracle's [OAuth role setup](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157771510070.html)
and [REST prerequisites](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_5085602973.html).
OAuth application-management permission alone does not grant API login access.

```bash
npm run doctor -- --mcp
npm run build:mcp
```

Configure your MCP client to launch:

```text
node /absolute/path/to/suitereact-mcp/mcp/dist/index.js
```

See the [README's stdio configuration example](../README.md#mcp-server).
The server reads `.env` beside its package, independent of the client's working
directory. Rebuild and restart it after changing code or packaged resources.

MCP startup is non-interactive. The first NetSuite-backed tool call prints the
authorization URL and tries to open it in your browser when no usable token
exists. Concurrent MCP processes share a filesystem lease so only one attempt
can launch; after a failure, automatic retries pause for five minutes. Call
`mcp_auth` to retry immediately or `mcp_reauth` to replace an invalid session.
The lease uses an atomic nonempty directory on the local filesystem. Expired
leases are reclaimed only after their owning process exits. If upgrading leaves
a legacy `~/.netsuite-mcp-auth.lock` file, stop all MCP processes before removing
that file and restarting; legacy or malformed locks are never automatically
deleted. Do not place the lock on a shared/network filesystem.
Tokens are stored in `~/.netsuite-mcp-tokens.json` with owner-only permissions.
`OPENAI_API_KEY` is optional; without it, knowledge tools use local lexical
retrieval.

### Optional AI features

SuiteQL Bot and other AI-enabled apps use server-side provider credentials.
Configure the NetSuite API secrets `custsecret_openai_api_key` or
`custsecret_openrouter_api_key`, then set `custscript_sr_llm_role_ids` and
explicit `provider:model` pairs in `custscript_sr_llm_models` on the LLM proxy.
The selected model must be supported by the configured provider.

Local application AI calls also pass through the NetSuite LLM proxy, so they
use those account-side secrets and allowlists. The optional `OPENAI_API_KEY` in
`mcp/.env` is for knowledge retrieval, not application chat. Never put provider
keys in `VITE_*` variables or production browser bundles.

### Install or refresh agent skills

All 14 skills live in [`.agents/skills/`](../.agents/skills/), including
[suiteql-cookbook](../.agents/skills/suiteql-cookbook/SKILL.md) for query writing,
debugging, and optimization with the authenticated NetSuite MCP tools. Keep the companion
SuiteReact skills, reference files, and optional UI metadata from the same
checkout. Use [the README's example goal](../README.md#agent-skills-and-workflows)
to start.

| Client         | Discovery and setup                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor         | Discovers project `.agents/skills/`; no additional links needed in this repo. See [Cursor skill directories](https://cursor.com/docs/skills#skill-directories).                        |
| Codex          | Discovers project `.agents/skills/`; no additional links needed in this repo. See [Codex skill discovery](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills). |
| Claude Code    | Uses `.claude/skills/` or `~/.claude/skills/`; link the source using the explicit destination below. See [Claude Code skills](https://code.claude.com/docs/en/skills).                 |
| Another client | Register/import the canonical folder using the client's skill mechanism. Symlinks alone may not register skills in every client.                                                       |

For use outside this repository, choose **one** installation destination from
a stable checkout you intend to keep:

```bash
# Universal user directory (~/.agents/skills), for compatible clients:
bash ./link-skills.sh

# Alternative destination, for Claude Code:
bash ./link-skills.sh --target-dir "$HOME/.claude/skills"
```

The explicit destination accepts any skill directory supported by your client.
These commands create links to the canonical source, including its companion
resources. They do not copy skill bodies into harness-specific folders. Avoid
installing the same set into multiple directories your client scans, and prefer
project discovery when working in this repository.

**Migrating existing links:** the default command replaces links owned by this
checkout that point to the old `.cursor/skills/` source. Once each new universal
link exists, it removes that checkout's redundant global Cursor/Codex links.
Explicit destinations only update that destination. Copied directories and links
from another checkout are preserved and reported with exit code 1; back up and
move conflicting installations outside skill discovery directories before
rerunning, or refresh them through their original installer. The script does not
delete or overwrite them.

**Copied installations:** use your client's import/refresh mechanism with
`.agents/skills/`. For clients using the Skills CLI, from the repo root:

```bash
npx skills add ./.agents/skills -g -a universal -y --skill '*'
```

This refreshes the entire set in the universal user directory; back up local
customizations first. Remove obsolete installations from other discovery roots
after checking their contents. An import is a snapshot: it needs refreshing after
later source changes.

**New sessions:** update the stable checkout (for example, `git pull --ff-only`
on `main`) before creating a session/worktree. Project discovery and symlinks use
the files present there; they do not fetch Git updates. Check the loaded
`SKILL.md` path and refresh/restart the client if its catalog still shows an old
copy. Repository rules under `.cursor/rules/` remain readable reference files;
this migration changes skill storage, not rule-loading behavior.

## 5. Validate or deploy later changes

Building never deploys. Before enabling any deployment:

1. validate in a sandbox account;
2. select only the roles that need the application;
3. leave **Run as Role** unset;
4. grant SuiteAnalytics Workbook only to roles that should run queries, and
   configure the statement email and LLM role lists where applicable;
5. keep production logging at `ERROR`;
6. follow organizational change control and segregation of duties.

Doc Spaces also requires the [backing-record security setup](doc-spaces-security.md).
Install its active record guard and restricted record definitions before enabling
the RESTlet. App-scoped deployment updates only the application; it does not
install these shared security dependencies.

```bash
npm run doctor -- --deploy
npm run validate:app -- data-viewer
npm run deploy:app -- data-viewer
```

## Doctor modes

Doctor checks only the path you request. Modes can be combined.

| Command                                      | Checks                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| `npm run doctor`                             | Build prerequisites and application structure         |
| `npm run doctor -- --live`                   | Local proxy credentials and all app tokens            |
| `npm run doctor -- --live --app data-viewer` | Local proxy and one app                               |
| `npm run doctor -- --mcp`                    | MCP OAuth configuration, including public-client mode |
| `npm run doctor -- --deploy`                 | Java and SuiteCloud deployment prerequisites          |

## Configuration files

| File                            | Needed for                                  | Created by setup |
| ------------------------------- | ------------------------------------------- | ---------------- |
| `server/.env`                   | Live local app data through OAuth 1.0 TBA   | Yes              |
| `apps/*/.env.development.local` | Local proxy URL and shared token            | Yes              |
| `mcp/.env`                      | OAuth 2.0 MCP tools and optional embeddings | Yes              |
| `~/.netsuite-mcp-tokens.json`   | OAuth 2.0 tokens after browser login        | No               |

All repository-local configuration files above are ignored by Git. Never paste
their contents into issues, logs, screenshots, or pull requests.

## Troubleshooting

- **Proxy rejects its bind host:** set `SUITEREACT_PROXY_HOST` to `127.0.0.1`
  (the default used by the managed runner) or `::1`. Wildcard/interface addresses
  and hostnames, including `localhost`, are rejected before the proxy listens.
  Keep `127.0.0.1` for managed `dev` commands, which check the proxy over IPv4.
- **Live startup fails its readiness check:** deploy and enable
  `customdeploy_sr_rl_rct_action_handler`, then grant the configured TBA role
  access.
- **Startup succeeds but Data Viewer queries fail:** grant the TBA role
  SuiteAnalytics Workbook (View) and verify native data permissions. The startup probe uses `getUserProps`, not a generic query.
- **App deployed but the RESTlet is missing:** complete the shared backend
  bootstrap in section 2; the generated app override does not include it.
- **Proxy token mismatch:** make every `VITE_PROXY_SERVER_TOKEN` match
  `SUITEREACT_PROXY_TOKEN`, then rerun `npm run setup`.
- **Port 5173 is occupied:** the managed runner selects another port and
  configures its managed proxy automatically. Stop or reconfigure a separately
  started proxy if it does not allow the reported origin.
- **The OAuth browser does not open:** copy the authorization URL printed by the
  MCP server into a browser on the same machine.
- **MCP authentication loops:** run `mcp_reauth`; it replaces the local token
  cache after a successful browser login and explicitly bypasses the failed-auth
  cooldown. It will not interrupt an OAuth attempt already owned by another MCP
  process.
- **SuiteCloud uses the wrong account:** rerun `suitecloud account:setup` and
  select the intended sandbox before validating again.
- **Deployment still targets another app:** inspect `deploy.override`; validation
  intentionally reuses it. Prepare a reviewed override for the desired scope.
- **Browser tests cannot find Chromium:** run `npx playwright install chromium`.
- **An older skill still runs:** check its resolved file path and refresh all
  companion skills; an existing copied directory is skipped by `link-skills.sh`.
