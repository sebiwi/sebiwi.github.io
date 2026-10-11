// Files, variables and the basics.

import { flagsOf, operandsOf } from '../args.js';
import { envIndex, envSet, envValue, isExported } from '../env.js';
import { errText, inputLines } from '../fileio.js';
import { ctx, fs, normalize, setCwd, stamp, wipeAll } from '../fsview.js';
import { isDrawn } from '../ink.js';
import { DOCS, HELP_ORDER, KEY_HELP, commands } from '../registry.js';
import { fileLink, styled, textNode } from '../screen.js';
import { ALIASES, sh } from '../state.js';
import { pad, padRight } from '../util.js';
import { ERR, absolute, can, chmod, chown, createFile, entries, formatMode, isDirLike, linkCount, lookup, mkdir, readLines, remove, sizeOf, walk } from '../vfs.js';

function navigate(url) {
  window.location.href = url;
}

// The page you came from is the directory you came from. Arriving cold (a
// bad link, a bookmark) leaves nothing to go back to, so it goes home.
function browserBack(hops) {
  var back = Math.min(hops, window.history.length - 1);
  if (back > 0) window.history.go(-back);
  else navigate('/');
}

// ls -p marks directories with /, ls -F also symlinks with @ and
// executables with *. Plain ls marks nothing, like the real one.
function shownName(name, n, classify) {
  if (!classify) return name;
  if (isDirLike(n)) return name + '/';
  if (classify !== 'F') return name;
  if (n.type === 'symlink') return name + '@';
  return n.mode & 0o111 ? name + '*' : name;
}


// ls -l: columns sized to their widest entry, as ls does it.
function longLines(rows, classify) {
  var w = { links: 0, uid: 0, gid: 0, size: 0 };
  var cells = rows.map(function (r) {
    var cell = {
      row: r,
      links: String(linkCount(r.node)),
      uid: r.node.uid,
      gid: r.node.gid,
      size: String(sizeOf(r.node))
    };
    for (var k in w) w[k] = Math.max(w[k], cell[k].length);
    return cell;
  });
  return cells.map(function (c) {
    var n = c.row.node;
    var meta = formatMode(n) + ' ' + pad(c.links, w.links) + ' ' + padRight(c.uid, w.uid) + ' ' +
      padRight(c.gid, w.gid) + ' ' + pad(c.size, w.size) + ' ' + stamp(n.mtime) + ' ';
    // A symlink's -> target already says what it is: no @ in the long form.
    var name = shownName(c.row.name, n, n.type === 'symlink' ? null : classify);
    if (n.url) return [textNode(meta), fileLink({ url: n.url, name: name })];
    return [textNode(meta + name + (n.type === 'symlink' ? ' -> ' + n.target : ''))];
  });
}

function blocks(rows) {
  var total = 0;
  for (var i = 0; i < rows.length; i++) total += Math.ceil(sizeOf(rows[i].node) / 4096) * 4;
  return total;
}

function printRows(rows, opts, io) {
  if (opts.long) {
    if (opts.total) io.out.text('total ' + blocks(rows));
    var lines = longLines(rows, opts.classify);
    for (var i = 0; i < lines.length; i++) io.out.line(lines[i]);
    return;
  }
  // Off a tty (or with -1), one name per line: what makes ls | grep useful.
  if (!io.tty || opts.one) {
    for (var j = 0; j < rows.length; j++) io.out.text(shownName(rows[j].name, rows[j].node, opts.classify));
    return;
  }
  var nodes = [];
  for (var k = 0; k < rows.length; k++) {
    if (k) nodes.push(textNode('  '));
    var n = rows[k].node;
    var name = shownName(rows[k].name, n, opts.classify);
    // On screen a directory is told by its color, as ls --color does.
    nodes.push(n.url ? fileLink({ url: n.url, name: name }) : isDirLike(n) ? styled('term-path', name) : textNode(name));
  }
  if (nodes.length) io.out.line(nodes);
}

