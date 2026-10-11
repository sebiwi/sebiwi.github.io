// tmux: sessions, windows, panes, the status line and the prefix key.

import { dom } from './dom.js';
import { copyEnv, envSet, envValue, leaveShell } from './env.js';
import { PACKAGES } from './ink.js';
import { jobs } from './jobs.js';
import { consume, renderLine, setCaret } from './lineeditor.js';
import { reap, spawn } from './proc.js';
import { spawnPaneShell, table } from './procs.js';
import { commands } from './registry.js';
import { printText, screenSink, styled } from './screen.js';
import { sh } from './state.js';
import { MONTHS, TIMES, padRight, two } from './util.js';

// ------------------------------------------------------------------- tmux

// One session, many windows. A window is a screen (the nodes above the live
// prompt, parked in an array while another screen shows) and a shell (its
// environment, its subshells, its $?). Attaching parks the page's own screen
// and shell the same way, and detaching puts them back.
export var TMUX_PID = 600;
export var TMUX_SOCKET = '/tmp/tmux-501/default';
export var tmux = null;
export var tmuxBar = null;
export var prefixArmed = false;
export var messageTimer = null;

export var TMUX_KEYS = [
  ['C-b c', 'new window'],
  ['C-b n', 'next window'],
  ['C-b p', 'previous window'],
  ['C-b l', 'last window'],
  ['C-b 0-9', 'select window'],
  ['C-b d', 'detach'],
  ['C-b %', 'split left and right'],
  ['C-b "', 'split top and bottom'],
  ['C-b o', 'next pane'],
  ['C-b ;', 'last pane'],
  ['C-b ←→↑↓', 'pane in that direction'],
  ['C-b x', 'kill the pane'],
  ['C-b z', 'zoom the pane'],
  ['C-b C-←→↑↓', 'resize by one'],
  ['C-b M-←→↑↓', 'resize by five'],
  ['C-b ?', 'this list']
];

export function takeScreen() {
  var nodes = [];
  while (dom.pre.firstChild !== dom.livePrompt) nodes.push(dom.pre.removeChild(dom.pre.firstChild));
  return nodes;
}

export function putScreen(nodes) {
  for (var i = 0; i < nodes.length; i++) dom.pre.insertBefore(nodes[i], dom.livePrompt);
  dom.pre.scrollTop = dom.pre.scrollHeight;
}

export function saveShell() {
  return { env: sh.env, shells: sh.shells, status: sh.lastStatus, pid: sh.pid, cwd: sh.cwd, uid: sh.uid };
}

export function loadShell(state) {
  sh.env = state.env;
  sh.shells = state.shells;
  sh.lastStatus = state.status;
  sh.pid = state.pid;
  sh.cwd = state.cwd;
  sh.uid = state.uid;
  sh.swapped = true;
}

// A pane is a screen and a shell. The current pane's screen is the live
// terminal itself; every other pane keeps its lines in a <pre> of its own,
// which is also what shows when its window is split.
export function newPane() {
  var env = [];
  for (var i = 0; i < tmux.env.length; i++) env.push(tmux.env[i].slice());
  var el = document.createElement('pre');
  el.className = 'term-404 term-pane';
  el.setAttribute('aria-hidden', 'true');
  var pane = { el: el, id: tmux.nextPane++, tty: tmux.nextTty++, state: { env: env, shells: [], status: 0, pid: tmux.nextPid, cwd: tmux.cwd, uid: tmux.uid } };
  tmux.nextPid += 10;
  // A pane's shell starts from the environment tmux was started with, one
  // level down, and knows it is inside tmux.
  var saved = sh.env;
  sh.env = env;
  envSet('SHLVL', String((parseInt(envValue('SHLVL'), 10) || 0) + 1));
  envSet('TMUX', TMUX_SOCKET + ',' + TMUX_PID + ',0');
  envSet('TMUX_PANE', '%' + pane.id);
  envSet('TERM', 'tmux-256comic');
  sh.env = saved;
  spawnPaneShell(pane.state.pid, 'ttys' + ('00' + pane.tty).slice(-3), tmux.uid);
  return pane;
}

