// Reading command arguments: flags, operands, and -n style numbers.

export function flagsOf(args) {
  var flags = '';
  for (var i = 0; i < args.length; i++) {
    if (args[i].charAt(0) === '-' && args[i].length > 1) flags += args[i].slice(1);
  }
  return flags;
}

export function operandsOf(args) {
  var operands = [];
  for (var i = 0; i < args.length; i++) {
    if (args[i].charAt(0) !== '-' || args[i].length === 1) operands.push(args[i]);
  }
  return operands;
}

// -n 5, -n5, and for -n the old -5 that head and tail still take.
export function numberFlag(args, letter, fallback) {
  for (var i = 0; i < args.length; i++) {
    if (letter === 'n' && /^-\d+$/.test(args[i])) return parseInt(args[i].slice(1), 10);
    if (args[i] === '-' + letter && args[i + 1] !== undefined) return parseInt(args[i + 1], 10);
    if (args[i].indexOf('-' + letter) === 0 && args[i].length > 2) return parseInt(args[i].slice(2), 10);
  }
  return fallback;
}

// Operands with the values of -x flags removed, so `head -n 2 file` doesn't
// read a file called 2.
export function operandsWithout(args, letters) {
  var out = [];
  for (var i = 0; i < args.length; i++) {
    if (args[i].charAt(0) === '-' && args[i].length > 1) {
      if (letters.indexOf(args[i].charAt(args[i].length - 1)) !== -1 && args[i].length === 2) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}
