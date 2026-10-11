import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendar } from '../../assets/js/notfound/text/cal.js';

test('October 2026 starts on a Thursday', function () {
  assert.deepEqual(calendar(10, 2026), [
    '    October 2026',
    'Su Mo Tu We Th Fr Sa',
    '             1  2  3',
    ' 4  5  6  7  8  9 10',
    '11 12 13 14 15 16 17',
    '18 19 20 21 22 23 24',
    '25 26 27 28 29 30 31'
  ]);
});

test('leap years and Sunday starts', function () {
  var feb24 = calendar(2, 2024);
  assert.equal(feb24[feb24.length - 1], '25 26 27 28 29');
  assert.equal(calendar(2, 2026)[2], ' 1  2  3  4  5  6  7');
  assert.equal(calendar(2, 2026).length, 6);
});