// A window's layout is a tree, as in tmux: a leaf is a pane, and a split
// is two halves side by side (h) or one above the other (v). panes lists the
// leaves in order, which is the order o, list-panes and -t count in.
export function newWindow() {
  var pane = newPane();
  tmux.windows.push({ root: pane, panes: [pane], active: 0, last: 0 });
  return tmux.windows.length - 1;
}

export function leavesOf(node, out) {
  out = out || [];
  if (!node.dir) out.push(node);
  else {
    leavesOf(node.a, out);
    leavesOf(node.b, out);
  }
  return out;
}

export function parentOf(node, child) {
  if (!node.dir) return null;
  if (node.a === child || node.b === child) return node;
  return parentOf(node.a, child) || parentOf(node.b, child);
}

export function replaceNode(win, node, other) {
  var parent = parentOf(win.root, node);
  if (!parent) win.root = other;
  else if (parent.a === node) parent.a = other;
  else parent.b = other;
  win.panes = leavesOf(win.root);
}

// Whether a pane reaches the given edge (start or end) of a node along dir:
// the border there belongs to it, and turns green when it is current.
export function touches(node, pane, dir, edge) {
  if (node === pane) return true;
  if (!node.dir) return false;
  if (node.dir === dir) return touches(edge === 'end' ? node.b : node.a, pane, dir, edge);
  return touches(node.a, pane, dir, edge) || touches(node.b, pane, dir, edge);
}

export function currentWindow() {
  return tmux.windows[tmux.current];
}

export function currentPane() {
  var win = currentWindow();
  return win.panes[win.active];
}

// The live screen goes back into the pane's own <pre>, and the shell with it.
// A pane waiting in the background still shows its prompt, minus the cursor.
export function parkPane() {
  var pane = currentPane();
  var nodes = takeScreen();
  for (var i = 0; i < nodes.length; i++) pane.el.appendChild(nodes[i]);
  var idle = styled('term-idle', '');
  idle.appendChild(styled('term-prompt', sh.uid === 'root' ? '#' : '$'));
  pane.el.appendChild(idle);
  pane.state = saveShell();
}

export function showPane() {
  var pane = currentPane();
  var nodes = [];
  while (pane.el.firstChild) {
    var node = pane.el.removeChild(pane.el.firstChild);
    if (!node.classList || !node.classList.contains('term-idle')) nodes.push(node);
  }
  putScreen(nodes);
  loadShell(pane.state);
}

// A split window nests its halves in boxes, with the live terminal in the
// current pane's place. The border between two halves is green when the
// current pane runs along it. Moving the live <pre> drops focus, so focus
// comes back with it.
export var panesBox = null;

export function boxFor(win, node) {
  var active = win.panes[win.active];
  if (!node.dir) return node === active ? dom.pre : node.el;
  var box = node.box || (node.box = document.createElement('div'));
  box.className = 'term-split is-' + node.dir;
  while (box.firstChild) box.removeChild(box.firstChild);
  var first = boxFor(win, node.a);
  var second = boxFor(win, node.b);
  first.style.flexGrow = String(node.ratio);
  second.style.flexGrow = String(1 - node.ratio);
  first.classList.remove('is-hot');
  second.classList.toggle('is-hot', touches(node.a, active, node.dir, 'end') || touches(node.b, active, node.dir, 'start'));
  box.appendChild(first);
  box.appendChild(second);
  return box;
}

export function layout() {
  var focused = document.activeElement === dom.input;
  var win = tmux && tmux.attached ? currentWindow() : null;
  if (!win || !win.root.dir || win.zoomed) {
    if (panesBox && panesBox.parentNode) {
      panesBox.parentNode.insertBefore(dom.pre, panesBox);
      panesBox.parentNode.removeChild(panesBox);
    }
    dom.pre.classList.remove('is-hot');
    dom.pre.style.flexGrow = '';
  } else {
    if (!panesBox) {
      panesBox = document.createElement('div');
      panesBox.className = 'term-panes';
    }
    if (!panesBox.parentNode) dom.pre.parentNode.insertBefore(panesBox, dom.pre);
    while (panesBox.firstChild) panesBox.removeChild(panesBox.firstChild);
    panesBox.appendChild(boxFor(win, win.root));
    for (var j = 0; j < win.panes.length; j++) {
      var el = j === win.active ? dom.pre : win.panes[j].el;
      el.scrollTop = el.scrollHeight;
    }
  }
  if (focused) dom.input.focus({ preventScroll: true });
}

