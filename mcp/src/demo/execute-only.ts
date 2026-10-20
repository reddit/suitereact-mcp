import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ensureAuthenticated } from '../auth/token-manager.js';
import { handleSuiteQLTool } from '../tools/suiteql.js';
import { ServerTools, SuiteQLInputSchema } from '../types.js';

// The shared executor logs queries; stdout belongs exclusively to MCP messages.
const logToStderr = console.error.bind(console);
Object.assign(console, {
  log: logToStderr,
  info: logToStderr,
  debug: logToStderr,
});

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env'), quiet: true });

async function main() {
  if (process.argv.includes('--auth-only')) {
    await ensureAuthenticated();
    console.error('NetSuite authentication is ready.');
    return;
  }

  const server = new McpServer({
    name: 'suiteql-execution-only',
    version: '1.0.0',
  });

  server.registerTool(
    ServerTools.EXECUTE_SUITEQL_QUERY,
    {
      title: 'Execute SuiteQL Query',
      description:
        'Executes a SuiteQL query against NetSuite REST Web Services and returns the query results or an error.',
      inputSchema: SuiteQLInputSchema.pick({
        query: true,
        offset: true,
        row_limit: true,
      }).shape,
    },
    async args => ({ content: await handleSuiteQLTool(args) })
  );

  await server.connect(new StdioServerTransport());
  console.error('Execution-only SuiteQL MCP server started.');
}

main().catch(error => {
  console.error('Execution-only SuiteQL MCP server failed:', error);
  process.exitCode = 1;
});
