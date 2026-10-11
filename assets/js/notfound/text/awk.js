// awk, the useful core of it. Patterns and actions; BEGIN and END; fields
// ($0, $1..., $NF, $(NF-1)) split on FS (runs of blanks unless -F says
// otherwise); NR, NF, FS, OFS; variables (-v too); arithmetic, comparisons
// (numeric when both sides look like numbers), concatenation, ~ and !~,
// && || !; print, printf, next; length, substr, index, toupper, tolower,
// int. No arrays, no getline, no user functions, no if or loops.

var KEYWORDS = { BEGIN: 1, END: 1, print: 1, printf: 1, next: 1 };
var FUNCS = { length: 1, substr: 1, index: 1, toupper: 1, tolower: 1, int: 1 };
var NUMERIC = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
var LEADING_NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/;
// Two-character operators are tried before one-character ones, so != and
// !~ never lex as !.
var OPS2 = ['&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '++', '--', '!~'];
var OPS1 = '{}();,$+-*/%<>!=~';
var STRING_ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', '/': '/' };
var NEXT = {};

function AwkError(message) {
  this.message = message;
}

function syntax() {
  throw new AwkError('awk: syntax error at source line 1');
}

function lex(src) {
  var tokens = [];
  var i = 0;
  function push(type, value) {
    tokens.push({ type: type, value: value });
  }
  // A / starts a regex where a value can't end: at the start, after an
  // operator, after an opening bracket.
  function regexAllowed() {
    var prev = tokens[tokens.length - 1];
    if (!prev) return true;
    if (prev.type === 'num' || prev.type === 'str' || prev.type === 'name' || prev.type === 'regex') return false;
    return !(prev.type === 'op' && (prev.value === ')' || prev.value === '$' || prev.value === '++' || prev.value === '--'));
  }
  while (i < src.length) {
    var c = src.charAt(i);
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\\' && src.charAt(i + 1) === '\n') {
      i += 2;
      continue;
    }
    if (c === '#') {
      while (i < src.length && src.charAt(i) !== '\n') i++;
      continue;
    }
    if (c === '\n') {
      push('op', '\n');
      i++;
      continue;
    }
    var num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
    if (num) {
      push('num', parseFloat(num[0]));
      i += num[0].length;
      continue;
    }
    if (c === '"') {
      var s = '';
      i++;
      while (i < src.length && src.charAt(i) !== '"') {
        if (src.charAt(i) === '\\' && i + 1 < src.length) {
          var e = src.charAt(i + 1);
          s += STRING_ESCAPES[e] !== undefined ? STRING_ESCAPES[e] : '\\' + e;
          i += 2;
          continue;
        }
        s += src.charAt(i++);
      }
      if (i >= src.length) syntax();
      i++;
      push('str', s);
      continue;
    }
    if (c === '/' && regexAllowed()) {
      var re = '';
      i++;
      while (i < src.length && src.charAt(i) !== '/') {
        if (src.charAt(i) === '\\' && src.charAt(i + 1) === '/') {
          re += '/';
          i += 2;
          continue;
        }
        if (src.charAt(i) === '\\') re += src.charAt(i++);
        re += src.charAt(i++);
      }
      if (i >= src.length) syntax();
      i++;
      push('regex', re);
      continue;
    }
    var word = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (word) {
      push(KEYWORDS[word[0]] ? 'kw' : 'name', word[0]);
      i += word[0].length;
      continue;
    }
    var two = src.substr(i, 2);
    if (OPS2.indexOf(two) !== -1) {
      push('op', two);
      i += 2;
      continue;
    }
    if (OPS1.indexOf(c) !== -1) {
      push('op', c);
      i++;
      continue;
    }
    syntax();
  }
  push('eof');
  return tokens;
}

