import {
  getNetSuiteAuthContext,
  netsuiteFetch,
} from '../auth/netsuiteFetch.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CACHE_TTL_MS = 300_000;
const MAX_CACHE_ENTRIES = 32;

function duration(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    throw new Error(
      `${name} must be an integer from ${min} to ${max} milliseconds`
    );
  }
  return parsed;
}

export class RecordSchemaTimeoutError extends Error {
  readonly code = 'SCHEMA_LOOKUP_TIMEOUT';

  constructor(
    readonly recordType: string,
    readonly timeoutMs: number
  ) {
    super(
      `NetSuite metadata lookup for ${recordType || 'the record catalog'} timed out after ${timeoutMs} ms. ` +
        'Retry the lookup or increase NETSUITE_SCHEMA_TIMEOUT_MS if the metadata API remains slow.'
    );
    this.name = 'RecordSchemaTimeoutError';
  }
}

interface CatalogDependencies {
  fetch: typeof netsuiteFetch;
  getAuthContext: () => Promise<string>;
  now: () => number;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** Process-local raw schemas; field filters are applied by the tool afterwards. */
export class RecordCatalogClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly deps: CatalogDependencies;

  constructor(deps: Partial<CatalogDependencies> = {}) {
    this.deps = {
      fetch: netsuiteFetch,
      getAuthContext: getNetSuiteAuthContext,
      now: Date.now,
      ...deps,
    };
  }

  async get(
    accountId: string,
    recordType: string,
    refreshCache = false
  ): Promise<unknown> {
    const timeoutMs = duration(
      'NETSUITE_SCHEMA_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
      1_000,
      300_000
    );
    const ttlMs = duration(
      'NETSUITE_SCHEMA_CACHE_TTL_MS',
      DEFAULT_CACHE_TTL_MS,
      0,
      3_600_000
    );
    const authContext = await this.deps.getAuthContext();
    const keyFor = (context: string) =>
      JSON.stringify([accountId, recordType, context]);
    const key = keyFor(authContext);
    const cached = this.cache.get(key);
    if (
      !refreshCache &&
      ttlMs > 0 &&
      cached &&
      cached.expiresAt > this.deps.now()
    ) {
      // Refresh LRU order, without extending the schema's freshness window.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.value;
    }
    this.cache.delete(key);
    const active = this.pending.get(key);
    if (active) return active;

    const request = this.load(
      accountId,
      recordType,
      timeoutMs,
      authContext
    ).then(result => {
      if (ttlMs > 0) {
        for (const [cacheKey, entry] of this.cache) {
          if (entry.expiresAt <= this.deps.now()) this.cache.delete(cacheKey);
        }
        // A 401 retry may use a different role/token. Never cache its response
        // under the original credential's key.
        const responseKey = keyFor(result.authContext);
        this.cache.delete(responseKey);
        while (this.cache.size >= MAX_CACHE_ENTRIES) {
          this.cache.delete(this.cache.keys().next().value!);
        }
        this.cache.set(responseKey, {
          value: result.value,
          expiresAt: this.deps.now() + ttlMs,
        });
      }
      return result.value;
    });
    this.pending.set(key, request);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private async load(
    accountId: string,
    recordType: string,
    timeoutMs: number,
    authContext: string
  ) {
    const controller = new AbortController();
    const timeoutError = new RecordSchemaTimeoutError(recordType, timeoutMs);
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(timeoutError);
        controller.abort();
      }, timeoutMs);
    });
    const read = async () => {
      const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/metadata-catalog/${encodeURIComponent(recordType)}`;
      const response = await this.deps.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/schema+json' },
        signal: controller.signal,
        onAuthContext: context => {
          authContext = context;
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `NetSuite Record Catalog API failed: ${response.status} ${errorText}`
        );
      }
      // Await body consumption before clearing the deadline or caching data.
      const value: unknown = await response.json();
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('NetSuite metadata response must be a JSON object');
      }
      return { value, authContext };
    };
    try {
      return await Promise.race([read(), deadline]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
