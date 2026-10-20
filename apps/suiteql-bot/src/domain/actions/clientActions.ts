import { handleRestletAction, type NsReactTableHeaderProps } from 'suitereact';

import { LOCAL_PROXY_BASE_URL, LOCAL_PROXY_TOKEN } from '../../config/runtime';

export type SuiteqlTablePayload = {
  headers: NsReactTableHeaderProps[];
  rows: Record<string, unknown>[];
};

export type SuiteqlError = {
  message: string;
  code?: string;
  detail?: string;
  raw?: unknown;
};

function isSuiteScriptError(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    (typeof o.type === 'string' && o.type.toLowerCase().includes('error')) ||
    (typeof o.name === 'string' && typeof o.message === 'string')
  );
}

function extractErrorMessage(obj: Record<string, unknown>): SuiteqlError {
  const name = typeof obj.name === 'string' ? obj.name : undefined;
  const msg = typeof obj.message === 'string' ? obj.message : undefined;

  const cause = obj.cause as Record<string, unknown> | undefined;
  const detail =
    cause && typeof cause.details === 'string' ? cause.details : undefined;

  const friendlyMsg = msg || detail || 'An unknown SuiteScript error occurred.';

  return {
    message: friendlyMsg,
    code: name,
    detail: detail && detail !== friendlyMsg ? detail : undefined,
    raw: obj,
  };
}

/**
 * The action handler wraps errors as `{ success: false, error: "ACTION: name [CODE]: msg", message: "..." }`.
 * Try to parse the code out of that `error` string.
 */
function parseActionHandlerError(
  obj: Record<string, unknown>
): SuiteqlError | null {
  if (obj.success !== false) return null;
  const errStr = typeof obj.error === 'string' ? obj.error : '';
  const msg = typeof obj.message === 'string' ? obj.message : '';
  if (!errStr && !msg) return null;

  const bracketMatch = errStr.match(/\[([A-Z_]+)\]/);
  const code = bracketMatch ? bracketMatch[1] : undefined;

  const pipeIdx = msg.indexOf(' | Query: ');
  const userMessage = pipeIdx >= 0 ? msg.substring(0, pipeIdx) : msg;
  const queryPreview =
    pipeIdx >= 0 ? msg.substring(pipeIdx + ' | Query: '.length) : undefined;

  return {
    message: userMessage || errStr,
    code,
    detail: queryPreview
      ? `Failed query: ${queryPreview}`
      : errStr !== userMessage
        ? errStr
        : undefined,
    raw: obj,
  };
}

function findSuiteScriptError(obj: unknown, depth = 0): SuiteqlError | null {
  if (depth > 3 || !obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  if (isSuiteScriptError(o) && o.name !== 'AxiosError') {
    return extractErrorMessage(o);
  }

  const actionErr = parseActionHandlerError(o);
  if (actionErr) return actionErr;

  if (o.error && typeof o.error === 'object') {
    const nested = findSuiteScriptError(o.error, depth + 1);
    if (nested) return nested;
  }
  if (o.cause && typeof o.cause === 'object') {
    const nested = findSuiteScriptError(o.cause, depth + 1);
    if (nested) return nested;
  }
  if (o.data && typeof o.data === 'object') {
    const nested = findSuiteScriptError(o.data, depth + 1);
    if (nested) return nested;
  }

  if (typeof o.message === 'string' && o.name !== 'AxiosError') {
    return {
      message: o.message as string,
      code: typeof o.name === 'string' ? (o.name as string) : undefined,
      raw: obj,
    };
  }

  return null;
}

function extractFromError(err: unknown): SuiteqlError {
  if (!err || typeof err !== 'object') {
    return {
      message: typeof err === 'string' ? err : 'SuiteQL request failed.',
      raw: err,
    };
  }

  const e = err as Record<string, unknown>;

  const responseData = (e.response as Record<string, unknown> | undefined)
    ?.data;
  if (responseData) {
    const found = findSuiteScriptError(responseData);
    if (found) return found;
  }

  const found = findSuiteScriptError(err);
  if (found) return found;

  const status = (e.response as Record<string, unknown> | undefined)?.status as
    | number
    | undefined;
  const statusText = (e.response as Record<string, unknown> | undefined)
    ?.statusText as string | undefined;

  if (status) {
    const errorProp = (responseData as Record<string, unknown> | undefined)
      ?.error;
    const msg =
      typeof errorProp === 'string'
        ? errorProp
        : `Server returned ${status}${statusText ? ` (${statusText})` : ''}`;
    return { message: msg, code: `HTTP_${status}`, raw: responseData };
  }

  const message =
    err instanceof Error ? err.message : 'SuiteQL request failed.';
  return { message, raw: err };
}

/**
 * Executes SuiteQL via the SuiteReact action RESTlet (`getTableRowsFromSuiteql`).
 * Uses the local proxy when `VITE_PROXY_SERVER_BASE_URL` is set.
 */
export async function executeSuiteqlQuery(
  query: string
): Promise<
  { ok: true; data: SuiteqlTablePayload } | { ok: false; error: SuiteqlError }
> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: { message: 'Query is empty.' },
    };
  }

  try {
    const raw = await handleRestletAction(
      'getTableRowsFromSuiteql',
      { query: trimmed },
      LOCAL_PROXY_BASE_URL,
      LOCAL_PROXY_TOKEN
    );

    if (!raw || typeof raw !== 'object') {
      return {
        ok: false,
        error: { message: 'Unexpected empty response from SuiteQL action.' },
      };
    }

    if (isSuiteScriptError(raw)) {
      return {
        ok: false,
        error: extractErrorMessage(raw as Record<string, unknown>),
      };
    }

    if ('error' in raw) {
      const errVal = (raw as Record<string, unknown>).error;
      if (typeof errVal === 'string') {
        return { ok: false, error: { message: errVal, raw } };
      }
      const nested = findSuiteScriptError(errVal);
      if (nested) return { ok: false, error: nested };
      return {
        ok: false,
        error: { message: 'An error occurred executing the query.', raw },
      };
    }

    const payload = raw as Partial<SuiteqlTablePayload>;
    if (!Array.isArray(payload.headers) || !Array.isArray(payload.rows)) {
      return {
        ok: false,
        error: { message: 'Response missing headers or rows.', raw },
      };
    }

    return {
      ok: true,
      data: {
        headers: payload.headers,
        rows: payload.rows,
      },
    };
  } catch (err: unknown) {
    const extracted = extractFromError(err);
    if (!extracted.detail && trimmed) {
      const preview =
        trimmed.length > 200 ? trimmed.substring(0, 200) + '…' : trimmed;
      extracted.detail = `Failed query: ${preview}`;
    }
    return { ok: false, error: extracted };
  }
}
