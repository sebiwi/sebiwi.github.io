// The system: processes, jobs, shells, and powering off.

import { numberFlag, operandsWithout } from '../args.js';
import { USERS, idLine } from '../auth.js';
import { dom } from '../dom.js';
import { enterShell, envValue, leaveShell } from '../env.js';
import { execute, findCommand, runScript } from '../exec.js';
import { inputLines } from '../fileio.js';
import { ctx, fs, historyKept } from '../fsview.js';
import { HISTORY_FILE, hist, saveHistory } from '../history.js';
import { describe, endJob, findJob, jobs, markerOf, resumeJob, startJob, stopJob, stoppedJobs } from '../jobs.js';
import { probeHost, resolveHost } from '../net/net.js';
import { replyLine, summary, timeoutLine } from '../net/pinglogic.js';
import { powerOff } from '../pageparts.js';
import { SIGNAL_LIST, byName, list, matching, reap, signal, signalName, spawn } from '../proc.js';
import { currentTty, table } from '../procs.js';
import { BUILTINS, commands } from '../registry.js';
import { textNode } from '../screen.js';
import { ALIASES, sh } from '../state.js';
import { calendar } from '../text/cal.js';
import { exitShell } from '../tmux.js';
import { MONTHS, TIMES, clockTime, pad, padRight, two } from '../util.js';
import { ERR, isDirLike, lookup, readLines } from '../vfs.js';

// uname fields, keyed by flag letter. -a prints them in this order.
export var UNAME = [
  ['s', 'sebiwiOS'],
  ['n', 'scoreplay'],
  ['r', '4.0.4-comic'],
  ['v', '#1 SMP PREEMPT_HANDDRAWN Sun Jul 13 07:19:00 UTC 2026'],
  ['m', 'pencil64'],
  ['o', 'sebiwiOS']
];

export var YES_LIMIT = 300; // yes runs forever, within reason

// ps and top list themselves, as the real ones do: they are processes too
// for as long as they run.
export function self(cmd) {
  return spawn(table, { cmd: cmd, tty: currentTty(), state: 'R' });
}

export function psRow(p) {
  return padRight(p.user, 8) + pad(String(p.pid), 5) + pad(p.cpu.toFixed(1), 5) + pad(p.mem.toFixed(1), 5) + ' ' +
    padRight(p.tty, 8) + ' ' + padRight(p.state, 4) + ' ' + p.time + ' ' + p.cmd;
}

// -e, -A, aux, ax and -ef all mean everything; plain ps means this terminal.
export function wantsAll(args) {
  for (var i = 0; i < args.length; i++) {
    if (/[aeAx]/.test(args[i])) return true;
  }
  return false;
}

export function parseSignalArgs(args, io, name) {
  var sig = 'TERM';
  var rest = [];
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    var spec = null;
    if (a === '-s' || a === '-n') spec = args[++i] || '';
    else if (a.charAt(0) === '-' && a.length > 1 && !rest.length && a !== '-f') spec = a.slice(1);
    if (spec === null) {
      rest.push(a);
      continue;
    }
    var named = signalName(spec);
    if (!named) {
      io.out.text(name + ': ' + spec + ': invalid signal specification');
      return null;
    }
    sig = named;
  }
  return { sig: sig, rest: rest };
}

// One frame of top: the header and every process, its own job included.
export function topFrame() {
  var lines = [];
  var procs = list(table);
  var counts = { R: 0, S: 0, T: 0 };
  for (var i = 0; i < procs.length; i++) counts[procs[i].state] = (counts[procs[i].state] || 0) + 1;
  lines.push('top - ' + clockTime() + ' up 4 days,  4:04,  1 user,  load average: 0.04, 0.04, 0.04');
  lines.push('Tasks: ' + pad(String(procs.length), 3) + ' total, ' + pad(String(counts.R), 3) + ' running, ' +
    pad(String(counts.S), 3) + ' sleeping, ' + pad(String(counts.T), 3) + ' stopped');
  lines.push('  PID USER      %CPU %MEM S COMMAND');
  for (var j = 0; j < procs.length; j++) {
    var p = procs[j];
    lines.push(pad(String(p.pid), 5) + ' ' + padRight(p.user, 8) + ' ' + pad(p.cpu.toFixed(1), 4) + ' ' + pad(p.mem.toFixed(1), 4) + ' ' + p.state + ' ' + p.cmd);
  }
  return lines;
}

