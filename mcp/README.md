# SuiteReact MCP Server

A Model Context Protocol (MCP) server that provides intelligent assistance for NetSuite SuiteQL queries and SuiteReact application development through hybrid semantic/lexical retrieval and code-generation capabilities.

## Directory Structure

```
mcp/
├── src/
│   ├── tools/           # MCP tools for various capabilities
│   ├── services/        # RAG service
│   ├── resources/       # Knowledge base plaintext files
│   ├── auth/           # NetSuite authentication
│   ├── demo/           # Execution-only SuiteQL demo entrypoint
│   ├── build/          # Vector database build scripts
│   └── types.ts        # TypeScript definitions
├── .vectordb/          # Generated vector embeddings
└── dist/              # Compiled JavaScript
```

## Setup Instructions

### 1. Configure an MCP client

Build the server first:

```bash
# From the repository root
npm ci
npm run setup
npm run build:mcp
```

Configure any MCP-compatible client or coding agent to launch the compiled server over stdio. Adapt the configuration shape and absolute path to your client:

```json
{
  "mcpServers": {
    "suitereact-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/suitereact-mcp/mcp/dist/index.js"]
    }
  }
}
```

The checked-in `.cursor/mcp.json` is a repository-local example whose relative
path assumes the client launches it from the repository root. Use the absolute
path above when copying the configuration to another client or user-level file.

### 2. Environment Variables Setup

Run `npm run setup` from the repository root, then fill the generated
`mcp/.env`. See the [setup guide](../docs/setup.md) for the complete build-only,
live-app, MCP, and deployment paths.

#### NetSuite Configuration (Required for SuiteQL tools)

```env
NETSUITE_ACCOUNT_ID=your_account_id
NETSUITE_CLIENT_ID=your_consumer_key
NETSUITE_CLIENT_SECRET=your_consumer_secret
NETSUITE_SCOPES=restlets rest_webservices
```

**Setup Steps**:

1. Create a NetSuite integration in **Setup → Integrations → Manage Integrations → New**
2. Enable **Authorization Code Grant** on the Authentication subtab
3. Set the **Redirect URI** to `http://localhost:57432/callback`
4. Save and copy the **Consumer Key** (Client ID) and **Consumer Secret**
5. Ensure your user role has the **"Log in using OAuth 2.0 Access Tokens"** permission (Setup → Users/Roles → Manage Roles → your role → Permissions → Setup)

Server startup never opens a browser. The first NetSuite-backed tool call prints
the authorization URL and attempts to open it for OAuth login when no usable
token exists. If browser launch is unavailable, open the printed URL on the same
machine. Concurrent MCP processes permit only one browser attempt, and failed
automatic attempts pause for five minutes. Call `mcp_auth` to retry immediately.
Tokens are stored locally at `~/.netsuite-mcp-tokens.json` and persist across
sessions.

#### Record schema lookups

`get_netsuite_record_schema` allows **120 seconds** for the metadata request and
response body. NetSuite can take more than 30 seconds to prepare a record schema,
even while SuiteQL requests are fast. Configure these optional values in `mcp/.env`
or the MCP server's environment, then restart that server process:

| Setting                        | Default              | Allowed values                                                 |
| ------------------------------ | -------------------- | -------------------------------------------------------------- |
| `NETSUITE_SCHEMA_TIMEOUT_MS`   | `120000` (2 minutes) | Integer milliseconds, `1000`–`300000`                          |
| `NETSUITE_SCHEMA_CACHE_TTL_MS` | `300000` (5 minutes) | Integer milliseconds, `0`–`3600000`; `0` disables cached reuse |

Successful raw schemas are cached in memory (up to 32 entries), separately for
each account, record type, and access-token fingerprint. A different token or role
does not reuse the previous credential's metadata. Simultaneous lookups in the same
context share one request; errors and timeouts are not cached. Token values and
schemas are not written to disk by this cache.

