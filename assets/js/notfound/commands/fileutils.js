// cp, mv, ln, stat, file and find, on the tree. A page part moved with mv or
// reached through a hard link is still the part (rm it and it leaves the
// page); a copy of one is only its text.

import { commands } from '../registry.js';
import {
  ERR, lookup, copy, rename, link, walk, isDirLike, readLines, sizeOf, formatMode, linkCount
} from '../vfs.js';
import { fs, ctx } from '../fsview.js';
import { globToRegExp } from '../parse.js';
import { flagsOf, operandsOf } from '../args.js';
import { pad, padRight, two } from '../util.js';
import { USERS } from '../auth.js';

function base(path) {
  return path.replace(/\/+$/, '').split('/').pop() || '/';
}

// Several sources need a directory to land in.
function needDir(dest, name, io) {
  var d = lookup(fs, dest, ctx());
  if (!d.error && isDirLike(d.node)) return true;
  io.out.text(name + ": target '" + dest + "' is not a directory");
  return false;
}

function cpMessage(f, src) {
  if (f.error === 'OMIT') return "cp: -r not specified; omitting directory '" + f.path + "'";
  if (f.error === 'SAME') return "cp: '" + f.path + "' and '" + f.path + "' are the same file";
  if (f.error === 'INTO') return "cp: cannot copy a directory, '" + f.path + "', into itself";
  if (f.error === 'ENOENT' && f.path === src) return "cp: cannot stat '" + f.path + "': No such file or directory";
  if (f.path === src || f.path.indexOf(src.replace(/\/+$/, '') + '/') === 0) {
    return "cp: cannot open '" + f.path + "' for reading: " + (ERR[f.error] || f.error);
  }
  return "cp: cannot create regular file '" + f.path + "': " + (ERR[f.error] || f.error);
}

function iso(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ' ' +
    two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ':' + two(d.getUTCSeconds()) + '.000000000 +0000';
}

function kindOf(n) {
  if (n.type === 'dir') return 'directory';
  if (n.type === 'page') return 'directory';
  if (n.type === 'symlink') return 'symbolic link';
  if (n.dev) return 'character special file';
  return sizeOf(n) ? 'regular file' : 'regular empty file';
}

function idOf(user) {
  return USERS[user] ? USERS[user].uid : 65534;
}

function statLines(name, n) {
  var size = sizeOf(n);
  return [
    '  File: ' + name + (n.type === 'symlink' ? ' -> ' + n.target : ''),
    '  Size: ' + padRight(String(size), 10) + 'Blocks: ' + padRight(String(Math.ceil(size / 512)), 10) + 'IO Block: 4096   ' + kindOf(n),
    'Device: 0,404   Inode: ' + padRight(String(n.ino), 10) + 'Links: ' + linkCount(n),
    'Access: (' + ('000' + (n.mode & 0o7777).toString(8)).slice(-4) + '/' + formatMode(n) + ')  Uid: (' +
      pad(String(idOf(n.uid)), 5) + '/' + pad(n.uid, 8) + ')   Gid: (' + pad(String(idOf(n.gid)), 5) + '/' + pad(n.gid, 8) + ')',
    'Modify: ' + iso(n.mtime),
    ' Birth: -'
  ];
}

// stat -c: the handful of format letters people reach for.
function statFormat(fmt, name, n) {
  return fmt.replace(/%([aAUGsnFi])/g, function (m, c) {
    if (c === 'a') return (n.mode & 0o7777).toString(8);
    if (c === 'A') return formatMode(n);
    if (c === 'U') return n.uid;
    if (c === 'G') return n.gid;
    if (c === 's') return String(sizeOf(n));
    if (c === 'n') return name;
    if (c === 'F') return kindOf(n);
    return String(n.ino);
  });
}

