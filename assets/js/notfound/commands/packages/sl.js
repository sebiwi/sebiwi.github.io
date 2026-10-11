// sl, an ink package.

import { dom, reducedMotion } from '../../dom.js';
import { startJob } from '../../jobs.js';
import { commands } from '../../registry.js';
import { termCols, textNode } from '../../screen.js';

// sl: the little train from sl -l, towing its coal, right to left across
// however wide this terminal is. ctrl+c is ignored, as tradition demands.
export var SL_BODY = [
  '     ++      +------ ____                 ',
  '     ||      |+-+ |  |   \\@@@@@@@@@@@     ',
  '   /---------|| | |  |    \\@@@@@@@@@@@@@_ ',
  '  + ========  +-+ |  |                  | '
];
export var SL_WHEELS = [
  [' _|--O========O~\\-+  |__________________| ', '//// \\_/      \\_/       (O)       (O)     '],
  [' _|--/O========O\\-+  |__________________| ', '//// \\_/      \\_/       (O)       (O)     '],
  [' _|--/~O========O-+  |__________________| ', '//// \\_/      \\_/       (O)       (O)     '],
  [' _|--/~\\------/~\\-+  |__________________| ', '//// \\_O========O       (O)       (O)     '],
  [' _|--/~\\------/~\\-+  |__________________| ', '//// \\O========O/       (O)       (O)     '],
  [' _|--/~\\------/~\\-+  |__________________| ', '//// O========O_/       (O)       (O)     ']
];
export var SL_SMOKE = [['   (@@)  (  ) (@)', '  ( )'], ['   (  ) (@@)  ( )', '  (@)']];


export function slFrame(x, cols, n) {
  var rows = SL_SMOKE[Math.floor(n / 4) % 2].concat(SL_BODY, SL_WHEELS[n % SL_WHEELS.length]);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = x < 0 ? rows[i].slice(-x) : new Array(x + 1).join(' ') + rows[i];
    out.push(row.slice(0, cols).replace(/\s+$/, ''));
  }
  return out.join('\n');
}

export function slRun(args, io) {
  var cols = io.tty ? termCols() : 40;
  if (!io.async || reducedMotion) {
    var still = slFrame(0, cols, 0).split('\n');
    for (var i = 0; i < still.length; i++) io.out.text(still[i]);
    return 0;
  }
  var x = cols;
  var frame = textNode(slFrame(x, cols, 0));
  var block = document.createElement('span');
  block.className = 'term-line';
  block.appendChild(frame);
  dom.pre.insertBefore(block, dom.livePrompt);
  dom.pre.scrollTop = dom.pre.scrollHeight;
  startJob({
    every: 40,
    stubborn: true,
    tick: function (n) {
      x--;
      frame.nodeValue = slFrame(x, cols, n);
      return x > -SL_BODY[0].length;
    },
    onEnd: function () {
      if (block.parentNode) block.parentNode.removeChild(block); // the train leaves no trace
    }
  });
  return 0;
}

// An ink package: on $PATH (so runnable) only once drawn into /usr/bin.
commands.sl = slRun;
