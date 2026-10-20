import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import {
  createNetSuiteFetch,
  netsuiteFetch,
} from '../src/auth/netsuiteFetch.js';
import {
  RecordCatalogClient,
  RecordSchemaTimeoutError,
} from '../src/tools/recordCatalog.js';
import { handleRecordSchemaTool } from '../src/tools/recordSchema.js';

const schema = {
  title: 'Customer',
  required: ['id'],
  properties: {
    id: { title: 'ID', type: 'integer', readOnly: true },
    email: { title: 'Email', type: 'string' },
    custentity_collection: {
      title: 'Collection manager',
      type: 'string',
      'x-ns-custom-field': true,
    },
  },
};

function environment(t: TestContext) {
  for (const name of [
    'NETSUITE_ACCOUNT_ID',
    'NETSUITE_SCHEMA_TIMEOUT_MS',
    'NETSUITE_SCHEMA_CACHE_TTL_MS',
  ]) {
    const previous = process.env[name];
    delete process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  process.env.NETSUITE_ACCOUNT_ID = 'test_sb1';
}

function fixture(
  t: TestContext,
  fetcher: typeof netsuiteFetch = async () => Response.json(schema)
) {
  environment(t);
  let scope = 'credential-a';
  let now = 0;
  let calls = 0;
  let authChecks = 0;
  const client = new RecordCatalogClient({
    fetch: async (url, init) => {
      calls++;
      init?.onAuthContext?.(scope);
      return fetcher(url, init);
    },
    getAuthContext: async () => {
      authChecks++;
      return scope;
    },
    now: () => now,
  });
  return {
    client,
    get calls() {
      return calls;
    },
    get authChecks() {
      return authChecks;
    },
    setScope: (value: string) => {
      scope = value;
    },
    setNow: (value: number) => {
      now = value;
    },
  };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const output = (value: Awaited<ReturnType<typeof handleRecordSchemaTool>>) =>
  JSON.parse(value[0].text);

test('the default deadline permits the observed 43.6-second metadata response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const f = fixture(t, async (_url, init) => {
    signal = init?.signal as AbortSignal;
    await new Promise(resolve => setTimeout(resolve, 43_600));
    return Response.json(schema);
  });
  const result = handleRecordSchemaTool({ recordType: 'customer' }, f.client);
  await flush();
  t.mock.timers.tick(30_001);
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(13_599);
  assert.equal(output(await result).fieldCount, 3);
  t.mock.timers.tick(120_000);
  assert.equal(signal?.aborted, false, 'completed requests clear their timer');
});

test('timeout reports the record and duration, aborts the request, and permits retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  let attempt = 0;
  const f = fixture(t, async (_url, init) => {
    if (++attempt > 1) return Response.json(schema);
    signal = init?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  });
  process.env.NETSUITE_SCHEMA_TIMEOUT_MS = '1500';
  const result = handleRecordSchemaTool({ recordType: 'customer' }, f.client);
  await flush();
  t.mock.timers.tick(1500);
  const error = output(await result);
  assert.equal(error.code, 'SCHEMA_LOOKUP_TIMEOUT');
  assert.equal(error.recordType, 'customer');
  assert.equal(error.timeoutMs, 1500);
  assert.equal(error.retryable, true);
  assert.match(error.details, /customer.*1500 ms/);
  assert.equal(signal?.aborted, true);
  assert.equal(
    output(await handleRecordSchemaTool({ recordType: 'customer' }, f.client))
      .fieldCount,
    3
  );
  assert.equal(f.calls, 2);
});

test('the deadline remains active after headers while the JSON body is loading', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let bodyReads = 0;
  const f = fixture(t, async () => {
    const response = Response.json(schema);
    response.json = async () => {
      bodyReads++;
      return new Promise(() => {});
    };
    return response;
  });
  const request = f.client.get('test', 'invoice');
  const rejected = assert.rejects(request, (error: unknown) => {
    assert.ok(error instanceof RecordSchemaTimeoutError);
    assert.equal(error.timeoutMs, 120_000);
    return true;
  });
  await flush();
  assert.equal(bodyReads, 1);
  t.mock.timers.tick(120_000);
  await rejected;
});