export function park() {
  parkPane();
}

export function show(index) {
  if (index !== tmux.current) tmux.last = tmux.current;
  tmux.current = index;
  showPane();
  layout();
  renderBar();
}

export function selectWindow(index) {
  if (index === tmux.current) return;
  park();
  show(index);
}

export function selectPane(index) {
  var win = currentWindow();
  if (index === win.active || index < 0 || index >= win.panes.length) return;
  unzoom(win);
  parkPane();
  win.last = win.active;
  win.active = index;
  showPane();
  layout();
}

// Zoom: the current pane takes the whole window until it is toggled back,
// or until another pane is picked or a split is made.
export function toggleZoom() {
  var win = currentWindow();
  if (!win.root.dir) return;
  win.zoomed = !win.zoomed;
  layout();
  renderBar();
}

export function unzoom(win) {
  if (!win.zoomed) return;
  win.zoomed = false;
  layout();
  renderBar();
}

// Resizing moves a border, the way resize-pane does: -L and -R move the
// nearest left-right border around the current pane that way, -U and -D the
// nearest top-bottom one. A half never shrinks below a few cells.
export var MIN_PANE_PX = 48;

export function setRatio(node, px) {
  var box = node.box.getBoundingClientRect();
  var size = node.dir === 'h' ? box.width : box.height;
  if (!size) return;
  var min = Math.min(0.45, MIN_PANE_PX / size);
  node.ratio = Math.max(min, Math.min(1 - min, px / size));
}

export function resizePane(way, cells) {
  var win = currentWindow();
  var dir = way === 'Left' || way === 'Right' ? 'h' : 'v';
  var split = parentOf(win.root, win.panes[win.active]);
  while (split && split.dir !== dir) split = parentOf(win.root, split);
  if (!split || win.zoomed) return;
  var probe = styled('', '0000000000');
  dom.pre.insertBefore(probe, dom.livePrompt);
  var rect = probe.getBoundingClientRect();
  dom.pre.removeChild(probe);
  var cell = dir === 'h' ? rect.width / 10 : rect.height;
  var box = split.box.getBoundingClientRect();
  var size = dir === 'h' ? box.width : box.height;
  var sign = way === 'Left' || way === 'Up' ? -1 : 1;
  setRatio(split, split.ratio * size + sign * cells * (cell || 8));
  layout();
}

// Dragging a border with the mouse (or a finger) moves it, as in tmux with
// the mouse on. A border is the leading edge of a split's second half.
export var drag = null;
export var dragged = false;

export function borderAt(target, x, y) {
  var win = currentWindow();
  for (var el = target; el && el !== panesBox; el = el.parentNode) {
    var parent = el.parentNode;
    if (!parent || !parent.classList || !parent.classList.contains('term-split') || el !== parent.lastChild) continue;
    var r = el.getBoundingClientRect();
    var across = parent.classList.contains('is-h');
    if (Math.abs(across ? x - r.left : y - r.top) > 6) continue;
    var nodes = [win.root];
    while (nodes.length) {
      var n = nodes.pop();
      if (!n.dir) continue;
      if (n.box === parent) return n;
      nodes.push(n.a, n.b);
    }
  }
  return null;
}

export function startDrag(e) {
  if (!tmux || !tmux.attached || jobs.fg || !panesBox || !panesBox.parentNode) return;
  var node = borderAt(e.target, e.clientX, e.clientY);
  if (!node) return;
  e.preventDefault();
  drag = node;
  dragged = true;
  document.addEventListener('pointermove', moveDrag);
  document.addEventListener('pointerup', endDrag);
}

export function moveDrag(e) {
  var box = drag.box.getBoundingClientRect();
  setRatio(drag, drag.dir === 'h' ? e.clientX - box.left : e.clientY - box.top);
  layout();
}

export function endDrag() {
  drag = null;
  document.removeEventListener('pointermove', moveDrag);
  document.removeEventListener('pointerup', endDrag);
}

