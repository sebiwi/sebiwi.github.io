// The filesystem behind the 404 shell, with no DOM in it.
//
// A tree of nodes. A node is a dir, a file, a symlink, a page (a directory
// that is really a page of the site, mounted read-only) or a part (a file
// that is really a piece of the 404 page). Nodes carry an owner, a group, a
// mode and an mtime, and paths resolve the way a kernel resolves them: one
// component at a time, checking search permission, following symlinks up to
// a limit. What a node means beyond its bytes (removing a part removes the
// element) lives in hooks the page passes in, so this file runs in Node.

export var ERR = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EACCES: 'Permission denied',
  EPERM: 'Operation not permitted',
  ENOTEMPTY: 'Directory not empty',
  EEXIST: 'File exists',
  ELOOP: 'Too many levels of symbolic links',
  EINVAL: 'Invalid argument',
  EBUSY: 'Device or resource busy',
  EROFS: 'Read-only file system'
};

export var EPOCH = Date.UTC(2026, 6, 13, 7, 19); // the day the 404 got a shell
export var UMASK = 0o022;
export var USERS = ['root', 'sebiwi'];
var MAX_HOPS = 8;

export function createFs(opts) {
  opts = opts || {};
  var fs = { nextIno: 1, hooks: opts.hooks || {}, graveyard: {}, now: opts.now || Date.now };
  fs.root = node(fs, 'dir', { uid: 'root', mode: 0o755, mtime: EPOCH });
  fs.root.links = 1;
  return fs;
}

export function node(fs, type, props) {
  props = props || {};
  var n = {
    ino: fs.nextIno++,
    type: type,
    uid: props.uid || 'root',
    gid: props.gid || props.uid || 'root',
    mode: props.mode !== undefined ? props.mode : type === 'dir' || type === 'page' ? 0o755 : 0o644,
    mtime: props.mtime !== undefined ? props.mtime : fs.now(),
    links: 0
  };
  if (type === 'dir' && !props.list) n.children = {};
  for (var key in props) {
    if (!Object.prototype.hasOwnProperty.call(n, key)) n[key] = props[key];
  }
  return n;
}

// Puts a node into a directory with no questions asked: for building trees.
export function attach(dir, name, child) {
  dir.children[name] = child;
  child.links++;
  return child;
}

export function isDirLike(n) {
  return n.type === 'dir' || n.type === 'page';
}

export function childrenOf(dir) {
  if (dir.list) return dir.list();
  return dir.children || {};
}

// ls order: case folded, a leading dot ignored, so .bashrc sorts with the b's.
function sortKey(name) {
  return name.replace(/^\.+/, '').toLowerCase();
}

export function entries(dir) {
  var kids = childrenOf(dir);
  return Object.keys(kids).sort(function (a, b) {
    var ka = sortKey(a);
    var kb = sortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0;
  }).map(function (name) {
    return { name: name, node: kids[name] };
  });
}

// Permission bits, the classic way: owner, then group, then other. Each user
// has a group of the same name. Root reads and writes anything and executes
// anything with at least one x bit.
export function can(n, user, bit) {
  if (user === 'root') return bit !== 1 || isDirLike(n) || (n.mode & 0o111) !== 0;
  var shift = n.uid === user ? 6 : n.gid === user ? 3 : 0;
  return ((n.mode >> shift) & bit) !== 0;
}

// '~' and '~/x' become the home directory; relative paths join the cwd.
// '..' is left alone, so it walks the real tree.
export function absolute(path, ctx) {
  if (path === '~' || path.indexOf('~/') === 0) return ctx.home + path.slice(1);
  if (path.charAt(0) === '/') return path;
  return (ctx.cwd === '/' ? '' : ctx.cwd) + '/' + path;
}

function pathOf(stack) {
  var names = [];
  for (var i = 1; i < stack.length; i++) names.push(stack[i].name);
  return '/' + names.join('/');
}

