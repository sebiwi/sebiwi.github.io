// Filters: grep, wc, head, tail, sort, uniq.

import { flagsOf, numberFlag, operandsOf, operandsWithout } from '../args.js';
import { invoke } from '../exec.js';
import { inputLines } from '../fileio.js';
import { ctx, fs } from '../fsview.js';
import { commands } from '../registry.js';
import { awk } from '../text/awk.js';
import { cut } from '../text/cut.js';
import { diffNormal, diffUnified } from '../text/diff.js';
import { sed } from '../text/sed.js';
import { tr } from '../text/tr.js';
import { pad } from '../util.js';
import { ERR, can, createFile, isDirLike, lookup, readLines, writeLines } from '../vfs.js';

Object.assign(commands, {
  grep: function (args, io) {
    var flags = flagsOf(args);
    var operands = operandsOf(args);
    var pattern = operands.shift();
    if (pattern === undefined) {
      io.out.text('usage: grep [-icv] pattern [file ...]');
      return 2;
    }
    var read = inputLines(operands, io, 'grep');
    if (!read.lines) return read.status;
    var re;
    try {
      re = new RegExp(pattern, flags.indexOf('i') !== -1 ? 'i' : '');
    } catch (err) {
      io.out.text('grep: ' + pattern + ': invalid pattern');
      return 2;
    }
    var invert = flags.indexOf('v') !== -1;
    var hits = [];
    for (var i = 0; i < read.lines.length; i++) {
      if (re.test(read.lines[i]) !== invert) hits.push(read.lines[i]);
    }
    if (flags.indexOf('c') !== -1) {
      io.out.text(String(hits.length));
      return hits.length ? 0 : 1;
    }
    for (var h = 0; h < hits.length; h++) io.out.text(hits[h]);
    return hits.length ? 0 : 1;
  },

  wc: function (args, io) {
    var flags = flagsOf(args);
    var read = inputLines(operandsOf(args), io, 'wc');
    if (!read.lines) return read.status;
    var body = read.lines.join('\n');
    var lines = read.lines.length;
    var words = body.split(/\s+/).filter(Boolean).length;
    var chars = body.length + (lines ? 1 : 0);
    if (flags.indexOf('l') !== -1) io.out.text(String(lines));
    else if (flags.indexOf('w') !== -1) io.out.text(String(words));
    else if (flags.indexOf('c') !== -1) io.out.text(String(chars));
    else io.out.text(pad(String(lines), 7) + pad(String(words), 7) + pad(String(chars), 7));
    return read.status;
  },

  head: function (args, io) {
    var count = numberFlag(args, 'n', 10);
    var read = inputLines(operandsWithout(args, 'n'), io, 'head');
    if (!read.lines) return read.status;
    var slice = read.lines.slice(0, count);
    for (var i = 0; i < slice.length; i++) io.out.text(slice[i]);
    return read.status;
  },

  tail: function (args, io) {
    var count = numberFlag(args, 'n', 10);
    var read = inputLines(operandsWithout(args, 'n'), io, 'tail');
    if (!read.lines) return read.status;
    var slice = count >= read.lines.length ? read.lines : read.lines.slice(read.lines.length - count);
    for (var i = 0; i < slice.length; i++) io.out.text(slice[i]);
    return read.status;
  },

  sort: function (args, io) {
    var flags = flagsOf(args);
    var read = inputLines(operandsOf(args), io, 'sort');
    if (!read.lines) return read.status;
    var sorted = read.lines.slice().sort();
    if (flags.indexOf('r') !== -1) sorted.reverse();
    for (var i = 0; i < sorted.length; i++) io.out.text(sorted[i]);
    return read.status;
  },

  uniq: function (args, io) {
    var read = inputLines(operandsOf(args), io, 'uniq');
    if (!read.lines) return read.status;
    var last = null;
    for (var i = 0; i < read.lines.length; i++) {
      if (read.lines[i] !== last) io.out.text(read.lines[i]);
      last = read.lines[i];
    }
    return read.status;
  }
});