// A split halves the current pane and nothing else. tmux refuses one that
// leaves a half too narrow or too short, and so does this.
export function roomFor(win, dir) {
  var probe = styled('', '0000000000');
  dom.pre.insertBefore(probe, dom.livePrompt);
  var rect = probe.getBoundingClientRect();
  dom.pre.removeChild(probe);
  var height = win.root.dir ? dom.pre.clientHeight : parseFloat(window.getComputedStyle(dom.pre).maxHeight);
  var cols = Math.floor(dom.pre.clientWidth / (rect.width / 10 || 8));
  var rows = Math.floor(height / (rect.height || 20)) || 10;
  return dir === 'h' ? Math.floor(cols / 2) - 2 >= 12 : Math.floor(rows / 2) >= 3;
}

// % splits the current pane left and right, " top and bottom, and the new
// half becomes current.
export function splitPane(dir) {
  var win = currentWindow();
  unzoom(win);
  if (!roomFor(win, dir)) {
    tmuxMessage('no space for new pane');
    return false;
  }
  parkPane();
  var old = win.panes[win.active];
  var fresh = newPane();
  replaceNode(win, old, { dir: dir, a: old, b: fresh, ratio: 0.5 });
  win.last = win.panes.indexOf(old);
  win.active = win.panes.indexOf(fresh);
  showPane();
  layout();
  return true;
}

export function attach() {
  tmux.outside = { nodes: takeScreen(), state: saveShell() };
  tmux.attached = true;
  show(tmux.current);
}

// Back to the page's own screen and shell, with tmux's parting words on it.
export function leaveTmux(message) {
  tmux.attached = false;
  layout();
  putScreen(tmux.outside.nodes);
  tmux.outside.state.status = 0; // the tmux client that just returned
  loadShell(tmux.outside.state);
  tmux.outside = null;
  prefixArmed = false;
  renderBar();
  printText(message);
}

export function detach() {
  park();
  leaveTmux('[detached (from session 0)]');
}

// A pane's shell and its subshells leave the process table with the pane.
export function reapPane(pane) {
  var st = pane === currentPane() && tmux.attached ? sh : pane.state;
  reap(table, st.pid);
  for (var i = 0; i < st.shells.length; i++) reap(table, st.shells[i].pid);
}

// The pane's shell is gone: the pane goes with it, the window with its last
// pane, and the session with the last window.
export function closePane() {
  var win = currentWindow();
  var gone = win.panes[win.active];
  var before = win.panes[win.last];
  win.zoomed = false;
  reapPane(gone);
  takeScreen();
  if (win.root !== gone) {
    // The other half takes the space, and tmux falls back to the pane used
    // before this one.
    var parent = parentOf(win.root, gone);
    var sibling = parent.a === gone ? parent.b : parent.a;
    replaceNode(win, parent, sibling);
    var next = before !== gone ? before : leavesOf(sibling)[0];
    win.active = win.last = win.panes.indexOf(next);
    showPane();
    layout();
    return;
  }
  tmux.windows.splice(tmux.current, 1);
  if (!tmux.windows.length) {
    leaveTmux('[exited]');
    reap(table, TMUX_PID);
    tmux = null;
    return;
  }
  tmux.last = 0;
  tmux.current = Math.min(tmux.current, tmux.windows.length - 1);
  showPane();
  layout();
  renderBar();
}

export function killServer() {
  for (var w = 0; w < tmux.windows.length; w++) {
    for (var p = 0; p < tmux.windows[w].panes.length; p++) reapPane(tmux.windows[w].panes[p]);
  }
  reap(table, TMUX_PID);
  if (tmux.attached) {
    takeScreen();
    leaveTmux('[server exited]');
  }
  tmux = null;
}

// Leaving the current shell: a subshell hands back to its parent, a tmux
// window closes, and only the shell the page started with is left to
// power the site off.
export function exitShell() {
  if (sh.shells.length) {
    leaveShell();
    return true;
  }
  if (tmux && tmux.attached) {
    closePane();
    return true;
  }
  return false;
}

export function tmuxStamp(date) {
  return TIMES[date.getDay()] + ' ' + MONTHS[date.getMonth()] + ' ' + two(date.getDate()) + ' ' +
    two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds()) + ' ' + date.getFullYear();
}