Object.assign(commands, {
  which: function (args, io) {
    var status = 0;
    for (var i = 0; i < args.length; i++) {
      var found = findCommand(args[i]);
      if (found.path) {
        io.out.text(found.path);
      } else {
        io.out.text('which: no ' + args[i] + ' in (' + (envValue('PATH') || '') + ')');
        status = 1;
      }
    }
    return status;
  },

  history: function (args, io) {
    if (!historyKept()) {
      io.out.text('sebiwish: history: ' + HISTORY_FILE + ': No such file or directory');
      return 1;
    }
    if (args[0] === '-c') {
      hist.lines = [];
      hist.index = 0;
      saveHistory();
      return;
    }
    for (var i = 0; i < hist.lines.length; i++) {
      io.out.text(pad(String(i + 1), 5) + '  ' + hist.lines[i]);
    }
  },

  clear: function () {
    while (dom.pre.firstChild !== dom.livePrompt) {
      dom.pre.removeChild(dom.pre.firstChild);
    }
  },

  date: function (args, io) {
    var now = new Date();
    io.out.text(TIMES[now.getDay()] + ' ' + MONTHS[now.getMonth()] + ' ' + two(now.getDate()) + ' ' +
      clockTime() + ' PENCIL ' + now.getFullYear());
  },

  uptime: function (args, io) {
    io.out.text(' ' + clockTime() + '  up 4 days,  4:04,  1 user,  load average: 0.04, 0.04, 0.04');
  },

  uname: function (args, io) {
    var picked = {};
    var any = false;
    for (var i = 0; i < args.length; i++) {
      if (args[i].charAt(0) !== '-') {
        io.out.text("uname: extra operand '" + args[i] + "'");
        return 1;
      }
      var flags = args[i] === '--all' ? 'a' : args[i].slice(1);
      for (var j = 0; j < flags.length; j++) {
        var c = flags.charAt(j);
        if (c === 'a') {
          for (var k = 0; k < UNAME.length; k++) picked[UNAME[k][0]] = true;
        } else if (c === 'p' || c === 'i') {
          picked.m = true; // processor and hardware platform: also pencil64
        } else {
          var known = false;
          for (var m = 0; m < UNAME.length; m++) {
            if (UNAME[m][0] === c) known = true;
          }
          if (!known) {
            io.out.text("uname: invalid option -- '" + c + "'");
            return 1;
          }
          picked[c] = true;
        }
      }
      any = true;
    }
    if (!any) picked.s = true;
    var parts = [];
    for (var n = 0; n < UNAME.length; n++) {
      if (picked[UNAME[n][0]]) parts.push(UNAME[n][1]);
    }
    io.out.text(parts.join(' '));
  },

  df: function (args, io) {
    io.out.text('Filesystem      Size  Used Avail Use% Mounted on');
    io.out.text('/dev/pencil0    404M  400M  4.0M  99% /');
    io.out.text('sketchbook       42M   42M     0 100% /comics');
    io.out.text('tmpfs           4.0M  1.2M  2.8M  30% /tmp');
  },

  // A real ping, as real as a page gets: the name is resolved with DNS (an
  // unknown host fails like ping does), then one timed HTTPS request a
  // second stands in for each echo request. See net/net.js.
  ping: function (args, io) {
    var host = operandsWithout(args, 'c')[0];
    if (!host) {
      io.out.text('ping: usage error: Destination address required');
      return 2;
    }
    // A pipeline runs to the end before anything could come back.
    if (!io.async) {
      io.out.text('ping: replies arrive after a pipe has closed: run ping on its own, or with &');
      return 2;
    }
    var count = numberFlag(args, 'c', null);
    if (count !== null && !(count > 0)) {
      io.out.text("ping: invalid count of packets to transmit: `" + args[args.indexOf('-c') + 1] + "'");
      return 64; // EX_USAGE, as macOS ping
    }
    var ip = null;
    var sent = 0;
    var waiting = 0;
    var times = [];
    var job;

    function send() {
      if (count !== null && sent >= count) return;
      var seq = sent++;
      waiting++;
      probeHost(host, ip).then(function (ms) {
        waiting--;
        if (job.state === 'Done') return; // a late reply to a ping that ended
        if (ms === null) {
          io.out.text(timeoutLine(seq));
        } else {
          times.push(ms);
          io.out.text(replyLine(ip, seq, ms));
        }
        if (count !== null && sent >= count && !waiting) endJob(job, 'done', times.length ? 0 : 2);
      });
    }

    job = startJob({
      every: 1000,
      tick: function () {
        if (ip) send();
        return true;
      },
      onEnd: function (abnormal, how) {
        if (!ip || how === 'terminated' || how === 'killed') return;
        var lines = summary(host, sent, times);
        for (var i = 0; i < lines.length; i++) io.out.text(lines[i]);
      }
    });
    resolveHost(host).then(function (addr) {
      if (job.state === 'Done') return;
      if (!addr) {
        io.out.text('ping: cannot resolve ' + host + ': Unknown host');
        endJob(job, 'done', 68);
        return;
      }
      ip = addr;
      io.out.text('PING ' + host + ' (' + ip + '): 56 data bytes');
      send();
    });
    return 0;
  },

  sleep: function (args, io) {
    var seconds = parseFloat(args[0]);
    if (isNaN(seconds)) {
      io.out.text('sleep: missing operand');
      return 1;
    }
    if (!io.async) return 0; // a pipeline has no patience
    startJob({ every: Math.min(seconds, 30) * 1000, tick: function () { return false; } });
    return 0;
  },

  yes: function (args, io) {
    var text = args.join(' ') || 'y';
    if (!io.async) {
      for (var i = 0; i < 10; i++) io.out.text(text);
      return 0;
    }
    io.out.text(text);
    startJob({
      every: 120,
      tick: function (ticks) {
        io.out.text(text);
        return ticks < YES_LIMIT;
      }
    });
    return 0;
  },

  shutdown: function (args, io) {
    if (sh.uid !== 'root') {
      io.out.text('Call to PowerOff failed: Interactive authentication required.');
      return 1;
    }
    io.out.text('Broadcast message from ' + sh.uid + '@scoreplay:');
    io.out.text('        The system is going down NOW!');
    powerOff();
  },

  reboot: function (args, io) {
    if (sh.uid !== 'root') {
      io.out.text('Call to Reboot failed: Interactive authentication required.');
      return 1;
    }
    io.out.text('Broadcast message from ' + sh.uid + '@scoreplay:');
    io.out.text('        The system is going down for reboot NOW!');
    powerOff(function () { window.location.reload(); });
  },

  sebiwish: function (args, io) {
    if (args[0] === '-c') {
      if (args[1] === undefined) {
        io.out.text('sebiwish: -c: option requires an argument');
        return 2;
      }
      var depth = sh.shells.length;
      enterShell();
      execute(args[1]);
      while (sh.shells.length > depth) leaveShell();
      return sh.lastStatus;
    }
    // A script on standard input (sebiwish << EOF, or a pipe) runs line by
    // line in a subshell, until it ends or exits.
    if (!args.length && io.stdin) {
      var level = sh.shells.length;
      enterShell();
      for (var l = 0; l < io.stdin.length && sh.shells.length > level; l++) {
        if (io.stdin[l].trim()) execute(io.stdin[l]);
      }
      while (sh.shells.length > level) leaveShell();
      return sh.lastStatus;
    }
      if (args.length) {
        var found = lookup(fs, args[0], ctx());
        if (found.error) {
          io.out.text('sebiwish: ' + args[0] + ': ' + ERR[found.error]);
          return 127;
        }
        var lines = isDirLike(found.node) || found.node.exec ? null : readLines(found.node);
        if (!lines) {
          io.out.text('sebiwish: ' + args[0] + ': cannot execute binary file');
          return 126;
        }
        return runScript(lines);
      }
    enterShell();
  },

  exit: function (args, io) {
    var code = args.length ? parseInt(args[0], 10) : sh.lastStatus;
    if (isNaN(code)) {
      io.out.text('sebiwish: exit: ' + args[0] + ': numeric argument required');
      code = 2;
    }
    if (exitShell()) {
      sh.exited = true;
      return code & 255;
    }
      // A login shell with stopped jobs warns once; exit again and they die
      // with it.
      if (stoppedJobs().length && !sh.warnedStopped) {
        io.out.text('There are stopped jobs.');
        sh.warnedStopped = true;
        return 1;
      }
      jobs.list.slice().forEach(function (job) { endJob(job, 'killed', undefined, true); });
    io.out.text('logout');
    powerOff();
  },

  logout: function (args, io) {
    if (sh.shells.length) {
      io.out.text("sebiwish: logout: not login shell: use `exit'");
      return 1;
    }
    return commands.exit(args, io);
  },

  ps: function (args, io) {
    var me = self(('ps ' + args.join(' ')).trim());
    var all = wantsAll(args);
    var tty = currentTty();
    var procs = list(table).filter(function (p) { return all || p.tty === tty; });
    if (all) {
      io.out.text(padRight('USER', 8) + pad('PID', 5) + pad('%CPU', 5) + pad('%MEM', 5) + ' ' + padRight('TTY', 8) + ' STAT TIME COMMAND');
      for (var i = 0; i < procs.length; i++) io.out.text(psRow(procs[i]));
    } else {
      io.out.text('  PID TTY          TIME CMD');
      for (var j = 0; j < procs.length; j++) {
        var p = procs[j];
        io.out.text(pad(String(p.pid), 5) + ' ' + padRight(p.tty, 8) + ' 00:' + (p.time.length < 5 ? '0' : '') + p.time + ' ' + p.cmd.split(' ')[0]);
      }
    }
    reap(table, me.pid);
  },

  top: function (args, io) {
    // Off a terminal, or with -b / -n 1, one frame and out, the way top -b -n 1 works.
    if (!io.async || !io.tty || args.indexOf('-b') !== -1 || numberFlag(args, 'n', 0) === 1) {
      var me = self('top');
      var lines = topFrame();
      for (var i = 0; i < lines.length; i++) io.out.text(lines[i]);
      reap(table, me.pid);
      return 0;
    }
    // Started with &, top draws nothing: it stops at once, as a real one
    // does on touching the terminal, and draws when fg resumes it.
    var block = null;
    var text = null;
    function draw() {
      if (!block) {
        block = document.createElement('span');
        block.className = 'term-line';
        text = textNode('');
        block.appendChild(text);
        dom.pre.insertBefore(block, dom.livePrompt);
      }
      text.nodeValue = topFrame().join('\n');
      dom.pre.scrollTop = dom.pre.scrollHeight;
    }
    var job = startJob({
      every: 1000,
      tick: function () {
        draw();
        return true;
      },
      onKey: function (e, key) {
        if (key !== 'q') return false;
        endJob(jobs.fg, 'done');
        return true;
      },
      onResume: function () {
        draw();
      },
      onEnd: function () {
        if (block && block.parentNode) block.parentNode.removeChild(block); // top leaves the screen as it found it
      }
    });
    if (io.background) stopJob(job, 'Stopped (tty output)');
    else draw();
    return 0;
  },

  kill: function (args, io) {
    if (args[0] === '-l' || args[0] === '-L') {
      io.out.text(SIGNAL_LIST);
      return 0;
    }
    var parsed = parseSignalArgs(args, io, 'sebiwish: kill');
    if (!parsed) return 1;
    if (!parsed.rest.length) {
      io.out.text('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]');
      return 2;
    }
    var status = 0;
    for (var i = 0; i < parsed.rest.length; i++) {
      var t = parsed.rest[i];
      if (t.charAt(0) === '%') {
        var job = findJob(t);
        if (!job) {
          io.out.text('sebiwish: kill: ' + t + ': no such job');
          status = 1;
          continue;
        }
        t = String(job.pid);
      }
      if (!/^\d+$/.test(t)) {
        io.out.text('sebiwish: kill: ' + t + ': arguments must be process or job IDs');
        status = 1;
        continue;
      }
      var res = signal(table, parseInt(t, 10), parsed.sig, sh.uid);
      if (res.error === 'ESRCH') io.out.text('sebiwish: kill: (' + t + ') - No such process');
      if (res.error === 'EPERM') io.out.text('sebiwish: kill: (' + t + ') - Operation not permitted');
      if (res.error) status = 1;
    }
    return status;
  },

  killall: function (args, io) {
    var parsed = parseSignalArgs(args, io, 'killall');
    if (!parsed) return 1;
    if (!parsed.rest.length) {
      io.out.text('Usage: killall [-s SIGNAL | -SIGNAL] NAME...');
      return 1;
    }
    var status = 0;
    for (var i = 0; i < parsed.rest.length; i++) {
      var name = parsed.rest[i];
      var procs = byName(table, name);
      if (!procs.length) {
        io.out.text(name + ': no process found');
        status = 1;
        continue;
      }
      for (var j = 0; j < procs.length; j++) {
        if (signal(table, procs[j].pid, parsed.sig, sh.uid).error === 'EPERM') {
          io.out.text(name + '(' + procs[j].pid + '): Operation not permitted');
          status = 1;
        }
      }
    }
    return status;
  },

  pkill: function (args, io) {
    var parsed = parseSignalArgs(args, io, 'pkill');
    if (!parsed) return 2;
    var full = parsed.rest.indexOf('-f') !== -1;
    var pattern = parsed.rest.filter(function (a) { return a !== '-f'; })[0];
    if (pattern === undefined) {
      io.out.text('pkill: no matching criteria specified');
      return 2;
    }
    var re;
    try {
      re = new RegExp(pattern);
    } catch (err) {
      io.out.text('pkill: invalid pattern: ' + pattern);
      return 2;
    }
    var hits = matching(table, re, full);
    var any = false;
    for (var i = 0; i < hits.length; i++) {
      if (!signal(table, hits[i].pid, parsed.sig, sh.uid).error) any = true;
    }
    return any ? 0 : 1;
  },

  jobs: function (args, io) {
    var long = args.indexOf('-l') !== -1;
    for (var i = 0; i < jobs.list.length; i++) {
      var job = jobs.list[i];
      var running = job.state === 'Running';
      io.out.text(describe(job, running ? 'Running' : job.stopLabel || 'Stopped', long) + (running ? ' &' : ''));
    }
  },

  fg: function (args, io) {
    var job = findJob(args[0]);
    if (!job) {
      io.out.text('sebiwish: fg: ' + (args[0] || 'current') + ': no such job');
      return 1;
    }
    io.out.text(job.cmd);
    resumeJob(job, true); // exec sees a job in front and waits for it
    return 0;
  },

  bg: function (args, io) {
    var job = findJob(args[0]);
    if (!job) {
      io.out.text('sebiwish: bg: ' + (args[0] || 'current') + ': no such job');
      return 1;
    }
    if (job.state === 'Running') {
      io.out.text('sebiwish: bg: job ' + job.id + ' already in background');
      return 0;
    }
    io.out.text('[' + job.id + ']' + markerOf(job) + ' ' + job.cmd + ' &');
    resumeJob(job, false);
    return 0;
  },

  whoami: function (args, io) {
    io.out.text(sh.uid);
  },

  id: function (args, io) {
    var user = args[0] || sh.uid;
    if (!USERS[user]) {
      io.out.text("id: '" + user + "': no such user");
      return 1;
    }
    io.out.text(idLine(user));
  },

  type: function (args, io) {
    var status = 0;
    for (var i = 0; i < args.length; i++) {
      var name = args[i];
      if (ALIASES[name]) {
        io.out.text(name + ' is aliased to `' + ALIASES[name] + "'");
      } else if (BUILTINS.indexOf(name) !== -1) {
        io.out.text(name + ' is a shell builtin');
      } else {
        var found = findCommand(name);
        if (found.path) {
          io.out.text(name + ' is ' + found.path);
        } else {
          io.out.text('sebiwish: type: ' + name + ': not found');
          status = 1;
        }
      }
    }
    return status;
  },

  // source runs a file in this shell, not a subshell: what it sets stays set.
  source: function (args, io) {
    if (!args.length) {
      io.out.text('sebiwish: source: filename argument required');
      return 2;
    }
    var got = inputLines([args[0]], io, 'sebiwish');
    if (got.status) return 1;
    for (var i = 0; i < got.lines.length; i++) {
      var line = got.lines[i].trim();
      if (line && line.charAt(0) !== '#') execute(line);
      if (sh.exited) break;
    }
    return sh.lastStatus;
  },

  cal: function (args, io) {
    var now = new Date();
    var month = now.getUTCMonth() + 1;
    var year = now.getUTCFullYear();
    if (args.length === 1) {
      // A year: every month, one under the other.
      year = parseInt(args[0], 10);
      for (var m = 1; m <= 12; m++) {
        if (m > 1) io.out.text('');
        calendar(m, year).forEach(function (l) { io.out.text(l); });
      }
      return 0;
    }
    if (args.length >= 2) {
      month = parseInt(args[0], 10);
      year = parseInt(args[1], 10);
    }
    if (!(month >= 1 && month <= 12) || !(year >= 1)) {
      io.out.text('cal: ' + args.join(' ') + ' is neither a month number (1..12) nor a year');
      return 1;
    }
    calendar(month, year).forEach(function (l) { io.out.text(l); });
    return 0;
  }
});

commands.poweroff = commands.shutdown;
commands.halt = commands.shutdown;
commands.bash = commands.sebiwish;
commands.sh = commands.sebiwish;
commands.zsh = commands.sebiwish;
commands['.'] = commands.source;
