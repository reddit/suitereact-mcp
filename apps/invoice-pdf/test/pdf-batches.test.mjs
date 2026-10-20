import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUSY_MESSAGE,
  chunk,
  generatePdfsInBatches,
  isConcurrencyLimitError,
} from '../src/domain/actions/pdfBatches.ts';

const invoices = n =>
  Array.from({ length: n }, (_, i) => ({ id: 100 + i, tranId: `INV-${i}` }));
const ok = batch => ({ pdfs: batch.map(inv => ({ ...inv, base64: 'PDF' })) });
const limitError = () =>
  Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429 },
  });

test('chunk splits into fixed-size groups with a short tail', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 3), [
    [1, 2, 3],
    [4, 5, 6],
    [7],
  ]);
});

test('concurrency-limit errors are recognised from status or NetSuite code', () => {
  assert(isConcurrencyLimitError(limitError()));
  assert(
    isConcurrencyLimitError(new Error('SSS_REQUEST_LIMIT_EXCEEDED: too many'))
  );
  assert(
    isConcurrencyLimitError({
      response: { status: 400, data: { error: 'SSS_REQUEST_LIMIT_EXCEEDED' } },
    })
  );
  assert(!isConcurrencyLimitError(new Error('Template not found')));
  assert(!isConcurrencyLimitError({ response: { status: 500 } }));
});

test('requests stay within chunk size and concurrency; order is kept', async () => {
  let inFlight = 0;
  let peak = 0;
  const sizes = [];
  const progress = [];
  const result = await generatePdfsInBatches(invoices(27), {
    chunkSize: 5,
    concurrency: 3,
    onProgress: (done, total) => progress.push([done, total]),
    generate: async batch => {
      sizes.push(batch.length);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Later batches finish first, so results arrive out of order.
      await new Promise(r => setTimeout(r, 30 - batch[0].id / 10));
      inFlight -= 1;
      return ok([...batch].reverse());
    },
  });
  assert.equal(peak, 3);
  assert.deepEqual(sizes.sort(), [2, 5, 5, 5, 5, 5]);
  assert.deepEqual(
    result.map(r => r.id),
    invoices(27).map(i => i.id)
  );
  assert.deepEqual(progress[0], [0, 27]);
  assert.deepEqual(progress.at(-1), [27, 27]);
});

test('a concurrency rejection backs off and retries the same request', async () => {
  const delays = [];
  let calls = 0;
  const result = await generatePdfsInBatches(invoices(3), {
    chunkSize: 5,
    concurrency: 1,
    baseDelayMs: 100,
    sleep: async ms => delays.push(ms),
    generate: async batch => {
      calls += 1;
      if (calls <= 2) throw limitError();
      return ok(batch);
    },
  });
  assert.deepEqual(delays, [100, 200]);
  assert(result.every(r => r.base64 === 'PDF' && !r.error));
});

test('persistent concurrency rejection fails only that request, with a clear reason', async () => {
  const result = await generatePdfsInBatches(invoices(7), {
    chunkSize: 5,
    concurrency: 2,
    maxAttempts: 3,
    sleep: async () => {},
    generate: async batch => {
      if (batch[0].id === 100) throw limitError();
      return ok(batch);
    },
  });
  assert.deepEqual(
    result.filter(r => r.error).map(r => r.id),
    [100, 101, 102, 103, 104]
  );
  assert(result.filter(r => r.error).every(r => r.error === BUSY_MESSAGE));
  assert(result.slice(5).every(r => r.base64 === 'PDF'));
});

test('other request failures are not retried and keep their message', async () => {
  let calls = 0;
  const result = await generatePdfsInBatches(invoices(2), {
    chunkSize: 5,
    concurrency: 3,
    sleep: async () => assert.fail('should not back off'),
    generate: async () => {
      calls += 1;
      throw new Error('Script execution time exceeded');
    },
  });
  assert.equal(calls, 1);
  assert(result.every(r => r.error === 'Script execution time exceeded'));
});

test('an invoice missing from the response is reported, not dropped', async () => {
  const result = await generatePdfsInBatches(invoices(3), {
    chunkSize: 5,
    concurrency: 1,
    generate: async batch => ok(batch.slice(1)),
  });
  assert.equal(result.length, 3);
  assert.equal(result[0].error, 'No PDF returned');
});
