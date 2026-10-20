import { createHash } from 'node:crypto';

import { ensureAuthenticated, getAccessToken } from './token-manager.js';

interface NetsuiteFetchInit extends RequestInit {
  /**
   * If true, a 401 response will clear the stored tokens, run the
   * interactive OAuth flow, and retry the request once. Defaults to true.
   */
  retryOn401?: boolean;
  /** Opaque fingerprint of the credential actually used, including a 401 retry. */
  onAuthContext?: (key: string) => void;
}

function authContextKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Authenticate before a cache lookup; token/role changes get a different key. */
export async function getNetSuiteAuthContext(): Promise<string> {
  return authContextKey(await getAccessToken());
}

/**
 * Wrapper around fetch() that:
 *   - injects a fresh NetSuite Bearer token
 *   - on a 401 response, clears tokens, launches the interactive OAuth flow,
 *     and retries the request exactly once with the new token
 *
 * Use this for every outgoing call to *.suitetalk.api.netsuite.com so that
 * token expiration is handled transparently for the caller.
 */
export function createNetSuiteFetch(
  deps = {
    getAccessToken,
    ensureAuthenticated,
    fetch: globalThis.fetch,
  }
) {
  return async function netsuiteFetch(
    url: string,
    init: NetsuiteFetchInit = {}
  ): Promise<Response> {
    const {
      retryOn401 = true,
      onAuthContext,
      headers: incomingHeaders,
      ...rest
    } = init;

    const buildHeaders = (token: string): Record<string, string> => {
      const headerRecord: Record<string, string> = {};
      if (incomingHeaders) {
        if (incomingHeaders instanceof Headers) {
          incomingHeaders.forEach((value, key) => {
            headerRecord[key] = value;
          });
        } else if (Array.isArray(incomingHeaders)) {
          for (const [key, value] of incomingHeaders) {
            headerRecord[key] = value;
          }
        } else {
          Object.assign(
            headerRecord,
            incomingHeaders as Record<string, string>
          );
        }
      }
      headerRecord['Authorization'] = `Bearer ${token}`;
      return headerRecord;
    };

    const token = await deps.getAccessToken();
    onAuthContext?.(authContextKey(token));
    const response = await deps.fetch(url, {
      ...rest,
      headers: buildHeaders(token),
    });

    if (response.status !== 401 || !retryOn401) {
      return response;
    }

    // Drain the body so callers/agents don't see a half-consumed stream.
    try {
      await response.text();
    } catch {
      // ignore
    }

    console.error(
      '[auth] NetSuite returned 401 — token is invalid. Attempting re-authentication...'
    );
    const freshToken = await deps.ensureAuthenticated({ forceReauth: true });
    onAuthContext?.(authContextKey(freshToken));

    return deps.fetch(url, {
      ...rest,
      headers: buildHeaders(freshToken),
    });
  };
}

export const netsuiteFetch = createNetSuiteFetch();
