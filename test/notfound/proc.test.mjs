import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, spawn, reap, find, list, signal, signalName, byName, matching } from '../../assets/js/notfound/proc.js';

function table() {
  var t = createTable(function () { return 0; });
  spawn(t, { pid: 1, user: 'root', cmd: 'hugo server' });
  spawn(t, { pid: 42, user: 'sebiwi', cmd: 'sebiwish', tty: 'ttys004' });
  spawn(t, { pid: 211, user: 'sebiwi', cmd: 'navd' });
  return t;
}

test('signal names in every spelling', function () {
  assert.equal(signalName('9'), 'KILL');
  assert.equal(signalName('KILL'), 'KILL');
  assert.equal(signalName('SIGKILL'), 'KILL');
  assert.equal(signalName('term'), 'TERM');
  assert.equal(signalName('BOGUS'), null);
});

test('spawn numbers from 1000 unless told, and list sorts by pid', function () {
  var t = table();
  assert.equal(spawn(t, { cmd: 'ping x' }).pid, 1000);
  assert.equal(spawn(t, { cmd: 'sleep 1' }).pid, 1001);
  assert.deepEqual(list(t).map(function (p) { return p.pid; }), [1, 42, 211, 1000, 1001]);
});

test('default dispositions: TERM exits, STOP stops, CONT continues', function () {
  var t = table();
  assert.deepEqual(signal(t, 211, 'STOP', 'sebiwi'), { ok: true, outcome: 'stop' });
  assert.equal(find(t, 211).state, 'T');
  signal(t, 211, 'CONT', 'sebiwi');
  assert.equal(find(t, 211).state, 'S');
  signal(t, 211, 'TERM', 'sebiwi');
  assert.equal(find(t, 211), null);
});

test('permissions and missing pids', function () {
  var t = table();
  assert.deepEqual(signal(t, 1, 'TERM', 'sebiwi'), { error: 'EPERM' });
  assert.deepEqual(signal(t, 999, 'TERM', 'sebiwi'), { error: 'ESRCH' });
  assert.equal(signal(t, 1, 'TERM', 'root').ok, true);
});

test('handlers decide, and ignore keeps the process', function () {
  var t = table();
  var seen = [];
  spawn(t, { pid: 405, cmd: 'sebiwish', onSignal: function (sig) { seen.push(sig); return sig === 'KILL' ? 'exit' : 'ignore'; } });
  signal(t, 405, 'TERM', 'sebiwi');
  assert.ok(find(t, 405));
  signal(t, 405, 'KILL', 'sebiwi');
  assert.equal(find(t, 405), null);
  assert.deepEqual(seen, ['TERM', 'KILL']);
});

test('byName matches the command name, matching the pattern', function () {
  var t = table();
  spawn(t, { pid: 600, cmd: 'tmux: server' });
  spawn(t, { pid: 1998, cmd: 'coffee --refill' });
  assert.deepEqual(byName(t, 'tmux').map(function (p) { return p.pid; }), [600]);
  assert.deepEqual(byName(t, 'sebiwish').map(function (p) { return p.pid; }), [42]);
  assert.deepEqual(matching(t, /cof/, false).map(function (p) { return p.pid; }), [1998]);
  assert.deepEqual(matching(t, /--refill/, false), []);
  assert.deepEqual(matching(t, /--refill/, true).map(function (p) { return p.pid; }), [1998]);
  reap(t, 1998);
  assert.equal(find(t, 1998), null);
});
