import { execFile } from 'child_process';
import crypto from 'crypto';
import http from 'http';

import { saveTokens } from './token-manager.js';

const CALLBACK_TIMEOUT_MS = 120_000;
const CALLBACK_PORT = 57432;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function openBrowser(url: string): void {
  console.error(`[auth] Open this URL if the browser does not launch:\n${url}`);
  const command =
    process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : process.platform === 'win32'
        ? {
            file: 'rundll32',
            args: ['url.dll,FileProtocolHandler', url],
          }
        : { file: 'xdg-open', args: [url] };
  execFile(command.file, command.args, err => {
    if (err) {
      console.error(
        `[auth] Could not open a browser automatically (${err.message}). Use the URL above.`
      );
    }
  });
}

export async function runOAuthFlow(): Promise<string> {
  const accountId = process.env.NETSUITE_ACCOUNT_ID?.replace(/_/g, '-');
  const clientId = process.env.NETSUITE_CLIENT_ID;
  const clientSecret = process.env.NETSUITE_CLIENT_SECRET;
  const scopes = process.env.NETSUITE_SCOPES || 'restlets rest_webservices';

  if (!accountId || !clientId) {
    throw new Error(
      'NETSUITE_ACCOUNT_ID and NETSUITE_CLIENT_ID must be set in the environment.'
    );
  }

  const { verifier, challenge } = generatePkce();
  const state = crypto.randomUUID();

  const { port, code } = await startCallbackServer(state);

  const callbackUrl = `http://localhost:${port}/callback`;

  const authUrl = new URL(
    `https://${accountId}.app.netsuite.com/app/login/oauth2/authorize.nl`
  );
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  openBrowser(authUrl.toString());

  const authCode = await code;

  const tokenUrl = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: callbackUrl,
    code_verifier: verifier,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (clientSecret) {
    headers['Authorization'] =
      `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    params.set('client_id', clientId);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `NetSuite token exchange failed (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  const expiresIn = parseInt(data.expires_in, 10) || 3600;

  saveTokens(data.access_token, data.refresh_token, expiresIn);

  return 'Authentication successful. You are now logged in to NetSuite.';
}

function startCallbackServer(
  expectedState: string
): Promise<{ port: number; code: Promise<string> }> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        const desc = url.searchParams.get('error_description') || error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<html><body><h2>Authentication Failed</h2><p>${escapeHtml(desc)}</p><p>You can close this tab.</p></body></html>`
        );
        server.close();
        rejectCode(new Error(`NetSuite authorization denied: ${desc}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h2>Error</h2><p>Invalid callback parameters.</p></body></html>'
        );
        server.close();
        rejectCode(
          new Error('Invalid callback: missing code or state mismatch')
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><h2>Authentication Successful</h2><p>You can close this tab and return to your MCP client.</p></body></html>'
      );
      server.close();
      resolveCode(code);
    });

    const timeout = setTimeout(() => {
      server.close();
      rejectCode(
        new Error(
          'Authentication timed out. Please try again with the mcp_auth tool.'
        )
      );
    }, CALLBACK_TIMEOUT_MS);

    void codePromise.then(
      () => clearTimeout(timeout),
      () => clearTimeout(timeout)
    );

    server.once('error', error => {
      clearTimeout(timeout);
      rejectServer(
        new Error(
          `OAuth callback server could not use 127.0.0.1:${CALLBACK_PORT}: ${error.message}`
        )
      );
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      resolveServer({ port: CALLBACK_PORT, code: codePromise });
    });
  });
}