function parse(tokens) {
  var pos = 0;
  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }
  function isOp(v) { return tokens[pos].type === 'op' && tokens[pos].value === v; }
  function isKw(v) { return tokens[pos].type === 'kw' && tokens[pos].value === v; }
  function expect(v) {
    if (!isOp(v)) syntax();
    return next();
  }
  function skipNewlines() {
    while (isOp('\n')) next();
  }
  function skipTerms() {
    while (isOp('\n') || isOp(';')) next();
  }
  function terminator() {
    return isOp(';') || isOp('\n') || isOp('}') || peek().type === 'eof';
  }

  function program() {
    var items = [];
    skipTerms();
    while (peek().type !== 'eof') {
      var item = { special: null, pattern: null, action: null };
      if (isKw('BEGIN') || isKw('END')) {
        item.special = next().value;
        skipNewlines();
        item.action = block();
      } else {
        if (!isOp('{')) item.pattern = expr();
        if (isOp('{')) item.action = block();
      }
      items.push(item);
      skipTerms();
    }
    return items;
  }

  function block() {
    expect('{');
    var stmts = [];
    skipTerms();
    while (!isOp('}')) {
      if (peek().type === 'eof') syntax();
      stmts.push(statement());
      if (!terminator()) syntax();
      skipTerms();
    }
    next();
    return stmts;
  }

  function statement() {
    if (isKw('print') || isKw('printf')) {
      var kind = next().value;
      var args = [];
      if (!terminator()) {
        // print (a, b) and printf("%s", x): a parenthesized list.
        if (isOp('(')) {
          var save = pos;
          next();
          var list = exprList();
          if (isOp(')')) {
            next();
            if (terminator()) return { t: kind, args: list };
          }
          pos = save;
        }
        args = exprList();
      }
      return { t: kind, args: args };
    }
    if (isKw('next')) {
      next();
      return { t: 'next' };
    }
    return { t: 'expr', e: expr() };
  }

  function exprList() {
    var list = [expr()];
    while (isOp(',')) {
      next();
      skipNewlines();
      list.push(expr());
    }
    return list;
  }

  var ASSIGN = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1 };
  var CMP = { '<': 1, '<=': 1, '==': 1, '!=': 1, '>': 1, '>=': 1 };

  function expr() {
    var left = or();
    if (peek().type === 'op' && ASSIGN[peek().value]) {
      if (left.t !== 'var' && left.t !== 'field') syntax();
      var op = next().value;
      return { t: 'assign', op: op, target: left, value: expr() };
    }
    return left;
  }
  function or() {
    var l = and();
    while (isOp('||')) {
      next();
      skipNewlines();
      l = { t: 'or', a: l, b: and() };
    }
    return l;
  }
  function and() {
    var l = matching();
    while (isOp('&&')) {
      next();
      skipNewlines();
      l = { t: 'and', a: l, b: matching() };
    }
    return l;
  }
  function matching() {
    var l = comparison();
    while (isOp('~') || isOp('!~')) {
      var neg = next().value === '!~';
      l = { t: 'match', neg: neg, a: l, b: comparison() };
    }
    return l;
  }
  function comparison() {
    var l = concat();
    if (peek().type === 'op' && CMP[peek().value]) {
      var op = next().value;
      return { t: 'cmp', op: op, a: l, b: concat() };
    }
    return l;
  }
  function startsValue() {
    var t = peek();
    if (t.type === 'num' || t.type === 'str' || t.type === 'name') return true;
    return t.type === 'op' && (t.value === '$' || t.value === '(' || t.value === '++' || t.value === '--');
  }
  function concat() {
    var l = additive();
    while (startsValue()) l = { t: 'cat', a: l, b: additive() };
    return l;
  }
  function additive() {
    var l = multiplicative();
    while (isOp('+') || isOp('-')) {
      var op = next().value;
      l = { t: 'bin', op: op, a: l, b: multiplicative() };
    }
    return l;
  }
  function multiplicative() {
    var l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      var op = next().value;
      l = { t: 'bin', op: op, a: l, b: unary() };
    }
    return l;
  }
  function unary() {
    if (isOp('-') || isOp('+')) {
      var op = next().value;
      return { t: 'neg', op: op, e: unary() };
    }
    if (isOp('!')) {
      next();
      return { t: 'not', e: unary() };
    }
    return postfix();
  }
  function postfix() {
    if (isOp('++') || isOp('--')) {
      var pre = next().value;
      var target = primary();
      if (target.t !== 'var' && target.t !== 'field') syntax();
      return { t: 'incr', op: pre, target: target, pre: true };
    }
    var p = primary();
    if ((isOp('++') || isOp('--')) && (p.t === 'var' || p.t === 'field')) {
      return { t: 'incr', op: next().value, target: p, pre: false };
    }
    return p;
  }
  function primary() {
    var t = next();
    if (t.type === 'num') return { t: 'num', v: t.value };
    if (t.type === 'str') return { t: 'str', v: t.value };
    if (t.type === 'regex') {
      try {
        return { t: 'regex', re: new RegExp(t.value) };
      } catch (err) {
        syntax();
      }
    }
    if (t.type === 'op' && t.value === '$') return { t: 'field', e: primary() };
    if (t.type === 'op' && t.value === '(') {
      var inner = expr();
      expect(')');
      return inner;
    }
    if (t.type === 'name') {
      if (FUNCS[t.value] && isOp('(')) {
        next();
        var args = isOp(')') ? [] : exprList();
        expect(')');
        return { t: 'call', name: t.value, args: args };
      }
      if (t.value === 'length') return { t: 'call', name: 'length', args: [] };
      return { t: 'var', name: t.value };
    }
    syntax();
  }

  return program();
}

