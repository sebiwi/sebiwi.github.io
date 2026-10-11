import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFs, lookup, readLines, formatMode, remove, can } from '../../assets/js/notfound/vfs.js';
import { buildSkeleton, HOME } from '../../assets/js/notfound/skeleton.js';

var me = { cwd: HOME, home: HOME, user: 'sebiwi' };

function fresh() {
  var fs = createFs();
  buildSkeleton(fs, { bins: ['ls', 'cat', 'sebiwish'], links: { bash: 'sebiwish', sh: 'sebiwish', zsh: 'sebiwish' } });
  return fs;
}

test('the standard directories exist with their modes', function () {
  var fs = fresh();
  assert.equal(formatMode(lookup(fs, '/tmp', me).node), 'drwxrwxrwt');
  assert.equal(formatMode(lookup(fs, '/root', { cwd: '/', home: '/root', user: 'root' }).node), 'drwx------');
  assert.equal(lookup(fs, '/root/notes.txt', me).error, 'EACCES');
  assert.equal(lookup(fs, HOME, me).node.uid, 'sebiwi');
  assert.equal(lookup(fs, '/usr/bin', me).error, undefined);
});

test('/bin holds an executable per command and the shell aliases as symlinks', function () {
  var fs = fresh();
  var ls = lookup(fs, '/bin/ls', me).node;
  assert.equal(ls.exec, 'ls');
  assert.equal(formatMode(ls), '-rwxr-xr-x');
  assert.equal(can(ls, 'sebiwi', 1), true);
  assert.equal(lookup(fs, '/bin/bash', me, { follow: false }).node.target, 'sebiwish');
  assert.equal(lookup(fs, '/bin/bash', me).node.exec, 'sebiwish');
});

test('/etc files, sudoers locked', function () {
  var fs = fresh();
  assert.deepEqual(readLines(lookup(fs, '/etc/hostname', me).node), ['scoreplay']);
  var sudoers = lookup(fs, '/etc/sudoers', me).node;
  assert.equal(formatMode(sudoers), '-r--r-----');
  assert.equal(can(sudoers, 'sebiwi', 4), false);
});

test('/dev/null swallows, /dev/zero and /dev/random are bounded', function () {
  var fs = fresh();
  var devnull = lookup(fs, '/dev/null', me).node;
  devnull.write(['x'], false);
  assert.deepEqual(readLines(devnull), []);
  assert.equal(readLines(lookup(fs, '/dev/zero', me).node).length, 8);
  assert.equal(readLines(lookup(fs, '/dev/random', me).node).length, 8);
});

test('/proc is listed by the caller and cannot be removed', function () {
  var fs = createFs();
  buildSkeleton(fs, { bins: [], procList: function () { return { 42: { type: 'dir', mode: 0o555, uid: 'sebiwi', links: 1, children: {} } }; } });
  assert.equal(lookup(fs, '/proc/42', me).error, undefined);
  assert.deepEqual(remove(fs, '/proc', { cwd: '/', home: '/root', user: 'root' }, { recursive: true }), [{ path: '/proc', error: 'EPERM' }]);
});
