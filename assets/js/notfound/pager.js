// more and less. more pages into the scrollback, a screen at a time, with
// --More-- under it. less takes the whole terminal, moves both ways and
// searches, and leaves the screen as it found it. Off a terminal (in a pipe)
// both are cat.

import { commands } from './registry.js';
import { dom } from './dom.js';
import { jobs, startJob, endJob } from './jobs.js';
import { textNode, styled, termRows, enterAltScreen } from './screen.js';
import { inputLines } from './fileio.js';
import { operandsOf } from './args.js';
import { createView, pagerKey, search, frame } from './text/pagerview.js';

function source(args, io, name) {
  var files = operandsOf(args);
  if (!files.length && !io.stdin) {
    io.out.text(name === 'less' ? 'Missing filename ("less --help" for help)' : 'usage: more [file ...]');
    return null;
  }
  return inputLines(files, io, name);
}

function asCat(lines, io) {
  for (var i = 0; i < lines.length; i++) io.out.text(lines[i]);
  return 0;
}

// A line, with what the search found marked.
function marked(line, query) {
  if (!query || line.indexOf(query) === -1) return [textNode(line)];
  var nodes = [];
  var parts = line.split(query);
  for (var i = 0; i < parts.length; i++) {
    if (i) nodes.push(styled('term-match', query));
    if (parts[i]) nodes.push(textNode(parts[i]));
  }
  return nodes;
}

commands.less = function (args, io) {
  var got = source(args, io, 'less');
  // Nothing readable (the error is already printed): stop there, as the
  // real ones do, instead of paging through nothing.
  if (!got || !got.lines || (got.status && !got.lines.length)) return got ? got.status : 1;
  if (!io.async || !io.tty) return asCat(got.lines, io);
  var screen = enterAltScreen();
  var view = createView(got.lines, termRows());
  var typing = null;
  var note = '';
  function draw() {
    var f = frame(view);
    var el = screen.view;
    while (el.firstChild) el.removeChild(el.firstChild);
    for (var i = 0; i < f.lines.length; i++) {
      var nodes = marked(f.lines[i], view.query);
      for (var n = 0; n < nodes.length; n++) el.appendChild(nodes[n]);
      el.appendChild(textNode('\n'));
    }
    el.appendChild(textNode(typing !== null ? '/' + typing : note || f.status));
    note = '';
  }
  startJob({
    onKey: function (e, key, chord) {
      if (chord && key === 'z') return false; // ctrl+z stops less like anything else
      if (typing !== null) {
        if (e.key === 'Enter') {
          if (typing && !search(view, typing, view.top + 1)) note = 'Pattern not found  (press RETURN)';
          typing = null;
        } else if (e.key === 'Escape' || (chord && key === 'c')) {
          typing = null;
        } else if (e.key === 'Backspace') {
          typing = typing.slice(0, -1);
        } else if (e.key.length === 1 && !chord) {
          typing += e.key;
        }
        draw();
        return true;
      }
      if (chord) return true; // less ignores ^C at its prompt
      var res = pagerKey(view, e.key);
      if (res.quit) {
        endJob(jobs.fg, 'done');
        return true;
      }
      if (res.searching) typing = '';
      draw();
      return true;
    },
    onEnd: function () {
      screen.restore();
    },
    onStop: function () {
      screen.restore();
    },
    onResume: function () {
      screen = enterAltScreen();
      draw();
    }
  });
  draw();
  return got.status;
};

commands.more = function (args, io) {
  var got = source(args, io, 'more');
  // Nothing readable (the error is already printed): stop there, as the
  // real ones do, instead of paging through nothing.
  if (!got || !got.lines || (got.status && !got.lines.length)) return got ? got.status : 1;
  var lines = got.lines;
  var rows = io.tty ? termRows() : lines.length;
  if (!io.async || !io.tty || lines.length <= rows) return asCat(lines, io);
  var shown = 0;
  var status = null;
  function show(n) {
    if (status && status.parentNode) status.parentNode.removeChild(status);
    var end = Math.min(lines.length, shown + n);
    for (; shown < end; shown++) io.out.text(lines[shown]);
    if (shown >= lines.length) return false;
    status = styled('term-line', '--More--(' + Math.round(100 * shown / lines.length) + '%)');
    dom.pre.insertBefore(status, dom.livePrompt);
    return true;
  }
  show(rows);
  startJob({
    onKey: function (e, key, chord) {
      if (chord) return false;
      var going = true;
      if (e.key === ' ' || e.key === 'f') going = show(rows);
      else if (e.key === 'Enter' || e.key === 'j') going = show(1);
      else if (e.key === 'q' || e.key === 'Q') going = false;
      if (!going) endJob(jobs.fg, 'done');
      return true;
    },
    onEnd: function () {
      if (status && status.parentNode) status.parentNode.removeChild(status);
    }
  });
  return got.status;
};
