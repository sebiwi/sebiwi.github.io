import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffNormal, diffUnified } from '../../assets/js/notfound/text/diff.js';

test('normal format: change, delete, add, ranges, equal', function () {
  assert.deepEqual(diffNormal(['a', 'b', 'c'], ['a', 'x', 'c']), ['2c2', '< b', '---', '> x']);
  assert.deepEqual(diffNormal(['a', 'b', 'c'], ['a', 'c']), ['2d1', '< b']);
  assert.deepEqual(diffNormal(['a', 'c'], ['a', 'b', 'c']), ['1a2', '> b']);
  assert.deepEqual(diffNormal(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'd']), ['2,3c2,3', '< b', '< c', '---', '> x', '> y']);
  assert.deepEqual(diffNormal(['a'], ['a']), []);
});

test('unified format', function () {
  assert.deepEqual(diffUnified(['a', 'b', 'c'], ['a', 'x', 'c'], 'old', 'new'),
    ['--- old', '+++ new', '@@ -1,3 +1,3 @@', ' a', '-b', '+x', ' c']);
  assert.deepEqual(diffUnified(['one'], ['two'], 'a', 'b'), ['--- a', '+++ b', '@@ -1 +1 @@', '-one', '+two']);
  assert.deepEqual(diffUnified(['a'], ['a'], 'a', 'b'), []);
});
