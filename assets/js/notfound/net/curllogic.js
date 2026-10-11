// What curl and wget understand and print, without the network: their
// options, the URL they will fetch, and the lines of a reply.

var HELP_HINT = "curl: try 'curl --help' for more information";

// Short flags that take no value, so -sSLf works as one word.
var SWITCHES = { s: 'silent', S: null, L: null, f: 'fail', i: 'include', I: 'head', k: null, v: null, O: 'remote' };

function bad(lines, code) {
  return { error: lines, code: code };
}

export function parseCurl(args) {
  var o = { method: null, headers: [], data: null, include: false, head: false, output: null, silent: false, fail: false, url: null };
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    var takes = { '-X': 1, '--request': 1, '-H': 1, '--header': 1, '-d': 1, '--data': 1, '--data-raw': 1, '-o': 1, '--output': 1, '-A': 1, '--user-agent': 1 };
    if (takes[a]) {
      var v = args[++i];
      if (v === undefined) return bad(['curl: option ' + a + ': requires parameter', HELP_HINT], 2);
      if (a === '-X' || a === '--request') o.method = v.toUpperCase();
      else if (a === '-H' || a === '--header') {
        var m = /^([^:]+):\s*(.*)$/.exec(v);
        if (m) o.headers.push([m[1], m[2]]);
      } else if (a === '-o' || a === '--output') o.output = v;
      else if (a.charAt(1) === 'd' || a.indexOf('--data') === 0) o.data = o.data === null ? v : o.data + '&' + v;
      continue;
    }
    var long = { '--silent': 'silent', '--fail': 'fail', '--include': 'include', '--head': 'head', '--location': null, '--insecure': null, '--verbose': null, '--remote-name': 'remote' };
    if (Object.prototype.hasOwnProperty.call(long, a)) {
      if (long[a] === 'remote') o.output = true;
      else if (long[a]) o[long[a]] = true;
      continue;
    }
    if (/^-[A-Za-z]+$/.test(a)) {
      for (var c = 1; c < a.length; c++) {
        var ch = a.charAt(c);
        if (!Object.prototype.hasOwnProperty.call(SWITCHES, ch)) return bad(['curl: option ' + a + ': is unknown', HELP_HINT], 2);
        if (SWITCHES[ch] === 'remote') o.output = true;
        else if (SWITCHES[ch]) o[SWITCHES[ch]] = true;
      }
      continue;
    }
    if (a.charAt(0) === '-') return bad(['curl: option ' + a + ': is unknown', HELP_HINT], 2);
    if (o.url === null) o.url = a;
  }
  if (o.url === null) return bad(['curl: no URL specified!', HELP_HINT], 2);
  if (!o.method) o.method = o.head ? 'HEAD' : o.data !== null ? 'POST' : 'GET';
  return o;
}

export function parseWget(args) {
  var o = { quiet: false, output: null, url: null };
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '-q' || args[i] === '--quiet') o.quiet = true;
    else if (args[i] === '-O' || args[i] === '--output-document') o.output = args[++i] || null;
    else if (args[i].charAt(0) !== '-' && o.url === null) o.url = args[i];
  }
  if (o.url === null) return { error: ['wget: missing URL', 'Usage: wget [OPTION]... [URL]...'], code: 1 };
  return o;
}

// A bare host means https: this page is served over https, and a browser
// will not fetch plain http from it. Only http and https are fetchable.
export function normalizeUrl(raw) {
  var withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
  var url;
  try {
    url = new URL(withScheme);
  } catch (err) {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) return null;
  return url.href;
}

// curl -O and wget name the file after the last part of the path.
export function remoteName(href) {
  return new URL(href).pathname.split('/').pop() || 'index.html';
}

// Browsers do not say which HTTP version answered; HTTP/2 is the likely one.
export function statusLine(status) {
  return 'HTTP/2 ' + status;
}

export function bodyLines(text) {
  if (!text) return [];
  var lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

var REASONS = {
  200: 'OK', 201: 'Created', 204: 'No Content', 206: 'Partial Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
};

// The words after the status code. HTTP/2 sends none, so browsers report an
// empty statusText; wget still says "200 OK".
export function reasonPhrase(status, statusText) {
  return statusText || REASONS[status] || '';
}
