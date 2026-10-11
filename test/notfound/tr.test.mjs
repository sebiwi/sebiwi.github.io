import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tr, expandSet } from '../../assets/js/notfound/text/tr.js';

test('ranges, classes and escapes', function () {
  assert.equal(expandSet('a-e').join(''), 'abcde');
  assert.equal(expandSet('[:digit:]').join(''), '0123456789');
  assert.deepEqual(expandSet('\\n\\t'), ['\n', '\t']);
  assert.equal(expandSet('z-a'), null);
});

test('translate, with set2 padded by its last char', function () {
  assert.equal(tr('hello\n', 'a-z', 'A-Z'), 'HELLO\n');
  assert.equal(tr('hello', 'lo', 'x'), 'hexxx');
  assert.equal(tr('a b\n', ' ', '\\n'), 'a\nb\n');
  assert.equal(tr('Hi 42', '[:digit:]', '#'), 'Hi ##');
});

test('delete, squeeze, complement', function () {
  assert.equal(tr('hello', 'l', undefined, { delete: true }), 'heo');
  assert.equal(tr('a  b   c', ' ', undefined, { squeeze: true }), 'a b c');
  assert.equal(tr('aabb', 'ab', 'xy', { squeeze: true }), 'xy');
  assert.equal(tr('abc123', '[:digit:]', undefined, { delete: true, complement: true }), '123');
});