// sed -i: each file rewritten with its own result. A page part is not a
// regular file, and sed says so instead of editing the page.
function sedInPlace(files, scripts, opts, io) {
  if (!files.length) {
    io.out.text('sed: no input files');
    return 1;
  }
  var c = ctx();
  var status = 0;
  for (var i = 0; i < files.length; i++) {
    var found = lookup(fs, files[i], c);
    var problem = found.error ? ERR[found.error] :
      found.node.type === 'part' || isDirLike(found.node) || found.node.read ? 'not a regular file' :
      !can(found.node, c.user, 4) || !can(found.node, c.user, 2) ? 'Permission denied' : null;
    if (problem) {
      io.out.text("sed: couldn't edit " + files[i] + ': ' + problem);
      status = 4;
      continue;
    }
    var res = sed(readLines(found.node) || [], scripts, opts);
    if (res.error) {
      io.out.text(res.error);
      return 1;
    }
    writeLines(fs, found.node, res.lines, false);
  }
  return status;
}

// tr reads its input as one stream: lines joined with the newlines they had.
function stream(lines) {
  return lines.length ? lines.join('\n') + '\n' : '';
}

function unstream(text) {
  var out = text.split('\n');
  if (out[out.length - 1] === '') out.pop();
  return out;
}

Object.assign(commands, {
  tr: function (args, io) {
    var opts = {};
    var sets = [];
    for (var i = 0; i < args.length; i++) {
      if (/^-[cdsC]+$/.test(args[i])) {
        if (/[cC]/.test(args[i])) opts.complement = true;
        if (args[i].indexOf('d') !== -1) opts['delete'] = true;
        if (args[i].indexOf('s') !== -1) opts.squeeze = true;
      } else {
        sets.push(args[i]);
      }
    }
    if (!sets.length) {
      io.out.text('tr: missing operand');
      return 1;
    }
    if (sets.length < 2 && !opts['delete'] && !opts.squeeze) {
      io.out.text("tr: missing operand after '" + sets[0] + "'");
      io.out.text('Two strings must be given when translating.');
      return 1;
    }
    var out = unstream(tr(stream(io.stdin || []), sets[0], sets[1], opts));
    for (var j = 0; j < out.length; j++) io.out.text(out[j]);
    return 0;
  },

  cut: function (args, io) {
    var opts = {};
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var m = /^-([dfc])(.*)$/.exec(args[i]);
      if (m) {
        var value = m[2] !== '' ? m[2] : args[++i];
        if (m[1] === 'd') opts.delim = value;
        else if (m[1] === 'f') opts.fields = value;
        else opts.chars = value;
      } else if (args[i] === '-s') {
        opts.onlyDelimited = true;
      } else {
        files.push(args[i]);
      }
    }
    if (!opts.fields && !opts.chars) {
      io.out.text('cut: you must specify a list of bytes, characters, or fields');
      return 1;
    }
    var read = inputLines(files, io, 'cut');
    if (!read.lines) return read.status;
    var out = cut(read.lines, opts);
    if (out.error) {
      io.out.text(out.error);
      return 1;
    }
    for (var j = 0; j < out.length; j++) io.out.text(out[j]);
    return read.status;
  },

  sed: function (args, io) {
    var opts = {};
    var scripts = [];
    var files = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n') opts.quiet = true;
      else if (args[i] === '-E' || args[i] === '-r') opts.extended = true;
      else if (args[i] === '-e') scripts.push(args[++i] || '');
      else if (args[i] === '-i') opts.inPlace = true;
      else if (!scripts.length && files.length === 0 && !opts.scriptGiven) {
        scripts.push(args[i]);
        opts.scriptGiven = true;
      } else {
        files.push(args[i]);
      }
    }
    if (!scripts.length) {
      io.out.text('Usage: sed [-niE] [-e script] script [file...]');
      return 1;
    }
    if (opts.inPlace) return sedInPlace(files, scripts, opts, io);
    var read = inputLines(files, io, 'sed');
    if (!read.lines) return read.status;
    var res = sed(read.lines, scripts, opts);
    if (res.error) {
      io.out.text(res.error);
      return 1;
    }
    for (var j = 0; j < res.lines.length; j++) io.out.text(res.lines[j]);
    return read.status;
  },

  awk: function (args, io) {
    var opts = { vars: {} };
    var program = null;
    var files = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (program === null && a.indexOf('-F') === 0) {
        opts.fs = (a.length > 2 ? a.slice(2) : args[++i] || ' ').replace(/\\t/g, '\t');
      } else if (program === null && a === '-v') {
        var assign = /^([A-Za-z_]\w*)=(.*)$/.exec(args[++i] || '');
        if (assign) opts.vars[assign[1]] = assign[2];
      } else if (program === null) {
        program = a;
      } else {
        files.push(a);
      }
    }
    if (program === null) {
      io.out.text('usage: awk [-F fs] [-v var=value] program [file ...]');
      return 2;
    }
    var read = /^\s*BEGIN\s*\{[^}]*\}\s*$/.test(program) ? { lines: [], status: 0 } : inputLines(files, io, 'awk');
    if (!read.lines) return read.status;
    var res = awk(read.lines, program, opts);
    for (var j = 0; j < res.lines.length; j++) io.out.text(res.lines[j]);
    if (res.error) {
      io.out.text(res.error);
      return 2;
    }
    return read.status;
  },

  tee: function (args, io) {
    var append = args.indexOf('-a') !== -1;
    var lines = io.stdin || [];
    var status = 0;
    var c = ctx();
    var files = operandsOf(args);
    for (var i = 0; i < files.length; i++) {
      var made = createFile(fs, files[i], c);
      var problem = made.error || (isDirLike(made.node) ? 'EISDIR' : made.node.type === 'part' || (made.existed && !can(made.node, c.user, 2)) ? 'EACCES' : null);
      if (problem) {
        io.out.text('tee: ' + files[i] + ': ' + ERR[problem]);
        status = 1;
        continue;
      }
      writeLines(fs, made.node, lines, append);
    }
    for (var j = 0; j < lines.length; j++) io.out.text(lines[j]);
    return status;
  },

  // xargs: standard input becomes arguments. -n N takes N at a time, -I R
  // runs once per line with R replaced. echo when no command is given.
  xargs: function (args, io) {
    var per = 0;
    var replace = null;
    var i = 0;
    for (; i < args.length && args[i].charAt(0) === '-'; i++) {
      if (args[i] === '-n') per = parseInt(args[++i], 10) || 0;
      else if (args[i] === '-I') replace = args[++i];
      else break;
    }
    var cmd = args.slice(i);
    if (!cmd.length) cmd = ['echo'];
    var input = io.stdin || [];
    var runs = [];
    if (replace !== null) {
      for (var l = 0; l < input.length; l++) {
        if (!input[l].trim()) continue;
        runs.push(cmd.map(function (w) { return w.split(replace).join(input[l].trim()); }));
      }
    } else {
      var words = input.join(' ').split(/\s+/).filter(Boolean);
      var size = per || words.length || 1;
      for (var w = 0; w < words.length || (w === 0 && !words.length); w += size) {
        runs.push(cmd.concat(words.slice(w, w + size)));
        if (!words.length) break;
      }
    }
    var status = 0;
    for (var r = 0; r < runs.length; r++) {
      if (invoke(runs[r], { out: io.out, stdin: null, tty: io.tty, async: false }) !== 0) status = 123;
    }
    return status;
  },

  diff: function (args, io) {
    var unified = args.indexOf('-u') !== -1;
    var files = operandsOf(args);
    if (files.length !== 2) {
      io.out.text("diff: missing operand after '" + (files[0] || 'diff') + "'");
      return 2;
    }
    var sides = [];
    for (var i = 0; i < 2; i++) {
      var got = inputLines([files[i]], io, 'diff');
      if (!got.lines || got.status) return 2;
      sides.push(got.lines);
    }
    var out = unified ? diffUnified(sides[0], sides[1], files[0], files[1]) : diffNormal(sides[0], sides[1]);
    for (var j = 0; j < out.length; j++) io.out.text(out[j]);
    return out.length ? 1 : 0;
  }
});
