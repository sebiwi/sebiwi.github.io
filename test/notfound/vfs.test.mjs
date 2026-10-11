import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFs, node, attach, lookup, lookupParent, mkdir, createFile, remove, rename,
  link, copy, purge, chmod, chown, readLines, writeLines, entries, formatMode,
  parseMode, sizeOf, can, walk, linkCount
} from '../../assets/js/notfound/vfs.js';

var me = { cwd: '/home/sebiwi', home: '/home/sebiwi', user: 'sebiwi' };
var root = { cwd: '/', home: '/root', user: 'root' };

function tree(hooks) {
  var fs = createFs({ hooks: hooks || {}, now: function () { return 1000; } });
  var dir = function (parent, name, props) { return attach(parent, name, node(fs, 'dir', props || {})); };
  var home = dir(fs.root, 'home');
  var sebiwi = dir(home, 'sebiwi', { uid: 'sebiwi' });
  dir(fs.root, 'etc');
  dir(fs.root, 'tmp', { mode: 0o1777 });
  dir(fs.root, 'root', { mode: 0o700 });
  attach(fs.root.children.etc, 'hostname', node(fs, 'file', { content: 'scoreplay' }));
  attach(sebiwi, 'notes', node(fs, 'file', { uid: 'sebiwi', content: 'a\nb' }));
  attach(sebiwi, 'blog', node(fs, 'page', { uid: 'sebiwi', url: '/blog/' }));
  return fs;
}

test('lookup resolves absolute, relative, ~, . and ..', function () {
  var fs = tree();
  assert.equal(lookup(fs, '/etc/hostname', me).path, '/etc/hostname');
  assert.equal(lookup(fs, 'notes', me).path, '/home/sebiwi/notes');
  assert.equal(lookup(fs, '~/notes', me).path, '/home/sebiwi/notes');
  assert.equal(lookup(fs, './../sebiwi/./notes', me).path, '/home/sebiwi/notes');
  assert.equal(lookup(fs, '/../..', me).path, '/');
  assert.equal(lookup(fs, 'nope', me).error, 'ENOENT');
  assert.equal(lookup(fs, 'notes/x', me).error, 'ENOTDIR');
  assert.equal(lookup(fs, 'notes/', me).error, 'ENOTDIR');
});

test('search permission guards traversal; root passes', function () {
  var fs = tree();
  attach(fs.root.children.root, 'secret', node(fs, 'file', { content: 'x' }));
  assert.equal(lookup(fs, '/root/secret', me).error, 'EACCES');
  assert.equal(lookup(fs, '/root/secret', root).path, '/root/secret');
});

test('symlinks follow, chain, and loop out', function () {
  var fs = tree();
  assert.equal(link(fs, '/etc/hostname', 'host', me, { symbolic: true }).error, undefined);
  assert.deepEqual(readLines(lookup(fs, 'host', me).node), ['scoreplay']);
  assert.equal(lookup(fs, 'host', me, { follow: false }).node.type, 'symlink');
  link(fs, 'loop2', 'loop1', me, { symbolic: true });
  link(fs, 'loop1', 'loop2', me, { symbolic: true });
  assert.equal(lookup(fs, 'loop1', me).error, 'ELOOP');
});

test('mkdir, createFile and the umask', function () {
  var fs = tree();
  var d = mkdir(fs, 'd', me);
  assert.equal(d.node.mode, 0o755);
  assert.equal(d.node.uid, 'sebiwi');
  assert.equal(mkdir(fs, 'd', me).error, 'EEXIST');
  assert.equal(mkdir(fs, '/etc/x', me).error, 'EACCES');
  assert.equal(mkdir(fs, 'blog/x', me).error, 'EROFS');
  var f = createFile(fs, 'd/f', me);
  assert.equal(f.existed, false);
  assert.equal(f.node.mode, 0o644);
  assert.equal(createFile(fs, 'd/f', me).existed, true);
});

