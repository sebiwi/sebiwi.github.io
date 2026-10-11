// The processes this page runs. hugo serves the site (pid 1, root's).
// sebiwish is the login shell (42). Each part of the page has a daemon
// drawing it: kill the daemon and the part goes; rm the part and its daemon
// exits. Subshells, tmux and jobs come and go on top.

import { createTable, spawn, reap, find } from './proc.js';
import { purge } from './vfs.js';
import { fs, partNodes, wipeAll } from './fsview.js';
import { getTmux, currentPane, shellStates, closePaneOf } from './tmux.js';
import { sh } from './state.js';
import { powerOff } from './pageparts.js';

export var table = createTable();
export var LOGIN_PID = 42;

var DAEMONS = {
  nav: { pid: 211, cmd: 'navd', cpu: 0.1, mem: 0.2 },
  controls: { pid: 212, cmd: 'controlsd', cpu: 0, mem: 0.1 },
  'hint.txt': { pid: 404, cmd: 'pencil', cpu: 4, mem: 0.4 }
};

export function currentTty() {
  var tmux = getTmux();
  return tmux && tmux.attached ? 'ttys' + ('00' + currentPane().tty).slice(-3) : 'ttys004';
}

// A daemon's signals land on its part: STOP greys it out, CONT brings it
// back, anything fatal removes it, wherever it was moved or linked.
function daemonSignal(part) {
  return function (sig) {
    var el = document.querySelector(part.selector);
    if (sig === 'STOP' || sig === 'TSTP') {
      if (el) el.classList.add('is-stopped');
      return 'stop';
    }
    if (sig === 'CONT') {
      if (el) el.classList.remove('is-stopped');
      return 'cont';
    }
    purge(fs, part); // the removed hook reaps this process
    return 'exit';
  };
}

function hugoSignal(sig) {
  if (sig === 'STOP' || sig === 'TSTP' || sig === 'CONT') return undefined;
  wipeAll(); // the site stops being served, so the page stops being there
  return 'exit';
}

// An interactive shell shrugs off TERM and INT. KILL and HUP end it, and
// whatever ran inside it.
function shellSignal(pid) {
  return function (sig) {
    if (sig !== 'KILL' && sig !== 'HUP') return 'ignore';
    killShell(pid);
    return 'exit';
  };
}

function trimState(st, pid, live) {
  var pids = st.shells.map(function (s) { return s.pid; }).concat([st.pid]);
  var level = pids.indexOf(pid);
  if (level === -1) return false;
  for (var i = level; i < pids.length; i++) reap(table, pids[i]);
  if (level === 0) return 'outermost';
  var parent = st.shells[level - 1];
  st.shells = st.shells.slice(0, level - 1);
  st.env = parent.env;
  st.cwd = parent.cwd;
  st.uid = parent.uid;
  st.pid = parent.pid;
  if (live) sh.shells = st.shells;
  return true;
}

function killShell(pid) {
  if (pid === LOGIN_PID) {
    powerOff();
    return;
  }
  var tmux = getTmux();
  var outcome = trimState(sh, pid, true);
  if (outcome === 'outermost') {
    if (tmux && tmux.attached) closePaneOf(currentPane());
    return;
  }
  if (outcome) return;
  var parked = shellStates();
  for (var i = 0; i < parked.length; i++) {
    outcome = trimState(parked[i].state, pid, false);
    if (outcome === 'outermost' && parked[i].pane) closePaneOf(parked[i].pane);
    if (outcome) return;
  }
}

export function spawnShell(parentPid) {
  var proc = spawn(table, {
    pid: table.nextShellPid++,
    ppid: parentPid,
    user: sh.uid,
    tty: currentTty(),
    cmd: 'sebiwish',
    mem: 0.1
  });
  proc.onSignal = shellSignal(proc.pid);
  return proc.pid;
}

export function reapShell(pid) {
  reap(table, pid);
}

// A pane's shell, with the pid tmux gave it.
export function spawnPaneShell(pid, tty, user) {
  spawn(table, { pid: pid, ppid: 600, user: user, tty: tty, cmd: 'sebiwish', mem: 0.1, onSignal: shellSignal(pid) });
}

export function initProcs() {
  spawn(table, { pid: 1, ppid: 0, user: 'root', cmd: 'hugo server', cpu: 0.4, mem: 0.4, time: '0:04', onSignal: hugoSignal });
  spawn(table, { pid: LOGIN_PID, user: 'sebiwi', tty: 'ttys004', cmd: 'sebiwish', mem: 0.1, onSignal: shellSignal(LOGIN_PID) });
  spawn(table, { pid: 1998, user: 'sebiwi', cmd: 'coffee --refill', cpu: 0.1 });
  var parts = partNodes();
  for (var i = 0; i < parts.length; i++) {
    var d = DAEMONS[parts[i].part];
    if (parts[i].part === 'terminal') {
      parts[i].pid = LOGIN_PID; // the terminal is the login shell's window
      continue;
    }
    if (!d) continue;
    parts[i].pid = d.pid;
    spawn(table, { pid: d.pid, user: 'sebiwi', cmd: d.cmd, cpu: d.cpu, mem: d.mem, onSignal: daemonSignal(parts[i]) });
  }
}

export { find };
