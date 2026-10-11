// The shell language, without running it: words, operators, globs as
// regular expressions, and the segments and stages of a line.

import { two } from './util.js';

export var OPERATORS = [';', '|', '>', '<', '&'];

// Whitespace splits words, quotes group them, and a token remembers whether
// it was single-quoted so expansion can leave it alone. The operators
// ; && || | > >> < << <<- <<< come out on their own, and a # that starts a
// word ends the line.
export function tokenize(line) {
  var tokens = [];
  var i = 0;
  while (i < line.length) {
    var ch = line.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '#') break;
    var three = line.substr(i, 3);
    if (three === '<<-' || three === '<<<') {
      tokens.push({ text: three, op: true });
      i += 3;
      continue;
    }
    var two = line.substr(i, 2);
    if (two === '&&' || two === '||' || two === '>>' || two === '<<') {
      tokens.push({ text: two, op: true });
      i += 2;
      continue;
    }
    if (OPERATORS.indexOf(ch) !== -1) {
      tokens.push({ text: ch, op: true });
      i++;
      continue;
    }
    var text = '';
    var quote = '';
    var quoted = false;
    while (i < line.length) {
      var c = line.charAt(i);
      if (/\s/.test(c) || OPERATORS.indexOf(c) !== -1) break;
      if (c === '"' || c === "'") {
        var close = line.indexOf(c, i + 1);
        text += close === -1 ? line.slice(i + 1) : line.slice(i + 1, close);
        if (!quoted) quote = c;
        quoted = true;
        i = close === -1 ? line.length : close + 1;
        continue;
      }
      text += c;
      i++;
    }
    tokens.push({ text: text, quote: quote, quoted: quoted, op: false });
  }
  return tokens;
}

export function globToRegExp(pattern) {
  var out = '^';
  for (var i = 0; i < pattern.length; i++) {
    var c = pattern.charAt(i);
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out + '/?$');
}

// A line is segments joined by ; && ||; a segment is a pipeline of stages;
// a stage is a command with an optional > or >> target and an optional
// input: < a file, <<< a string, or << a heredoc, whose body arrives later
// (the line editor collects it) and is matched up by index. Words stay words
// until their stage runs, so `false; echo $?` sees the false.
export function parse(tokens) {
  var segments = [];
  var seg = { join: ';', stages: [], background: false, parts: [] };
  var stage = { words: [], redirect: null, input: null };
  var heredocs = [];
  var error = null;

  function pushStage() {
    if (stage.words.length || stage.redirect || stage.input) seg.stages.push(stage);
    stage = { words: [], redirect: null, input: null };
  }
  function pushSeg(join) {
    pushStage();
    seg.text = seg.parts.join(' ');
    if (seg.stages.length) segments.push(seg);
    seg = { join: join, stages: [], background: false, parts: [] };
  }

  // How a token reads back, for the text a segment keeps (what jobs shows).
  function shown(t) {
    return t.quoted ? t.quote + t.text + t.quote : t.text;
  }

  for (var i = 0; i < tokens.length && !error; i++) {
    var t = tokens[i];
    var separator = t.op && (t.text === ';' || t.text === '&' || t.text === '&&' || t.text === '||');
    if (!separator) {
      seg.parts.push(shown(t));
      if (t.op && tokens[i + 1] && !tokens[i + 1].op && t.text !== '|') seg.parts.push(shown(tokens[i + 1]));
    }
    if (!t.op) {
      stage.words.push(t);
      continue;
    }
    if (t.text === '|') {
      pushStage();
    } else if (t.text === ';' || t.text === '&') {
      if (t.text === '&') seg.background = true;
      pushSeg(';');
    } else if (t.text === '&&' || t.text === '||') {
      pushSeg(t.text);
    } else if (t.text.charAt(0) === '<') {
      var source = tokens[i + 1];
      if (!source || source.op) {
        error = "sebiwish: syntax error near unexpected token `newline'";
      } else {
        if (t.text === '<') {
          stage.input = { file: source };
        } else if (t.text === '<<<') {
          stage.input = { string: source };
        } else {
          stage.input = { heredoc: heredocs.length };
          heredocs.push({ delim: source.text, strip: t.text === '<<-', literal: source.quoted });
        }
        i++;
      }
    } else {
      var target = tokens[i + 1];
      if (!target || target.op) {
        error = "sebiwish: syntax error near unexpected token `newline'";
      } else {
        stage.redirect = { word: target, append: t.text === '>>' };
        i++;
      }
    }
  }
  pushSeg(';');
  return { segments: segments, heredocs: heredocs, error: error };
}