test('remove: files, dirs, -r, permissions, sticky /tmp', function () {
  var fs = tree();
  mkdir(fs, 'd', me);
  createFile(fs, 'd/f', me);
  assert.deepEqual(remove(fs, 'd', me), [{ path: 'd', error: 'EISDIR' }]);
  assert.deepEqual(remove(fs, 'd', me, { dirOnly: true }), [{ path: 'd', error: 'ENOTEMPTY' }]);
  assert.deepEqual(remove(fs, 'd', me, { recursive: true }), []);
  assert.equal(lookup(fs, 'd', me).error, 'ENOENT');
  assert.deepEqual(remove(fs, '/etc/hostname', me), [{ path: '/etc/hostname', error: 'EACCES' }]);
  createFile(fs, '/tmp/roots', root);
  assert.deepEqual(remove(fs, '/tmp/roots', me), [{ path: '/tmp/roots', error: 'EACCES' }]);
  createFile(fs, '/tmp/mine', me);
  assert.deepEqual(remove(fs, '/tmp/mine', me), []);
  assert.deepEqual(remove(fs, 'blog', me, { dirOnly: true }), [{ path: 'blog', error: 'ENOTEMPTY' }]);
});

test('remove -r keeps going and reports what it could not remove', function () {
  var fs = tree();
  mkdir(fs, '/tmp/d', me);
  createFile(fs, '/tmp/d/ok', me);
  mkdir(fs, '/tmp/d/locked', me);
  createFile(fs, '/tmp/d/locked/f', me);
  chmod(fs, '/tmp/d/locked', '555', me);
  var failures = remove(fs, '/tmp/d', me, { recursive: true });
  assert.deepEqual(failures, [
    { path: '/tmp/d/locked/f', error: 'EACCES' },
    { path: '/tmp/d/locked', error: 'ENOTEMPTY' },
    { path: '/tmp/d', error: 'ENOTEMPTY' }
  ]);
  assert.equal(lookup(fs, '/tmp/d/ok', me).error, 'ENOENT');
});

test('the removed hook fires when the last link goes, and buried nodes revive', function () {
  var gone = [];
  var back = [];
  var fs = tree({ removed: function (n) { gone.push(n.part); }, revived: function (n) { back.push(n.part); } });
  var sebiwi = lookup(fs, '~', me).node;
  attach(sebiwi, 'nav', node(fs, 'part', { uid: 'sebiwi', part: 'nav', mode: 0o444 }));
  attach(sebiwi, '.hist', node(fs, 'file', { uid: 'sebiwi', part: 'hist', revivable: true, content: '' }));
  link(fs, 'nav', 'twin', me);
  remove(fs, 'nav', me);
  assert.deepEqual(gone, []);
  remove(fs, 'twin', me);
  assert.deepEqual(gone, ['nav']);
  var hist = lookup(fs, '.hist', me).node;
  remove(fs, '.hist', me);
  assert.equal(createFile(fs, '.hist', me).node, hist);
  assert.deepEqual(back, ['hist']);
});

test('rename moves parts by identity, into dirs, and refuses loops', function () {
  var gone = [];
  var fs = tree({ removed: function (n) { gone.push(n.part); } });
  var sebiwi = lookup(fs, '~', me).node;
  var nav = attach(sebiwi, 'nav', node(fs, 'part', { uid: 'sebiwi', part: 'nav', mode: 0o444 }));
  assert.equal(rename(fs, 'nav', 'menu', me).node, nav);
  assert.equal(lookup(fs, 'menu', me).node, nav);
  remove(fs, 'menu', me);
  assert.deepEqual(gone, ['nav']);
  mkdir(fs, 'a', me);
  mkdir(fs, 'a/b', me);
  createFile(fs, 'f', me);
  rename(fs, 'f', 'a', me);
  assert.equal(lookup(fs, 'a/f', me).error, undefined);
  assert.equal(rename(fs, 'a', 'a/b', me).error, 'INTO');
  assert.equal(rename(fs, '/etc/hostname', 'h', me).error, 'EACCES');
});

test('link: hard links share the node, dirs refuse, -f replaces', function () {
  var fs = tree();
  link(fs, 'notes', 'n2', me);
  writeLines(fs, lookup(fs, 'n2', me).node, ['z'], false);
  assert.deepEqual(readLines(lookup(fs, 'notes', me).node), ['z']);
  assert.equal(lookup(fs, 'notes', me).node.links, 2);
  assert.equal(link(fs, '/etc', 'e', me).error, 'EPERM');
  assert.equal(link(fs, 'notes', 'n2', me).error, 'EEXIST');
  assert.equal(link(fs, '/etc/hostname', 'n2', me, { force: true }).error, undefined);
  assert.deepEqual(readLines(lookup(fs, 'n2', me).node), ['scoreplay']);
});

