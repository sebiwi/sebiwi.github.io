// The prompt: readline keys, history recall, ctrl+r, heredocs and tab
// completion.

import { dom } from './dom.js';
import { envValue } from './env.js';
import { eofWarning, execute } from './exec.js';
import { ctx, fs, historyKept, updateTitle } from './fsview.js';
import { MAX_HISTORY, hist, historyExpand, saveHistory } from './history.js';
import { isDrawn } from './ink.js';
import { PACKAGES } from './inkdb.js';
import { endJob, flushNotices, jobs, stopJob } from './jobs.js';
import { powerOff } from './pageparts.js';
import { parse, tokenize } from './parse.js';
import { BUILTINS, commands } from './registry.js';
import { printLine, printText, styled, textNode } from './screen.js';
import { ALIASES, sh } from './state.js';
import { exitShell, getTmux, paneClick, tmuxKeydown } from './tmux.js';
import { can, entries, isDirLike, lookup } from './vfs.js';

export var search = null;                 // { query, at, saved } while ctrl+r is open
export var killRing = '';

// A line with heredocs waits for their bodies: the prompt turns to >, and
// each line typed is body until one is exactly the delimiter (after leading
// tabs, for <<-). The last delimiter runs the line.
export var pending = null; // { line, docs, bodies, at }

// The prompt: > while a heredoc is open, # for root, $ for everyone else.
export function ps1() {
  return pending ? '>' : sh.uid === 'root' ? '#' : '$';
}

export function heredocsOf(line) {
  var parsed = parse(tokenize(line));
  return parsed.error ? [] : parsed.heredocs;
}

export function finishHeredoc() {
  var line = pending.line;
  var bodies = pending.bodies;
  pending = null;
  dom.promptLabel.textContent = ps1();
  execute(line, bodies, { async: true, done: promptReturned });
}

export function feedHeredoc(raw) {
  var doc = pending.docs[pending.at];
  var text = doc.strip ? raw.replace(/^\t+/, '') : raw;
  if (text !== doc.delim) {
    pending.bodies[pending.at].push(text);
    return;
  }
  pending.at++;
  if (pending.at < pending.docs.length) {
    pending.bodies.push([]);
    return;
  }
  finishHeredoc();
}

// ctrl+d on an empty body line: every heredoc still open ends here, with
// the warning bash gives, and the line runs with what it got.
export function endHeredocs() {
  for (var i = pending.at; i < pending.docs.length; i++) {
    printText(eofWarning(pending.docs[i].delim));
    if (!pending.bodies[i]) pending.bodies.push([]);
  }
  finishHeredoc();
}

// The prompt is back: background jobs that ended meanwhile say so now,
// after the command's own output, the way a shell reports them.
export function promptReturned() {
  if (!jobs.fg) flushNotices();
  renderLine();
}

export function submit(raw) {
  var expanded = historyExpand(raw, hist.lines);
  if (expanded.line === null) {
    printText(expanded.error);
    sh.lastStatus = 1;
    return;
  }
  var line = expanded.line;
  if (expanded.echo) printLine([styled('term-prompt', ps1()), textNode(' ' + line)]);
  var trimmed = line.trim();
  // Like a shell: blank lines and immediate repeats don't pile up. With no
  // history file, nothing is written down at all.
  if (trimmed && historyKept() && hist.lines[hist.lines.length - 1] !== trimmed) {
    hist.lines.push(trimmed);
    if (hist.lines.length > MAX_HISTORY) hist.lines.shift();
    saveHistory();
  }
  hist.index = hist.lines.length;
  hist.draft = '';
  if (!/^\s*(exit|logout)\b/.test(line)) sh.warnedStopped = false;
  if (!trimmed) {
    flushNotices();
    return;
  }
  var docs = heredocsOf(line);
  if (docs.length) {
    pending = { line: line, docs: docs, bodies: [[]], at: 0 };
    dom.promptLabel.textContent = ps1();
    return;
  }
  execute(line, undefined, { async: true, done: promptReturned });
}