function describe(n) {
  if (n.type === 'symlink') return 'symbolic link to ' + n.target;
  if (n.type === 'page') return 'HTML page, mounted from ' + n.url;
  if (n.type === 'dir') return 'directory';
  if (n.type === 'part') return 'live DOM element';
  if (n.dev) return 'character special';
  if (n.exec) return 'ELF 64-bit LSB executable, pencil64, dynamically linked, stripped';
  var lines = readLines(n);
  if (!lines || !lines.length) return 'empty';
  var text = lines.join('\n');
  var kind = /[^\x00-\x7f]/.test(text) ? 'UTF-8 Unicode text' : 'ASCII text';
  return /^#!/.test(text) ? 'sebiwish script, ' + kind + ' executable' : kind;
}

Object.assign(commands, {
  cp: function (args, io) {
    var flags = flagsOf(args);
    var ops = operandsOf(args);
    if (ops.length < 2) {
      io.out.text(ops.length ? "cp: missing destination file operand after '" + ops[0] + "'" : 'cp: missing file operand');
      return 1;
    }
    var recursive = /[rRa]/.test(flags);
    var verbose = flags.indexOf('v') !== -1;
    var dest = ops.pop();
    if (ops.length > 1 && !needDir(dest, 'cp', io)) return 1;
    var status = 0;
    for (var i = 0; i < ops.length; i++) {
      var failures = copy(fs, ops[i], dest, ctx(), { recursive: recursive });
      for (var f = 0; f < failures.length; f++) io.out.text(cpMessage(failures[f], ops[i]));
      if (failures.length) status = 1;
      else if (verbose) io.out.text("'" + ops[i] + "' -> '" + dest + "'");
    }
    return status;
  },

  mv: function (args, io) {
    var verbose = flagsOf(args).indexOf('v') !== -1;
    var ops = operandsOf(args);
    if (ops.length < 2) {
      io.out.text(ops.length ? "mv: missing destination file operand after '" + ops[0] + "'" : 'mv: missing file operand');
      return 1;
    }
    var dest = ops.pop();
    if (ops.length > 1 && !needDir(dest, 'mv', io)) return 1;
    var status = 0;
    for (var i = 0; i < ops.length; i++) {
      var src = ops[i];
      var res = rename(fs, src, dest, ctx());
      if (!res.error) {
        if (verbose) io.out.text("renamed '" + src + "' -> '" + dest + "'");
        continue;
      }
      status = 1;
      if (res.error === 'ENOENT' && res.path === src) io.out.text("mv: cannot stat '" + src + "': No such file or directory");
      else if (res.error === 'INTO') io.out.text("mv: cannot move '" + src + "' to a subdirectory of itself, '" + dest + "'");
      else if (res.error === 'EISDIR') io.out.text("mv: cannot overwrite directory '" + dest + "' with non-directory");
      else if (res.error === 'ENOTDIR') io.out.text("mv: cannot overwrite non-directory '" + dest + "' with directory '" + src + "'");
      else io.out.text("mv: cannot move '" + src + "' to '" + dest + "': " + (ERR[res.error] || res.error));
    }
    return status;
  },

  ln: function (args, io) {
    var flags = flagsOf(args);
    var symbolic = flags.indexOf('s') !== -1;
    var force = flags.indexOf('f') !== -1;
    var ops = operandsOf(args);
    if (!ops.length) {
      io.out.text('ln: missing file operand');
      return 1;
    }
    var pairs = [];
    if (ops.length === 1) {
      pairs.push([ops[0], base(ops[0])]);
    } else if (ops.length === 2 && !(function () { var d = lookup(fs, ops[1], ctx()); return !d.error && isDirLike(d.node); })()) {
      pairs.push([ops[0], ops[1]]);
    } else {
      var dir = ops.pop();
      if (!needDir(dir, 'ln', io)) return 1;
      for (var o = 0; o < ops.length; o++) pairs.push([ops[o], dir.replace(/\/+$/, '') + '/' + base(ops[o])]);
    }
    var kind = symbolic ? 'symbolic' : 'hard';
    var status = 0;
    for (var i = 0; i < pairs.length; i++) {
      var res = link(fs, pairs[i][0], pairs[i][1], ctx(), { symbolic: symbolic, force: force });
      if (!res.error) continue;
      status = 1;
      if (res.error === 'EPERM' && !symbolic) io.out.text('ln: ' + pairs[i][0] + ': hard link not allowed for directory');
      else if (res.path === pairs[i][0] && !symbolic) io.out.text("ln: failed to access '" + pairs[i][0] + "': " + (ERR[res.error] || res.error));
      else io.out.text('ln: failed to create ' + kind + " link '" + pairs[i][1] + "': " + (ERR[res.error] || res.error));
    }
    return status;
  },

  stat: function (args, io) {
    var follow = args.indexOf('-L') !== -1;
    var fmt = null;
    var names = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c' || args[i] === '--format') fmt = args[++i];
      else if (args[i] !== '-L') names.push(args[i]);
    }
    if (!names.length) {
      io.out.text('stat: missing operand');
      return 1;
    }
    var status = 0;
    for (var n = 0; n < names.length; n++) {
      var found = lookup(fs, names[n], ctx(), { follow: follow });
      if (found.error) {
        io.out.text("stat: cannot statx '" + names[n] + "': " + ERR[found.error]);
        status = 1;
        continue;
      }
      var lines = fmt === null ? statLines(names[n], found.node) : [statFormat(fmt, names[n], found.node)];
      for (var l = 0; l < lines.length; l++) io.out.text(lines[l]);
    }
    return status;
  },

  file: function (args, io) {
    var names = operandsOf(args);
    if (!names.length) {
      io.out.text('Usage: file [-bL] file...');
      return 1;
    }
    for (var i = 0; i < names.length; i++) {
      var found = lookup(fs, names[i], ctx(), { follow: args.indexOf('-L') !== -1 });
      if (found.error) io.out.text(names[i] + ': cannot open `' + names[i] + "' (" + ERR[found.error] + ')');
      else io.out.text(names[i] + ': ' + describe(found.node));
    }
    return 0;
  },

  find: function (args, io) {
    var starts = [];
    var i = 0;
    while (i < args.length && args[i].charAt(0) !== '-') starts.push(args[i++]);
    if (!starts.length) starts = ['.'];
    var tests = [];
    var maxdepth = Infinity;
    var mindepth = 0;
    for (; i < args.length; i++) {
      var a = args[i];
      var v = args[i + 1];
      if ((a === '-name' || a === '-iname' || a === '-type' || a === '-maxdepth' || a === '-mindepth') && v === undefined) {
        io.out.text("find: missing argument to `" + a + "'");
        return 1;
      }
      if (a === '-name' || a === '-iname') {
        var re = new RegExp(globToRegExp(v).source, a === '-iname' ? 'i' : '');
        tests.push(function (re) {
          return function (path) { return re.test(base(path)); };
        }(re));
        i++;
      } else if (a === '-type') {
        if (!/^[fdl]$/.test(v)) {
          io.out.text('find: Unknown argument to -type: ' + v);
          return 1;
        }
        tests.push(function (t) {
          return function (path, n) {
            if (t === 'd') return isDirLike(n);
            if (t === 'l') return n.type === 'symlink';
            return !isDirLike(n) && n.type !== 'symlink';
          };
        }(v));
        i++;
      } else if (a === '-maxdepth' || a === '-mindepth') {
        var depth = parseInt(v, 10);
        if (a === '-maxdepth') maxdepth = depth;
        else mindepth = depth;
        i++;
      } else {
        io.out.text("find: unknown predicate `" + a + "'");
        return 1;
      }
    }
    var status = 0;
    var c = ctx();
    function passes(path, n) {
      for (var t = 0; t < tests.length; t++) {
        if (!tests[t](path, n)) return false;
      }
      return true;
    }
    for (var s = 0; s < starts.length; s++) {
      walk(fs, starts[s], c, function (path, n, depth, error) {
        if (!n) {
          io.out.text("find: '" + path + "': " + ERR[error]);
          status = 1;
          return false;
        }
        if (depth > maxdepth) return false;
        if (depth >= mindepth && passes(path, n)) io.out.text(path);
        if (error) {
          io.out.text("find: '" + path + "': " + ERR[error]);
          status = 1;
          return false;
        }
        if (depth === maxdepth) return false;
      });
    }
    return status;
  }
});
