// What ping says, without the network: reading a DNS-over-HTTPS answer,
// the names that resolve without asking anyone, and the lines ping prints.
// macOS ping's wording, since the replies are timed the same way it times
// them: from sending to hearing back.

var LOCAL = { localhost: '127.0.0.1', sebiwi: '127.0.0.1', scoreplay: '127.0.0.1' };
var IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// The first A record of a dns-json answer (application/dns-json), or null
// for NXDOMAIN, an answer with no IPv4 address, or no answer at all.
export function parseDnsAnswer(json) {
  if (!json || json.Status !== 0 || !json.Answer) return null;
  for (var i = 0; i < json.Answer.length; i++) {
    if (json.Answer[i].type === 1) return json.Answer[i].data;
  }
  return null;
}

export function localAddress(host) {
  var name = String(host).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LOCAL, name)) return LOCAL[name];
  var m = IPV4.exec(name);
  if (!m) return null;
  for (var i = 1; i <= 4; i++) {
    if (parseInt(m[i], 10) > 255) return null;
  }
  return name;
}

// A dotted name made of DNS labels: anything else would only send a lookup
// that cannot succeed (a URL, a word, a typo with two dots).
export function plausibleHost(host) {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i.test(host);
}

export function replyLine(ip, seq, ms) {
  return '64 bytes from ' + ip + ': icmp_seq=' + seq + ' ttl=56 time=' + ms.toFixed(3) + ' ms';
}

export function timeoutLine(seq) {
  return 'Request timeout for icmp_seq ' + seq;
}

export function summary(host, sent, times) {
  var loss = sent ? 100 * (sent - times.length) / sent : 0;
  var lines = [
    '--- ' + host + ' ping statistics ---',
    sent + ' packets transmitted, ' + times.length + ' packets received, ' + loss.toFixed(1) + '% packet loss'
  ];
  if (times.length) {
    var min = Math.min.apply(null, times);
    var max = Math.max.apply(null, times);
    var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
    lines.push('round-trip min/avg/max = ' + min.toFixed(3) + '/' + avg.toFixed(3) + '/' + max.toFixed(3) + ' ms');
  }
  return lines;
}
