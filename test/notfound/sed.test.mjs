import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sed, bre } from '../../assets/js/notfound/text/sed.js';

function run(lines, script, opts) {
  var res = sed(lines, [script], opts || {});
  return res.error ? res.error : res.lines;
}

test('BRE to JS', function () {
  assert.equal(bre('\\(a\\)+'), '(a)\\+');
  assert.equal(bre('a\\{2\\}'), 'a{2}');
  assert.equal(bre('a.b\\.c'), 'a.b\\.c');
});

test('s with flags, groups, &, other delimiters', function () {
  assert.deepEqual(run(['hello world'], 's/o/0/'), ['hell0 world']);
  assert.deepEqual(run(['hello world'], 's/o/0/g'), ['hell0 w0rld']);
  assert.deepEqual(run(['hello world'], 's/o/0/2'), ['hello w0rld']);
  assert.deepEqual(run(['hello world'], 's/\\(h\\)\\(e\\)/\\2\\1/'), ['ehllo world']);
  assert.deepEqual(run(['hello world'], 's/(h)(e)/\\2\\1/', { extended: true }), ['ehllo world']);
  assert.deepEqual(run(['hello world'], 's/world/[&]/'), ['hello [world]']);
  assert.deepEqual(run(['/a/b'], 's|/|_|g'), ['_a_b']);
  assert.deepEqual(run(['HELLO'], 's/hello/hi/i'), ['hi']);
});

test('addresses, p, d, q, =, -n', function () {
  var abc = ['a', 'b', 'c'];
  assert.deepEqual(run(abc, '2p', { quiet: true }), ['b']);
  assert.deepEqual(run(abc, '/b/d'), ['a', 'c']);
  assert.deepEqual(run(abc, '2,$d'), ['a']);
  assert.deepEqual(run(abc, '/a/,/b/d'), ['c']);
  assert.deepEqual(run(abc, '2q'), ['a', 'b']);
  assert.deepEqual(run(abc, '$=', { quiet: true }), ['3']);
  assert.deepEqual(run(['ab'], 's/a/x/;s/b/y/'), ['xy']);
  assert.deepEqual(run(['ab'], 's/a/x/p', { quiet: true }), ['xb']);
});

test('several -e scripts run in order', function () {
  assert.deepEqual(sed(['ab'], ['s/a/x/', 's/x/y/'], {}).lines, ['yb']);
});

test('errors', function () {
  assert.equal(run(['a'], 'x'), "sed: -e expression #1, char 1: unknown command: `x'");
  assert.equal(run(['a'], 's/a/b'), "sed: -e expression #1, char 5: unterminated `s' command");
});
