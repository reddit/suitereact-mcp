import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from '../../../deploy/tests/helpers/load-suitescript.mjs';

const json = loadModule(
  'apps/script-logs/src/utils/json.ts',
  {},
  { TextEncoder }
);
test('malformed, empty, scalar and oversized payloads remain safe', () => {
  assert.equal(json.inspectJson('{"broken":').kind, 'invalid');
  assert.equal(json.inspectJson('plain text').kind, 'text');
  assert.equal(json.inspectJson('').kind, 'text');
  for (const raw of ['null', 'false', '0', '""'])
    assert.equal(json.inspectJson(raw).kind, 'json');
  assert.equal(json.inspectJson('x'.repeat(300000)).kind, 'large');
  assert.equal(json.inspectJson('é'.repeat(150000)).kind, 'large');
});
test('index, depth and rendered rows are bounded while matching ancestors are retained', () => {
  const inspection = json.inspectJson(
    JSON.stringify({ rows: Array.from({ length: 6000 }, (_, i) => i) })
  );
  assert.equal(inspection.nodes.length, 5000);
  assert.equal(inspection.truncated, true);
  const expanded = new Set(
    inspection.nodes.filter(node => node.container).map(node => node.path)
  );
  assert.equal(
    json.visibleNodes(inspection.nodes, expanded, '').rows.length,
    500
  );
  const found = json.visibleNodes(inspection.nodes, new Set(), '4990');
  assert.ok(found.rows.some(node => node.path === '$/rows'));
  assert.ok(found.matches.size > 0);
  assert.equal(
    json.inspectJson('{"x":'.repeat(100) + 'null' + '}'.repeat(100)).truncated,
    true
  );
});
test('path encoding keeps unusual object keys distinct and stack arrays readable', () => {
  const inspected = json.inspectJson('{"a/b":0,"a":{"b":false},"~":null}');
  assert.equal(
    new Set(inspected.nodes.map(node => node.path)).size,
    inspected.nodes.length
  );
  assert.equal(
    json.errorSummary({ name: 'ERROR', stack: ['one', 'two'] }).stack,
    'one\ntwo'
  );
});

test('key matches remain browsable and clearing search restores expansion', () => {
  const { nodes } = json.inspectJson(
    '{"cause":{"response":{"code":"FAILED"}},"message":"normal"}'
  );
  const base = new Set(['$']);
  const key = json.visibleNodes(nodes, base, 'cause');
  assert.ok(key.rows.some(node => node.path === '$/cause'));
  assert.equal(key.expanded.has('$/cause'), false);
  const browsed = json.visibleNodes(nodes, new Set(['$', '$/cause']), 'cause');
  assert.ok(browsed.rows.some(node => node.path === '$/cause/response'));
  const leaf = json.visibleNodes(nodes, base, 'FAILED');
  assert.ok(leaf.rows.some(node => node.path === '$/cause/response/code'));
  const closed = json.visibleNodes(nodes, base, 'FAILED', {
    collapsed: new Set(['$/cause']),
  });
  assert.equal(
    closed.rows.some(node => node.path === '$/cause/response'),
    false
  );
  assert.equal(
    json
      .visibleNodes(nodes, base, '')
      .rows.some(node => node.path === '$/cause/response'),
    false
  );
});

test('a later match moves the bounded row window instead of disappearing', () => {
  const { nodes } = json.inspectJson(
    JSON.stringify({
      rows: Array.from({ length: 2000 }, (_, i) => `entry-${i}`),
    })
  );
  const result = json.visibleNodes(nodes, new Set(['$']), 'entry-1999', {
    focusPath: '$/rows/1999',
  });
  assert.ok(result.rows.length <= 500);
  assert.ok(result.rows.some(node => node.path === '$/rows/1999'));
  assert.ok(result.offset > 0);
  const next = json.visibleNodes(nodes, new Set(['$', '$/rows']), '', {
    offset: 500,
  });
  assert.equal(next.offset, 500);
  assert.equal(next.rows.length, 500);
});

