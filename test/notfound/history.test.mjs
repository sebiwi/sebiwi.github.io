import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyExpand } from '../../assets/js/notfound/history.js';

var lines = ['ls', 'echo hi', 'cat x'];

test('!! !N !-N !prefix', function () {
  assert.deepEqual(historyExpand('!!', lines), { line: 'cat x', echo: true });
  assert.equal(historyExpand('!2', lines).line, 'echo hi');
  assert.equal(historyExpand('!-3', lines).line, 'ls');
  assert.equal(historyExpand('!ec', lines).line, 'echo hi');
});

test('no bang, no change', function () {
  assert.deepEqual(historyExpand('ls -l', lines), { line: 'ls -l', echo: false });
});

test('unknown event', function () {
  assert.deepEqual(historyExpand('!zz', lines), { line: null, error: 'sebiwish: !zz: event not found' });
});