export function run(raw) {
  printLine([styled('term-prompt', ps1()), textNode(' ' + raw)]);
  if (pending) feedHeredoc(raw);
  else submit(raw);
}

// ------------------------------------------------------------- line editor

export function caretPos() {
  var at = dom.input.selectionStart;
  if (at === null || at === undefined || at > dom.input.value.length) return dom.input.value.length;
  return at;
}

// The visible line: text before the caret, the character under it, the rest.
// The cursor is a real position, not a block parked at the end.
export function renderLine() {
  if (search) {
    var label = search.at === -1 && search.query ? 'failed reverse-i-search' : 'reverse-i-search';
    dom.promptLabel.textContent = '(' + label + ')`' + search.query + "':";
    dom.echo.textContent = matchedLine();
    dom.cursor.textContent = ' ';
    dom.tail.textContent = '';
    return;
  }
  dom.promptLabel.textContent = ps1();
  updateTitle();
  var value = dom.input.value;
  var at = caretPos();
  dom.echo.textContent = value.slice(0, at);
  dom.cursor.textContent = value.charAt(at) || ' ';
  dom.tail.textContent = value.slice(at + 1);
}

// A key the prompt takes is the prompt's: stopping propagation keeps it away
// from the page's own shortcuts, and ctrl+k is one of theirs (the search
// modal). preventDefault alone would leave the modal opening under us.
export function consume(e) {
  e.preventDefault();
  e.stopPropagation();
}

export function setCaret(at) {
  at = Math.max(0, Math.min(at, dom.input.value.length));
  try {
    dom.input.setSelectionRange(at, at);
  } catch (err) {
    /* a detached or disabled input has no caret to move */
  }
  renderLine();
}

export function setLine(text, at) {
  dom.input.value = text;
  setCaret(at === undefined ? text.length : at);
}

export function recallHistory(step) {
  var next = hist.index + step;
  if (next < 0 || next > hist.lines.length) return;
  if (hist.index === hist.lines.length) hist.draft = dom.input.value;
  hist.index = next;
  setLine(hist.index === hist.lines.length ? hist.draft : hist.lines[hist.index]);
}

export function wordStart(text, at) {
  var i = at;
  while (i > 0 && /\s/.test(text.charAt(i - 1))) i--;
  while (i > 0 && !/\s/.test(text.charAt(i - 1))) i--;
  return i;
}

export function wordEnd(text, at) {
  var i = at;
  while (i < text.length && /\s/.test(text.charAt(i))) i++;
  while (i < text.length && !/\s/.test(text.charAt(i))) i++;
  return i;
}

// Everything the kill chords have in common: cut a range, keep it for ctrl+y.
export function cut(from, to) {
  var value = dom.input.value;
  killRing = value.slice(from, to);
  setLine(value.slice(0, from) + value.slice(to), from);
}

// ------------------------------------------------------- reverse-i-search

export function findMatch(query, from) {
  for (var i = from; i >= 0; i--) {
    if (hist.lines[i].indexOf(query) !== -1) return i;
  }
  return -1;
}

export function matchedLine() {
  return search.at === -1 ? '' : hist.lines[search.at];
}

export function startSearch() {
  search = { query: '', at: -1, saved: dom.input.value };
  dom.input.value = '';
  renderLine();
}

export function endSearch(line) {
  search = null;
  dom.promptLabel.textContent = ps1();
  setLine(line);
}

// Leaving the search on a match: it becomes the line being edited, and up/down
// carry on from where that match sits in the history.
export function acceptSearch() {
  if (search.at === -1) {
    endSearch(search.saved);
    return;
  }
  hist.draft = search.saved;
  hist.index = search.at;
  endSearch(hist.lines[search.at]);
}

// ---------------------------------------------------------- tab completion