function resolveStack(fs, comps, stack, ctx, followLast, hops) {
  for (var i = 0; i < comps.length; i++) {
    var name = comps[i];
    var last = i === comps.length - 1;
    var dir = stack[stack.length - 1].node;
    if (!isDirLike(dir)) return { error: 'ENOTDIR' };
    if (name === '.') continue;
    if (name === '..') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (!can(dir, ctx.user, 1)) return { error: 'EACCES' };
    var child = dir.type === 'page' ? null : childrenOf(dir)[name];
    if (!child) return { error: 'ENOENT' };
    if (child.type === 'symlink' && (followLast || !last)) {
      if (hops >= MAX_HOPS) return { error: 'ELOOP' };
      var base = child.target.charAt(0) === '/' ? [stack[0]] : stack.slice();
      var res = resolveStack(fs, child.target.split('/').filter(Boolean), base, ctx, true, hops + 1);
      if (res.error) return res;
      stack = res.stack;
      continue;
    }
    stack.push({ name: name, node: child });
  }
  return { stack: stack };
}

export function lookup(fs, path, ctx, opts) {
  var follow = !opts || opts.follow !== false;
  var comps = absolute(path, ctx).split('/').filter(Boolean);
  var res = resolveStack(fs, comps, [{ name: '', node: fs.root }], ctx, follow, 0);
  if (res.error) return { error: res.error, path: path };
  var stack = res.stack;
  var top = stack[stack.length - 1];
  if (path.length > 1 && path.slice(-1) === '/' && !isDirLike(top.node)) return { error: 'ENOTDIR', path: path };
  return {
    node: top.node,
    name: top.name,
    parent: stack.length > 1 ? stack[stack.length - 2].node : fs.root,
    path: pathOf(stack)
  };
}

// Where a new entry would go: the directory (resolved) and the last name
// (not). 'a/b/' names b.
export function lookupParent(fs, path, ctx) {
  var abs = absolute(path, ctx).replace(/\/+$/, '');
  var cut = abs.lastIndexOf('/');
  var name = abs.slice(cut + 1);
  if (!name || name === '.' || name === '..') return { error: 'EEXIST', path: path };
  var found = lookup(fs, abs.slice(0, cut) || '/', ctx);
  if (found.error) return { error: found.error, path: path };
  if (found.node.type === 'page') return { error: 'EROFS', path: path };
  if (!isDirLike(found.node)) return { error: 'ENOTDIR', path: path };
  return {
    dir: found.node,
    dirPath: found.path,
    name: name,
    existing: childrenOf(found.node)[name] || null,
    path: path
  };
}

function join(dirPath, name) {
  return (dirPath === '/' ? '' : dirPath) + '/' + name;
}

// Changing a directory's entries takes write and search permission on it.
function denyWrite(dir, ctx) {
  if (dir.readonly) return 'EPERM';
  if (dir.type === 'page') return 'EROFS';
  return can(dir, ctx.user, 2) && can(dir, ctx.user, 1) ? null : 'EACCES';
}

// In a sticky directory (/tmp), only a file's owner, the directory's owner
// or root may delete or rename it.
function denySticky(dir, n, ctx) {
  if (!(dir.mode & 0o1000) || ctx.user === 'root') return null;
  return n.uid === ctx.user || dir.uid === ctx.user ? null : 'EACCES';
}

function touchDir(fs, dir) {
  dir.mtime = fs.now();
}

export function mkdir(fs, path, ctx) {
  var p = lookupParent(fs, path, ctx);
  if (p.error) return p;
  if (p.existing) return { error: 'EEXIST', path: path };
  var deny = denyWrite(p.dir, ctx);
  if (deny) return { error: deny, path: path };
  var made = attach(p.dir, p.name, node(fs, 'dir', { uid: ctx.user, mode: 0o777 & ~UMASK }));
  touchDir(fs, p.dir);
  return { node: made, path: join(p.dirPath, p.name) };
}

// touch, > and >>: the file at path, made when it is missing. A node the
// filesystem buried at that path (the history file) comes back as itself.
export function createFile(fs, path, ctx) {
  var found = lookup(fs, path, ctx);
  if (!found.error) return { node: found.node, existed: true, path: found.path };
  if (found.error !== 'ENOENT') return found;
  var p = lookupParent(fs, path, ctx);
  if (p.error) return p;
  if (p.existing) return { error: 'ENOENT', path: path }; // a dangling symlink
  var deny = denyWrite(p.dir, ctx);
  if (deny) return { error: deny, path: path };
  var key = join(p.dirPath, p.name);
  var made = fs.graveyard[key] || node(fs, 'file', { uid: ctx.user, mode: 0o666 & ~UMASK, content: '' });
  delete fs.graveyard[key];
  attach(p.dir, p.name, made);
  touchDir(fs, p.dir);
  if (made.revivable && fs.hooks.revived) fs.hooks.revived(made);
  return { node: made, existed: false, path: key };
}

