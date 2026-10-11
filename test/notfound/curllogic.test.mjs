import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurl, normalizeUrl, remoteName, statusLine, bodyLines, parseWget } from '../../assets/js/notfound/net/curllogic.js';

test('curl options, with the method each one implies', function () {
  assert.deepEqual(parseCurl(['example.com']).method, 'GET');
  assert.equal(parseCurl(['-I', 'example.com']).method, 'HEAD');
  assert.equal(parseCurl(['-d', 'a=1', 'example.com']).method, 'POST');
  assert.equal(parseCurl(['-X', 'PUT', '-d', 'a=1', 'example.com']).method, 'PUT');
  var o = parseCurl(['-sSLfi', '-H', 'Accept: text/plain', '-o', 'out.txt', 'https://x.example/a']);
  assert.deepEqual([o.silent, o.fail, o.include, o.output, o.url], [true, true, true, 'out.txt', 'https://x.example/a']);
  assert.deepEqual(o.headers, [['Accept', 'text/plain']]);
  assert.equal(parseCurl(['-d', 'a=1', '-d', 'b=2', 'x.example']).data, 'a=1&b=2');
  assert.equal(parseCurl(['-O', 'x.example/f.txt']).output, true);
});

test('curl refuses what it cannot run', function () {
  assert.deepEqual(parseCurl([]).error, ['curl: no URL specified!', "curl: try 'curl --help' for more information"]);
  assert.equal(parseCurl([]).code, 2);
  assert.deepEqual(parseCurl(['--frobnicate', 'x.example']).error, ['curl: option --frobnicate: is unknown', "curl: try 'curl --help' for more information"]);
  assert.equal(parseCurl(['-X']).code, 2);
});

test('URLs: bare hosts become https, other schemes are refused', function () {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com/');
  assert.equal(normalizeUrl('ftp://example.com'), null);
  assert.equal(normalizeUrl('https://'), null);
});

test('remote names, status lines, body lines', function () {
  assert.equal(remoteName('https://example.com/'), 'index.html');
  assert.equal(remoteName('https://example.com/a/data.json?x=1'), 'data.json');
  assert.equal(statusLine(404), 'HTTP/2 404');
  assert.deepEqual(bodyLines('a\r\nb\n'), ['a', 'b']);
  assert.deepEqual(bodyLines('a'), ['a']);
  assert.deepEqual(bodyLines(''), []);
});

test('wget options', function () {
  assert.deepEqual(parseWget(['-q', '-O', 'f.txt', 'example.com']), { quiet: true, output: 'f.txt', url: 'example.com' });
  assert.deepEqual(parseWget([]).error, ['wget: missing URL', 'Usage: wget [OPTION]... [URL]...']);
});

test('reason phrases, since HTTP/2 sends none', async function () {
  var m = await import('../../assets/js/notfound/net/curllogic.js');
  assert.equal(m.reasonPhrase(200, ''), 'OK');
  assert.equal(m.reasonPhrase(404, ''), 'Not Found');
  assert.equal(m.reasonPhrase(418, ''), '');
  assert.equal(m.reasonPhrase(200, 'Fine'), 'Fine');
});
