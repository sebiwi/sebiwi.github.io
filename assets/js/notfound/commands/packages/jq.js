import { commands } from '../../registry.js';
import { inputLines } from '../../fileio.js';
import { jq } from '../../text/jq.js';

commands.jq = function (args, io) {
  var opts = {};
  var rest = [];
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '-r') opts.raw = true;
    else if (args[i] === '-c') opts.compact = true;
    else rest.push(args[i]);
  }
  if (!rest.length) {
    io.out.text('Usage: jq [-rc] <filter> [file]');
    return 2;
  }
  var got = inputLines(rest.slice(1), io, 'jq');
  if (!got.lines || (got.status && !got.lines.length)) return 2; // nothing readable: the error is said
  var res = jq(got.lines.join('\n'), rest[0], opts);
  if (res.error) {
    io.out.text(res.error);
    return 5;
  }
  for (var j = 0; j < res.lines.length; j++) io.out.text(res.lines[j]);
  return got.status ? 2 : 0;
};