// The status line: the session, the windows (* current, - last), and on the
// right the host and the time. Built on first attach; hidden when detached.
export function renderBar() {
  if (!tmuxBar) {
    tmuxBar = document.createElement('div');
    tmuxBar.className = 'term-tmux';
    tmuxBar.appendChild(document.createElement('span'));
    tmuxBar.appendChild(document.createElement('span'));
    dom.pre.parentNode.appendChild(tmuxBar);
  }
  tmuxBar.hidden = !(tmux && tmux.attached);
  if (tmuxBar.hidden || tmuxBar.classList.contains('is-message')) return;
  var names = [];
  for (var i = 0; i < tmux.windows.length; i++) {
    names.push(i + ':sebiwish' + (i === tmux.current ? '*' : i === tmux.last ? '-' : '') + (tmux.windows[i].zoomed ? 'Z' : ''));
  }
  var now = new Date();
  tmuxBar.firstChild.textContent = '[0] ' + names.join(' ');
  tmuxBar.lastChild.textContent = '"sebiwi@scoreplay" ' + two(now.getHours()) + ':' + two(now.getMinutes()) + ' ' +
    two(now.getDate()) + '-' + MONTHS[now.getMonth()] + '-' + String(now.getFullYear()).slice(2);
}

// display-message: the status line says one thing, briefly.
export function tmuxMessage(text) {
  renderBar();
  window.clearTimeout(messageTimer);
  tmuxBar.classList.add('is-message');
  tmuxBar.firstChild.textContent = text;
  tmuxBar.lastChild.textContent = '';
  messageTimer = window.setTimeout(function () {
    tmuxBar.classList.remove('is-message');
    renderBar();
  }, 2000);
}

export function listKeys(out) {
  for (var i = 0; i < TMUX_KEYS.length; i++) out.text(padRight(TMUX_KEYS[i][0], 12) + TMUX_KEYS[i][1]);
}

// Arrows go by what is on the screen: the nearest pane on that side that
// overlaps this one, and the most overlap when two are as near. At the
// edge they stop (tmux would wrap; this is close enough to feel right).
export function movePane(way) {
  var win = currentWindow();
  var a = dom.pre.getBoundingClientRect();
  var best = -1;
  var bestGap = Infinity;
  var bestOverlap = 0;
  for (var i = 0; i < win.panes.length; i++) {
    if (i === win.active) continue;
    var r = win.panes[i].el.getBoundingClientRect();
    var across = way === 'Left' || way === 'Right';
    var gap = way === 'Left' ? a.left - r.right : way === 'Right' ? r.left - a.right :
      way === 'Up' ? a.top - r.bottom : r.top - a.bottom;
    var overlap = across ? Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top) :
      Math.min(r.right, a.right) - Math.max(r.left, a.left);
    if (gap < -2 || overlap <= 0) continue;
    if (gap < bestGap - 2 || (Math.abs(gap - bestGap) <= 2 && overlap > bestOverlap)) {
      best = i;
      bestGap = gap;
      bestOverlap = overlap;
    }
  }
  if (best !== -1) selectPane(best);
}

// step: how far a modified arrow resizes, 1 cell with ctrl and 5 with alt.
// Those keys repeat, as tmux's do: for half a second another one needs no
// prefix.
export var repeatUntil = 0;

export function tmuxKey(key, step) {
  var count = tmux.windows.length;
  if (/^Arrow/.test(key) && step) {
    resizePane(key.slice(5), step);
    repeatUntil = Date.now() + 500;
    return;
  }
  if (key === 'd') detach();
  else if (key === 'c') selectWindow(newWindow());
  else if (key === 'n') selectWindow((tmux.current + 1) % count);
  else if (key === 'p') selectWindow((tmux.current + count - 1) % count);
  else if (key === 'l') selectWindow(tmux.last < count ? tmux.last : tmux.current);
  else if (key === '%') splitPane('h');
  else if (key === '"') splitPane('v');
  else if (key === 'o') selectPane((currentWindow().active + 1) % currentWindow().panes.length);
  else if (key === ';') selectPane(currentWindow().last);
  else if (key === 'x') closePane();
  else if (key === 'z') toggleZoom();
  else if (/^Arrow/.test(key)) movePane(key.slice(5));
  else if (key === '?') listKeys(screenSink);
  else if (/^[0-9]$/.test(key)) {
    var index = parseInt(key, 10);
    if (index < count) selectWindow(index);
    else tmuxMessage("can't find window: " + index);
  }
}

