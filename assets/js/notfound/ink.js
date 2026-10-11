// ink is the house package manager: the pencil sketches, ink makes it stay.
// ink draw puts a package's commands in /usr/bin and its libraries in
// /usr/lib; ink erase rubs them out. Both need root, as a package manager
// should. The download is for show. Nothing outlives the tab.

import { commands } from './registry.js';
import { sh } from './state.js';
import { system, installBin, uninstallBin, rootCtx, fs } from './fsview.js';
import { node, attach, EPOCH } from './vfs.js';
import { startJob } from './jobs.js';
import { textNode } from './screen.js';
import { pad, padRight } from './util.js';
import { PACKAGES, LIBS, planDraw, libFile, searchPackages, versionOf } from './inkdb.js';

var INK_STEPS = 10;  // ticks per progress bar
var INK_TICK_MS = 70;
var BAR_WIDTH = 16;

function bar(name, step) {
  var filled = Math.round(BAR_WIDTH * step / INK_STEPS);
  var bars = new Array(filled + 1).join('#') + new Array(BAR_WIDTH - filled + 1).join('-');
  return padRight(name + ' ' + versionOf(name), 16) + ' [' + bars + '] ' + pad(Math.round(100 * step / INK_STEPS) + '%', 4);
}

export var drawn = {};

export function isDrawn(pkg) {
  return !!drawn[pkg];
}

var OLD_WORDS = { install: 'draw', i: 'draw', add: 'draw', remove: 'erase', uninstall: 'erase', rm: 'erase' };

function land(name) {
  drawn[name] = true;
  if (LIBS[name]) {
    var file = libFile(name);
    if (!system.usrLib.children[file]) {
      attach(system.usrLib, file, node(fs, 'file', { uid: 'root', mode: 0o644, mtime: fs.now(), content: '\u007fELF\u0002\u0001\u0001 ' + file }));
    }
    return;
  }
  var bins = PACKAGES[name].bins;
  for (var i = 0; i < bins.length; i++) installBin(system.usrBin, bins[i]);
}

function needRoot(verb, io) {
  if (sh.uid === 'root') return false;
  io.out.text('ink: cannot ' + verb + ' without root. Are you root?');
  return true;
}

function draw(names, io) {
  if (needRoot('draw', io)) return 100;
  if (!names.length) {
    io.out.text('ink: draw what? ink search lists what there is.');
    return 1;
  }
  var plan = planDraw(names, drawn);
  var status = 0;
  for (var u = 0; u < plan.unknown.length; u++) {
    io.out.text("ink: no package named '" + plan.unknown[u] + "'. ink search lists what there is.");
    status = 1;
  }
  for (var a = 0; a < plan.already.length; a++) {
    io.out.text('ink: ' + plan.already[a] + ' ' + versionOf(plan.already[a]) + ' is already drawn');
  }
  if (!plan.wanted.length) return status;
  var queue = plan.queue;
  io.out.text('==> Resolving ' + plan.wanted.join(' '));
  io.out.text('==> Drawing ' + queue.length + ' package' + (queue.length === 1 ? '' : 's') + ': ' + queue.join(' '));

  function done() {
    for (var k = 0; k < plan.wanted.length; k++) {
      io.out.text('==> ' + plan.wanted[k] + ' ' + versionOf(plan.wanted[k]) + ' drawn. Try: ' + PACKAGES[plan.wanted[k]].bins[0]);
    }
  }

  // In a pipeline there is no download to watch, only the result.
  if (!io.async) {
    for (var q = 0; q < queue.length; q++) {
      io.out.text(bar(queue[q], INK_STEPS));
      land(queue[q]);
    }
    done();
    return status;
  }

  var at = 0;
  var step = 0;
  var line = textNode(bar(queue[0], 0));
  io.out.line([line]);
  startJob({
    every: INK_TICK_MS,
    tick: function () {
      step++;
      line.nodeValue = bar(queue[at], step);
      if (step < INK_STEPS) return true;
      land(queue[at]);
      at++;
      if (at >= queue.length) return false;
      step = 0;
      line = textNode(bar(queue[at], 0));
      io.out.line([line]);
      return true;
    },
    onEnd: function (abnormal) {
      if (!abnormal) {
        done();
        return;
      }
      var missed = plan.wanted.filter(function (w) { return !drawn[w]; });
      io.out.text('ink: interrupted. Not drawn: ' + missed.join(' '));
    }
  });
  return status;
}

function erase(names, io) {
  if (needRoot('erase', io)) return 100;
  if (!names.length) {
    io.out.text('ink: erase what? ink list shows what is drawn.');
    return 1;
  }
  var status = 0;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (name === 'ink') {
      io.out.text('ink: ink holds the rest together. Not erasing it.');
      status = 1;
    } else if (!PACKAGES[name] || !drawn[name]) {
      io.out.text('ink: ' + name + ' is not drawn');
      status = 1;
    } else {
      var bins = PACKAGES[name].bins;
      for (var b = 0; b < bins.length; b++) uninstallBin('/usr/bin', bins[b]);
      delete drawn[name];
      io.out.text('==> Erasing ' + name + ' ' + PACKAGES[name].version + '... done');
    }
  }
  return status;
}

function usage(io) {
  io.out.text('usage: ink <command> [package...]');
  io.out.text('  draw <pkg>      ink a package into the shell');
  io.out.text('  erase <pkg>     rub it back out');
  io.out.text('  list            what is drawn');
  io.out.text('  search [term]   what could be');
}

commands.ink = function (args, io) {
  var sub = args[0];
  var names = args.slice(1);
  if (sub === 'draw') return draw(names, io);
  if (sub === 'erase') return erase(names, io);
  if (sub === 'list' || sub === 'ls') {
    var any = false;
    for (var name in PACKAGES) {
      if (!drawn[name]) continue;
      io.out.text(padRight(name, 8) + ' ' + PACKAGES[name].version);
      any = true;
    }
    for (var lib in LIBS) {
      if (drawn[lib]) io.out.text(padRight(lib, 8) + ' ' + LIBS[lib] + ' (dependency)');
    }
    if (!any) io.out.text('nothing drawn yet. ink search shows what could be.');
    return 0;
  }
  if (sub === 'search') {
    var hits = searchPackages(names[0]);
    for (var h = 0; h < hits.length; h++) {
      var p = PACKAGES[hits[h]];
      io.out.text(padRight(hits[h] + ' ' + p.version, 16) + (drawn[hits[h]] ? '[drawn] ' : '') + p.blurb);
    }
    if (!hits.length) {
      io.out.text("ink: nothing matches '" + (names[0] || '') + "'");
      return 1;
    }
    return 0;
  }
  if (sub === '-v' || sub === '--version' || sub === 'version') {
    io.out.text('ink 4.0.4 (fresh, do not smudge)');
    return 0;
  }
  if (sub === undefined || sub === 'help' || sub === '-h' || sub === '--help') {
    usage(io);
    return sub === undefined ? 1 : 0;
  }
  if (OLD_WORDS[sub]) {
    io.out.text("ink: unknown command '" + sub + "'. Did you mean '" + OLD_WORDS[sub] + "'?");
    return 1;
  }
  io.out.text("ink: unknown command '" + sub + "'");
  usage(io);
  return 1;
};

export { PACKAGES };
