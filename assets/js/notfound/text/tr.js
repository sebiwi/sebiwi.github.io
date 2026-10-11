// tr: characters in, characters out. It works on the text as one stream,
// newlines included, so tr '\n' ' ' joins lines the way it does on a pipe.

var CLASSES = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  space: ' \t\n\r\f\v',
  blank: ' \t',
  punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
};
CLASSES.alpha = CLASSES.lower + CLASSES.upper;
CLASSES.alnum = CLASSES.alpha + CLASSES.digit;

var ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\' };

export function expandSet(spec) {
  var out = [];
  var i = 0;
  function one() {
    var c = spec.charAt(i);
    if (c === '\\' && i + 1 < spec.length) {
      var e = spec.charAt(i + 1);
      i += 2;
      return ESCAPES[e] || e;
    }
    i++;
    return c;
  }
  while (i < spec.length) {
    if (spec.substr(i, 2) === '[:') {
      var end = spec.indexOf(':]', i);
      var name = end === -1 ? '' : spec.slice(i + 2, end);
      if (!CLASSES[name]) return null;
      out = out.concat(CLASSES[name].split(''));
      i = end + 2;
      continue;
    }
    var a = one();
    if (spec.charAt(i) === '-' && i + 1 < spec.length) {
      i++;
      var b = one();
      if (b < a) return null;
      for (var code = a.charCodeAt(0); code <= b.charCodeAt(0); code++) out.push(String.fromCharCode(code));
      continue;
    }
    out.push(a);
  }
  return out;
}

export function tr(text, set1, set2, opts) {
  opts = opts || {};
  var a = expandSet(set1) || [];
  var b = set2 === undefined ? null : expandSet(set2) || [];
  var squeezeSet = b || a;
  var out = '';
  var last = null;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    var inA = (a.indexOf(ch) !== -1) !== !!opts.complement;
    var mapped = ch;
    if (opts['delete']) {
      if (inA) continue;
    } else if (b && b.length && inA) {
      mapped = opts.complement ? b[b.length - 1] : b[Math.min(a.indexOf(ch), b.length - 1)];
    }
    if (opts.squeeze && mapped === last && squeezeSet.indexOf(mapped) !== -1) continue;
    out += mapped;
    last = mapped;
  }
  return out;
}