`fieldFilter` and `customFieldsOnly` filter the retrieved schema locally, so changing
them reuses the same raw metadata. Pass `refreshCache: true` after changing record
customizations or permissions when immediate freshness is needed; otherwise the
cached schema expires after its configured lifetime. Refreshes can share a lookup
already in progress.

A timeout retains the existing `error`/`details` response fields and adds
`code: "SCHEMA_LOOKUP_TIMEOUT"`, `recordType`, `timeoutMs`, and `retryable: true`.
If the MCP client enforces a shorter tool-call deadline, adjust it to allow the
configured metadata timeout.

#### OpenAI Configuration (Optional for queries; required to rebuild vectors)

```env
OPENAI_API_KEY=your_openai_api_key_here
```

With a key, the knowledge assistants use OpenAI semantic embeddings. Without one, they automatically use local BM25-style lexical ranking over the packaged resources. The same fallback activates when the embedding request fails or semantic retrieval returns no matches. An OpenAI key is still required to generate or refresh `.vectordb/embeddings.json`.

## Execution-only demo server

For an execution-only baseline, use `src/demo/execute-only.ts`. It registers only
`execute_suiteql_query` with a neutral description and the existing `query`,
`offset`, and `row_limit` inputs. It reuses the normal query executor and OAuth
implementation, including query normalization, row limiting, and error responses.
It exposes no authentication tools, schema/retrieval tools, resources, or prompts.

Build and test from the repository root:

```bash
npm run build:mcp
npm --prefix mcp run test:execute-only
```

Configure a separate client connection using the compiled entrypoint:

```json
{
  "mcpServers": {
    "suiteql-execution-only": {
      "command": "node",
      "args": ["/absolute/path/to/suitereact-mcp/mcp/dist/demo/execute-only.js"]
    }
  }
}
```

The entrypoint loads `mcp/.env` relative to its own location, so the client can run
from an empty directory outside this repository. Existing process environment
variables take precedence. Diagnostics go to stderr; stdout carries MCP messages.

Startup and tool discovery do not initiate OAuth. The first query uses the shared
lazy login/refresh behavior and the existing account-checked token cache. To
authenticate before recording, run this operator-only command from the repository
root; it exits after authentication:

```bash
node mcp/dist/demo/execute-only.js --auth-only
```

The demo server limits its MCP surface. Configure the recording client separately
to exclude other tools, Skills, repository instructions, memory, and inherited
workflow guidance. Verify the effective tool list received by the model before
recording. If the guided run has additional schema/retrieval tools, describe the
comparison as execution-only access versus the guided setup.

The focused tests exercise the compiled stdio entrypoint and shared executor with
mocked NetSuite/auth modules in a temporary fixture; they do not access the live
account or real token cache. Live query correctness remains a separate validation.

## Available Tools

### Analyze and Plan

**Description**: Analyzes user requests and creates development plans with tool recommendations.

**Parameters**:

- `userRequest`: The user's goal or requirement

### SuiteQL Query Assistant

**Description**: Hybrid retrieval assistant that provides query guidance, field mappings, and best practices before executing SuiteQL queries. It prefers OpenAI semantic embeddings and automatically falls back to local lexical ranking.

**Parameters**:

- `userQuery`: Your question about SuiteQL
- `ragCategory`: Knowledge focus area
  - `suiteql_pure`: Syntax examples
  - `suiteql`: General documentation
  - `netsuite_records`: Table/field information
- `includeExamples`: Include example queries (optional)
- `includeFieldMappings`: Include field mapping info (optional)

### Execute SuiteQL Query

**Description**: Executes SuiteQL queries against NetSuite REST Web Services.

**Parameters**:

- `query`: The SuiteQL query to execute
- `offset`: Number of rows to skip (optional)
- `row_limit`: Maximum rows to return (optional)

**Environment**: Requires NetSuite credentials

### SuiteReact Code Sample Assistant