test('different field filters share raw metadata while preserving the output contract', async t => {
  const f = fixture(t, async (url, init) => {
    assert.match(String(url), /test-sb1.*metadata-catalog\/customer$/);
    assert.equal(
      (init?.headers as Record<string, string>).Accept,
      'application/schema+json'
    );
    return Response.json(schema);
  });
  const first = output(
    await handleRecordSchemaTool(
      { recordType: 'customer', fieldFilter: 'collection' },
      f.client
    )
  );
  assert.equal(first.mode, 'detail');
  assert.deepEqual(
    first.fields.map((field: { field: string }) => field.field),
    ['custentity_collection']
  );
  const second = output(
    await handleRecordSchemaTool(
      { recordType: 'customer', fieldFilter: 'email' },
      f.client
    )
  );
  assert.equal(second.fields[0].field, 'email');
  const custom = output(
    await handleRecordSchemaTool(
      { recordType: 'customer', customFieldsOnly: true },
      f.client
    )
  );
  assert.equal(custom.fields[0].custom, true);
  const all = output(
    await handleRecordSchemaTool({ recordType: 'customer' }, f.client)
  );
  assert.equal(all.fieldCount, 3);
  assert.equal(
    all.fields.find((field: { field: string }) => field.field === 'id')
      .required,
    true
  );
  assert.equal(f.calls, 1);
  assert.equal(f.authChecks, 4, 'even cache hits check current credentials');
});

test('concurrent lookups for one schema share the same pending request', async t => {
  let finish!: (value: Response) => void;
  const f = fixture(
    t,
    async () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const first = f.client.get('test', 'customer');
  const second = f.client.get('test', 'customer');
  await flush();
  assert.equal(f.calls, 1);
  finish(Response.json(schema));
  assert.deepEqual(await first, await second);
});

test('cache expires and refreshCache replaces prior metadata for the same account', async t => {
  let revision = 0;
  const f = fixture(t, async () =>
    Response.json({ ...schema, title: `Revision ${++revision}` })
  );
  await f.client.get('test-sb1', 'customer');
  f.setNow(299_999);
  await f.client.get('test-sb1', 'customer');
  assert.equal(f.calls, 1);
  f.setNow(300_000);
  await f.client.get('test-sb1', 'customer');
  assert.equal(f.calls, 2);
  const refreshed = output(
    await handleRecordSchemaTool(
      { recordType: 'customer', refreshCache: true },
      f.client
    )
  );
  assert.equal(refreshed.recordTitle, 'Revision 3');
  assert.equal(
    output(await handleRecordSchemaTool({ recordType: 'customer' }, f.client))
      .recordTitle,
    'Revision 3'
  );
  assert.equal(f.calls, 3);
});

test('setting the cache TTL to zero disables completed-schema reuse', async t => {
  const f = fixture(t);
  process.env.NETSUITE_SCHEMA_CACHE_TTL_MS = '0';
  await f.client.get('test', 'customer');
  await f.client.get('test', 'customer');
  assert.equal(f.calls, 2);
});

test('account, credential and record changes cannot reuse another cached schema', async t => {
  const f = fixture(t);
  await f.client.get('account-a', 'customer');
  await f.client.get('account-a', 'invoice');
  await f.client.get('account-b', 'customer');
  f.setScope('credential-b');
  await f.client.get('account-a', 'customer');
  assert.equal(f.calls, 4);
  await f.client.get('account-a', 'customer');
  assert.equal(f.calls, 4);
});

test('a changed credential on a 401 retry cannot populate the original context cache', async t => {
  const f = fixture(t, async (_url, init) => {
    init?.onAuthContext?.('credential-b');
    return Response.json(schema);
  });
  await f.client.get('test', 'customer');
  await f.client.get('test', 'customer');
  assert.equal(f.calls, 2, 'credential-a cannot reuse credential-b metadata');
  f.setScope('credential-b');
  await f.client.get('test', 'customer');
  assert.equal(
    f.calls,
    2,
    'the response is cached only under its actual credential'
  );
});

test('bounded cache evicts the least recently used schema', async t => {
  const f = fixture(t);
  for (let i = 0; i < 32; i++) await f.client.get('test', `record${i}`);
  await f.client.get('test', 'record0');
  await f.client.get('test', 'record32');
  await f.client.get('test', 'record0');
  assert.equal(f.calls, 33);
  await f.client.get('test', 'record1');
  assert.equal(f.calls, 34);
});

for (const failure of ['http', 'json', 'shape']) {
  test(`${failure} failures are not cached and do not prevent a later successful fetch`, async t => {
    let attempt = 0;
    const f = fixture(t, async () => {
      if (attempt === 0 && failure === 'shape') {
        attempt++;
        return Response.json(null);
      }
      if (++attempt === 1)
        return new Response('unavailable', {
          status: failure === 'http' ? 503 : 200,
        });
      return Response.json(schema);
    });
    await assert.rejects(f.client.get('test', 'customer'));
    assert.deepEqual(await f.client.get('test', 'customer'), schema);
    assert.equal(f.calls, 2);
  });
}

test('concurrent requests under different credentials never share pending metadata', async t => {
  const finish: Array<(response: Response) => void> = [];
  const f = fixture(
    t,
    async () => new Promise(resolve => finish.push(resolve))
  );
  const first = f.client.get('test', 'customer');
  await flush();
  f.setScope('credential-b');
  const second = f.client.get('test', 'customer');
  await flush();
  assert.equal(f.calls, 2);
  finish[1](Response.json({ title: 'B' }));
  finish[0](Response.json({ title: 'A' }));
  assert.deepEqual(await first, { title: 'A' });
  assert.deepEqual(await second, { title: 'B' });
  assert.deepEqual(await f.client.get('test', 'customer'), { title: 'B' });
  f.setScope('credential-a');
  assert.deepEqual(await f.client.get('test', 'customer'), { title: 'A' });
  assert.equal(f.calls, 2);
});

test('invalid timeout and cache configuration fails before authenticating or fetching', async t => {
  const f = fixture(t);
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1.5', '999', '300001']) {
    process.env.NETSUITE_SCHEMA_TIMEOUT_MS = value;
    await assert.rejects(
      f.client.get('test', 'customer'),
      /NETSUITE_SCHEMA_TIMEOUT_MS/
    );
  }
  delete process.env.NETSUITE_SCHEMA_TIMEOUT_MS;
  process.env.NETSUITE_SCHEMA_CACHE_TTL_MS = '-1';
  await assert.rejects(
    f.client.get('test', 'customer'),
    /NETSUITE_SCHEMA_CACHE_TTL_MS/
  );
  assert.equal(f.calls, 0);
  assert.equal(f.authChecks, 0);
});

