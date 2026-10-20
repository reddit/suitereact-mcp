import { TextContent } from '@modelcontextprotocol/sdk/types.js';

import { ReactAppScaffoldInputSchema } from '../types.js';

function stripExt(name: string): string {
  return name.replace(/\.[tj]sx?$/, '');
}

export async function handleAppScaffoldGeneratorTool(
  arguments_: Record<string, any>
): Promise<TextContent[]> {
  try {
    const inputArgs = ReactAppScaffoldInputSchema.parse(arguments_);
    const {
      appName,
      appId,
      subheader,
      clientActionsFile,
      landingPageFile,
      serverActionFile,
    } = inputArgs;

    const clientBase = stripExt(clientActionsFile);
    const landingBase = stripExt(landingPageFile);
    const serverBase = stripExt(serverActionFile);

    const packageJson = {
      name: `rdt-sr-${appId}`,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
        lint: `cd ../.. && eslint 'apps/${appId}/src/**/*.{ts,tsx}' --max-warnings 0`,
        'lint:fix': `cd ../.. && eslint 'apps/${appId}/src/**/*.{ts,tsx}' --fix`,
      },
      devDependencies: {
        '@hitc/netsuite-types': '^2024.2.2',
        '@types/node': '^20.11.25',
        '@types/react': '^18.2.64',
        '@types/react-dom': '^18.2.21',
        '@vitejs/plugin-react': '^4.2.1',
        typescript: '^5.4.2',
        vite: '^6.3.5',
        'vite-tsconfig-paths': '^4.3.1',
      },
      dependencies: {
        '@emotion/react': '^11.11.4',
        '@emotion/styled': '^11.11.0',
        '@mui/material': '^7.1.0',
        '@mui/x-data-grid': '^8.6.0',
        axios: '^1.15.0',
        dayjs: '^1.11.10',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        suitereact: 'file:../../suitereact',
      },
    };

    const mainTsx = `import { CssBaseline, ThemeProvider } from '@mui/material';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from 'suitereact';

import App from './App/App';
import { theme } from './App/theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
`;

    const appTsx = `import { AppBar, Container, Toolbar, Typography } from '@mui/material';

import { LandingPage } from '../domain/views';

export default function App() {
  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar variant="dense">
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            ${appName.replace(/'/g, "\\'")}
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <LandingPage />
      </Container>
    </>
  );
}
`;

    const themeTs = `import { createTheme } from '@mui/material';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1a3a5c' },
    secondary: { main: '#e74c3c' },
    background: { default: '#f5f5f5' },
  },
});
`;

    const typesTs = `// Shared TypeScript types for ${appName}
export interface ExamplePingRequest {
  searchTerm?: string;
}

export interface ExampleCustomerRow {
  id: string;
  entityId: string;
  companyName: string;
  email: string | null;
}

export interface ExamplePingResponse {
  data: ExampleCustomerRow[];
  count: number;
}
`;

    const clientActions = `// ${clientActionsFile} — client-side actions (${appName})
// Use React state in components and call NetSuite via handleRestletAction from here.

import { handleRestletAction, toastService } from 'suitereact';

import { ExamplePingRequest, ExamplePingResponse } from '../types';

const apiBaseUrl = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const proxyToken = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

/**
 * Example: call a server action registered on the SuiteReact RESTlet.
 * Adjust \`action\` to match your SuiteScript export name.
 */
export async function examplePing(
  request: ExamplePingRequest = {}
): Promise<ExamplePingResponse> {
  try {
    const response = await handleRestletAction<ExamplePingResponse>(
      '${serverBase}',
      request,
      apiBaseUrl,
      proxyToken
    );

    toastService.showInfo(\`Loaded \${response.count ?? 0} row(s)\`, 3000);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    toastService.showError(message, 4000);
    throw error;
  }
}
`;

    const landingPage = `import { Stack, Typography } from '@mui/material';

export default function LandingPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        ${appName.replace(/'/g, "\\'")}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        ${subheader.replace(/'/g, "\\'")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Build screens with MUI components, \`@mui/x-data-grid\` for tables, and
        \`handleRestletAction\` from \`suitereact\` for server actions. Prefer SuiteQL (test queries with the SuiteQL tools
        before wiring server actions).
      </Typography>
    </Stack>
  );
}
`;

    const actionsIndex = `export * from './${clientBase}';
`;

    const viewsIndex = `export { default as LandingPage } from './${landingBase}';
`;

    const viteEnvDts = `/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_SERVER_BASE_URL?: string;
  readonly VITE_PROXY_SERVER_TOKEN?: string;
}
`;

    const tsconfigJson = {
      compilerOptions: {
        target: 'ESNext',
        useDefineForClassFields: true,
        lib: ['DOM', 'DOM.Iterable', 'ESNext'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: false,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: 'ESNext',
        moduleResolution: 'Node',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        paths: {
          N: ['../../node_modules/@hitc/netsuite-types/N'],
          'N/*': ['../../node_modules/@hitc/netsuite-types/N/*'],
        },
      },
      include: ['src', 'suitelet'],
      references: [{ path: './tsconfig.node.json' }],
    };

    const tsconfigNodeJson = {
      compilerOptions: {
        composite: true,
        module: 'ESNext',
        moduleResolution: 'Node',
        allowSyntheticDefaultImports: true,
      },
      include: ['vite.config.ts'],
    };

    const viteConfigTs = `import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsConfigPaths()],
  build: {
    outDir: './client',
    rollupOptions: {
      output: {
        entryFileNames: \`assets/[name].js\`,
        chunkFileNames: \`assets/[name].js\`,
        assetFileNames: \`assets/[name].[ext]\`,
      },
    },
  },
});
`;

    const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName.replace(/</g, '')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

    const exampleEnv = `VITE_PROXY_SERVER_BASE_URL=http://localhost:3001
VITE_PROXY_SERVER_TOKEN=replace-with-the-same-value-as-SUITEREACT_PROXY_TOKEN
`;

    const readmeMd = `# ${appName}

${subheader}

## Development

1. From the repository root, run \`npm ci\`.
2. Copy \`example.env\` to \`.env.development.local\`, configure the local proxy URL, and use the same token as \`SUITEREACT_PROXY_TOKEN\` in \`server/.env\`. Never store either value in \`.env\` or a production-mode env file.
3. \`npm run dev\`

## Architecture

This SuiteReact app uses **freeform React + MUI** (not the legacy 12-column grid schema). Build UI with MUI components, manage state with React hooks, and call NetSuite through \`handleRestletAction\` so the same client works locally and in a hosted Suitelet.

SuiteQL: test queries with the MCP SuiteQL assistant and \`execute_suiteql_query\` before implementing server actions in \`sdf/actions/\`.

Performance: for large tables, bulk actions, PDFs, and zip/export flows, follow \`docs/performance.md\`. Prefer pagination, bounded batches, and Blob/ArrayBuffer file paths over large base64 payloads.

## Quality Gate

From the repo root:

\`\`\`
npm run review:app -- ${appId}
npm run build:app ${appId}
npm run check:production-bundle -- ${appId}
npm run test:app -- ${appId} --url http://localhost:5173
\`\`\`

Use \`npm run test:app -- ${appId} --url http://localhost:5173 --live\` after the proxy and NetSuite credentials are configured.

## Deploy

From the repo root:

\`\`\`
npm run build:app ${appId}
npm run validate:app -- ${appId}
npm run deploy:app -- ${appId}
\`\`\`
`;

    const files = [
      { path: 'package.json', content: JSON.stringify(packageJson, null, 2) },
      { path: 'src/main.tsx', content: mainTsx },
      { path: 'src/App/App.tsx', content: appTsx },
      { path: 'src/App/theme.ts', content: themeTs },
      { path: 'src/domain/types.ts', content: typesTs },
      {
        path: `src/domain/actions/${clientActionsFile}`,
        content: clientActions,
      },
      { path: 'src/domain/actions/index.tsx', content: actionsIndex },
      { path: `src/domain/views/${landingPageFile}`, content: landingPage },
      { path: 'src/domain/views/index.tsx', content: viewsIndex },
      { path: 'src/vite-env.d.ts', content: viteEnvDts },
      { path: 'tsconfig.json', content: JSON.stringify(tsconfigJson, null, 2) },
      {
        path: 'tsconfig.node.json',
        content: JSON.stringify(tsconfigNodeJson, null, 2),
      },
      { path: 'vite.config.ts', content: viteConfigTs },
      { path: 'index.html', content: indexHtml },
      { path: 'example.env', content: exampleEnv },
      { path: 'README.md', content: readmeMd },
    ];

    return [
      {
        type: 'text',
        text: JSON.stringify(
          {
            files,
            instructions:
              'Write each file to apps/' +
              appId +
              '/ at the given paths. Use the Suitelet generator tool for suitelet files and the Action Scaffold Generator with actionType="server" for sdf/actions/' +
              serverActionFile +
              '. Apps are freeform React + MUI: compose screens with MUI and @mui/x-data-grid, use React state, and call NetSuite via handleRestletAction from suitereact. Run npm run review:app -- ' +
              appId +
              ' before committing. For large tables, bulk work, PDFs, and exports, follow docs/performance.md. The validate_suitereact_page tool is deprecated (grid schema); ignore grid-layout validation.',
          },
          null,
          2
        ),
      },
    ];
  } catch (error) {
    console.error('Error processing React app scaffold generator tool:', error);
    return [
      {
        type: 'text',
        text: 'Error: Invalid arguments for generate_app_scaffold',
      },
    ];
  }
}