function toNum(v) {
  if (typeof v === 'number') return v;
  var m = LEADING_NUMBER.exec(v);
  return m ? parseFloat(m[0]) : 0;
}

function toStr(v) {
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)));
}

function looksNumeric(v) {
  return typeof v === 'number' || NUMERIC.test(v);
}

function truthy(v) {
  if (typeof v === 'number') return v !== 0;
  if (NUMERIC.test(v)) return toNum(v) !== 0;
  return v !== '';
}

function arith(op, a, b) {
  var x = toNum(a);
  var y = toNum(b);
  if (op === '+') return x + y;
  if (op === '-') return x - y;
  if (op === '*') return x * y;
  if ((op === '/' || op === '%') && y === 0) throw new AwkError('awk: division by zero');
  return op === '/' ? x / y : x % y;
}

function compare(op, a, b) {
  var x = a;
  var y = b;
  if (looksNumeric(a) && looksNumeric(b)) {
    x = toNum(a);
    y = toNum(b);
  } else {
    x = toStr(a);
    y = toStr(b);
  }
  var r = op === '<' ? x < y : op === '<=' ? x <= y : op === '==' ? x === y : op === '!=' ? x !== y : op === '>' ? x > y : x >= y;
  return r ? 1 : 0;
}

function format(fmt, values) {
  var k = 0;
  return fmt.replace(/%([-0 +#]*)(\d+)?(?:\.(\d+))?([sdifxXoceEgG%])/g, function (m, flags, width, prec, conv) {
    if (conv === '%') return '%';
    var v = values[k++];
    if (v === undefined) v = '';
    var s;
    if (conv === 's') {
      s = toStr(v);
      if (prec !== undefined) s = s.slice(0, parseInt(prec, 10));
    } else if (conv === 'd' || conv === 'i') {
      s = String(Math.trunc(toNum(v)));
    } else if (conv === 'f') {
      s = toNum(v).toFixed(prec === undefined ? 6 : parseInt(prec, 10));
    } else if (conv === 'e' || conv === 'E') {
      s = toNum(v).toExponential(prec === undefined ? 6 : parseInt(prec, 10));
      if (conv === 'E') s = s.toUpperCase();
    } else if (conv === 'g' || conv === 'G') {
      s = toStr(toNum(v));
    } else if (conv === 'x' || conv === 'X') {
      s = Math.trunc(toNum(v)).toString(16);
      if (conv === 'X') s = s.toUpperCase();
    } else if (conv === 'o') {
      s = Math.trunc(toNum(v)).toString(8);
    } else {
      s = typeof v === 'number' ? String.fromCharCode(v) : toStr(v).charAt(0);
    }
    if (flags.indexOf('+') !== -1 && 'difeEgG'.indexOf(conv) !== -1 && toNum(v) >= 0) s = '+' + s;
    var w = width ? parseInt(width, 10) : 0;
    var zero = flags.indexOf('0') !== -1 && flags.indexOf('-') === -1 && conv !== 's' && conv !== 'c';
    while (s.length < w) {
      if (flags.indexOf('-') !== -1) s += ' ';
      else if (zero) s = /^[-+]/.test(s) ? s.charAt(0) + '0' + s.slice(1) : '0' + s;
      else s = ' ' + s;
    }
    return s;
  });
}

export function awk(lines, program, opts) {
  opts = opts || {};
  var items;
  try {
    items = parse(lex(program));
  } catch (err) {
    if (err instanceof AwkError) return { error: err.message, lines: [] };
    throw err;
  }
  var vars = { NR: 0, NF: 0, FS: opts.fs === undefined ? ' ' : opts.fs, OFS: ' ' };
  for (var name in opts.vars || {}) vars[name] = opts.vars[name];
  var record = '';
  var fields = [];
  var buffer = '';

  function split(text) {
    var fs = toStr(vars.FS);
    if (fs === ' ') return text.trim() === '' ? [] : text.trim().split(/[ \t\n]+/);
    if (text === '') return [];
    return fs.length === 1 ? text.split(fs) : text.split(new RegExp(fs));
  }
  function setRecord(text) {
    record = text;
    fields = split(text);
    vars.NF = fields.length;
  }
  function getField(i) {
    i = Math.floor(toNum(i));
    if (i === 0) return record;
    return i > 0 && i <= fields.length ? fields[i - 1] : '';
  }
  function setField(i, v) {
    i = Math.floor(toNum(i));
    if (i === 0) {
      setRecord(toStr(v));
      return;
    }
    while (fields.length < i) fields.push('');
    fields[i - 1] = toStr(v);
    vars.NF = fields.length;
    record = fields.join(toStr(vars.OFS));
  }
  function get(target) {
    if (target.t === 'field') return getField(ev(target.e));
    return vars[target.name] === undefined ? '' : vars[target.name];
  }
  function set(target, v) {
    if (target.t === 'field') setField(ev(target.e), v);
    else vars[target.name] = v;
  }
  function call(n) {
    var a = n.args.map(ev);
    if (n.name === 'length') return toStr(a.length ? a[0] : record).length;
    if (n.name === 'toupper') return toStr(a[0]).toUpperCase();
    if (n.name === 'tolower') return toStr(a[0]).toLowerCase();
    if (n.name === 'index') return toStr(a[0]).indexOf(toStr(a[1])) + 1;
    if (n.name === 'int') return Math.trunc(toNum(a[0]));
    var s = toStr(a[0]);
    var start = Math.max(Math.round(toNum(a[1])), 1);
    if (a.length < 3) return s.slice(start - 1);
    var end = Math.round(toNum(a[1])) + Math.round(toNum(a[2]));
    return s.slice(start - 1, Math.max(end - 1, start - 1));
  }
  function ev(n) {
    switch (n.t) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'regex': return n.re.test(record) ? 1 : 0;
      case 'field': return getField(ev(n.e));
      case 'var': return get(n);
      case 'assign': {
        var value = ev(n.value);
        if (n.op !== '=') value = arith(n.op.charAt(0), get(n.target), value);
        set(n.target, value);
        return value;
      }
      case 'or': return truthy(ev(n.a)) || truthy(ev(n.b)) ? 1 : 0;
      case 'and': return truthy(ev(n.a)) && truthy(ev(n.b)) ? 1 : 0;
      case 'match': {
        var re = n.b.t === 'regex' ? n.b.re : new RegExp(toStr(ev(n.b)));
        return re.test(toStr(ev(n.a))) !== n.neg ? 1 : 0;
      }
      case 'cmp': return compare(n.op, ev(n.a), ev(n.b));
      case 'cat': return toStr(ev(n.a)) + toStr(ev(n.b));
      case 'bin': return arith(n.op, ev(n.a), ev(n.b));
      case 'neg': return n.op === '-' ? -toNum(ev(n.e)) : toNum(ev(n.e));
      case 'not': return truthy(ev(n.e)) ? 0 : 1;
      case 'incr': {
        var old = toNum(get(n.target));
        var now = old + (n.op === '++' ? 1 : -1);
        set(n.target, now);
        return n.pre ? now : old;
      }
      case 'call': return call(n);
    }
    syntax();
  }
  function exec(stmts) {
    for (var i = 0; i < stmts.length; i++) {
      var s = stmts[i];
      if (s.t === 'print') {
        buffer += (s.args.length ? s.args.map(function (a) { return toStr(ev(a)); }).join(toStr(vars.OFS)) : record) + '\n';
      } else if (s.t === 'printf') {
        if (!s.args.length) syntax();
        buffer += format(toStr(ev(s.args[0])), s.args.slice(1).map(ev));
      } else if (s.t === 'next') {
        throw NEXT;
      } else {
        ev(s.e);
      }
    }
  }
  function output() {
    var out = buffer.split('\n');
    if (out[out.length - 1] === '') out.pop();
    return out;
  }

  try {
    var main = items.filter(function (it) { return !it.special; });
    var ends = items.filter(function (it) { return it.special === 'END'; });
    items.filter(function (it) { return it.special === 'BEGIN'; }).forEach(function (it) { exec(it.action); });
    if (main.length || ends.length) {
      for (var l = 0; l < lines.length; l++) {
        vars.NR++;
        setRecord(lines[l]);
        try {
          for (var m = 0; m < main.length; m++) {
            if (main[m].pattern && !truthy(ev(main[m].pattern))) continue;
            if (main[m].action) exec(main[m].action);
            else buffer += record + '\n';
          }
        } catch (err) {
          if (err !== NEXT) throw err;
        }
      }
    }
    ends.forEach(function (it) { exec(it.action); });
  } catch (err) {
    if (err instanceof AwkError) return { error: err.message, lines: output() };
    throw err;
  }
  return { lines: output() };
}