// Compare captured tokens, including all whitespace inside strings, independently of layout.
function capturedTokens(text) {
  let quoted = false;
  let escaped = false;
  let result = '';
  for (const char of text) {
    if (quoted || !/\s/.test(char)) result += char;
    if (escaped) escaped = false;
    else if (quoted && char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
  }
  return result;
}

test('every truncated prefix preserves tokens, escapes and unfinished values', () => {
  const complete = JSON.stringify([
    {
      action: 'c',
      period: 0,
      balance: 1234.56,
      note: 'quoted "key", [brace]: \\ end  ',
    },
    {
      period: 1,
      payment: -2.5e10,
      flags: [true, false, null],
      nested: { message: 'hello\nworld' },
    },
  ]);
  for (let length = 1; length < complete.length; length++) {
    const raw = complete.slice(0, length);
    const formatted = json.formatIncompleteJson(raw);
    assert.equal(typeof formatted, 'string');
    assert.equal(
      capturedTokens(formatted),
      capturedTokens(raw),
      `prefix ${length}`
    );
  }
  const raw = '[{"period":0,"balance":1234.56},{"period":1,"remaining_pay';
  const inspection = json.inspectJson(raw);
  assert.equal(inspection.kind, 'invalid');
  assert.match(inspection.formatted, /^\[\n  \{\n    "period": 0,/);
  assert.ok(inspection.formatted.endsWith('"remaining_pay'));
  assert.equal(inspection.nodes.length, 0);
});

test('incomplete strings keep trailing spaces, newlines and partial escapes exactly', () => {
  for (const raw of [
    '{"x":"tail   ',
    '{"x":"tail\n  ',
    '{"x":"\\',
    '{"x":"\\u00',
    '{"x":"a\\"b,}:  ',
  ]) {
    assert.equal(
      capturedTokens(json.formatIncompleteJson(raw)),
      capturedTokens(raw)
    );
  }
});

test('invalid interior tokens remain invalid rather than being silently repaired', () => {
  for (const raw of [
    '{"x":1 2,"y":',
    '{"x":tru false}',
    '[1,,2]',
    '{"x":NaN}',
    '{"x":1}]',
  ]) {
    const formatted = json.formatIncompleteJson(raw);
    assert.equal(capturedTokens(formatted), capturedTokens(raw));
    assert.throws(() => JSON.parse(formatted));
  }
});

test('formatting falls back at byte, depth and output limits', () => {
  assert.equal(json.formatIncompleteJson('["' + 'é'.repeat(140000)), null);
  assert.equal(json.formatIncompleteJson('['.repeat(41)), null);
  assert.equal(
    json.formatIncompleteJson('['.repeat(35) + '0,'.repeat(8000)),
    null
  );
  assert.equal(json.inspectJson('['.repeat(41)).formatted, undefined);
  assert.equal(json.inspectJson('normal diagnostic text').formatted, undefined);
  assert.equal(json.inspectJson('{"a":1}').formatted, undefined);
});
test('copy value decodes strings, including a root string, and keeps root containers verbatim', () => {
  const root = raw => json.inspectJson(raw).nodes[0];
  const rootString = '"a\\"b\\n"';
  assert.equal(json.copyValueText(root(rootString), rootString), 'a"b\n');
  const object = '{ "id": 1,\n  "name": "x" }';
  assert.equal(json.copyValueText(root(object), object), object);
  const nested = json.inspectJson('{"name":"a\\tb"}').nodes[1];
  assert.equal(json.copyValueText(nested, ''), 'a\tb');
});
test('stack traces longer than one text page are returned whole for paging', () => {
  const frames = Array.from(
    { length: 2000 },
    (_, i) => `    at frame${i} (/SuiteScripts/lib/module${i}.js:${i}:1)`
  );
  const stack = frames.join('\n');
  assert.ok(stack.length > json.RAW_PAGE_SIZE * 2);
  const summary = json.errorSummary({ name: 'SSS_ERROR', stack });
  assert.equal(summary.stack, stack);
  assert.ok(
    summary.stack.endsWith('frame1999 (/SuiteScripts/lib/module1999.js:1999:1)')
  );
});