test('list mode preserves sorted record names and supports a forced refresh', async t => {
  const f = fixture(t, async url => {
    assert.ok(String(url).endsWith('/metadata-catalog/'));
    return Response.json({
      items: [{ name: 'invoice' }, { name: 'customer' }],
    });
  });
  const list = output(await handleRecordSchemaTool({}, f.client));
  assert.equal(list.mode, 'list');
  assert.deepEqual(list.recordTypes, ['customer', 'invoice']);
  assert.equal(list.totalRecordTypes, 2);
  await handleRecordSchemaTool({ refreshCache: true }, f.client);
  assert.equal(f.calls, 2);
});

test('authenticated fetch reports only fingerprints and updates context on its existing 401 retry', async () => {
  const requests: RequestInit[] = [];
  let reauths = 0;
  const request = createNetSuiteFetch({
    getAccessToken: async () => 'test-token-a',
    ensureAuthenticated: async options => {
      assert.equal(options?.forceReauth, true);
      reauths++;
      return 'test-token-b';
    },
    fetch: async (_url, init) => {
      requests.push(init!);
      return new Response('', { status: requests.length === 1 ? 401 : 200 });
    },
  });
  const contexts: string[] = [];
  const response = await request('https://example.invalid', {
    onAuthContext: context => contexts.push(context),
  });
  assert.equal(response.status, 200);
  assert.equal(reauths, 1);
  assert.deepEqual(
    contexts,
    ['test-token-a', 'test-token-b'].map(token =>
      createHash('sha256').update(token).digest('hex')
    )
  );
  assert.equal(
    (requests[0].headers as Record<string, string>).Authorization,
    'Bearer test-token-a'
  );
  assert.equal(
    (requests[1].headers as Record<string, string>).Authorization,
    'Bearer test-token-b'
  );
  assert.ok(!('onAuthContext' in requests[0]));
});
