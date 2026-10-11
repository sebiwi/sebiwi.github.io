// diff: the longest common subsequence of two lists of lines, printed in the
// classic normal format (2c2, < old, ---, > new) or, with -u, unified with
// three lines of context.

function ops(a, b) {
  var n = a.length;
  var m = b.length;
  var L = [];
  for (var i = 0; i <= n; i++) {
    L.push(new Array(m + 1).fill(0));
  }
  for (var x = n - 1; x >= 0; x--) {
    for (var y = m - 1; y >= 0; y--) {
      L[x][y] = a[x] === b[y] ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]);
    }
  }
  var out = [];
  var p = 0;
  var q = 0;
  while (p < n || q < m) {
    if (p < n && q < m && a[p] === b[q]) {
      out.push({ type: '=', line: a[p++] });
      q++;
    } else if (q >= m || (p < n && L[p + 1][q] >= L[p][q + 1])) {
      out.push({ type: '-', line: a[p++] });
    } else {
      out.push({ type: '+', line: b[q++] });
    }
  }
  return out;
}

function range(start, count) {
  return count === 1 ? String(start) : start + ',' + (start + count - 1);
}

export function diffNormal(a, b) {
  var list = ops(a, b);
  var out = [];
  var ai = 0;
  var bi = 0;
  var k = 0;
  while (k < list.length) {
    if (list[k].type === '=') {
      ai++;
      bi++;
      k++;
      continue;
    }
    var dels = [];
    var adds = [];
    var s1 = ai + 1;
    var s2 = bi + 1;
    while (k < list.length && list[k].type !== '=') {
      if (list[k].type === '-') dels.push(list[k].line);
      else adds.push(list[k].line);
      k++;
    }
    ai += dels.length;
    bi += adds.length;
    if (dels.length && adds.length) out.push(range(s1, dels.length) + 'c' + range(s2, adds.length));
    else if (dels.length) out.push(range(s1, dels.length) + 'd' + (s2 - 1));
    else out.push((s1 - 1) + 'a' + range(s2, adds.length));
    dels.forEach(function (l) { out.push('< ' + l); });
    if (dels.length && adds.length) out.push('---');
    adds.forEach(function (l) { out.push('> ' + l); });
  }
  return out;
}

var CONTEXT = 3;

function hunkRange(start, count) {
  if (count === 0) return (start - 1) + ',0';
  return count === 1 ? String(start) : start + ',' + count;
}

export function diffUnified(a, b, nameA, nameB) {
  var list = ops(a, b);
  var changes = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== '=') changes.push(i);
  }
  if (!changes.length) return [];
  var out = ['--- ' + nameA, '+++ ' + nameB];
  var c = 0;
  while (c < changes.length) {
    var from = Math.max(0, changes[c] - CONTEXT);
    var last = changes[c];
    while (c + 1 < changes.length && changes[c + 1] - last <= CONTEXT * 2) last = changes[++c];
    var to = Math.min(list.length - 1, last + CONTEXT);
    var aStart = 1;
    var bStart = 1;
    for (var j = 0; j < from; j++) {
      if (list[j].type !== '+') aStart++;
      if (list[j].type !== '-') bStart++;
    }
    var aLen = 0;
    var bLen = 0;
    var body = [];
    for (var h = from; h <= to; h++) {
      var op = list[h];
      body.push((op.type === '=' ? ' ' : op.type) + op.line);
      if (op.type !== '+') aLen++;
      if (op.type !== '-') bLen++;
    }
    out.push('@@ -' + hunkRange(aStart, aLen) + ' +' + hunkRange(bStart, bLen) + ' @@');
    out = out.concat(body);
    c++;
  }
  return out;
}