function dropLink(fs, n, absPath) {
  n.links--;
  if (n.links > 0) return;
  if (n.revivable) fs.graveyard[absPath] = n;
  if (fs.hooks.removed) fs.hooks.removed(n);
}

function unlinkTree(fs, parent, name, n, shown, absPath, ctx) {
  var failures = [];
  if (n.type === 'dir' && !n.list) {
    var kids = entries(n);
    for (var i = 0; i < kids.length; i++) {
      failures = failures.concat(unlinkTree(fs, n, kids[i].name, kids[i].node,
        join(shown, kids[i].name), join(absPath, kids[i].name), ctx));
    }
    if (failures.length) return failures.concat([{ path: shown, error: 'ENOTEMPTY' }]);
  }
  var deny = n.readonly ? 'EPERM' : denyWrite(parent, ctx) || denySticky(parent, n, ctx);
  if (deny) return failures.concat([{ path: shown, error: deny }]);
  delete parent.children[name];
  touchDir(fs, parent);
  dropLink(fs, n, absPath);
  return failures;
}

// rm and rmdir. Returns the failures, each { path, error }; rm -r keeps going
// past them, the way rm does, and an empty list means everything went.
export function remove(fs, path, ctx, opts) {
  opts = opts || {};
  var found = lookup(fs, path, ctx, { follow: false });
  if (found.error) return [{ path: path, error: found.error }];
  var n = found.node;
  if (n === fs.root) return [{ path: path, error: 'EBUSY' }];
  if (opts.dirOnly) {
    if (!isDirLike(n)) return [{ path: path, error: 'ENOTDIR' }];
    if (n.type === 'page' || Object.keys(childrenOf(n)).length) return [{ path: path, error: 'ENOTEMPTY' }];
  } else if (isDirLike(n) && !opts.recursive) {
    return [{ path: path, error: 'EISDIR' }];
  }
  return unlinkTree(fs, found.parent, found.name, n, path, found.path, ctx);
}

// Removes every link to a node at once: what a killed process does to the
// page part it was drawing, wherever that part has been moved or linked.
export function purge(fs, target) {
  var path = null;
  (function sweep(dir, at) {
    var kids = dir.children || {};
    for (var name in kids) {
      var child = kids[name];
      if (child === target) {
        delete kids[name];
        if (!path) path = join(at, name);
      } else if (child.type === 'dir' && !child.list) {
        sweep(child, join(at, name));
      }
    }
  })(fs.root, '/');
  if (target.links <= 0) return;
  target.links = 1;
  dropLink(fs, target, path || '/');
}

export function rename(fs, from, to, ctx) {
  var src = lookup(fs, from, ctx, { follow: false });
  if (src.error) return { error: src.error, path: from };
  if (src.node === fs.root) return { error: 'EBUSY', path: from };
  var dst = lookup(fs, to, ctx);
  var dir;
  var dirPath;
  var name;
  if (!dst.error && dst.node.type === 'page') return { error: 'EROFS', path: to };
  if (!dst.error && isDirLike(dst.node)) {
    dir = dst.node;
    dirPath = dst.path;
    name = src.name;
  } else {
    var p = lookupParent(fs, to, ctx);
    if (p.error) return p;
    dir = p.dir;
    dirPath = p.dirPath;
    name = p.name;
  }
  var existing = childrenOf(dir)[name];
  if (existing === src.node) return { node: src.node, name: name };
  var deny = denyWrite(src.parent, ctx) || denyWrite(dir, ctx) || denySticky(src.parent, src.node, ctx);
  if (deny) return { error: deny, path: from };
  if (isDirLike(src.node) && (join(dirPath, name) + '/').indexOf(src.path + '/') === 0) {
    return { error: 'INTO', path: from };
  }
  if (existing) {
    if (isDirLike(existing) && !isDirLike(src.node)) return { error: 'EISDIR', path: to };
    if (!isDirLike(existing) && isDirLike(src.node)) return { error: 'ENOTDIR', path: to };
    if (isDirLike(existing) && Object.keys(childrenOf(existing)).length) return { error: 'ENOTEMPTY', path: to };
    delete dir.children[name];
    dropLink(fs, existing, join(dirPath, name));
  }
  delete src.parent.children[src.name];
  dir.children[name] = src.node;
  touchDir(fs, src.parent);
  touchDir(fs, dir);
  return { node: src.node, name: name, path: join(dirPath, name) };
}

