// sed: a stream editor, the part of one people use. A script is commands
// separated by ; or newlines, each with an optional address: a line number,
// $, /regex/, or two of them with a comma. Commands: s (flags g, i, p and a
// number), p, d, q and =. quiet is -n; extended is -E (else basic regexes,
// translated to JavaScript ones).

var BRE_SPECIAL = '(){}+?|';

export function bre(pattern) {
  var out = '';
  for (var i = 0; i < pattern.length; i++) {
    var c = pattern.charAt(i);
    if (c === '\\' && i + 1 < pattern.length) {
      var next = pattern.charAt(i + 1);
      out += BRE_SPECIAL.indexOf(next) !== -1 ? next : c + next;
      i++;
    } else {
      out += BRE_SPECIAL.indexOf(c) !== -1 ? '\\' + c : c;
    }
  }
  return out;
}

function SedError(message) {
  this.message = message;
}

function parseScript(script, n, extended) {
  var cmds = [];
  var i = 0;
  function fail(what) {
    throw new SedError('sed: -e expression #' + n + ', char ' + Math.max(i, 1) + ': ' + what);
  }
  // Up to the next unescaped delimiter. An escaped delimiter becomes the
  // character itself; every other escape is left for the regex to read.
  function until(delim, what) {
    var text = '';
    while (i < script.length) {
      var c = script.charAt(i);
      if (c === '\\' && script.charAt(i + 1) === delim) {
        text += delim;
        i += 2;
        continue;
      }
      if (c === '\\' && i + 1 < script.length) {
        text += c + script.charAt(i + 1);
        i += 2;
        continue;
      }
      if (c === delim) {
        i++;
        return text;
      }
      text += c;
      i++;
    }
    fail(what);
  }
  function regex(source, flags) {
    try {
      return new RegExp(extended ? source : bre(source), flags);
    } catch (err) {
      fail('Invalid regular expression');
    }
  }
  function address() {
    var c = script.charAt(i);
    if (/\d/.test(c)) {
      var m = /^\d+/.exec(script.slice(i));
      i += m[0].length;
      return { line: parseInt(m[0], 10) };
    }
    if (c === '$') {
      i++;
      return { last: true };
    }
    if (c === '/') {
      i++;
      return { re: regex(until('/', 'unterminated address regex'), '') };
    }
    return null;
  }
  while (i < script.length) {
    while (i < script.length && /[\s;]/.test(script.charAt(i))) i++;
    if (i >= script.length) break;
    var cmd = { a1: address(), a2: null };
    if (cmd.a1 && script.charAt(i) === ',') {
      i++;
      cmd.a2 = address();
      if (!cmd.a2) fail('unexpected `,\'');
    }
    while (script.charAt(i) === ' ') i++;
    cmd.name = script.charAt(i++);
    if (cmd.name === 's') {
      var delim = script.charAt(i++);
      if (!delim) fail("unterminated `s' command");
      var pattern = until(delim, "unterminated `s' command");
      cmd.rep = until(delim, "unterminated `s' command");
      var flags = /^[gipI0-9]*/.exec(script.slice(i))[0];
      i += flags.length;
      cmd.global = flags.indexOf('g') !== -1;
      cmd.print = flags.indexOf('p') !== -1;
      cmd.nth = parseInt(flags.replace(/\D/g, ''), 10) || 0;
      cmd.re = regex(pattern, 'g' + (/[iI]/.test(flags) ? 'i' : ''));
    } else if ('pdq='.indexOf(cmd.name) === -1 || !cmd.name) {
      i--;
      fail('unknown command: `' + script.charAt(i) + "'");
    }
    cmds.push(cmd);
  }
  return cmds;
}

// & is the match, \1 to \9 the groups, \n a newline, \& and \\ themselves.
function expand(rep, match) {
  return rep.replace(/\\([0-9&n\\])|&/g, function (all, esc) {
    if (all === '&') return match[0];
    if (esc === 'n') return '\n';
    if (esc === '&' || esc === '\\') return esc;
    return match[parseInt(esc, 10)] || '';
  });
}

function substitute(line, cmd) {
  var count = 0;
  var changed = false;
  var out = line.replace(cmd.re, function () {
    var match = Array.prototype.slice.call(arguments, 0, -2);
    count++;
    var nth = cmd.nth || 1;
    if (cmd.global ? count >= nth : count === nth) {
      changed = true;
      return expand(cmd.rep, match);
    }
    return match[0];
  });
  return { line: out, changed: changed };
}

function hit(addr, line, n, last) {
  if (addr.line !== undefined) return n === addr.line;
  if (addr.last) return n === last;
  return addr.re.test(line);
}

function selects(cmd, line, n, last) {
  if (!cmd.a1) return true;
  if (!cmd.a2) return hit(cmd.a1, line, n, last);
  if (!cmd.active) {
    if (!hit(cmd.a1, line, n, last)) return false;
    cmd.active = !(cmd.a2.line !== undefined && cmd.a2.line <= n);
    return true;
  }
  if (cmd.a2.line !== undefined ? n >= cmd.a2.line : hit(cmd.a2, line, n, last)) cmd.active = false;
  return true;
}

export function sed(lines, scripts, opts) {
  opts = opts || {};
  var cmds = [];
  try {
    for (var s = 0; s < scripts.length; s++) cmds = cmds.concat(parseScript(scripts[s], s + 1, opts.extended));
  } catch (err) {
    if (err instanceof SedError) return { error: err.message };
    throw err;
  }
  var out = [];
  for (var n = 1; n <= lines.length; n++) {
    var line = lines[n - 1];
    var deleted = false;
    var quit = false;
    for (var c = 0; c < cmds.length && !deleted && !quit; c++) {
      var cmd = cmds[c];
      if (!selects(cmd, line, n, lines.length)) continue;
      if (cmd.name === 's') {
        var res = substitute(line, cmd);
        line = res.line;
        if (res.changed && cmd.print) out.push(line);
      } else if (cmd.name === 'p') {
        out.push(line);
      } else if (cmd.name === '=') {
        out.push(String(n));
      } else if (cmd.name === 'd') {
        deleted = true;
      } else if (cmd.name === 'q') {
        quit = true;
      }
    }
    if (!deleted && !opts.quiet) out.push(line);
    if (quit) break;
  }
  return { lines: out };
}
