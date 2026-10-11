import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cut, parseList } from '../../assets/js/notfound/text/cut.js';

test('lists', function () {
  assert.deepEqual(parseList('1,3'), [[1, 1], [3, 3]]);
  assert.deepEqual(parseList('2-4'), [[2, 4]]);
  assert.deepEqual(parseList('3-'), [[3, Infinity]]);
  assert.deepEqual(parseList('-2'), [[1, 2]]);
  assert.equal(parseList('x'), null);
  assert.equal(parseList('0'), null);
});

test('fields', function () {
  assert.deepEqual(cut(['a:b:c'], { fields: '2', delim: ':' }), ['b']);
  assert.deepEqual(cut(['a:b:c'], { fields: '1,3', delim: ':' }), ['a:c']);
  assert.deepEqual(cut(['a:b:c'], { fields: '2-', delim: ':' }), ['b:c']);
  assert.deepEqual(cut(['a\tb'], { fields: '2' }), ['b']);
  assert.deepEqual(cut(['nodelim', 'a:b'], { fields: '2', delim: ':' }), ['nodelim', 'b']);
  assert.deepEqual(cut(['nodelim', 'a:b'], { fields: '2', delim: ':', onlyDelimited: true }), ['b']);
});

test('characters', function () {
  assert.deepEqual(cut(['hello'], { chars: '2-4' }), ['ell']);
  assert.deepEqual(cut(['hello'], { chars: '1,5' }), ['ho']);
});
