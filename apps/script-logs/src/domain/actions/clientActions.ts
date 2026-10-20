import { handleRestletAction } from 'suitereact';

import {
  LogResult,
  LogTablePage,
  LogTableRequest,
  ScriptLogScriptPage,
} from '../types';

const apiBaseUrl = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_BASE_URL
  : undefined;
const proxyToken = import.meta.env.DEV
  ? import.meta.env.VITE_PROXY_SERVER_TOKEN
  : undefined;

export async function listLiveLogs(
  request: LogTableRequest
): Promise<LogResult<LogTablePage>> {
  if (import.meta.env.DEV && (!apiBaseUrl || !proxyToken)) {
    return {
      status: 'query_error',
      message:
        'Live connection is not configured. Start the managed live proxy and configure the local connection.',
    };
  }
  return callLive<LogTablePage>('listScriptLogTable', request);
}

export async function getLiveDetail(
  id: string
): Promise<LogResult<{ raw: string } | null>> {
  return callLive<{ raw: string } | null>('getScriptLogDetail', { id });
}

let scriptLookup: Promise<LogResult<ScriptLogScriptPage>> | null = null;

export async function searchLiveScripts(
  search: string,
  signal: AbortSignal,
  kind: 'script' | 'deployment' = 'script',
  script?: string
): Promise<LogResult<ScriptLogScriptPage> | null> {
  // The transport cannot cancel an issued RESTlet call. Serialize lookups and drop obsolete queued work.
  while (scriptLookup) await scriptLookup;
  if (signal.aborted) return null;
  scriptLookup = callLive<ScriptLogScriptPage>(
    kind === 'deployment'
      ? 'searchScriptLogDeployments'
      : 'searchScriptLogScripts',
    kind === 'deployment' ? { search, script } : { search }
  );
  try {
    return await scriptLookup;
  } finally {
    scriptLookup = null;
  }
}

async function callLive<T>(
  action: string,
  payload: unknown
): Promise<LogResult<T>> {
  try {
    return {
      status: 'ok',
      value: await handleRestletAction<T>(
        action,
        payload,
        apiBaseUrl,
        proxyToken
      ),
    };
  } catch (error) {
    const failure = error as {
      message?: string;
      response?: { status?: number; data?: unknown };
    };
    const denied =
      failure.response?.status === 403 ||
      /SCRIPT_LOG_PERMISSION_DENIED/.test(
        String(failure.message) + JSON.stringify(failure.response?.data ?? '')
      );
    return denied
      ? {
          status: 'permission_denied',
          message:
            'Your role cannot read these logs. Ask your administrator to check SuiteScript View permission, analytics access, and the RESTlet audience.',
        }
      : {
          status: 'query_error',
          message:
            'NetSuite could not read the logs. Check the connection and deployed log reader, or try a shorter time window.',
        };
  }
}
