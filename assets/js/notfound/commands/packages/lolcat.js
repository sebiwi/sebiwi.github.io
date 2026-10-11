// lolcat, an ink package.

import { operandsOf } from '../../args.js';
import { inputLines } from '../../fileio.js';
import { commands } from '../../registry.js';
import { styled } from '../../screen.js';

// lolcat: every character its own color, the hue drifting along the line
// and down the page. Through a pipe the colors are lost, like the real one.
export function lolcatRun(args, io) {
  var got = inputLines(operandsOf(args), io, 'lolcat');
  if (!got.lines) return got.status;
  for (var i = 0; i < got.lines.length; i++) {
    var text = got.lines[i];
    if (!io.tty) {
      io.out.text(text);
      continue;
    }
    var nodes = [];
    for (var c = 0; c < text.length; c++) {
      var span = styled('', text.charAt(c));
      span.style.color = 'hsl(' + ((i * 12 + c * 7) % 360) + ', 85%, 70%)';
      nodes.push(span);
    }
    io.out.line(nodes);
  }
  return got.status;
}

// An ink package: on $PATH (so runnable) only once drawn into /usr/bin.
commands.lolcat = lolcatRun;
