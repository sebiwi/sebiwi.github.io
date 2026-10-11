// jq, the filters people type first: . .key .a.b .["key"] .[n] .[] keys
// length, joined with |. Output is pretty JSON (two spaces), -c compact,
// -r raw strings.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function JqError(message) {
  this.message = message;
}

function fail(message) {
  throw new JqError('jq: error: ' + message);
}

// A path: a dot, an optional name, then any of .name [n] [] ["name"].
// '..' (jq's recursion) is not supported and reads as a syntax error.
function parsePath(t) {
  if (t.charAt(0) !== '.' || /^\.\./.test(t)) return null;
  var steps = [];
  var rest = t.slice(1);
  var m = /^[A-Za-z_]\w*/.exec(rest);
  if (m) {
    steps.push({ key: m[0] });
    rest = rest.slice(m[0].length);
  }
  while (rest) {
    if ((m = /^\.([A-Za-z_]\w*)/.exec(rest))) steps.push({ key: m[1] });
    else if ((m = /^\.?\[\]/.exec(rest))) steps.push({ iterate: true });
    else if ((m = /^\.?\[(-?\d+)\]/.exec(rest))) steps.push({ index: parseInt(m[1], 10) });
    else if ((m = /^\.?\["([^"]*)"\]/.exec(rest))) steps.push({ key: m[1] });
    else return null;
    rest = rest.slice(m[0].length);
  }
  return { fn: null, steps: steps };
}

// A filter is terms joined by |. A term is keys, keys[], length, or a path.
function parse(filter) {
  return filter.split('|').map(function (t) {
    t = t.trim();
    if (t === 'keys' || t === 'length') return { fn: t, steps: [] };
    if (t === 'keys[]') return { fn: 'keys', steps: [{ iterate: true }] };
    return parsePath(t);
  });
}

function step(values, s) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var type = typeOf(v);
    if (s.iterate) {
      if (type === 'array') out = out.concat(v);
      else if (type === 'object') out = out.concat(Object.keys(v).map(function (k) { return v[k]; }));
      else fail('Cannot iterate over ' + type + (v === null ? '' : ' (' + JSON.stringify(v) + ')'));
    } else if (s.index !== undefined) {
      if (type === 'null') out.push(null);
      else if (type !== 'array') fail('Cannot index ' + type + ' with number');
      else out.push(v[s.index < 0 ? v.length + s.index : s.index] === undefined ? null : v[s.index < 0 ? v.length + s.index : s.index]);
    } else {
      if (type === 'null') out.push(null);
      else if (type !== 'object') fail('Cannot index ' + type + ' with "' + s.key + '"');
      else out.push(Object.prototype.hasOwnProperty.call(v, s.key) ? v[s.key] : null);
    }
  }
  return out;
}

function apply(term, values) {
  if (term.fn === 'keys') {
    values = values.map(function (v) {
      var type = typeOf(v);
      if (type === 'object') return Object.keys(v).sort();
      if (type === 'array') return v.map(function (x, i) { return i; });
      fail(type + ' has no keys');
    });
  } else if (term.fn === 'length') {
    values = values.map(function (v) {
      var type = typeOf(v);
      if (type === 'null') return 0;
      if (type === 'number') return Math.abs(v);
      if (type === 'object') return Object.keys(v).length;
      if (type === 'boolean') fail('boolean (' + v + ') has no length');
      return v.length;
    });
  }
  for (var i = 0; i < term.steps.length; i++) values = step(values, term.steps[i]);
  return values;
}

export function jq(text, filter, opts) {
  opts = opts || {};
  var terms = parse(filter);
  if (terms.indexOf(null) !== -1) return { error: "jq: error: syntax error in filter '" + filter + "'" };
  var input;
  try {
    input = JSON.parse(text);
  } catch (err) {
    return { error: 'jq: error: input is not valid JSON' };
  }
  try {
    var values = [input];
    for (var t = 0; t < terms.length; t++) values = apply(terms[t], values);
    var lines = [];
    for (var v = 0; v < values.length; v++) {
      var out = opts.raw && typeof values[v] === 'string' ? values[v] : JSON.stringify(values[v], null, opts.compact ? 0 : 2);
      lines = lines.concat(out.split('\n'));
    }
    return { lines: lines };
  } catch (err) {
    if (err instanceof JqError) return { error: err.message };
    throw err;
  }
}
