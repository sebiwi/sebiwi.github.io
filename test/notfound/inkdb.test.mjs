import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGES, providerOf, planDraw, libFile, searchPackages, versionOf } from '../../assets/js/notfound/inkdb.js';

test('commands map to the package that provides them', function () {
  assert.equal(providerOf('vi'), 'vim');
  assert.equal(providerOf('yarn'), 'nodejs');
  assert.equal(providerOf('cowsay'), 'cowsay');
  assert.equal(providerOf('ls'), null);
});

test('dependencies first, each once, then what was asked for', function () {
  var plan = planDraw(['tmux', 'emacs', 'cowsay'], {});
  assert.deepEqual(plan.queue, ['libevent', 'ncurses', 'tmux', 'emacs', 'cowsay']);
  assert.deepEqual(plan.wanted, ['tmux', 'emacs', 'cowsay']);
});

test('drawn things and unknown names are set aside', function () {
  var plan = planDraw(['tmux', 'nope', 'cowsay', 'cowsay'], { ncurses: true, cowsay: true });
  assert.deepEqual(plan.queue, ['libevent', 'tmux']);
  assert.deepEqual(plan.unknown, ['nope']);
  assert.deepEqual(plan.already, ['cowsay']);
});

test('library files and versions', function () {
  assert.equal(libFile('libevent'), 'libevent.so.2');
  assert.equal(libFile('ncurses'), 'libncurses.so.6');
  assert.equal(versionOf('tmux'), PACKAGES.tmux.version);
  assert.equal(versionOf('coal'), '1.0.4');
});

test('search matches names and blurbs', function () {
  assert.deepEqual(searchPackages('cow'), ['cowsay']);
  assert.ok(searchPackages('').length >= 15);
});
