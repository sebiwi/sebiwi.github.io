import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awk } from '../../assets/js/notfound/text/awk.js';

function run(lines, program, opts) {
  var res = awk(lines, program, opts || {});
  return res.error ? res.error : res.lines;
}

test('fields, NR, NF, -F', function () {
  assert.deepEqual(run(['a b c'], '{print $2}'), ['b']);
  assert.deepEqual(run(['a b c'], '{print $1, $3}'), ['a c']);
  assert.deepEqual(run(['  a   b  '], '{print $1 "|" $2}'), ['a|b']);
  assert.deepEqual(run(['a:b'], '{print $2}', { fs: ':' }), ['b']);
  assert.deepEqual(run(['x y', 'z'], '{print NR, NF}'), ['1 2', '2 1']);
  assert.deepEqual(run(['a b c'], '{print $NF, $(NF-1)}'), ['c b']);
});

test('patterns: regex, comparison, ~, &&', function () {
  assert.deepEqual(run(['apple', 'banana'], '/an/'), ['banana']);
  assert.deepEqual(run(['1', '5', '10'], '$1 > 4'), ['5', '10']);
  assert.deepEqual(run(['a', 'b'], '$1 == "b"'), ['b']);
  assert.deepEqual(run(['apple', 'banana'], '$1 ~ /^b/'), ['banana']);
  assert.deepEqual(run(['1 x', '2 y', '3 x'], '$1 > 1 && $2 == "x" {print $1}'), ['3']);
});

test('BEGIN, END, variables, arithmetic, increments', function () {
  assert.deepEqual(run(['1', '2', '3'], '{s += $1} END {print s}'), ['6']);
  assert.deepEqual(run(['a', 'b', 'c'], '{n++} END {print n}'), ['3']);
  assert.deepEqual(run([], 'BEGIN { print 7/2, 2*3+1, 10%3, -4 }'), ['3.5 7 1 -4']);
  assert.deepEqual(run([], 'BEGIN {print n * 2}', { vars: { n: '21' } }), ['42']);
});

test('field assignment, concatenation, functions', function () {
  assert.deepEqual(run(['a b c'], '{$2 = "X"; print}'), ['a X c']);
  assert.deepEqual(run(['a b'], '{print $2 "-" $1}'), ['b-a']);
  assert.deepEqual(run(['hey you'], '{print length($0), toupper($1), substr($2, 2), index($0, "y")}'), ['7 HEY ou 3']);
});

test('printf', function () {
  assert.deepEqual(run(['3.14159'], '{printf "%.2f|%5s|%-3d|%03d\\n", $1, "x", 7, 5}'), ['3.14|    x|7  |005']);
  assert.deepEqual(run(['a', 'b'], '{printf "%s,", $1} END {print ""}'), ['a,b,']);
});

test('next skips the rest of the rules for that line', function () {
  assert.deepEqual(run(['a', 'b'], '/a/ {next} {print}'), ['b']);
});

test('syntax errors', function () {
  assert.equal(run(['a'], '{print $1'), 'awk: syntax error at source line 1');
  assert.equal(run(['a'], '{print 1/0}'), 'awk: division by zero');
});
