import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDnsAnswer, localAddress, plausibleHost, replyLine, timeoutLine, summary } from '../../assets/js/notfound/net/pinglogic.js';

test('a DNS-over-HTTPS answer gives its first A record', function () {
  assert.equal(parseDnsAnswer({ Status: 0, Answer: [{ type: 5, data: 'cname.example.' }, { type: 1, data: '93.184.216.34' }] }), '93.184.216.34');
  assert.equal(parseDnsAnswer({ Status: 3 }), null); // NXDOMAIN
  assert.equal(parseDnsAnswer({ Status: 0, Answer: [{ type: 28, data: '::1' }] }), null);
  assert.equal(parseDnsAnswer(null), null);
});

test('local names and IPv4 literals need no lookup', function () {
  assert.equal(localAddress('localhost'), '127.0.0.1');
  assert.equal(localAddress('Sebiwi'), '127.0.0.1');
  assert.equal(localAddress('10.0.4.4'), '10.0.4.4');
  assert.equal(localAddress('300.1.1.1'), null);
  assert.equal(localAddress('github.com'), null);
});

test('only names that could be on the internet are looked up', function () {
  assert.equal(plausibleHost('github.com'), true);
  assert.equal(plausibleHost('sub.example.co.uk'), true);
  assert.equal(plausibleHost('x'), false);
  assert.equal(plausibleHost('https://github.com'), false);
  assert.equal(plausibleHost('a..b'), false);
});

test('reply and timeout lines', function () {
  assert.equal(replyLine('93.184.216.34', 0, 12.3456), '64 bytes from 93.184.216.34: icmp_seq=0 ttl=56 time=12.346 ms');
  assert.equal(timeoutLine(3), 'Request timeout for icmp_seq 3');
});

test('statistics, with and without replies', function () {
  assert.deepEqual(summary('example.com', 3, [10, 20]), [
    '--- example.com ping statistics ---',
    '3 packets transmitted, 2 packets received, 33.3% packet loss',
    'round-trip min/avg/max = 10.000/15.000/20.000 ms'
  ]);
  assert.deepEqual(summary('example.com', 2, []), [
    '--- example.com ping statistics ---',
    '2 packets transmitted, 0 packets received, 100.0% packet loss'
  ]);
  assert.deepEqual(summary('example.com', 0, []), [
    '--- example.com ping statistics ---',
    '0 packets transmitted, 0 packets received, 0.0% packet loss'
  ]);
});