// Names under a directory, for a word that may carry a path: 'cat ~/.ba'
// completes inside ~, 'cd /e' to /etc/. Directories keep their slash.
export function pathCandidates(word, dirsOnly, execOnly) {
  var cut = word.lastIndexOf('/');
  var dirPart = cut === -1 ? '' : word.slice(0, cut + 1);
  var stem = word.slice(cut + 1);
  var c = ctx();
  var where = dirPart.charAt(0) === '~' ? c.home + dirPart.slice(1) : dirPart;
  var dir = lookup(fs, where || '.', c);
  if (dir.error || !isDirLike(dir.node) || !can(dir.node, c.user, 4)) return [];
  var out = [];
  var kids = entries(dir.node);
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].name.charAt(0) === '.' && stem.charAt(0) !== '.') continue;
    var target = kids[i].node.type === 'symlink' ? lookup(fs, (where || '.') + '/' + kids[i].name, c).node : kids[i].node;
    var isDir = !!target && isDirLike(target);
    if (dirsOnly && !isDir) continue;
    if (execOnly && !isDir && !(target && can(target, c.user, 1))) continue;
    out.push(dirPart + kids[i].name + (isDir ? '/' : ''));
  }
  return out;
}

// Every command a first word could be: builtins, aliases, and what $PATH
// holds right now. A deleted /bin file stops completing, as it should.
export function commandNames() {
  var names = BUILTINS.concat(Object.keys(ALIASES));
  var dirs = (envValue('PATH') || '').split(':');
  var c = ctx();
  for (var d = 0; d < dirs.length; d++) {
    var dir = dirs[d] ? lookup(fs, dirs[d], c) : { error: 'ENOENT' };
    if (dir.error || !isDirLike(dir.node)) continue;
    var kids = entries(dir.node);
    for (var k = 0; k < kids.length; k++) {
      var n = kids[k].name;
      if (!isDirLike(kids[k].node) && names.indexOf(n) === -1) names.push(n);
    }
  }
  return names.sort();
}

export function candidates(word, argv, firstWord) {
  var pool;
  // After sudo (and xargs, exec, nohup, time) and their flags comes a
  // command, so the word completes as one.
  var runner = /^(sudo|xargs|exec|nohup|time)$/.test(argv[0] || '') && argv.slice(1).every(function (w) { return w.charAt(0) === '-'; });
  if (firstWord || runner) {
    pool = word.indexOf('/') !== -1 ? pathCandidates(word, false, true) : commandNames();
  } else if (argv[0] === 'cd' || argv[0] === 'rmdir') {
    pool = pathCandidates(word, true, false);
  } else if (argv[0] === 'man' || argv[0] === 'which' || argv[0] === 'help' || argv[0] === 'type') {
    pool = commandNames();
  } else if (argv[0] === 'ink' && argv.length === 1) {
    pool = ['draw', 'erase', 'list', 'search'];
  } else if (argv[0] === 'ink' && argv[1] === 'erase') {
    pool = Object.keys(PACKAGES).filter(isDrawn);
  } else if (argv[0] === 'ink') {
    pool = Object.keys(PACKAGES);
  } else if (argv[0] === 'export' || argv[0] === 'unset' || argv[0] === 'printenv') {
    pool = sh.env.map(function (e) { return e[0]; });
  } else {
    pool = pathCandidates(word, false, false);
  }
  var hits = [];
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].indexOf(word) === 0 && hits.indexOf(pool[i]) === -1) hits.push(pool[i]);
  }
  return hits;
}

