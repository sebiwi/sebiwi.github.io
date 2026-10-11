import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jq } from '../../assets/js/notfound/text/jq.js';

var doc = '{"a":1,"b":[1,2],"c":{"d":"x"}}';

function run(text, filter, opts) {
  var res = jq(text, filter, opts || {});
  return res.error ? res.error : res.lines;
}

test('identity, fields, indexes, iteration', function () {
  assert.deepEqual(run('{"a":1}', '.'), ['{', '  "a": 1', '}']);
  assert.deepEqual(run(doc, '.a'), ['1']);
  assert.deepEqual(run(doc, '.b[]'), ['1', '2']);
  assert.deepEqual(run(doc, '.b[1]'), ['2']);
  assert.deepEqual(run(doc, '.b[-1]'), ['2']);
  assert.deepEqual(run(doc, '.c.d'), ['"x"']);
  assert.deepEqual(run(doc, '.c.d', { raw: true }), ['x']);
  assert.deepEqual(run(doc, '.zz'), ['null']);
  assert.deepEqual(run(doc, '.["a"]'), ['1']);
});

test('pipes, keys, length, compact', function () {
  assert.deepEqual(run(doc, 'keys', { compact: true }), ['["a","b","c"]']);
  assert.deepEqual(run(doc, '.b | length'), ['2']);
  assert.deepEqual(run(doc, '.c | keys[]'), ['"d"']);
  assert.deepEqual(run(doc, '.', { compact: true }), [doc]);
  assert.deepEqual(run('[{"n":1},{"n":2}]', '.[] | .n'), ['1', '2']);
});

test('errors', function () {
  assert.equal(run(doc, '.[0]'), 'jq: error: Cannot index object with number');
  assert.equal(run(doc, '.b.x'), 'jq: error: Cannot index array with "x"');
  assert.equal(run(doc, '.a[]'), 'jq: error: Cannot iterate over number (1)');
  assert.equal(run('{oops', '.'), 'jq: error: input is not valid JSON');
  assert.equal(run(doc, '..x'), "jq: error: syntax error in filter '..x'");
});
