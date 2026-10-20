import fs from 'fs';
import os from 'os';
import path from 'path';

import { OAuthCoordinator } from './auth-coordinator.js';

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  account_id: string;
}

const TOKEN_FILE = path.join(os.homedir(), '.netsuite-mcp-tokens.json');
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const AUTH_COORDINATORS = new Map<string, OAuthCoordinator>();

function getAuthCoordinator(): OAuthCoordinator {
  const account = getAccountId().replace(/[^A-Za-z0-9_-]/g, '-');
  let coordinator = AUTH_COORDINATORS.get(account);
  if (!coordinator) {
    const prefix = path.join(os.homedir(), `.netsuite-mcp-auth-${account}`);
    coordinator = new OAuthCoordinator({
      // Every account uses the same registered callback port, so the browser
      // lease must be global even though failure cooldowns are account-specific.
      lockFile: path.join(os.homedir(), '.netsuite-mcp-auth.lock'),
      failureFile: `${prefix}.failure.json`,
    });
    AUTH_COORDINATORS.set(account, coordinator);
  }
  return coordinator;
}

function getAccountId(): string {
  const raw = process.env.NETSUITE_ACCOUNT_ID;
  if (!raw) throw new Error('NETSUITE_ACCOUNT_ID not set');
  return raw.replace(/_/g, '-');
}

function getClientCredentials(): { clientId: string; clientSecret?: string } {
  const clientId = process.env.NETSUITE_CLIENT_ID;
  if (!clientId) throw new Error('NETSUITE_CLIENT_ID not set');
  return { clientId, clientSecret: process.env.NETSUITE_CLIENT_SECRET };
}

function readTokens(): StoredTokens | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    if (data.account_id !== getAccountId()) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveTokens(
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number
): void {
  const tokens: StoredTokens = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    account_id: getAccountId(),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

export function clearTokens(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch (err) {
    console.error('Failed to clear stored tokens:', err);
  }
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const accountId = getAccountId();
  const { clientId, clientSecret } = getClientCredentials();
  const tokenUrl = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
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
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const expiresIn = parseInt(data.expires_in, 10) || 3600;

  saveTokens(data.access_token, data.refresh_token, expiresIn);
  return readTokens()!;
}

/**
 * Runs the full browser-based OAuth flow. Concurrent callers in one process
 * share an attempt; a filesystem lease coordinates separate MCP processes.
 *
 * Dynamically imports oauth-flow to avoid a circular import with token-manager.
 */
export async function runInteractiveAuth(
  options: {
    ignoreCooldown?: boolean;
    clearTokensBeforeAuth?: boolean;
  } = {}
): Promise<string> {
  return getAuthCoordinator().run(async () => {
    if (options.clearTokensBeforeAuth) clearTokens();
    const { runOAuthFlow } = await import('./oauth-flow.js');
    return runOAuthFlow();
  }, options);
}

export async function getAccessToken(): Promise<string> {
  let tokens = readTokens();

  // No tokens at all → run OAuth flow.
  if (!tokens) {
    console.error(
      '[auth] No NetSuite tokens found. Launching interactive OAuth flow...'
    );
    await runInteractiveAuth();
    tokens = readTokens();
    if (!tokens) {
      throw new Error(
        'Authentication completed but no tokens were saved. Please try again.'
      );
    }
    return tokens.access_token;
  }

  // Still valid.
  if (tokens.expires_at > Date.now() + REFRESH_BUFFER_MS) {
    return tokens.access_token;
  }

  // Expired-ish → try refresh first.
  if (tokens.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      return refreshed.access_token;
    } catch (err) {
      console.error(
        '[auth] Refresh token failed, falling back to interactive OAuth flow:',
        err instanceof Error ? err.message : err
      );
      clearTokens();
    }
  } else {
    console.error(
      '[auth] Access token expired with no refresh token, launching interactive OAuth flow...'
    );
    clearTokens();
  }

  // Refresh failed or unavailable → run interactive flow.
  await runInteractiveAuth();
  tokens = readTokens();
  if (!tokens) {
    throw new Error(
      'Re-authentication completed but no tokens were saved. Please try again.'
    );
  }
  return tokens.access_token;
}

export function isAuthenticated(): boolean {
  const tokens = readTokens();
  return tokens !== null;
}

/**
 * Ensures a valid access token exists, triggering interactive OAuth if needed.
 * Useful for callers that want to force a fresh login (e.g. after a 401).
 */
export async function ensureAuthenticated(
  options: { forceReauth?: boolean; ignoreCooldown?: boolean } = {}
): Promise<string> {
  if (options.forceReauth) {
    await runInteractiveAuth({
      ignoreCooldown: options.ignoreCooldown,
      clearTokensBeforeAuth: true,
    });
    const tokens = readTokens();
    if (!tokens) {
      throw new Error(
        'Re-authentication completed but no tokens were saved. Please try again.'
      );
    }
    return tokens.access_token;
  }
  return getAccessToken();
}