export var TMUX_SUBCOMMANDS = {
  'new': 'new', 'new-session': 'new',
  attach: 'attach', a: 'attach', at: 'attach', 'attach-session': 'attach',
  ls: 'ls', 'list-sessions': 'ls',
  detach: 'detach', 'detach-client': 'detach',
  'kill-server': 'kill', 'kill-session': 'kill',
  'new-window': 'neww', neww: 'neww',
  'next-window': 'next', next: 'next',
  'previous-window': 'prev', prev: 'prev',
  'split-window': 'split', splitw: 'split',
  'select-pane': 'selectp', selectp: 'selectp',
  'kill-pane': 'killp', killp: 'killp',
  'list-panes': 'lsp', lsp: 'lsp',
  'resize-pane': 'resizep', resizep: 'resizep',
  'list-keys': 'keys', lsk: 'keys'
};

export function tmuxRun(args, io) {
  if (args[0] === '-V') {
    io.out.text('tmux ' + PACKAGES.tmux.version);
    return 0;
  }
  var sub = TMUX_SUBCOMMANDS[args[0] || 'new'];
  if (!sub) {
    io.out.text('unknown command: ' + args[0]);
    return 1;
  }
  var inside = tmux && tmux.attached;
  if (sub === 'new' || sub === 'attach') {
    if (envValue('TMUX') || inside) {
      io.out.text('sessions should be nested with care, unset $TMUX to force');
      return 1;
    }
    if (sub === 'attach' && !tmux) {
      io.out.text('no sessions');
      return 1;
    }
    if (!io.tty) {
      io.out.text('open terminal failed: not a terminal');
      return 1;
    }
    // One session is plenty here: tmux with one already running joins it.
    if (!tmux) {
      tmux = { windows: [], current: 0, last: 0, attached: false, env: copyEnv(), created: new Date(), outside: null, nextPid: TMUX_PID + 1, nextPane: 0, nextTty: 5, cwd: sh.cwd, uid: sh.uid };
      spawn(table, {
        pid: TMUX_PID, cmd: 'tmux: server', mem: 0.3, user: sh.uid,
        onSignal: function (sig) {
          if (sig === 'STOP' || sig === 'TSTP' || sig === 'CONT') return undefined;
          killServer();
          return 'exit';
        }
      });
      newWindow();
    }
    attach();
    return 0;
  }
  if (sub === 'ls' || sub === 'kill') {
    if (!tmux) {
      io.out.text('no server running on ' + TMUX_SOCKET);
      return 1;
    }
    if (sub === 'kill') {
      killServer();
      return 0;
    }
    var count = tmux.windows.length;
    io.out.text('0: ' + count + ' window' + (count === 1 ? '' : 's') + ' (created ' + tmuxStamp(tmux.created) + ')' +
      (inside ? ' (attached)' : ''));
    return 0;
  }
  if (sub === 'keys') {
    listKeys(io.out);
    return 0;
  }
  if (!inside) {
    io.out.text('no current client');
    return 1;
  }
  if (sub === 'detach') detach();
  else if (sub === 'neww') selectWindow(newWindow());
  else if (sub === 'next') tmuxKey('n');
  else if (sub === 'prev') tmuxKey('p');
  else if (sub === 'split') return splitPane(args.indexOf('-h') !== -1 ? 'h' : 'v') ? 0 : 1;
  else if (sub === 'killp') closePane();
  else if (sub === 'resizep') {
    var sizeWays = { '-L': 'Left', '-R': 'Right', '-U': 'Up', '-D': 'Down' };
    if (args.indexOf('-Z') !== -1) toggleZoom();
    for (var r = 1; r < args.length; r++) {
      if (sizeWays[args[r]]) resizePane(sizeWays[args[r]], parseInt(args[r + 1], 10) || 1);
    }
  }
  else if (sub === 'selectp') {
    var flag = args[1] || '';
    var ways = { '-L': 'Left', '-R': 'Right', '-U': 'Up', '-D': 'Down' };
    if (ways[flag]) movePane(ways[flag]);
    else if (flag === '-t' && /^%?\d+$/.test(args[2] || '')) {
      var win = currentWindow();
      var target = parseInt(args[2].replace('%', ''), 10);
      var found = -1;
      for (var p = 0; p < win.panes.length; p++) {
        if (args[2].charAt(0) === '%' ? win.panes[p].id === target : p === target) found = p;
      }
      if (found === -1) {
        io.out.text("can't find pane: " + args[2]);
        return 1;
      }
      selectPane(found);
    }
  } else if (sub === 'lsp') {
    var panes = currentWindow().panes;
    for (var q = 0; q < panes.length; q++) {
      io.out.text(q + ': [' + 'sebiwish' + '] %' + panes[q].id +
        (q === currentWindow().active ? ' (active)' : ''));
    }
  }
  return 0;
}

