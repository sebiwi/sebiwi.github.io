import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, cached, accepts, grant, revoke, idLine, CACHE_MS, LECTURE } from '../../assets/js/notfound/auth.js';

test('any non-empty password is accepted', function () {
  assert.equal(accepts('hunter2'), true);
  assert.equal(accepts(' '), true);
  assert.equal(accepts(''), false);
  assert.equal(accepts(undefined), false);
});

test('the cache lasts five minutes and -k drops it', function () {
  var auth = createAuth();
  assert.equal(cached(auth, 0), false);
  grant(auth, 1000);
  assert.equal(cached(auth, 1000 + CACHE_MS - 1), true);
  assert.equal(cached(auth, 1000 + CACHE_MS), false);
  grant(auth, 1000);
  revoke(auth);
  assert.equal(cached(auth, 1001), false);
});

test('id lines', function () {
  assert.equal(idLine('sebiwi'), 'uid=1000(sebiwi) gid=1000(sebiwi) groups=1000(sebiwi),27(sudo)');
  assert.equal(idLine('root'), 'uid=0(root) gid=0(root) groups=0(root)');
});

test('the lecture is the classic one', function () {
  assert.equal(LECTURE[1], 'We trust you have received the usual lecture from the local System');
  assert.equal(LECTURE.length, 8);
});
