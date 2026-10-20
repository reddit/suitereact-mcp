import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import express from 'express';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { loadModule } from './helpers/load-suitescript.mjs';

const { SUITEQL_CHAT_MODELS: models } = loadModule(
  'apps/suiteql-bot/src/config/models.ts'
);
const responses = loadModule('sdf/domain/suitereact.ts');
const quiet = { debug() {}, error() {}, warn() {} };
const querySchema = z.object({ suggestedQuery: z.string() }).strict();
const completion = {
  choices: [
    { message: { content: JSON.stringify({ suggestedQuery: 'SELECT 1' }) } },
  ],
};

function proxyHarness({ role = '100', allowedModels } = {}) {
  const outgoing = [];
  const parameters = {
    custscript_sr_llm_role_ids: '100',
    custscript_sr_llm_models:
      allowedModels ?? models.map(m => `${m.clientType}:${m.model}`).join(','),
  };
  const handler = loadModule('sdf/scripts/sr_rl_llm_proxy.ts', {
    'N/log': quiet,
    'N/runtime': {
      getCurrentUser: () => ({ role }),
      getCurrentScript: () => ({
        getParameter: ({ name }) => parameters[name],
      }),
    },
    'N/https': {
      createSecureString: () => 'mock-secure-secret',
      post: request => {
        outgoing.push({ ...request, body: JSON.parse(request.body) });
        return { code: 200, body: JSON.stringify(completion) };
      },
    },
    '../domain/suitereact': responses,
  });
  return { handler, outgoing };
}

test('documented deployment allowlist matches the SuiteQL picker', () => {
  const readme = readFileSync('apps/suiteql-bot/README.md', 'utf8');
  const csv = readme.match(/```text\n([^\n]+)\n```/)[1];
  assert.deepEqual(
    csv.split(','),
    Array.from(models, m => `${m.clientType}:${m.model}`)
  );
});

for (const model of models) {
  test(`${model.model}: hosted and local paths preserve structured responses and provider parameters`, async t => {
    const { handler, outgoing } = proxyHarness();
    let hostedRequest;
    const { NetSuiteProxyClient } = loadModule(
      'suitereact/src/clients/NetSuiteProxyClient.ts',
      {
        axios: {
          default: {
            create: () => ({
              interceptors: { request: { use() {} }, response: { use() {} } },
              post: async (url, body) => {
                assert.match(url, /script=customscript_sr_rl_llm_proxy/);
                hostedRequest = JSON.parse(JSON.stringify(body));
                return { data: JSON.parse(handler.post(hostedRequest)) };
              },
            }),
          },
        },
        'zod-to-json-schema': { zodToJsonSchema },
      },
      { console: quiet }
    );
    const client = new NetSuiteProxyClient({});
    const result = await client.chatStructured(
      'Suggest a query',
      querySchema,
      'suiteql_query',
      { clientType: model.clientType, model: model.model, topP: 0.9 }
    );
    assert.deepEqual(result, { suggestedQuery: 'SELECT 1' });
    assert.equal(hostedRequest.temperature, 0.7);
    assert.equal(hostedRequest.max_tokens, 15000);

    const routes = loadModule(
      'server/src/routes/nsReactApi.ts',
      {
        axios: {
          default: {
            post: async (url, body) => {
              assert.match(url, /script=customscript_sr_rl_llm_proxy/);
              assert.deepEqual(body, hostedRequest);
              return { data: handler.post(body) };
            },
          },
        },
        dotenv: { default: { config() {} } },
        express: { default: express },
      },
      {
        process: { env: { REACT_APP_NS_ACCOUNT_ID: 'test_SB1' } },
        console: quiet,
      }
    ).default;
    const app = express();
    app.use(express.json());
    app.use('/api', routes);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/handle-llm-request`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hostedRequest),
      }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), completion);
    assert.equal(outgoing.length, 2);
    assert.deepEqual(outgoing[0], outgoing[1]);
    const { url, body } = outgoing[0];
    assert.equal(
      url,
      model.clientType === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions'
    );
    assert.equal(body.model, model.model);
    assert.deepEqual(body.messages, hostedRequest.messages);
    assert.deepEqual(body.response_format, hostedRequest.response_format);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    if (model.clientType === 'openai') {
      assert.equal(body.max_completion_tokens, 15000);
      for (const key of ['temperature', 'top_p', 'max_tokens']) {
        assert.equal(Object.hasOwn(body, key), false);
      }
    } else {
      assert.equal(body.max_tokens, 15000);
      assert.equal(body.temperature, 0.7);
      assert.equal(body.top_p, 0.9);
      assert.equal(Object.hasOwn(body, 'max_completion_tokens'), false);
    }
  });
}

const request = {
  provider: 'openai',
  model: 'gpt-6.1-sol',
  messages: [{ role: 'user', content: 'Suggest a query' }],
  temperature: 0.7,
  top_p: 0.9,
};

for (const [model, sampling] of [
  ['gpt-5.6-sol', false],
  ['gpt-5.4-2026-03-05', false],
  ['gpt-5.3', true],
  ['gpt-4o-mini', true],
]) {
  test(`${model}: existing direct OpenAI sampling behavior`, () => {
    const { handler, outgoing } = proxyHarness({
      allowedModels: `openai:${model}`,
    });
    assert.equal(JSON.parse(handler.post({ ...request, model })).success, true);
    assert.equal(Object.hasOwn(outgoing[0].body, 'temperature'), sampling);
    assert.equal(Object.hasOwn(outgoing[0].body, 'top_p'), sampling);
  });
}

for (const [name, config, changes] of [
  ['role denied', { role: '200' }, {}],
  ['empty allowlist', { allowedModels: '' }, {}],
  ['wrong provider', {}, { provider: 'openrouter' }],
  ['retired model', {}, { model: 'gpt-5.6-sol' }],
  ['excessive token budget', {}, { max_tokens: 32769 }],
]) {
  test(`${name}: no provider call`, () => {
    const { handler, outgoing } = proxyHarness(config);
    assert.equal(
      JSON.parse(handler.post({ ...request, ...changes })).success,
      false
    );
    assert.equal(outgoing.length, 0);
  });
}
