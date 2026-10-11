import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse, globToRegExp } from '../../assets/js/notfound/parse.js';

test('tokenize splits words, keeps quotes, splits operators', function () {
  var t = tokenize("echo 'a b' \"c\" d|wc >> out # gone");
  assert.deepEqual(t.map(function (x) { return x.text; }), ['echo', 'a b', 'c', 'd', '|', 'wc', '>>', 'out']);
  assert.equal(t[1].quote, "'");
  assert.equal(t[2].quote, '"');
  assert.equal(t[4].op, true);
});

test('tokenize knows the three-character operators', function () {
  assert.deepEqual(tokenize('cat <<- E <<< s').map(function (x) { return x.text; }), ['cat', '<<-', 'E', '<<<', 's']);
});

test('parse builds segments, stages, redirects and heredocs', function () {
  var p = parse(tokenize('a | b > f && c << EOF; d'));
  assert.equal(p.error, null);
  assert.equal(p.segments.length, 3);
  assert.equal(p.segments[0].stages.length, 2);
  assert.equal(p.segments[0].stages[1].redirect.word.text, 'f');
  assert.equal(p.segments[1].join, '&&');
  assert.deepEqual(p.heredocs, [{ delim: 'EOF', strip: false, literal: false }]);
});

test('parse reports a redirect with no target', function () {
  assert.match(parse(tokenize('echo >')).error, /syntax error/);
});

test('globToRegExp matches one path component', function () {
  assert.ok(globToRegExp('*.txt').test('a.txt'));
  assert.ok(!globToRegExp('*.txt').test('a/b.txt'));
  assert.ok(globToRegExp('b?og').test('blog/'));
});

test('& ends a segment and sends it to the background', function () {
  var p = parse(tokenize("ping x & echo 'a b'"));
  assert.equal(p.segments.length, 2);
  assert.equal(p.segments[0].background, true);
  assert.equal(p.segments[0].text, 'ping x');
  assert.equal(p.segments[1].background, false);
  assert.equal(p.segments[1].text, "echo 'a b'");
});