export function commonPrefix(words) {
  var prefix = words[0];
  for (var i = 1; i < words.length; i++) {
    while (prefix && words[i].indexOf(prefix) !== 0) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

// Completion works on the word under the caret, so it behaves the same
// whether the caret is at the end of the line or back inside it.
export function complete() {
  var value = dom.input.value;
  var at = caretPos();
  var head = value.slice(0, at);
  var start = head.search(/\S*$/);
  var word = head.slice(start);
  var before = head.slice(0, start);
  var argv = before.trim().split(/\s+/).filter(Boolean);
  var hits = candidates(word, argv, argv.length === 0);
  if (!hits.length) return; // nothing to say, like a shell with no match
  if (hits.length === 1) {
    // A directory keeps its slash and no space, so it reads like a path.
    var hit = hits[0];
    var insert = hit + (hit.slice(-1) === '/' ? '' : ' ');
    setLine(before + insert + value.slice(at), before.length + insert.length);
    return;
  }
  var prefix = commonPrefix(hits);
  if (prefix.length > word.length) {
    setLine(before + prefix + value.slice(at), before.length + prefix.length);
    return;
  }
  // As far as the common prefix goes: show what's on offer. The line being
  // typed needs no redraw, since the live prompt below the listing is one.
  printText(hits.join('  '));
}

// ------------------------------------------------------------------ wiring

// Show whatever the input now holds. Typing, deleting and pasting all end up
// here, and the caret is read back from the input, so mid-line edits render.
// What the hidden input holds while a job reads typing (sudo's prompt): one
// character, so a mobile Backspace has something to delete and says so in
// an input event. Nothing typed ever stays in the input.
export var INPUT_PLACEHOLDER = ' ';

export function renderInput(e) {
  // Mobile keyboards type through input events, not keydown. While a job is
  // in front, what they type goes to the job (or nowhere), by the event's
  // type and text, and the input goes back to empty, or to the placeholder
  // for a job that reads typing.
  if (jobs.fg) {
    var reader = jobs.fg.opts && jobs.fg.opts.onInput;
    var value = dom.input.value;
    var kind = e && e.inputType;
    var data = e && typeof e.data === 'string' ? e.data : null;
    dom.input.value = reader ? INPUT_PLACEHOLDER : '';
    if (!reader) return;
    if (kind && kind.indexOf('delete') === 0) reader('', true);
    else if (data !== null) reader(data, false);
    else if (value.indexOf(INPUT_PLACEHOLDER) === 0 && value !== INPUT_PLACEHOLDER) reader(value.slice(INPUT_PLACEHOLDER.length), false);
    else if (value && value !== INPUT_PLACEHOLDER) reader(value, false);
    return;
  }
  if (search) {
    search.query = dom.input.value;
    search.at = search.query ? findMatch(search.query, hist.lines.length - 1) : -1;
  }
  renderLine();
}

export function initLineEditor() {
  dom.input.addEventListener('input', renderInput);

  // Pasting several lines runs the complete ones and leaves the last at the
  // prompt, which is what a terminal does with a multi-line paste.
  dom.input.addEventListener('paste', function (e) {
    var clipboard = e.clipboardData || window.clipboardData;
    // Pasting into a running job: the job takes it (sudo's prompt takes it
    // as a password) or nobody does. It never lands in the hidden input,
    // where it would show up on the prompt line afterwards.
    if (jobs.fg) {
      e.preventDefault();
      var pasted = clipboard ? clipboard.getData('text') : '';
      if (jobs.fg.opts && jobs.fg.opts.onPaste) jobs.fg.opts.onPaste(pasted);
      return;
    }
    if (!clipboard) return;
    var text = clipboard.getData('text');
    if (!text || text.indexOf('\n') === -1) return; // one line: let the browser paste it
    e.preventDefault();
    var at = caretPos();
    var before = dom.input.value.slice(0, at);
    var after = dom.input.value.slice(at);
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length - 1; i++) {
      var whole = (i === 0 ? before : '') + lines[i];
      setLine('');
      run(whole);
      if (jobs.fg) break; // a job took the front: the rest of the paste goes with the typing
    }
    setLine(lines[lines.length - 1] + after, lines[lines.length - 1].length);
  });

  dom.input.addEventListener('keydown', function (e) {
    // Terminal chords only on plain ctrl, and only while the prompt has focus,
    // so cmd+R and the rest of the browser's shortcuts stay untouched.
    var chord = e.ctrlKey && !e.metaKey && !e.altKey;
    var meta = e.altKey && !e.ctrlKey && !e.metaKey;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var value = dom.input.value;
    var at = caretPos();

    // While something runs in front, the keyboard is its: a job with an
    // onKey takes what it wants, ctrl+c interrupts, ctrl+z stops.
    if (jobs.fg) {
      var fg = jobs.fg;
      if (fg.opts && fg.opts.onKey && fg.opts.onKey(e, key, chord)) {
        consume(e);
        return;
      }
      if (chord && key === 'c') {
        consume(e);
        if (fg.stubborn) return;
        printText('^C');
        endJob(fg, 'interrupted');
      } else if (chord && key === 'z') {
        consume(e);
        printText('^Z');
        stopJob(fg);
      } else if (e.key.length === 1 || e.key === 'Enter') {
        consume(e);
      }
      return;
    }

    if (!search && tmuxKeydown(e, chord, key, at)) return;

    if (chord && key === 'r') {
      consume(e);
      if (!search) {
        startSearch();
      } else {
        // Again: the next older match, or stay put when there isn't one.
        var older = findMatch(search.query, search.at === -1 ? -1 : search.at - 1);
        if (older !== -1) search.at = older;
        renderLine();
      }
      return;
    }

    if (chord && key === 'c') {
      // A selection keeps the native copy: on Windows and Linux ctrl+c is how
      // you copy, and silently eating that would be rude.
      var selection = window.getSelection();
      if (selection && selection.type === 'Range') return;
      consume(e);
      var abandoned = search ? matchedLine() : value;
      if (search) endSearch('');
      printLine([styled('term-prompt', ps1()), textNode(' ' + abandoned + '^C')]);
      if (pending) {
        pending = null; // the whole command goes, not just this line of it
        dom.promptLabel.textContent = ps1();
        sh.lastStatus = 130;
      }
      setLine('');
      hist.index = hist.lines.length;
      hist.draft = '';
      return;
    }

    // ctrl+g is the shell's "forget I asked": the search goes, the line it
    // interrupted comes back.
    if (chord && key === 'g' && search) {
      consume(e);
      endSearch(search.saved);
      return;
    }

    if (e.key === 'Escape') {
      if (search) {
        consume(e);
        acceptSearch();
        return;
      }
      // Escape leaves the prompt. Tab is spoken for while a word is being
      // completed, so this is the way out that always works.
      dom.input.blur();
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey && !chord && !e.metaKey && !e.altKey) {
      if (search) acceptSearch();
      // Nothing typed: tab keeps its day job and moves focus off the prompt.
      // shift+tab is never touched, so backwards always works too.
      if (dom.input.value === '') return;
      consume(e);
      complete();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || (chord && (key === 'p' || key === 'n'))) {
      consume(e);
      if (search) acceptSearch();
      else recallHistory(e.key === 'ArrowUp' || key === 'p' ? -1 : 1);
      return;
    }

    if (e.key === 'Enter' && !e.isComposing) {
      consume(e);
      if (search) acceptSearch();
      var raw = dom.input.value;
      setLine('');
      run(raw);
      return;
    }

    if (search) return; // the rest of the chords wait until the search is done

    // Readline, the useful bits.
    if (chord && key === 'a') {
      consume(e);
      setCaret(0);
      return;
    }
    if (chord && key === 'e') {
      consume(e);
      setCaret(value.length);
      return;
    }
    if (chord && key === 'b') {
      consume(e);
      setCaret(at - 1);
      return;
    }
    if (chord && key === 'f') {
      consume(e);
      setCaret(at + 1);
      return;
    }
    if (chord && key === 'w') {
      consume(e);
      cut(wordStart(value, at), at);
      return;
    }
    if (chord && key === 'u') {
      consume(e);
      cut(0, at);
      return;
    }
    if (chord && key === 'k') {
      consume(e);
      cut(at, value.length);
      return;
    }
    if (chord && key === 'y') {
      consume(e);
      setLine(value.slice(0, at) + killRing + value.slice(at), at + killRing.length);
      return;
    }
    if (chord && key === 'l') {
      consume(e);
      commands.clear();
      return;
    }
    if (chord && key === 'd') {
      consume(e);
      if (!value && pending) {
        printLine([styled('term-prompt', ps1())]);
        endHeredocs();
        return;
      }
      // ctrl+d on an empty line is how you leave a shell.
      if (!value && (sh.shells.length || (getTmux() && getTmux().attached))) {
        printLine([styled('term-prompt', ps1()), textNode(' exit')]);
        exitShell();
        renderLine(); // the shell we are back in may be someone else's: # or $
        return;
      }
      if (!value) {
        printLine([styled('term-prompt', ps1()), textNode(' logout')]);
        powerOff();
        return;
      }
      setLine(value.slice(0, at) + value.slice(at + 1), at);
      return;
    }
    if (meta && (e.code === 'KeyB' || e.key === 'b')) {
      consume(e);
      setCaret(wordStart(value, at));
      return;
    }
    if (meta && (e.code === 'KeyF' || e.key === 'f')) {
      consume(e);
      setCaret(wordEnd(value, at));
      return;
    }
    if (meta && (e.code === 'KeyD' || e.key === 'd')) {
      consume(e);
      cut(at, wordEnd(value, at));
      return;
    }

    // Caret keys are handled here rather than natively, so the rendered cursor
    // and the real one can never disagree.
    if (e.key === 'ArrowLeft') {
      consume(e);
      setCaret(at - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      consume(e);
      setCaret(at + 1);
      return;
    }
    if (e.key === 'Home') {
      consume(e);
      setCaret(0);
      return;
    }
    if (e.key === 'End') {
      consume(e);
      setCaret(value.length);
    }
  });

  dom.terminal.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    paneClick(e);
    var selection = window.getSelection();
    if (selection && selection.type === 'Range') return;
    dom.input.focus({ preventScroll: true });
  });

  // Typing anywhere on the page lands in the prompt, as long as nothing else
  // wants the keystroke: no modifiers (⌘K search), no other field focused,
  // no open search modal. The character is inserted manually because focus()
  // mid-keydown doesn't reroute the default text insertion in every browser.
  // Tab rides along for the same reason: a line can be typed without the
  // hidden input ever becoming the focused element, and completing it has to
  // work either way.
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    var completing = e.key === 'Tab' && !e.shiftKey;
    if (!completing && e.key.length !== 1) return; // printable characters only
    if (!dom.input.isConnected || dom.input.disabled || jobs.fg) return;
    var active = document.activeElement;
    // e.target covers a keystroke aimed at the prompt while focus sits
    // elsewhere: its own handler has it, and completing twice would be wrong.
    if (active === dom.input || e.target === dom.input) return;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    // Space keeps its native meaning where it has one: activating a focused
    // control, or scrolling when nothing has been typed yet. Commands never
    // start with a space, so an empty-buffer Space can safely go to the page.
    if (!completing && e.key === ' ' && active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'SUMMARY')) return;
    if (!completing && e.key === ' ' && dom.input.value === '') return;
    var modal = document.getElementById('search-modal');
    if (modal && !modal.hasAttribute('hidden')) return;
    // Nothing typed: tab keeps its day job and moves focus through the page.
    // shift+tab is never touched, so the terminal can't trap a keyboard.
    if (completing && dom.input.value === '') return;
    e.preventDefault();
    dom.input.focus({ preventScroll: true });
    if (completing) {
      complete();
      return;
    }
    setLine(dom.input.value + e.key);
  });
}