test('copy: files, parts as plain text, dirs with -r only, never into itself', function () {
  var fs = tree();
  var sebiwi = lookup(fs, '~', me).node;
  attach(sebiwi, 'hint.txt', node(fs, 'part', { uid: 'sebiwi', part: 'hint', mode: 0o444, read: function () { return ['404, that page']; } }));
  assert.deepEqual(copy(fs, 'hint.txt', 'h', me), []);
  var h = lookup(fs, 'h', me).node;
  assert.equal(h.type, 'file');
  assert.equal(h.mode, 0o644);
  assert.deepEqual(readLines(h), ['404, that page']);
  mkdir(fs, 'd', me);
  createFile(fs, 'd/f', me);
  assert.deepEqual(copy(fs, 'd', 'e', me), [{ path: 'd', error: 'OMIT' }]);
  assert.deepEqual(copy(fs, 'd', 'e', me, { recursive: true }), []);
  assert.equal(lookup(fs, 'e/f', me).error, undefined);
  assert.deepEqual(copy(fs, 'd', 'd/x', me, { recursive: true }), [{ path: 'd', error: 'INTO' }]);
  assert.deepEqual(copy(fs, 'notes', 'notes', me), [{ path: 'notes', error: 'SAME' }]);
});

test('purge drops every link at once', function () {
  var gone = [];
  var fs = tree({ removed: function (n) { gone.push(n.part); } });
  var sebiwi = lookup(fs, '~', me).node;
  var nav = attach(sebiwi, 'nav', node(fs, 'part', { uid: 'sebiwi', part: 'nav' }));
  link(fs, 'nav', '/tmp/twin', me);
  purge(fs, nav);
  assert.equal(lookup(fs, 'nav', me).error, 'ENOENT');
  assert.equal(lookup(fs, '/tmp/twin', me).error, 'ENOENT');
  assert.deepEqual(gone, ['nav']);
});

test('chmod: octal, symbolic, owner only; chown: root only', function () {
  var fs = tree();
  assert.equal(parseMode('755', 0), 0o755);
  assert.equal(parseMode('u+x', 0o644), 0o744);
  assert.equal(parseMode('go-r', 0o644), 0o600);
  assert.equal(parseMode('a=r', 0o777), 0o444);
  assert.equal(parseMode('+x', 0o644), 0o755);
  assert.equal(parseMode('+t', 0o777), 0o1777);
  assert.equal(parseMode('zz', 0o644), null);
  assert.equal(chmod(fs, 'notes', '600', me).node.mode, 0o600);
  assert.equal(chmod(fs, '/etc/hostname', '777', me).error, 'EPERM');
  assert.equal(chown(fs, 'notes', 'root', me).error, 'EPERM');
  assert.equal(chown(fs, '/home/sebiwi/notes', 'root:root', root).node.uid, 'root');
  assert.equal(chown(fs, '/home/sebiwi/notes', 'nobody', root).error, 'EINVAL');
});

test('can, formatMode, sizeOf, entries order', function () {
  var fs = tree();
  var notes = lookup(fs, 'notes', me).node;
  assert.equal(can(notes, 'sebiwi', 2), true);
  assert.equal(can(notes, 'nobody', 2), false);
  assert.equal(formatMode(notes), '-rw-r--r--');
  assert.equal(formatMode(lookup(fs, '/tmp', me).node), 'drwxrwxrwt');
  assert.equal(sizeOf(notes), 3);
  createFile(fs, '.hidden', me);
  createFile(fs, 'Zed', me);
  assert.deepEqual(entries(lookup(fs, '~', me).node).map(function (e) { return e.name; }), ['blog', '.hidden', 'notes', 'Zed']);
});

test('walk visits depth first and reports unreadable dirs', function () {
  var fs = tree();
  mkdir(fs, 'a', me);
  createFile(fs, 'a/x', me);
  var seen = [];
  walk(fs, '/', me, function (path, n, depth, error) { seen.push(path + (error ? ' !' + error : '')); });
  assert.ok(seen.indexOf('/home/sebiwi/a/x') !== -1);
  assert.ok(seen.indexOf('/root !EACCES') !== -1);
});

test('linkCount: 2 plus subdirectories for a dir, the link count for a file', function () {
  var fs = tree();
  mkdir(fs, 'a', me);
  mkdir(fs, 'a/b', me);
  createFile(fs, 'a/f', me);
  assert.equal(linkCount(lookup(fs, 'a', me).node), 3);
  link(fs, 'a/f', 'g', me);
  assert.equal(linkCount(lookup(fs, 'g', me).node), 2);
});
