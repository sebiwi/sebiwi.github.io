import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createView, pagerKey, search, frame } from '../../assets/js/notfound/text/pagerview.js';

function lines(n) {
  var out = [];
  for (var i = 1; i <= n; i++) out.push('line ' + i);
  return out;
}

test('paging keys move the window and clamp at both ends', function () {
  var v = createView(lines(30), 10);
  pagerKey(v, ' ');
  assert.equal(v.top, 10);
  pagerKey(v, 'G');
  assert.equal(v.top, 20);
  pagerKey(v, 'j');
  assert.equal(v.top, 20);
  pagerKey(v, 'b');
  assert.equal(v.top, 10);
  pagerKey(v, 'g');
  assert.equal(v.top, 0);
  pagerKey(v, 'k');
  assert.equal(v.top, 0);
  pagerKey(v, 'ArrowDown');
  assert.equal(v.top, 1);
  assert.deepEqual(pagerKey(v, 'q'), { quit: true, searching: false });
  assert.deepEqual(pagerKey(v, '/'), { quit: false, searching: true });
});

test('frames: status, and ~ past the end', function () {
  var v = createView(lines(30), 10);
  assert.equal(frame(v).status, ':');
  pagerKey(v, 'G');
  assert.equal(frame(v).status, '(END)');
  var short = createView(lines(2), 4);
  assert.deepEqual(frame(short).lines, ['line 1', 'line 2', '~', '~']);
  assert.equal(frame(short).status, '(END)');
});

test('search jumps to the next match, n and N walk them', function () {
  var v = createView(lines(30), 10);
  assert.equal(search(v, 'line 2'), true);
  assert.equal(v.top, 1);
  pagerKey(v, 'n');
  assert.equal(v.top, 19);
  pagerKey(v, 'N');
  assert.equal(v.top, 1);
  assert.equal(search(v, 'nothing'), false);
  assert.equal(v.top, 1);
});
