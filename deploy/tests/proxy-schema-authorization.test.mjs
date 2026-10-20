import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';

import { loadModule } from './helpers/load-suitescript.mjs';

const responses = loadModule('sdf/domain/suitereact.ts');
const denial = loadModule('sdf/domain/actionDenial.ts');
const Permission = { NONE: 0, VIEW: 1, CREATE: 2, EDIT: 3, FULL: 4 };
const ramda = loadModule('sdf/libs/ramda.js');

for (const endpoint of ['action', 'record-schema']) {
  for (const allowed of [false, true]) {
    test(`proxy ${endpoint}: schema retrieval ${allowed ? 'honors' : 'requires'} SuiteAnalytics Workbook`, async t => {
      let schemaReads = 0;
      const schema = { recordType: 'customer', fields: [{ field: 'id' }] };
      const runtime = {
        Permission,
        getCurrentUser: () => ({
          role: 100,
          getPermission: ({ name }) =>
            name === 'REPO_ANALYTICS' && allowed
              ? Permission.VIEW
              : Permission.NONE,
        }),
        getCurrentScript: () => {
          throw new Error('query actions must not read role-list parameters');
        },
      };
      const handler = loadModule('sdf/scripts/sr_rl_rct_action_handler.ts', {
        'N/log': { audit() {}, debug() {}, error() {} },
        '../domain/actionDenial': denial,
        '../domain/actionAuthorization': loadModule(
          'sdf/domain/actionAuthorization.ts',
          { 'N/runtime': runtime }
        ),
        '../domain/suitereact': responses,
        '../libs/ramda': ramda,
        '../actions/index': {
          getRecordFieldSchema: () => {
            schemaReads += 1;
            return schema;
          },
        },
      });
      const requests = [];
      const routes = loadModule(
        'server/src/routes/nsReactApi.ts',
        {
          axios: {
            default: {
              post: async (url, body) => {
                requests.push({ url, body });
                return { data: handler.post(body) };
              },
            },
          },
          dotenv: { default: { config() {} } },
          express: { default: express },
        },
        {
          process: { env: { REACT_APP_NS_ACCOUNT_ID: 'test_SB1' } },
          console: { warn() {}, error() {} },
        }
      ).default;
      const app = express();
      app.use(express.json());
      app.use('/api', routes);
      const server = app.listen(0, '127.0.0.1');
      t.after(
        () =>
          new Promise((resolve, reject) => {
            server.close(error => (error ? reject(error) : resolve()));
          })
      );
      await once(server, 'listening');
      const base = `http://127.0.0.1:${server.address().port}`;
      const response =
        endpoint === 'action'
          ? await fetch(`${base}/api/handle-action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                params: { actionProps: { action: 'getRecordFieldSchema' } },
                inputData: { recordType: 'customer' },
              }),
            })
          : await fetch(`${base}/api/record-schema/customer`);
      assert.equal(requests.length, 1);
      assert.match(requests[0].url, /test-sb1\.restlets\.api\.netsuite\.com/);
      assert.equal(requests[0].body.action, 'getRecordFieldSchema');
      assert.equal(requests[0].body.recordType, 'customer');
      assert.equal(response.status, allowed ? 200 : 400);
      assert.equal(schemaReads, allowed ? 1 : 0);
      const data = await response.json();
      if (allowed) assert.deepEqual(data, schema);
      else assert.equal(data.error.error, 'SUITEREACT_ACTION_FAILED');
    });
  }
}
