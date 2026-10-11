import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, operandsOf, numberFlag, operandsWithout } from '../../assets/js/notfound/args.js';

test('flags and operands', function () {
  assert.equal(flagsOf(['-rf', 'x', '-v']), 'rfv');
  assert.deepEqual(operandsOf(['-rf', 'x', '-', 'y']), ['x', '-', 'y']);
});

test('numberFlag reads -n 5, -n5 and -5', function () {
  assert.equal(numberFlag(['-n', '5'], 'n', 10), 5);
  assert.equal(numberFlag(['-n5'], 'n', 10), 5);
  assert.equal(numberFlag(['-5'], 'n', 10), 5);
  assert.equal(numberFlag([], 'n', 10), 10);
});

test('operandsWithout drops flag values', function () {
  assert.deepEqual(operandsWithout(['-n', '2', 'file'], 'n'), ['file']);
});