export function link(fs, target, path, ctx, opts) {
  opts = opts || {};
  var p = lookupParent(fs, path, ctx);
  if (p.error) return p;
  if (p.existing) {
    if (!opts.force) return { error: 'EEXIST', path: path };
    var gone = remove(fs, path, ctx);
    if (gone.length) return { error: gone[0].error, path: path };
  }
  var deny = denyWrite(p.dir, ctx);
  if (deny) return { error: deny, path: path };
  if (opts.symbolic) {
    return { node: attach(p.dir, p.name, node(fs, 'symlink', { uid: ctx.user, mode: 0o777, target: target })) };
  }
  var src = lookup(fs, target, ctx);
  if (src.error) return { error: src.error, path: target };
  if (isDirLike(src.node)) return { error: 'EPERM', path: target };
  return { node: attach(p.dir, p.name, src.node) };
}

export function readLines(n) {
  if (n.read) return n.read();
  if (typeof n.content === 'string') return n.content === '' ? [] : n.content.split('\n');
  return null;
}

export function writeLines(fs, n, lines, append) {
  if (n.write) {
    n.write(lines, append);
    return;
  }
  var body = lines.join('\n');
  n.content = append && n.content ? n.content + '\n' + body : body;
  n.mtime = fs.now();
}

function copyNode(fs, n, from, to, ctx, opts) {
  if (!can(n, ctx.user, 4)) return [{ path: from, error: 'EACCES' }];
  if (isDirLike(n)) {
    if (!opts.recursive) return [{ path: from, error: 'OMIT' }];
    var made = lookup(fs, to, ctx);
    if (made.error) {
      var m = mkdir(fs, to, ctx);
      if (m.error) return [{ path: to, error: m.error }];
    } else if (!isDirLike(made.node)) {
      return [{ path: to, error: 'ENOTDIR' }];
    }
    var failures = [];
    var kids = n.type === 'page' ? [] : entries(n);
    for (var i = 0; i < kids.length; i++) {
      failures = failures.concat(copyNode(fs, kids[i].node, join(from, kids[i].name), join(to, kids[i].name), ctx, opts));
    }
    return failures;
  }
  var lines = readLines(n);
  var out = createFile(fs, to, ctx);
  if (out.error) return [{ path: to, error: out.error }];
  if (out.node === n) return [{ path: from, error: 'SAME' }];
  if (out.existed && !can(out.node, ctx.user, 2)) return [{ path: to, error: 'EACCES' }];
  writeLines(fs, out.node, lines || [], false);
  if (!out.existed) {
    // A copy is a plain file. A part's copy is just its text, not the part.
    out.node.mode = n.type === 'part' ? 0o644 & ~UMASK : n.mode & 0o777 & ~UMASK;
    if (n.exec) out.node.exec = n.exec;
  }
  return [];
}

export function copy(fs, from, to, ctx, opts) {
  opts = opts || {};
  var src = lookup(fs, from, ctx);
  if (src.error) return [{ path: from, error: src.error }];
  var dst = lookup(fs, to, ctx);
  var target = !dst.error && isDirLike(dst.node) ? join(to.replace(/\/+$/, '') || '/', src.name) : to;
  if (isDirLike(src.node)) {
    var p = lookupParent(fs, target, ctx);
    if (!p.error && (join(p.dirPath, p.name) + '/').indexOf(src.path + '/') === 0) {
      return [{ path: from, error: 'INTO' }];
    }
  }
  return copyNode(fs, src.node, from, target, ctx, opts);
}

