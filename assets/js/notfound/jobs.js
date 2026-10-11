// Jobs: everything that runs on a timer, in front of the prompt or behind
// it. A job is a process too (ps lists it, kill reaches it), has a number
// for %N, and ends Done, Exit N, Terminated, Killed or Interrupt. The job in
// front owns the keyboard: ctrl+c interrupts it, ctrl+z stops it, and a job
// with an onKey (a pager, sudo's password prompt) gets the other keys.
// Background jobs report how they ended just before the next prompt.

import { dom } from './dom.js';
import { table, currentTty } from './procs.js';
import { spawn, reap } from './proc.js';
import { printText } from './screen.js';
import { padRight } from './util.js';
import { renderLine } from './lineeditor.js';

export var jobs = { list: [], fg: null, launch: null, notices: [] };

var CODES = { interrupted: 130, terminated: 143, killed: 137 };
var LABELS = { interrupted: 'Interrupt', terminated: 'Terminated', killed: 'Killed' };

function nextId() {
  var id = 1;
  for (var i = 0; i < jobs.list.length; i++) id = Math.max(id, jobs.list[i].id + 1);
  return id;
}

// '+' is the current job (the newest), '-' the one before it.
export function markerOf(job) {
  var at = jobs.list.indexOf(job);
  var n = jobs.list.length;
  return at === n - 1 ? '+' : at === n - 2 ? '-' : ' ';
}

export function describe(job, state, withPid) {
  return '[' + job.id + ']' + markerOf(job) + '  ' + (withPid ? job.pid + ' ' : '') + padRight(state, 24) + job.cmd;
}

// Signals sent to a job's pid land here. The job keeps its own books (and
// reaps itself in endJob), so the table is told to leave it alone.
function signalJob(job, sig) {
  if (sig === 'INT') {
    if (!job.stubborn) endJob(job, 'interrupted');
  } else if (sig === 'TERM' || sig === 'HUP') {
    endJob(job, 'terminated');
  } else if (sig === 'KILL') {
    endJob(job, 'killed');
  } else if (sig === 'STOP' || sig === 'TSTP') {
    stopJob(job);
  } else if (sig === 'CONT') {
    resumeJob(job, false);
  }
  return 'ignore';
}

// A job before it starts: exec reserves one for `cmd &` so it can print
// [1] 1003 first, whether or not the command ever starts a timer.
export function reserve(cmd, background) {
  var job = { id: nextId(), pid: 0, cmd: cmd, background: !!background, state: 'Running', opts: null, timer: null, ticks: 0, then: null, stubborn: false, proc: null };
  job.proc = spawn(table, { cmd: cmd, tty: currentTty(), state: 'R', onSignal: function (sig) { return signalJob(job, sig); } });
  job.pid = job.proc.pid;
  jobs.list.push(job);
  return job;
}

function tickOn(job) {
  if (!job.opts.every) return; // pagers and prompts move on keys, not time
  job.timer = window.setInterval(function () {
    job.ticks++;
    if (job.opts.tick(job.ticks) === false) endJob(job, 'done');
  }, job.opts.every);
}

function tickOff(job) {
  window.clearInterval(job.timer);
  job.timer = null;
}

function toFront(job) {
  jobs.fg = job;
  job.background = false;
  dom.livePrompt.classList.add('is-running');
}

function release(job) {
  if (jobs.fg !== job) return false;
  jobs.fg = null;
  dom.livePrompt.classList.remove('is-running');
  return true;
}

export function startJob(opts) {
  var launch = jobs.launch || { cmd: '', background: false };
  var job = launch.reserved || reserve(launch.cmd, launch.background);
  launch.reserved = null; // a reservation is used once: a second job in the same command gets its own
  launch.started = true;
  job.opts = opts;
  job.stubborn = !!opts.stubborn;
  tickOn(job);
  if (!job.background) toFront(job);
  return job;
}

// how: 'done', 'interrupted', 'terminated' or 'killed'. status overrides the
// exit status. quiet ends a job without a notice (sudo handing its prompt
// over to the command it ran).
export function endJob(job, how, status, quiet) {
  if (!job || job.state === 'Done') return;
  tickOff(job);
  var code = status !== undefined ? status : CODES[how] || 0;
  var label = how === 'done' ? (code ? 'Exit ' + code : 'Done') : LABELS[how];
  var notice = describe(job, label); // while the job is still listed: the marker needs it
  job.state = 'Done';
  reap(table, job.pid);
  jobs.list.splice(jobs.list.indexOf(job), 1);
  if (job.opts && job.opts.onEnd) job.opts.onEnd(how !== 'done', how);
  var wasFront = release(job);
  if (!wasFront && !quiet) jobs.notices.push(notice);
  var then = job.then;
  job.then = null;
  renderLine();
  if (wasFront && then) then(code, how);
}

// A command run with & that finished at once: Done the moment it started.
export function finishReserved(job, status) {
  job.opts = job.opts || {};
  endJob(job, 'done', status);
}

export function stopJob(job) {
  if (job.state !== 'Running') return;
  tickOff(job);
  job.state = 'Stopped';
  job.proc.state = 'T';
  var wasFront = release(job);
  job.background = true;
  printText(describe(job, 'Stopped'));
  if (job.opts && job.opts.onStop) job.opts.onStop();
  var then = job.then;
  job.then = null;
  renderLine();
  if (wasFront && then) then(148, 'stopped');
}

export function resumeJob(job, front) {
  if (job.state === 'Done') return;
  var wasStopped = job.state === 'Stopped';
  job.state = 'Running';
  job.proc.state = 'R';
  if (front) toFront(job);
  if (wasStopped) tickOn(job);
  if (job.opts && job.opts.onResume) job.opts.onResume(front);
}

// %, %%, %+ the current job; %- the previous; %N by number; %name by how
// the command starts; %?text by what it contains.
export function findJob(spec) {
  var n = jobs.list.length;
  if (!n) return null;
  if (spec === undefined || spec === '%' || spec === '%%' || spec === '%+') return jobs.list[n - 1];
  if (spec === '%-') return n > 1 ? jobs.list[n - 2] : null;
  var i;
  var num = /^%(\d+)$/.exec(spec);
  for (i = 0; i < n; i++) {
    var job = jobs.list[i];
    if (num && job.id === parseInt(num[1], 10)) return job;
    if (!num && spec.indexOf('%?') === 0 && job.cmd.indexOf(spec.slice(2)) !== -1) return job;
    if (!num && spec.indexOf('%?') !== 0 && spec.charAt(0) === '%' && job.cmd.indexOf(spec.slice(1)) === 0) return job;
  }
  return null;
}

export function flushNotices() {
  while (jobs.notices.length) printText(jobs.notices.shift());
}

export function stoppedJobs() {
  return jobs.list.filter(function (job) { return job.state === 'Stopped'; });
}
