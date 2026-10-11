// Reading and writing files for commands and redirections, with the error
// messages a shell prints when that goes wrong.

import { ERR, lookup, createFile, readLines, writeLines, can, isDirLike } from './vfs.js';
import { fs, ctx } from './fsview.js';
import { printText } from './screen.js';

export function errText(code) {
  return ERR[code] || code;
}

// What a filter reads: the files it was given ('-' is the pipe), or the pipe
// behind it when there are none.
export function inputLines(targets, io, name) {
  if (!targets.length) {
    if (io.stdin) return { lines: io.stdin, status: 0 };
    io.out.text(name + ': missing operand');
    return { lines: null, status: 1 };
  }
  var c = ctx();
  var lines = [];
  var status = 0;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t === '-' && io.stdin) {
      lines = lines.concat(io.stdin);
      continue;
    }
    var found = lookup(fs, t, c);
    var problem = found.error || (isDirLike(found.node) ? 'EISDIR' : !can(found.node, c.user, 4) ? 'EACCES' : null);
    var body = problem ? null : readLines(found.node);
    if (problem) io.out.text(name + ': ' + t + ': ' + errText(problem));
    else if (!body) io.out.text(name + ': ' + t + ': Is a widget');
    if (problem || !body) {
      status = 1;
      continue;
    }
    lines = lines.concat(body);
  }
  return { lines: lines, status: status };
}

// > and >>. A part can't be written to: it is the page, not a file of it.
export function writeFile(redirect, lines) {
  var c = ctx();
  var made = createFile(fs, redirect.name, c);
  if (made.error) {
    printText('sebiwish: ' + redirect.name + ': ' + errText(made.error));
    return 1;
  }
  var n = made.node;
  if (isDirLike(n)) {
    printText('sebiwish: ' + redirect.name + ': Is a directory');
    return 1;
  }
  if (n.type === 'part' || (made.existed && !can(n, c.user, 2))) {
    printText('sebiwish: ' + redirect.name + ': Permission denied');
    return 1;
  }
  writeLines(fs, n, lines, redirect.append);
  return 0;
}
