// The filesystem, mounted on the 404 page. vfs.js knows trees; this file
// knows the page: the static `ls ~/` line gives the page directories (a
// trailing slash in the link text means directory), the page's pieces
// become files in ~ that are really elements, and removing one removes the
// element. The history file is the history, so deleting it ends that too.

import { dom } from './dom.js';
import { envSet, envValue } from './env.js';
import { MAX_HISTORY, forgetHistory, hist, saveHistory } from './history.js';
import { providerOf } from './inkdb.js';
import { farewell, vaporize, wipeEverything } from './pageparts.js';
import { list, reap } from './proc.js';
import { LOGIN_PID, table } from './procs.js';
import { BUILTIN_ONLY, commands } from './registry.js';
import { printText } from './screen.js';
import { HOME, buildSkeleton } from './skeleton.js';
import { sh } from './state.js';
import { MONTHS, pad, two } from './util.js';
import { EPOCH, attach, createFs, isDirLike, lookup, node, remove } from './vfs.js';

export var fs = null;
export var system = null;
var historyNode = null;

var BASHRC = [
  '# sebiwish, such as it is',
  "PS1='\\u@\\h:\\w\\$ '",
  "alias ll='ls -l'",
  "alias la='ls -a'",
  "alias please='sudo'",
  "alias ..='cd ..'",
  'export EDITOR=pencil',
  '# there is no network, only sebiwi'
].join('\n');

var SHELL_LINKS = { bash: 'sebiwish', sh: 'sebiwish', zsh: 'sebiwish' };

// Page parts, top of the page first. pid ties each to the process that
// draws it (Task 5); text marks the one that reads as text.
var PARTS = [
  { name: 'nav', selector: '.top-nav', size: 512 },
  { name: 'controls', selector: '.page-controls', size: 256 },
  { name: 'hint.txt', selector: '[data-404-hint]', size: 42, text: true },
  { name: 'terminal', selector: '.terminal-404', size: 8192, mode: 0o555 }
];

var partList = [];

function elf(name) {
  return '\u007fELF\u0002\u0001\u0001 sebiwiOS ' + name + ' (pencil64)';
}

// Every command with a file of its own: everything registered except the
// builtins that only make sense inside the shell, the shell's aliases, and
// what ink draws into /usr/bin.
function binNames() {
  return Object.keys(commands).filter(function (name) {
    return BUILTIN_ONLY.indexOf(name) === -1 && !SHELL_LINKS[name] && !providerOf(name);
  }).sort();
}

function removed(n) {
  if (n.pid && n.pid !== LOGIN_PID) reap(table, n.pid); // its daemon has nothing left to draw
  if (n.type === 'part') {
    var el = document.querySelector(n.selector);
    if (el) vaporize(el, el === dom.terminal ? farewell : null); // silent on success, like the real thing
  } else if (n.navSelector) {
    // A page directory goes from the navbar too, so the deletion shows.
    var navLink = document.querySelector(n.navSelector);
    if (navLink) vaporize(navLink);
  } else if (n === historyNode) {
    forgetHistory();
  }
}

// /proc: one read-only directory per live process, made fresh on each look.
function procDirs() {
  var out = {};
  var procs = list(table);
  for (var i = 0; i < procs.length; i++) {
    out[procs[i].pid] = procDir(procs[i]);
  }
  return out;
}

function procDir(p) {
  var dir = node(fs, 'dir', {
    uid: p.user, mode: 0o555, mtime: p.started, readonly: true,
    list: function () {
      return {
        cmdline: node(fs, 'file', { uid: p.user, mode: 0o444, mtime: p.started, content: p.cmd }),
        status: node(fs, 'file', {
          uid: p.user, mode: 0o444, mtime: p.started,
          content: 'Name:\t' + p.cmd.split(' ')[0] + '\nState:\t' + p.state + '\nPid:\t' + p.pid + '\nPPid:\t' + p.ppid + '\nUid:\t' + (p.user === 'root' ? 0 : 1000)
        })
      };
    }
  });
  dir.links = 1;
  return dir;
}

