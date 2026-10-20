import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { loadModule } from '../../../deploy/tests/helpers/load-suitescript.mjs';

test('built app resolves every root-relative asset through the File Cabinet', () => {
  const html = readFileSync('apps/script-logs/client/index.html', 'utf8');
  const requested = [];
  const loader = loadModule('apps/script-logs/utils/renderingAndHelpers.ts', {
    'N/file': {
      load({ id }) {
        if (id === '../client/index.html') return { getContents: () => html };
        assert.ok(
          readFileSync('apps/script-logs/' + id.replace('../', '')).length
        );
        requested.push(id);
        return { url: '/core/media/media.nl?id=demo&c=synthetic' };
      },
    },
  });
  const hosted = loader.getClient();
  assert.ok(requested.some(id => id.includes('/assets/index.js')));
  assert.ok(requested.some(id => id.endsWith('/favicon.svg')));
  assert.ok(!/\b(?:src|href)="\/(?:assets|favicon)/.test(hosted));
  assert.ok(hosted.includes('&amp;c=synthetic'));
});

test('hosted JavaScript has no separate dynamic chunk to resolve against media.nl', () => {
  const scripts = readdirSync('apps/script-logs/client/assets').filter(name =>
    name.endsWith('.js')
  );
  assert.deepEqual(scripts, ['index.js']);
});

test('production bundle contains no demo switch or fixtures', () => {
  const bundle = readFileSync(
    'apps/script-logs/client/assets/index.js',
    'utf8'
  );
  for (const marker of [
    'Synthetic demo',
    'Demo scenarios',
    'DEMO-INV-1042',
    'INVOICE_SYNC_FAILED',
    'Opening synthetic schedule',
  ])
    assert.ok(!bundle.includes(marker), marker);
});