// chmod's two spellings: octal (755, 1777) and symbolic (u+x, go-w, a=r, +t),
// comma-separated. null when the spec is neither.
export function parseMode(spec, current) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  var mode = current;
  var clauses = spec.split(',');
  for (var i = 0; i < clauses.length; i++) {
    var m = /^([ugoa]*)([-+=])([rwxt]*)$/.exec(clauses[i]);
    if (!m) return null;
    var who = (m[1] || 'a').replace('a', 'ugo');
    var bits = 0;
    var whoMask = 0;
    for (var w = 0; w < who.length; w++) {
      var shift = { u: 6, g: 3, o: 0 }[who.charAt(w)];
      whoMask |= 7 << shift;
      for (var p = 0; p < m[3].length; p++) {
        var c = m[3].charAt(p);
        if (c === 't') bits |= 0o1000;
        else bits |= { r: 4, w: 2, x: 1 }[c] << shift;
      }
    }
    if (m[2] === '+') mode |= bits;
    else if (m[2] === '-') mode &= ~bits;
    else mode = (mode & ~whoMask) | bits;
  }
  return mode;
}

export function chmod(fs, path, spec, ctx) {
  var found = lookup(fs, path, ctx);
  if (found.error) return found;
  var n = found.node;
  if (n.readonly || (ctx.user !== 'root' && n.uid !== ctx.user)) return { error: 'EPERM', path: path };
  var mode = parseMode(spec, n.mode);
  if (mode === null) return { error: 'EINVAL', path: path };
  n.mode = mode;
  return { node: n };
}

// 'user', 'user:group' or ':group'. Only root gives files away.
export function chown(fs, path, owner, ctx) {
  var m = /^([^:]*)(?::(.*))?$/.exec(owner);
  var user = m[1];
  var group = m[2];
  if ((user && USERS.indexOf(user) === -1) || (group && USERS.indexOf(group) === -1)) return { error: 'EINVAL', path: path };
  var found = lookup(fs, path, ctx);
  if (found.error) return found;
  if (ctx.user !== 'root' || found.node.readonly) return { error: 'EPERM', path: path };
  if (user) found.node.uid = user;
  if (group) found.node.gid = group;
  return { node: found.node };
}

export function sizeOf(n) {
  if (n.size !== undefined) return n.size;
  if (isDirLike(n)) return 4096;
  if (n.type === 'symlink') return n.target.length;
  var lines = readLines(n);
  return lines ? lines.join('\n').length : 0;
}

export function formatMode(n) {
  var out = isDirLike(n) ? 'd' : n.type === 'symlink' ? 'l' : n.dev ? 'c' : '-';
  var letters = 'rwxrwxrwx';
  for (var i = 0; i < 9; i++) out += n.mode & (1 << (8 - i)) ? letters.charAt(i) : '-';
  if (n.mode & 0o1000) out = out.slice(0, 9) + (n.mode & 1 ? 't' : 'T');
  return out;
}

// Depth first from path, the way find walks: visit(path, node, depth, error).
// A directory that can't be read is visited once, with EACCES, and not entered.
export function walk(fs, path, ctx, visit) {
  var start = lookup(fs, path, ctx);
  if (start.error) {
    visit(path, null, 0, start.error);
    return;
  }
  (function step(shown, n, depth) {
    if (n.type === 'dir' && !can(n, ctx.user, 4)) {
      visit(shown, n, depth, 'EACCES');
      return;
    }
    if (visit(shown, n, depth, null) === false || n.type !== 'dir') return;
    var kids = entries(n);
    for (var i = 0; i < kids.length; i++) {
      step(shown === '/' ? '/' + kids[i].name : shown.replace(/\/$/, '') + '/' + kids[i].name, kids[i].node, depth + 1);
    }
  })(path, start.node, 0);
}

// ls -l and stat's link count: a directory has 2 (itself, and . inside it)
// plus one per subdirectory (each one's ..); anything else, its links.
export function linkCount(n) {
  if (n.type !== 'dir' || n.list) return isDirLike(n) ? 2 : n.links;
  var count = 2;
  for (var name in n.children) {
    if (n.children[name].type === 'dir') count++;
  }
  return count;
}