**Description**: Hybrid retrieval of SuiteReact code samples, slim utilities, and **freeform React + MUI** development patterns. It prefers semantic embeddings and works without an OpenAI key through local lexical fallback.

**Parameters**:

- `userQuery`: Question about SuiteReact development
- `ragCategory`: Knowledge category
  - `action_docs`: Action patterns
  - `app_build_steps`: Build processes
  - `app_lifecycle`: Application lifecycle
  - `suitereact_code_samples`: Code examples
  - `suitereact_component_library`: UI components
  - `suitereact`: General framework
- `includeExamples`: Include code examples (optional)
- `includeComponentInfo`: Include component usage patterns (optional)

### Generate Suitelet

**Description**: Generates NetSuite Suitelet script files for new SuiteReact applications.

**Parameters**:

- `appId`: Short identifier (< 15 chars, lowercase, no spaces)
- `appName`: Human-readable application name
- `description`: App description (optional)

### Generate App Scaffold

**Description**: Creates a minimal **freeform React + MUI** application scaffold (Vite, MUI, Data Grid deps, ToastProvider, REST example)—not a grid-schema layout.

**Parameters**:

- `appId`: Short identifier for the app
- `appName`: Display name for the application
- `subheader`: Subheader text for the app
- `clientActionsFile`: Client actions filename
- `landingPageFile`: Landing page filename
- `serverActionFile`: Server action filename

### Generate Action Scaffold

**Description**: Generates client or server action code following SuiteReact patterns.

**Parameters**:

- `actionName`: Name of the action
- `actionType`: `client` or `server`
- `appId`: Associated app identifier
- `description`: Action description (optional)
- `includeAdvancedFeatures`: Include advanced examples (optional)

### Validate SuiteReact Page _(deprecated)_

**Description**: **Deprecated.** The 12-column grid page schema is no longer used; new SuiteReact apps are **freeform React + MUI**. The tool remains registered so agents receive migration guidance instead of layout validation. Optional `pageSchema` input is ignored.

**Parameters**:

- `pageSchema`: Optional; ignored (formerly grid rows whose widths summed to 12)

## Available Resources

The server automatically discovers and provides access to all documentation through the `docs` resource:

### SuiteQL Documentation

- **suiteql_transactions**: Comprehensive transaction table documentation and field mappings
- **suiteql_customers**: Customer record schemas and query examples
- **suiteql_employees**: Employee record documentation and field references
- **ns_record_type_ids**: NetSuite record type identifiers and mappings

### SuiteReact Documentation

- **suitereact_component_library**: Slim SuiteReact utilities (REST, Toast, Chatbot, DataGrid, etc.) and freeform MUI patterns — not grid-schema layouts
- **suitereact_action_docs**: Action development patterns and best practices
- **suitereact_app_build_steps**: Step-by-step application build process
- **suitereact_app_lifecycle**: Application lifecycle management guide
- **suitereact_code_samples**: Extensive code examples and implementation patterns

_Resources are automatically discovered from the `src/resources/` directory. Add new `.md` or `.json` files to expand the knowledge base._

## RAG Capabilities

The server uses a hybrid retrieval pipeline for intelligent assistance:

1. **Semantic primary** — when `OPENAI_API_KEY` is configured, the query is embedded with `text-embedding-3-small` and compared with the cached vector database.
2. **Lexical fallback** — current packaged resources are chunked and ranked locally with BM25-style scoring. This mode requires no external API key.

The fallback activates when the OpenAI key is missing, an embedding request fails, or semantic retrieval returns no matches. Tool responses report the retrieval mode used.

### Knowledge Categories

1. **SuiteQL Knowledge**:
   - `suiteql_pure`: Query syntax and examples
   - `suiteql`: General SuiteQL documentation
   - `netsuite_records`: NetSuite table and field information

