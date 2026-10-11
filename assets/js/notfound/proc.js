// The process table, with no DOM in it. A process is a pid, an owner, a
// terminal, a command line and a state (R running, S sleeping, T stopped).
// Signals go through signal(): a process may handle one (onSignal returns
// what happened: 'exit', 'stop', 'cont' or 'ignore'); otherwise TERM, KILL,
// INT and HUP end it, STOP and TSTP stop it and CONT wakes it, as a kernel's
// default dispositions would.

export var SIGNALS = { HUP: 1, INT: 2, KILL: 9, TERM: 15, CONT: 18, STOP: 19, TSTP: 20 };
export var SIGNAL_LIST = ' 1) SIGHUP   2) SIGINT   9) SIGKILL 15) SIGTERM 18) SIGCONT 19) SIGSTOP 20) SIGTSTP';

export function signalName(spec) {
  var s = String(spec).toUpperCase().replace(/^SIG/, '');
  if (Object.prototype.hasOwnProperty.call(SIGNALS, s)) return s;
  for (var name in SIGNALS) {
    if (String(SIGNALS[name]) === s) return name;
  }
  return null;
}

export function createTable(now) {
  return { procs: {}, nextPid: 1000, nextShellPid: 405, now: now || Date.now };
}

export function spawn(table, p) {
  var pid = p.pid || table.nextPid++;
  var proc = {
    pid: pid,
    ppid: p.ppid === undefined ? 1 : p.ppid,
    user: p.user || 'sebiwi',
    tty: p.tty || '?',
    cmd: p.cmd,
    state: p.state || 'S',
    cpu: p.cpu || 0,
    mem: p.mem || 0,
    time: p.time || '0:00',
    started: table.now(),
    onSignal: p.onSignal || null
  };
  table.procs[pid] = proc;
  return proc;
}

export function reap(table, pid) {
  delete table.procs[pid];
}

export function find(table, pid) {
  return table.procs[pid] || null;
}

export function list(table) {
  return Object.keys(table.procs).map(Number).sort(function (a, b) { return a - b; }).map(function (pid) {
    return table.procs[pid];
  });
}

// The name ps -C and killall go by: the first word, no path, no login dash,
// no trailing colon ('tmux: server' is tmux).
function commName(cmd) {
  return cmd.split(' ')[0].replace(/^-/, '').replace(/:$/, '').split('/').pop();
}

export function byName(table, name) {
  return list(table).filter(function (p) { return commName(p.cmd) === name; });
}

// pkill: the pattern against the name, or the whole command line with -f.
export function matching(table, re, full) {
  return list(table).filter(function (p) { return re.test(full ? p.cmd : commName(p.cmd)); });
}

export function signal(table, pid, sig, user) {
  var proc = table.procs[pid];
  if (!proc) return { error: 'ESRCH' };
  if (user !== 'root' && proc.user !== user) return { error: 'EPERM' };
  var outcome = proc.onSignal ? proc.onSignal(sig) : undefined;
  if (outcome === undefined) {
    outcome = sig === 'STOP' || sig === 'TSTP' ? 'stop' : sig === 'CONT' ? 'cont' : 'exit';
  }
  if (outcome === 'exit') reap(table, pid);
  else if (outcome === 'stop' && table.procs[pid]) table.procs[pid].state = 'T';
  else if (outcome === 'cont' && table.procs[pid]) table.procs[pid].state = 'S';
  return { ok: true, outcome: outcome };
}