function listDir(name, found, opts, io) {
  var n = found.node;
  if (n.type === 'page') {
    io.out.text('(mounted: ' + n.url + ')'); // the live site: cd into it to visit
    return 0;
  }
  if (!can(n, ctx().user, 4)) {
    io.out.text("ls: cannot open directory '" + name + "': Permission denied");
    return 2;
  }
  var rows = [];
  if (opts.all) {
    rows.push({ name: '.', node: n });
    rows.push({ name: '..', node: lookup(fs, found.path + '/..', ctx()).node || n });
  }
  var kids = entries(n);
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].name.charAt(0) === '.' && !opts.all && !opts.almost) continue;
    rows.push(kids[i]);
  }
  printRows(rows, { long: opts.long, one: opts.one, classify: opts.classify, total: true }, io);
  return 0;
}

Object.assign(commands, {
  help: function (args, io) {
    io.out.text('available commands:');
    // The usage column is as wide as its widest entry, plus a space, so a
    // long synopsis never runs into its description.
    var width = 16;
    for (var w = 0; w < HELP_ORDER.length; w++) {
      width = Math.max(width, (HELP_ORDER[w] + ' ' + DOCS[HELP_ORDER[w]].args).trim().length + 1);
    }
    for (var i = 0; i < HELP_ORDER.length; i++) {
      var name = HELP_ORDER[i];
      var doc = DOCS[name];
      io.out.text('  ' + padRight((name + ' ' + doc.args).trim(), width) + doc.blurb);
    }
    io.out.text('keys:');
    for (var k = 0; k < KEY_HELP.length; k++) {
      io.out.text('  ' + padRight(KEY_HELP[k][0], 16) + KEY_HELP[k][1]);
    }
    io.out.text('also: pipes, < > redirection, << heredocs, ; && ||, globs, $VARS, and man <command>.');
  },

  man: function (args, io) {
    var name = args[0];
    if (!name) {
      io.out.text('What manual page do you want?');
      return 1;
    }
    var doc = DOCS[name];
    if (!doc || (doc.pkg && !isDrawn(doc.pkg))) {
      io.out.text('No manual entry for ' + name);
      return 1;
    }
    io.out.text(name.toUpperCase() + '(1)');
    io.out.text('NAME');
    io.out.text('     ' + name + ' - ' + (doc.blurb || DOCS[name].man.split('.')[0].toLowerCase()));
    io.out.text('SYNOPSIS');
    io.out.text('     ' + (name + ' ' + doc.args).trim());
    io.out.text('DESCRIPTION');
    io.out.text('     ' + doc.man);
  },

  // The two commands that exist only to have an exit status.
  'true': function () {
    return 0;
  },

  'false': function () {
    return 1;
  },

  // The line comes back as one line: -n and -e are swallowed, because every
  // line here is a line whatever you ask. Quoting and $VAR expansion happen
  // before echo ever sees the words.
  echo: function (args, io) {
    var words = args.slice();
    var escapes = false;
    while (words.length && /^-[neE]+$/.test(words[0])) {
      if (words[0].indexOf('e') !== -1) escapes = true;
      words.shift();
    }
    var text = words.join(' ');
    if (escapes) {
      text = text.replace(/\\t/g, '\t');
      var lines = text.split(/\\n/);
      for (var i = 0; i < lines.length; i++) io.out.text(lines[i]);
      return;
    }
    io.out.text(text);
  },

  env: function (args, io) {
    for (var i = 0; i < sh.env.length; i++) {
      if (isExported(sh.env[i])) io.out.text(sh.env[i][0] + '=' + sh.env[i][1]);
    }
  },

  printenv: function (args, io) {
    if (!args.length) return commands.env(args, io);
    var at = envIndex(args[0]);
    if (at === -1 || !isExported(sh.env[at])) return 1;
    io.out.text(sh.env[at][1]);
  },

  // Everything, exported or not, the way set with no arguments shows it.
  set: function (args, io) {
    var names = [];
    for (var i = 0; i < sh.env.length; i++) names.push(sh.env[i]);
    names.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    for (var j = 0; j < names.length; j++) io.out.text(names[j][0] + '=' + names[j][1]);
  },

  export: function (args, io) {
    if (!args.length) return commands.env(args, io);
    for (var i = 0; i < args.length; i++) {
      var eq = args[i].indexOf('=');
      var name = eq === -1 ? args[i] : args[i].slice(0, eq);
      if (!/^[A-Za-z_]\w*$/.test(name)) {
        io.out.text("export: `" + args[i] + "': not a valid identifier");
        return 1;
      }
      var known = envValue(name);
      envSet(name, eq !== -1 ? args[i].slice(eq + 1) : known === null ? '' : known);
    }
  },

  unset: function (args, io) {
    for (var i = 0; i < args.length; i++) {
      var at = envIndex(args[i]);
      if (at !== -1) sh.env.splice(at, 1);
    }
  },

  ls: function (args, io) {
    var flags = flagsOf(args);
    var opts = {
      long: flags.indexOf('l') !== -1,
      all: flags.indexOf('a') !== -1,
      almost: flags.indexOf('A') !== -1,
      dirs: flags.indexOf('d') !== -1,
      one: flags.indexOf('1') !== -1,
      classify: flags.indexOf('F') !== -1 ? 'F' : flags.indexOf('p') !== -1 ? 'p' : null
    };
    var named = operandsOf(args);
    var several = named.length > 1;
    if (!named.length) named = ['.'];
    var c = ctx();
    var status = 0;
    var plain = [];
    var dirs = [];
    for (var i = 0; i < named.length; i++) {
      var found = lookup(fs, named[i], c, { follow: !opts.long && !opts.classify }); // -l and -F show a link itself
      if (opts.long && !found.error && found.node.type === 'symlink' && named[i].slice(-1) === '/') {
        found = lookup(fs, named[i], c);
      }
      if (found.error) {
        io.out.text("ls: cannot access '" + named[i] + "': " + errText(found.error));
        status = 2;
      } else if (isDirLike(found.node) && !opts.dirs) {
        dirs.push({ name: named[i], found: found });
      } else {
        plain.push({ name: named[i].replace(/\/+$/, '') || '/', node: found.node });
      }
    }
    printRows(plain, { long: opts.long, one: opts.one, classify: opts.classify, total: false }, io);
    for (var d = 0; d < dirs.length; d++) {
      if (several || plain.length) {
        if (plain.length || d) io.out.text('');
        io.out.text(dirs[d].name + ':');
      }
      status = Math.max(status, listDir(dirs[d].name, dirs[d].found, opts, io));
    }
    return status;
  },

  cd: function (args, io) {
    var c = ctx();
    var target = args[0];
    if (target === undefined || target === '~') target = c.home;
    if (target === '-') {
      var old = envValue('OLDPWD');
      if (!old) {
        browserBack(1);
        return 0;
      }
      io.out.text(old);
      target = old;
    }
    // From ~ and anything above it, .. is still the browser's back button.
    var segments = target.replace(/\/+$/, '').split('/');
    var hops = 0;
    var onlyUp = true;
    for (var s = 0; s < segments.length; s++) {
      if (segments[s] === '..') hops++;
      else if (segments[s] !== '.') onlyUp = false;
    }
    if (onlyUp && (c.cwd === c.home || c.cwd === '/home' || c.cwd === '/')) {
      if (hops) browserBack(hops);
      return 0;
    }
    var logical = normalize(absolute(target, c));
    var found = lookup(fs, logical, c);
    var problem = found.error || (!isDirLike(found.node) ? 'ENOTDIR' : !can(found.node, c.user, 1) ? 'EACCES' : null);
    if (problem === 'ENOENT') io.out.text('cd: no such file or directory: ' + args[0]);
    else if (problem === 'EACCES') io.out.text('cd: permission denied: ' + args[0]);
    else if (problem === 'ENOTDIR') io.out.text('cd: not a directory: ' + args[0]);
    else if (problem) io.out.text('cd: ' + errText(problem).toLowerCase() + ': ' + args[0]);
    if (problem) return 1;
    if (found.node.type === 'page') {
      navigate(found.node.url);
      return 0;
    }
    setCwd(logical);
    return 0;
  },

  open: function (args, io) {
    var found = args[0] ? lookup(fs, args[0], ctx()) : null;
    if (found && !found.error && found.node.url) {
      navigate(found.node.url);
      return 0;
    }
    io.out.text('open: ' + (args[0] || '') + ': nothing to open it with');
    return 1;
  },

  pwd: function (args, io) {
    io.out.text(sh.cwd);
  },

  cat: function (args, io) {
    var targets = operandsOf(args);
    if (!targets.length && io.stdin) {
      for (var s = 0; s < io.stdin.length; s++) io.out.text(io.stdin[s]);
      return 0;
    }
    if (!targets.length) {
      io.out.text('cat: missing operand');
      return 1;
    }
    var status = 0;
    for (var i = 0; i < targets.length; i++) {
      var got = inputLines([targets[i]], io, 'cat');
      if (got.status) status = 1;
      for (var j = 0; j < got.lines.length; j++) io.out.text(got.lines[j]);
    }
    return status;
  },

  touch: function (args, io) {
    var targets = operandsOf(args);
    if (!targets.length) {
      io.out.text('touch: missing file operand');
      return 1;
    }
    var c = ctx();
    var status = 0;
    for (var i = 0; i < targets.length; i++) {
      var made = createFile(fs, targets[i], c);
      var problem = made.error || (made.existed && !can(made.node, c.user, 2) && made.node.uid !== c.user ? 'EACCES' : null);
      if (problem) {
        io.out.text("touch: cannot touch '" + targets[i] + "': " + errText(problem));
        status = 1;
      } else if (made.existed) {
        made.node.mtime = fs.now(); // real touch just moves the clock forward
      }
    }
    return status;
  },

  mkdir: function (args, io) {
    var parents = flagsOf(args).indexOf('p') !== -1;
    var targets = operandsOf(args);
    if (!targets.length) {
      io.out.text('mkdir: missing operand');
      return 1;
    }
    var c = ctx();
    var status = 0;
    for (var i = 0; i < targets.length; i++) {
      var steps = [targets[i]];
      if (parents) {
        steps = [];
        var parts = targets[i].split('/');
        for (var p = 1; p <= parts.length; p++) {
          var step = parts.slice(0, p).join('/');
          if (step && step !== '~') steps.push(step);
        }
      }
      for (var s = 0; s < steps.length; s++) {
        var made = mkdir(fs, steps[s], c);
        if (!made.error) continue;
        if (parents && made.error === 'EEXIST') {
          var there = lookup(fs, steps[s], c);
          if (!there.error && isDirLike(there.node)) continue;
        }
        io.out.text("mkdir: cannot create directory '" + targets[i] + "': " + errText(made.error));
        status = 1;
        break;
      }
    }
    return status;
  },

  rmdir: function (args, io) {
    var targets = operandsOf(args);
    if (!targets.length) {
      io.out.text('rmdir: missing operand');
      return 1;
    }
    var status = 0;
    for (var i = 0; i < targets.length; i++) {
      var failures = remove(fs, targets[i], ctx(), { dirOnly: true });
      if (failures.length) {
        io.out.text("rmdir: failed to remove '" + targets[i] + "': " + errText(failures[0].error));
        status = 1;
      }
    }
    return status;
  },

  rm: function (args, io) {
    var flags = flagsOf(args);
    var targets = operandsOf(args);
    if (!targets.length) {
      io.out.text('rm: missing operand');
      return 1;
    }
    var recursive = /[rR]/.test(flags);
    var force = flags.indexOf('f') !== -1;
    var verbose = flags.indexOf('v') !== -1;
    var c = ctx();
    var scope = recursive && force ? coverage(targets, c) : null;
    if (scope) return wipeFrom(scope, c, io);
    var status = 0;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var bare = t.replace(/\/+$/, '');
      if (/(^|\/)\.\.?$/.test(bare)) {
        io.out.text("rm: refusing to remove '.' or '..' directory: skipping '" + t + "'");
        status = 1;
        continue;
      }
      if (bare === '') {
        io.out.text(recursive ? "rm: it is dangerous to operate recursively on '/'" : "rm: cannot remove '/': Is a directory");
        status = 1;
        continue;
      }
      var failures = remove(fs, t, c, { recursive: recursive });
      for (var f = 0; f < failures.length; f++) {
        if (force && failures[f].error === 'ENOENT') continue;
        io.out.text("rm: cannot remove '" + failures[f].path + "': " + errText(failures[f].error));
        status = 1;
      }
      if (verbose && !failures.length) io.out.text("removed '" + t + "'");
    }
    return status;
  },

  chmod: function (args, io) {
    var recursive = args[0] === '-R';
    var rest = recursive ? args.slice(1) : args;
    if (rest.length < 2) {
      io.out.text('chmod: missing operand');
      return 1;
    }
    var spec = rest[0];
    var c = ctx();
    var status = 0;
    function one(path) {
      var res = chmod(fs, path, spec, c);
      if (!res.error) return;
      status = 1;
      if (res.error === 'EINVAL') io.out.text("chmod: invalid mode: '" + spec + "'");
      else if (res.error === 'EPERM') io.out.text("chmod: changing permissions of '" + path + "': Operation not permitted");
      else io.out.text("chmod: cannot access '" + path + "': " + errText(res.error));
    }
    for (var i = 1; i < rest.length; i++) {
      if (!recursive) {
        one(rest[i]);
        continue;
      }
      walk(fs, rest[i], c, function (path, n, depth, error) {
        if (error && error !== 'EACCES') {
          io.out.text("chmod: cannot access '" + path + "': " + errText(error));
          status = 1;
          return false;
        }
        one(path);
      });
    }
    return status;
  },

  chown: function (args, io) {
    if (args.length < 2) {
      io.out.text('chown: missing operand');
      return 1;
    }
    var status = 0;
    for (var i = 1; i < args.length; i++) {
      var res = chown(fs, args[i], args[0], ctx());
      if (!res.error) continue;
      status = 1;
      if (res.error === 'EINVAL') io.out.text("chown: invalid user: '" + args[0] + "'");
      else if (res.error === 'EPERM') io.out.text("chown: changing ownership of '" + args[i] + "': Operation not permitted");
      else io.out.text("chown: cannot access '" + args[i] + "': " + errText(res.error));
    }
    return status;
  },

  // alias alone lists; alias name=value defines; alias name prints one.
  alias: function (args, io) {
    if (!args.length) {
      var names = Object.keys(ALIASES).sort();
      for (var i = 0; i < names.length; i++) io.out.text('alias ' + names[i] + "='" + ALIASES[names[i]] + "'");
      return 0;
    }
    var status = 0;
    for (var a = 0; a < args.length; a++) {
      var eq = args[a].indexOf('=');
      if (eq > 0) {
        ALIASES[args[a].slice(0, eq)] = args[a].slice(eq + 1);
      } else if (ALIASES[args[a]]) {
        io.out.text('alias ' + args[a] + "='" + ALIASES[args[a]] + "'");
      } else {
        io.out.text('sebiwish: alias: ' + args[a] + ': not found');
        status = 1;
      }
    }
    return status;
  },

  unalias: function (args, io) {
    var status = 0;
    for (var i = 0; i < args.length; i++) {
      if (ALIASES[args[i]]) {
        delete ALIASES[args[i]];
      } else {
        io.out.text('sebiwish: unalias: ' + args[i] + ': not found');
        status = 1;
      }
    }
    return status;
  }
});