2. **SuiteReact Knowledge**:
   - `action_docs`: Development patterns for actions
   - `app_build_steps`: Application build processes
   - `app_lifecycle`: Application lifecycle management
   - `suitereact_code_samples`: Code examples and snippets
   - `suitereact_component_library`: Utility components and freeform React + MUI guidance (not grid schemas)
   - `suitereact`: General framework documentation

### Adding New Knowledge

1. **Add Content**: Place new documentation files in `src/resources/`:
   - `.md` files for documentation
   - `.json` files for structured data
   - Files are automatically discovered and registered as resources

2. **Rebuild Vector Database**:

   ```bash
   npm run rebuild-vectors
   ```

3. **Test RAG Performance**:

   ```bash
   npm run test-rag
   ```

4. **Restart Server**: After adding new files, rebuild and restart the MCP server to register new resources

### Vector Database Management

The vector database is automatically built and cached in `.vectordb/`:

- **Automatic**: Initialized on first use if cache doesn't exist
- **Manual Rebuild**: Use `npm run rebuild-vectors` to refresh
- **Cache Location**: `.vectordb/embeddings.json`
- **Chunking**: Documents split into 1000-character chunks with 200-character overlap
- **Lexical Corpus**: Built from current packaged resources at MCP startup; it does not depend on or modify the vector cache
- **No-Key Test**: Run `npm run test-rag-fallback`

## Example Use Cases

### 1. SuiteQL Query Development

```
👤 User: "I need to query all customers with their email addresses"

🤖 Assistant: *Uses SuiteQL Query Assistant first*
- Provides field mappings (customer.email vs customerMain.email)
- Suggests proper JOIN syntax
- Shows example queries
- *Then executes the query*
```

### 2. SuiteReact App Development

```
👤 User: "Create a new app for expense approvals"

🤖 Assistant: *Uses Analyze and Plan*
- Plans development steps for a freeform React + MUI app (no grid-schema pages)
- *Generates Suitelet* for backend
- *Generates App Scaffold* (Vite, MUI, ToastProvider, REST example)
- *Provides Code Samples* for MUI layouts, actions, and NsReactDataGrid where needed
```

### 3. UI Implementation (MUI + SuiteReact utilities)

```
👤 User: "How do I build a filterable list with a toolbar and call my server action?"

🤖 Assistant: *Uses SuiteReact Code Sample Assistant*
- Suggests MUI layout (e.g. Stack, Paper, TextField, Button)
- Shows REST.post from client actions and server handler patterns
- Retrieves NsReactDataGrid examples when a full grid is appropriate
```

### 4. NetSuite Record Analysis

```
👤 User: "What fields are available on transaction records?"

🤖 Assistant: *Uses SuiteQL Query Assistant with netsuite_records category*
- Shows transaction table schema
- Lists available fields and types
- Provides relationship mappings
```

## Development Commands

```bash
# Install dependencies
npm ci

# Build the server
npm run build

# Start in development mode
npm run dev

# Build and start production
npm run start

# Rebuild vector database
npm run rebuild-vectors

# Test RAG functionality
npm run test-rag

# Verify no-key lexical fallback
npm run test-rag-fallback

# Clean build artifacts
npm run clean
```

## Error Handling

- **Missing OpenAI Key**: Knowledge assistants automatically use local lexical retrieval
- **Embedding API Failure**: Knowledge assistants log the failure and continue in lexical mode
- **Invalid NetSuite Credentials**: SuiteQL tools will return authentication errors
- **Missing Vector Database**: Semantic mode rebuilds when a key is available; otherwise current packaged resources load into the lexical corpus
- **Query Syntax Errors**: SuiteQL Query Assistant helps prevent common mistakes

## Best Practices

1. **Always use SuiteQL Query Assistant before executing queries**
2. **Use Analyze and Plan for complex development tasks**
3. **Leverage RAG tools for learning SuiteReact patterns**
4. **Keep vector database updated when adding new knowledge**
5. **Use appropriate RAG categories for focused results**
6. **Do not rely on grid page schemas** — use freeform MUI; `validate_suitereact_page` is deprecated
