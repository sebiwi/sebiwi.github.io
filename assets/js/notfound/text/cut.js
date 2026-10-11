// cut: fields split on a delimiter (tab unless -d says otherwise) or
// characters. Lists are 1-based: 1,3 and 2-4 and 3- and -2.

export function parseList(spec) {
  if (!spec) return null;
  var out = [];
  var parts = String(spec).split(',');
  for (var i = 0; i < parts.length; i++) {
    var m = /^(\d*)(-?)(\d*)$/.exec(parts[i]);
    if (!m || (!m[1] && !m[3])) return null;
    var from = m[1] ? parseInt(m[1], 10) : 1;
    var to = m[2] ? (m[3] ? parseInt(m[3], 10) : Infinity) : from;
    if (from < 1 || to < from) return null;
    out.push([from, to]);
  }
  return out;
}

function picked(n, ranges) {
  for (var i = 0; i < ranges.length; i++) {
    if (n >= ranges[i][0] && n <= ranges[i][1]) return true;
  }
  return false;
}

export function cut(lines, opts) {
  var ranges = parseList(opts.fields || opts.chars);
  if (!ranges) return { error: 'cut: invalid field value' };
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (opts.chars) {
      var chars = '';
      for (var c = 0; c < line.length; c++) {
        if (picked(c + 1, ranges)) chars += line.charAt(c);
      }
      out.push(chars);
      continue;
    }
    var delim = opts.delim === undefined ? '\t' : opts.delim;
    if (line.indexOf(delim) === -1) {
      if (!opts.onlyDelimited) out.push(line);
      continue;
    }
    var fields = line.split(delim);
    var kept = [];
    for (var f = 0; f < fields.length; f++) {
      if (picked(f + 1, ranges)) kept.push(fields[f]);
    }
    out.push(kept.join(delim));
  }
  return out;
}