// rm -rf on everything: '/', the home directory, or every entry of either.
// Returns 'root', 'home' or null.
function coverage(targets, c) {
  var paths = {};
  for (var i = 0; i < targets.length; i++) {
    var found = lookup(fs, targets[i], c, { follow: false });
    if (!found.error) paths[found.path] = true;
  }
  if (paths['/']) return 'root';
  if (paths[c.home]) return 'home';
  var scopes = [['/', 'root'], [c.home, 'home']];
  for (var s = 0; s < scopes.length; s++) {
    var dir = lookup(fs, scopes[s][0], c);
    if (dir.error) continue;
    var kids = entries(dir.node);
    var all = kids.length > 0;
    for (var k = 0; k < kids.length; k++) {
      if (!paths[(scopes[s][0] === '/' ? '' : scopes[s][0]) + '/' + kids[k].name]) all = false;
    }
    if (all) return scopes[s][1];
  }
  return null;
}

// The whole show. A user can't take the system with them, and rm says so
// first, once per root-owned top-level entry; their own files (the page)
// go anyway, and the page goes with them.
function wipeFrom(scope, c, io) {
  var status = 0;
  if (scope === 'root' && c.user !== 'root') {
    var top = entries(fs.root);
    for (var i = 0; i < top.length; i++) {
      if (top[i].node.uid === 'root') io.out.text("rm: cannot remove '/" + top[i].name + "': Permission denied");
    }
    status = 1;
  }
  wipeAll();
  return status;
}

commands['xdg-open'] = commands.open;
