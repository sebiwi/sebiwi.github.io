// The network, as far as a web page can reach it. A browser sends no ICMP,
// so ping's two halves are done the way a page can: the name is resolved
// with DNS-over-HTTPS (Cloudflare's 1.1.1.1), and each packet is one HTTPS
// request to the host, timed from send to answer. A host that answers at
// all, even with an error, is up; one that says nothing for two seconds
// timed out. Only ping calls this, so only typing ping makes a request.
//
// window.SEBIWI_NET, when set, answers instead (the tests set it): resolve
// gives an address or null, probe gives milliseconds or null.

import { parseDnsAnswer, localAddress, plausibleHost } from './pinglogic.js';

var DOH = 'https://cloudflare-dns.com/dns-query';
var TIMEOUT_MS = 2000;

function stub() {
  return typeof window !== 'undefined' && window.SEBIWI_NET ? window.SEBIWI_NET : null;
}

// A promise of the host's IPv4 address, or null when it has none.
export function resolveHost(host) {
  if (stub()) return Promise.resolve(stub().resolve(host));
  var local = localAddress(host);
  if (local) return Promise.resolve(local);
  if (!plausibleHost(host)) return Promise.resolve(null);
  return fetch(DOH + '?name=' + encodeURIComponent(host) + '&type=A', { headers: { accept: 'application/dns-json' } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(parseDnsAnswer)
    .catch(function () { return null; });
}

// A promise of the round trip in milliseconds, or null for a timeout.
export function probeHost(host, ip) {
  if (stub()) return Promise.resolve(stub().probe(host));
  // Loopback never leaves the machine: answer like it, a few hundredths of
  // a millisecond.
  if (/^127\./.test(ip)) return Promise.resolve(0.03 + Math.random() * 0.04);
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var start = performance.now();
  var timer = window.setTimeout(function () {
    if (controller) controller.abort();
  }, TIMEOUT_MS);
  // no-cors: the answer is opaque and that is fine, only its arrival counts.
  // A unique query string keeps every packet out of the cache.
  return fetch('https://' + host + '/favicon.ico?sebiwi-ping=' + Date.now() + Math.random(), {
    mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    signal: controller ? controller.signal : undefined
  }).then(answered, answered);

  function answered(outcome) {
    window.clearTimeout(timer);
    var elapsed = performance.now() - start;
    var aborted = outcome && outcome.name === 'AbortError';
    return aborted || elapsed >= TIMEOUT_MS ? null : elapsed;
  }
}

var HTTP_TIMEOUT_MS = 15000;

// One HTTP request, for curl and wget: a promise of { status, statusText,
// headers, body, url }, or { error } with 'timeout', 'aborted', 'cors'
// (the host answered, but its reply is not readable from a web page) or
// 'connect' (nothing answered). opts: method, headers ([[name, value]]),
// body, signal (curl's ctrl+c).
export function httpRequest(href, opts) {
  if (stub() && stub().fetch) return Promise.resolve(stub().fetch(href, opts));
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timedOut = false;
  var timer = window.setTimeout(function () {
    timedOut = true;
    if (controller) controller.abort();
  }, HTTP_TIMEOUT_MS);
  if (opts.signal && controller) {
    opts.signal.addEventListener('abort', function () { controller.abort(); });
  }
  var headers = {};
  for (var i = 0; i < opts.headers.length; i++) headers[opts.headers[i][0]] = opts.headers[i][1];
  if (opts.body !== null && opts.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return fetch(href, {
    method: opts.method, headers: headers, body: opts.body === null ? undefined : opts.body,
    credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'follow',
    signal: controller ? controller.signal : undefined
  }).then(function (res) {
    var list = [];
    res.headers.forEach(function (value, name) { list.push([name, value]); });
    return res.text().then(function (body) {
      window.clearTimeout(timer);
      return { status: res.status, statusText: res.statusText, headers: list, body: body, url: res.url };
    });
  }).catch(function (err) {
    window.clearTimeout(timer);
    if (err && err.name === 'AbortError') return { error: timedOut ? 'timeout' : 'aborted' };
    // A blocked read looks like a failed connection. Asking again without
    // reading (no-cors) tells them apart: an opaque answer means the host
    // is there and only the browser said no.
    return fetch(href, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' })
      .then(function () { return { error: 'cors' }; }, function () { return { error: 'connect' }; });
  });
}