// tmux sees keys before the shell does: ctrl+b arms the prefix, and the
// next key (modifiers aside) is a tmux command, not typing. Returns true
// when the key was tmux's.
export function tmuxKeydown(e, chord, key, at) {
  if (!tmux || !tmux.attached) return false;
  if (prefixArmed) {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return true;
    consume(e);
    prefixArmed = false;
    if (chord && key === 'b') setCaret(at - 1); // the prefix twice sends it through
    else tmuxKey(e.key, e.ctrlKey ? 1 : e.altKey ? 5 : 0);
    renderLine(); // the pane, and its title, may have changed
    return true;
  }
  if (/^Arrow/.test(e.key) && (e.ctrlKey || e.altKey) && Date.now() < repeatUntil) {
    consume(e);
    tmuxKey(e.key, e.ctrlKey ? 1 : 5);
    renderLine();
    return true;
  }
  if (chord && key === 'b') {
    consume(e);
    prefixArmed = true;
    return true;
  }
  return false;
}

export function getTmux() {
  return tmux;
}

// The mouse: borders drag, and the pointer shows where one can.
export function initTmuxMouse() {
  dom.terminal.addEventListener('pointerdown', function (e) {
    dragged = false;
    startDrag(e);
  });

  // Over a border, the pointer turns into a resize arrow.
  dom.terminal.addEventListener('pointermove', function (e) {
    if (drag || !panesBox || !panesBox.parentNode || !tmux || !tmux.attached) return;
    var node = borderAt(e.target, e.clientX, e.clientY);
    panesBox.classList.toggle('is-col', !!node && node.dir === 'h');
    panesBox.classList.toggle('is-row', !!node && node.dir === 'v');
  });
}

// tmux with the mouse on: clicking a pane selects it, unless the click
// ends the drag of a border.
export function paneClick(e) {
  var pane = e.target.closest('.term-pane');
  if (dragged) {
    dragged = false;
    pane = null;
  }
  if (pane && tmux && tmux.attached && !jobs.fg) {
    var panes = currentWindow().panes;
    for (var i = 0; i < panes.length; i++) {
      if (panes[i].el === pane) selectPane(i);
    }
  }
}

// Every shell state that is not the live one: the panes not on screen, and
// the page's own shell while tmux has the screen.
export function shellStates() {
  var out = [];
  if (!tmux) return out;
  if (tmux.attached && tmux.outside) out.push({ state: tmux.outside.state, pane: null });
  for (var w = 0; w < tmux.windows.length; w++) {
    var panes = tmux.windows[w].panes;
    for (var p = 0; p < panes.length; p++) {
      if (tmux.attached && panes[p] === currentPane()) continue;
      out.push({ state: panes[p].state, pane: panes[p] });
    }
  }
  return out;
}

// A pane whose shell was killed goes, even when it is not the one on screen.
export function closePaneOf(pane) {
  if (!tmux) return;
  if (tmux.attached && pane === currentPane()) {
    closePane();
    return;
  }
  for (var w = 0; w < tmux.windows.length; w++) {
    var win = tmux.windows[w];
    if (win.panes.indexOf(pane) === -1) continue;
    reapPane(pane);
    if (win.root === pane) {
      tmux.windows.splice(w, 1);
      if (!tmux.windows.length) {
        if (tmux.attached) leaveTmux('[exited]');
        reap(table, TMUX_PID);
        tmux = null;
        return;
      }
      if (w < tmux.current) tmux.current--;
      tmux.last = 0;
      renderBar();
      return;
    }
    var active = win.panes[win.active];
    var parent = parentOf(win.root, pane);
    replaceNode(win, parent, parent.a === pane ? parent.b : parent.a);
    win.active = win.last = Math.max(0, win.panes.indexOf(active));
    if (tmux.attached && win === currentWindow()) layout();
    return;
  }
}

// An ink package: on $PATH (so runnable) only once drawn into /usr/bin.
commands.tmux = tmuxRun;
