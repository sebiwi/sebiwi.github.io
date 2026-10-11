// htop: top with a cursor. The arrows pick a process, F9 or k sends it TERM
// (it goes, and so does what it drew), q or F10 quits. Refreshes each second.

import { endJob, jobs, startJob, stopJob } from '../../jobs.js';
import { list, signal } from '../../proc.js';
import { table } from '../../procs.js';
import { commands } from '../../registry.js';
import { enterAltScreen, styled, termRows, textNode } from '../../screen.js';
import { sh } from '../../state.js';
import { pad, padRight } from '../../util.js';

function meter(label, used, total, text) {
  var width = 24;
  var bars = Math.max(1, Math.round(width * used / total));
  return [textNode(padRight(label, 4) + '['), styled('term-prompt', new Array(bars + 1).join('|')), textNode(new Array(width - bars + 1).join(' ') + text + ']')];
}

commands.htop = function (args, io) {
  if (!io.async || !io.tty) {
    io.out.text('htop: not a terminal');
    return 1;
  }
  var user = sh.uid; // sudo htop keeps root's rights for as long as it runs
  // Started with &, a full-screen program draws nothing: it stops at once,
  // as a real one does on touching the terminal, and draws when fg resumes it.
  var screen = io.background ? null : enterAltScreen();
  var selected = 0;
  var note = '';
  function draw() {
    if (!screen) return;
    var procs = list(table);
    selected = Math.min(selected, procs.length - 1);
    var el = screen.view;
    while (el.firstChild) el.removeChild(el.firstChild);
    var rows = [meter('  1', 4, 100, '4.0%'), meter('Mem', 42, 404, '42M/404M')];
    rows.push([textNode('Tasks: ' + procs.length + ', 1 running   Load average: 0.04 0.04 0.04')]);
    rows.push([textNode('')]);
    rows.push([styled('term-sel', '  PID USER     S  CPU% MEM%  Command')]);
    var room = Math.max(3, termRows() - rows.length - 1);
    var first = Math.max(0, Math.min(selected - room + 1, procs.length - room));
    for (var i = first; i < Math.min(procs.length, first + room); i++) {
      var p = procs[i];
      var text = pad(String(p.pid), 5) + ' ' + padRight(p.user, 8) + ' ' + p.state + ' ' + pad(p.cpu.toFixed(1), 5) + ' ' + pad(p.mem.toFixed(1), 4) + '  ' + p.cmd;
      rows.push([i === selected ? styled('term-sel', text) : textNode(text)]);
    }
    rows.push([textNode(note || 'F9Kill  F10Quit')]);
    note = '';
    for (var r = 0; r < rows.length; r++) {
      for (var n = 0; n < rows[r].length; n++) el.appendChild(rows[r][n]);
      if (r < rows.length - 1) el.appendChild(textNode('\n'));
    }
  }
  var job = startJob({
    every: 1000,
    tick: function () {
      draw();
      return true;
    },
    onKey: function (e, key, chord) {
      if (chord) return key !== 'z' && key !== 'c'; // ctrl+c quits and ctrl+z stops, as for any job
      var procs = list(table);
      if (e.key === 'ArrowDown') selected = Math.min(selected + 1, procs.length - 1);
      else if (e.key === 'ArrowUp') selected = Math.max(selected - 1, 0);
      else if (e.key === 'F9' || e.key === 'k') {
        var res = signal(table, procs[selected].pid, 'TERM', user);
        if (res.error === 'EPERM') note = 'Operation not permitted: try sudo htop';
      } else if (e.key === 'q' || e.key === 'F10') {
        endJob(jobs.fg, 'done');
        return true;
      }
      draw();
      return true;
    },
    onEnd: function () {
      if (screen) screen.restore();
      screen = null;
    },
    onStop: function () {
      if (screen) screen.restore();
      screen = null;
    },
    onResume: function () {
      screen = enterAltScreen();
      draw();
    }
  });
  if (io.background) stopJob(job, 'Stopped (tty output)');
  else draw();
  return 0;
};
