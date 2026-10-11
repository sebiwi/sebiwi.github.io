// curl and wget, ink packages, and real: the host is resolved with DNS and
// the URL fetched over HTTPS (net/net.js). A web page may only read another
// site's reply when that site allows it (CORS); when it does not, curl says
// the host answered and why the reply stays unread. Both answer later than
// a command usually does, so they return a promise and the pipeline waits
// for it (exec.js, waitFor): curl ... | grep works, ctrl+c abandons it.

import { commands } from '../../registry.js';
import { createFile, writeLines, can, isDirLike, ERR } from '../../vfs.js';
import { fs, ctx } from '../../fsview.js';
import { resolveHost, httpRequest } from '../../net/net.js';
import { parseCurl, parseWget, normalizeUrl, remoteName, statusLine, bodyLines, reasonPhrase } from '../../net/curllogic.js';
import { two } from '../../util.js';

function hostPort(href) {
  var url = new URL(href);
  return { host: url.hostname, port: url.port || (url.protocol === 'https:' ? '443' : '80') };
}

// A file written where the user is, as > would, with their permissions.
function save(name, lines) {
  var c = ctx();
  var made = createFile(fs, name, c);
  var problem = made.error || (isDirLike(made.node) ? 'EISDIR' : made.node.type === 'part' || (made.existed && !can(made.node, c.user, 2)) ? 'EACCES' : null);
  if (problem) return ERR[problem] || problem;
  writeLines(fs, made.node, lines, false);
  return null;
}

// Plain http from an https page is blocked by the browser before it leaves.
function blockedHttp(href) {
  return href.indexOf('http:') === 0 && typeof location !== 'undefined' && location.protocol === 'https:';
}

function abandoned(controller) {
  return !!controller && controller.signal.aborted;
}

function cancellable(promise, controller) {
  promise.abort = function () {
    if (controller) controller.abort();
  };
  return promise;
}

commands.curl = function (args, io) {
  var o = parseCurl(args);
  if (o.error) {
    for (var e = 0; e < o.error.length; e++) io.out.text(o.error[e]);
    return o.code;
  }
  var href = normalizeUrl(o.url);
  if (!href) {
    io.out.text('curl: (3) URL rejected: Malformed input to a URL function');
    return 3;
  }
  if (!io.canWait) {
    io.out.text('curl: the reply would arrive after this line has finished: run curl at the prompt');
    return 2;
  }
  var target = hostPort(href);
  if (blockedHttp(href)) {
    io.out.text('curl: (7) Failed to connect to ' + target.host + ' port ' + target.port + ': this page is https, and the browser blocks plain http from it');
    return 7;
  }
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var work = resolveHost(target.host).then(function (ip) {
    if (!ip) {
      io.out.text('curl: (6) Could not resolve host: ' + target.host);
      return 6;
    }
    return httpRequest(href, { method: o.method, headers: o.headers, body: o.data, signal: controller ? controller.signal : undefined }).then(function (res) {
      if (abandoned(controller)) return 130; // ctrl+c came first: nothing more to say
      if (res.error === 'cors') {
        io.out.text('curl: (56) ' + target.host + ' answered, but a web page may not read its reply (no CORS header)');
        return 56;
      }
      if (res.error === 'connect') {
        io.out.text('curl: (7) Failed to connect to ' + target.host + ' port ' + target.port + ': Could not connect to server');
        return 7;
      }
      if (res.error === 'timeout') {
        io.out.text('curl: (28) Operation timed out after 15000 milliseconds with 0 bytes received');
        return 28;
      }
      if (res.error) return 130; // aborted by ctrl+c: the job already said ^C
      if (o.fail && res.status >= 400) {
        io.out.text('curl: (22) The requested URL returned error: ' + res.status);
        return 22;
      }
      var lines = [];
      if (o.include || o.head) {
        lines.push(statusLine(res.status));
        for (var h = 0; h < res.headers.length; h++) lines.push(res.headers[h][0] + ': ' + res.headers[h][1]);
        lines.push('');
      }
      if (!o.head) lines = lines.concat(bodyLines(res.body));
      if (o.output) {
        var problem = save(o.output === true ? remoteName(href) : o.output, lines);
        if (problem) {
          io.out.text('curl: (23) Failure writing output to destination: ' + problem);
          return 23;
        }
        return 0;
      }
      for (var l = 0; l < lines.length; l++) io.out.text(lines[l]);
      return 0;
    });
  });
  return cancellable(work, controller);
};

function stamp() {
  var d = new Date();
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' +
    two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
}

commands.wget = function (args, io) {
  var o = parseWget(args);
  if (o.error) {
    for (var e = 0; e < o.error.length; e++) io.out.text(o.error[e]);
    return o.code;
  }
  var href = normalizeUrl(o.url);
  if (!href) {
    io.out.text(o.url + ': Invalid URL ' + o.url + ': Scheme missing');
    return 1;
  }
  if (!io.canWait) {
    io.out.text('wget: the download would finish after this line has: run wget at the prompt');
    return 2;
  }
  var target = hostPort(href);
  var name = o.output || remoteName(href);
  function say(text) {
    if (!o.quiet) io.out.text(text);
  }
  say('--' + stamp() + '--  ' + href);
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var work = resolveHost(target.host).then(function (ip) {
    if (!ip) {
      say('Resolving ' + target.host + ' (' + target.host + ')... failed: Name or service not known.');
      io.out.text("wget: unable to resolve host address '" + target.host + "'");
      return 4;
    }
    say('Resolving ' + target.host + ' (' + target.host + ')... ' + ip);
    if (blockedHttp(href)) {
      say('Connecting to ' + target.host + ' (' + target.host + ')|' + ip + '|:' + target.port + '... failed: this page is https, and the browser blocks plain http from it.');
      return 4;
    }
    say('Connecting to ' + target.host + ' (' + target.host + ')|' + ip + '|:' + target.port + '... connected.');
    return httpRequest(href, { method: 'GET', headers: [], body: null, signal: controller ? controller.signal : undefined }).then(function (res) {
      if (abandoned(controller)) return 130;
      if (res.error) {
        if (res.error === 'aborted') return 130;
        say('HTTP request sent, awaiting response... ' + (res.error === 'cors' ? 'answered, but a web page may not read the reply (no CORS header).' : 'failed.'));
        return 4;
      }
      say('HTTP request sent, awaiting response... ' + (res.status + ' ' + reasonPhrase(res.status, res.statusText)).trim());
      if (res.status >= 400) {
        io.out.text(stamp() + ' ERROR ' + res.status + '.');
        return 8;
      }
      var type = 'text/plain';
      for (var h = 0; h < res.headers.length; h++) {
        if (res.headers[h][0].toLowerCase() === 'content-type') type = res.headers[h][1];
      }
      var size = res.body.length;
      say('Length: ' + size + ' [' + type + ']');
      say("Saving to: '" + name + "'");
      say('');
      var problem = save(name, bodyLines(res.body));
      if (problem) {
        io.out.text(name + ': ' + problem);
        return 3;
      }
      say(stamp() + " - '" + name + "' saved [" + size + '/' + size + ']');
      return 0;
    });
  });
  return cancellable(work, controller);
};