export function initFs() {
  fs = createFs({ hooks: { removed: removed } });
  system = buildSkeleton(fs, {
    bins: binNames(),
    links: SHELL_LINKS,
    procList: procDirs,
    ttyWrite: function (lines) {
      for (var i = 0; i < lines.length; i++) printText(lines[i]);
    }
  });
  var me = system.me;
  var links = dom.pre.querySelectorAll('a.term-link');
  for (var i = 0; i < links.length; i++) {
    var text = (links[i].textContent || '').trim();
    var url = links[i].getAttribute('href');
    var isDir = text.slice(-1) === '/';
    attach(me, text.replace(/\/$/, ''), node(fs, isDir ? 'page' : 'file', {
      uid: 'sebiwi', mtime: EPOCH, url: url, content: isDir ? undefined : '',
      navSelector: '.top-nav a[href="' + url + '"]'
    }));
  }
  for (var p = 0; p < PARTS.length; p++) {
    var spec = PARTS[p];
    var el = document.querySelector(spec.selector);
    if (!el) continue;
    var part = node(fs, 'part', {
      uid: 'sebiwi', mtime: EPOCH, mode: spec.mode || 0o444, part: spec.name,
      selector: spec.selector, size: spec.size,
      read: spec.text ? readText(spec.selector) : undefined
    });
    partList.push(part);
    attach(me, spec.name, part);
  }
  attach(me, '.bashrc', node(fs, 'file', { uid: 'sebiwi', mtime: EPOCH, content: BASHRC }));
  attach(me, '.gitignore', node(fs, 'file', { uid: 'sebiwi', mtime: EPOCH, content: 'public/\nresources/\n.hugo_build.lock' }));
  historyNode = attach(me, '.sebiwi_history', node(fs, 'file', {
    uid: 'sebiwi', mode: 0o600, mtime: EPOCH, revivable: true,
    read: function () { return hist.lines.slice(); },
    // The file is the history: >> adds commands to it, > replaces them.
    write: function (lines, append) {
      hist.lines = (append ? hist.lines.concat(lines) : lines.slice()).slice(-MAX_HISTORY);
      hist.index = hist.lines.length;
      saveHistory();
    }
  }));
}

function readText(selector) {
  return function () {
    var el = document.querySelector(selector);
    return el ? [el.textContent.replace(/\s+/g, ' ').trim()] : [];
  };
}

export function partNodes() {
  return partList;
}

// The history is the file: with .sebiwi_history gone (every link to it),
// nothing is listed, recalled or written down. touch brings it back.
export function historyKept() {
  return !!historyNode && historyNode.links > 0;
}

export function ctx() {
  return { cwd: sh.cwd, home: envValue('HOME') || HOME, user: sh.uid };
}

export function rootCtx() {
  return { cwd: '/', home: '/root', user: 'root' };
}

// '.' and '..' resolved by spelling, not by walking: cd keeps the path it was
// given, the way bash does, so cd .. works even from a removed directory.
export function normalize(abs) {
  var out = [];
  var parts = abs.split('/');
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i] === '.') continue;
    if (parts[i] === '..') out.pop();
    else out.push(parts[i]);
  }
  return '/' + out.join('/');
}

export function setCwd(path) {
  envSet('OLDPWD', sh.cwd);
  sh.cwd = path;
  envSet('PWD', path);
  updateTitle();
}

export function displayPath(path) {
  var home = envValue('HOME') || HOME;
  if (path === home) return '~';
  if (home !== '/' && path.indexOf(home + '/') === 0) return '~' + path.slice(home.length);
  return path;
}

export function updateTitle() {
  var title = dom.terminal.querySelector('.neofetch-title');
  if (title) title.textContent = sh.uid + '@scoreplay: ' + displayPath(sh.cwd);
}

// ls -l's date column, in UTC so the same tree prints the same everywhere.
// Always the time, never the year: the oldest file here is from July.
export function stamp(ms) {
  var d = new Date(ms);
  return MONTHS[d.getUTCMonth()] + ' ' + pad(String(d.getUTCDate()), 2) + ' ' +
    two(d.getUTCHours()) + ':' + two(d.getUTCMinutes());
}

export function installBin(dir, name) {
  var existing = dir.children[name];
  if (existing) return existing;
  return attach(dir, name, node(fs, 'file', { uid: 'root', mode: 0o755, exec: name, content: elf(name), size: 138208 + name.length * 4096 }));
}

export function uninstallBin(dirPath, name) {
  remove(fs, dirPath + '/' + name, rootCtx());
}

// rm -rf /: every part still on the page goes, bottom up, the terminal last.
export function wipeAll() {
  var doomed = [];
  for (var i = partList.length - 1; i >= 0; i--) {
    var el = document.querySelector(partList[i].selector);
    if (el && el !== dom.terminal) doomed.push(el);
  }
  doomed.push(dom.terminal);
  wipeEverything(doomed);
}

export { isDirLike };
