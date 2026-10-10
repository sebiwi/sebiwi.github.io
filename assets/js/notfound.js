// 404 page: fills in the path the visitor tried to reach, then hides an easter
// egg. The terminal prompt is real, and what sits behind it is a small but
// honest shell.
//
// The language: quoted words, $VAR expansion, globs, ; && || chaining, pipes,
// < > and >> redirection, << heredocs (with a > prompt for the body) and <<<
// here-strings, # comments, NAME=value (alone or before a command), $? exit
// status, ! history expansion, aliases.
// The filesystem: read off the `ls ~/` line above the prompt, so the shell
// can't drift from what the page shows. touch, mkdir and > add to it, and rm
// genuinely deletes: page elements vanish, directories take their navbar link
// with them, and rm -rf / wipes everything, then the whole site powers off
// like an old CRT.
// The line editor: a cursor that sits where the caret really is, the readline
// chords (ctrl+a/e/b/f/w/u/k/y/d/l and alt+b/f/d), up/down through a history
// kept in sessionStorage, ctrl+r reverse search, tab completion, ctrl+c. The
// history lives in .sebiwi_history, so rm on that file ends all of it.
// Subshells: sebiwish (or bash, sh, zsh) starts another one, SHLVL and all.
// Its environment is a copy, so what it exports dies with it, and exit only
// powers the site off from the outermost shell.
// Jobs: ping, sleep and yes print on a timer and ctrl+c interrupts them, which
// is the only reason ctrl+c means anything.
// Packages: ink, the house package manager, installs what the shell ships
// without: tmux, sl, lolcat. Asking for one before it is inked says how.
// tmux: a session of windows split into panes, each pane its own screen and
// shell, a status line, ctrl+b for a prefix, detach and attach.
// Toys: uname, env, neofetch, top, ps, df, tree, date, cowsay, fortune, sudo,
// git, vim, curl/ssh (there is no network, only sebiwi), and package managers
// that question your judgment. Most are hidden from help; man knows them.
// Nothing outlives the tab: reloading restores the page.
(function () {
  'use strict';

  var attempted = document.querySelector('[data-404-path]');
  if (attempted && window.location && window.location.pathname) {
    attempted.textContent = window.location.pathname;
  }

  var pre = document.querySelector('.term-404');
  var livePrompt = document.querySelector('[data-term-live]');
  var input = document.querySelector('[data-term-input]');
  var echo = document.querySelector('[data-term-typed]');
  var terminal = document.querySelector('.terminal-404');
  if (!pre || !livePrompt || !input || !echo || !terminal) return;

  // The live prompt is four pieces: the '$' (ctrl+r borrows it), the text
  // before the caret, the character under it, and the text after.
  var promptLabel = livePrompt.querySelector('.term-prompt');
  var cursor = livePrompt.querySelector('.term-cursor');
  var tail = livePrompt.querySelector('[data-term-rest]');
  if (!promptLabel || !cursor || !tail) return;

  var FADE_MS = 180;
  var WIPE_STEP_MS = 300;
  var MAX_SCROLLBACK = 100;
  var HISTORY_KEY = 'sebiwi:404:history';
  var HISTORY_FILE = '.sebiwi_history';
  var MAX_HISTORY = 100;
  var YES_LIMIT = 300; // yes runs forever, within reason

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- the files

  var BASHRC = [
    '# sebiwish, such as it is',
    "PS1='$ '",
    "alias ll='ls -l'",
    "alias la='ls -a'",
    "alias please='sudo'",
    "alias ..='cd ..'",
    'export EDITOR=pencil',
    '# there is no network, only sebiwi'
  ].join('\n');

  // What the shell can see. The directories are read off the links of the
  // static `ls ~/` line above the prompt (a trailing slash in the link text
  // means directory, so the listing can carry a file too), which keeps the
  // shell from drifting from what the page shows. "element" entries map rm
  // targets to parts of this page, and the one flagged text can be read.
  // Dotfiles only show up under ls -a; sizes are for ls -l flavor only.
  var files = [];
  var lsLinks = pre.querySelectorAll('a.term-link');
  for (var li = 0; li < lsLinks.length; li++) {
    var lsName = (lsLinks[li].textContent || '').trim();
    var lsUrl = lsLinks[li].getAttribute('href');
    var isDir = lsName.slice(-1) === '/';
    files.push({
      name: lsName,
      kind: isDir ? 'dir' : 'file',
      url: lsUrl,
      size: isDir ? 4096 : 1998,
      navSelector: '.top-nav a[href="' + lsUrl + '"]'
    });
  }
  files.push(
    { name: 'nav', kind: 'element', selector: '.top-nav', size: 512 },
    { name: 'controls', kind: 'element', selector: '.page-controls', size: 256 },
    { name: 'hint.txt', kind: 'element', selector: '[data-404-hint]', size: 42, text: true },
    { name: 'terminal', kind: 'element', selector: '.terminal-404', size: 8192 },
    { name: '.bashrc', kind: 'file', hidden: true, content: BASHRC },
    { name: '.gitignore', kind: 'file', hidden: true, content: 'public/\nresources/\n.hugo_build.lock' },
    // The history file is the history, so it can't go stale either. Delete it
    // and the shell has nowhere left to keep one: see historyKept.
    { name: HISTORY_FILE, kind: 'file', hidden: true, read: function () { return cmdHistory.slice(); } }
  );

  function elementOf(file) {
    return file.kind === 'element' ? document.querySelector(file.selector) : null;
  }

  // Elements live until removed from the DOM; everything else carries a removed
  // flag instead (deleting a directory can't unpublish the real site).
  function exists(file) {
    if (file.kind === 'element') return !!elementOf(file);
    return !file.removed;
  }

  function listing(all) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      if (exists(files[i]) && (all || !files[i].hidden)) out.push(files[i]);
    }
    return out;
  }

  // "blog", "blog/", "~/blog" and "/blog" all resolve to the blog/ entry.
  // Deleted entries don't resolve, so rm and cd report them as missing.
  function resolve(name) {
    var clean = name.replace(/^~\//, '').replace(/^\//, '').replace(/\/$/, '');
    for (var i = 0; i < files.length; i++) {
      if (files[i].name.replace(/\/$/, '') === clean && exists(files[i])) return files[i];
    }
    return null;
  }

  // A deleted file the shell still knows about. touch remakes that entry rather
  // than pushing a blank namesake, so .sebiwi_history comes back as the real
  // history file and not as an empty file wearing its name.
  function deletedFile(name) {
    var clean = name.replace(/^~\//, '').replace(/^\//, '');
    for (var i = 0; i < files.length; i++) {
      if (files[i].kind === 'file' && files[i].removed && files[i].name === clean) return files[i];
    }
    return null;
  }

  // The lines of a file, or null when it isn't the kind of thing you can read.
  function fileLines(file) {
    if (file.read) return file.read();
    if (typeof file.content === 'string') {
      return file.content === '' ? [] : file.content.split('\n');
    }
    if (file.kind === 'element' && file.text) {
      var el = elementOf(file);
      return el ? [el.textContent.replace(/\s+/g, ' ').trim()] : [];
    }
    return null;
  }

  function sizeOf(file) {
    if (file.kind === 'element' || file.kind === 'dir') return file.size || 0;
    var lines = fileLines(file);
    return lines ? lines.join('\n').length : file.size || 0;
  }

  // ---------------------------------------------------------------- printing

  function textNode(text) {
    return document.createTextNode(text);
  }

  function styled(className, text) {
    var span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function fileLink(file) {
    var link = document.createElement('a');
    link.className = 'term-link';
    link.href = file.url;
    link.textContent = file.name;
    return link;
  }

  // Every printed line is a .term-line span followed by a newline text node,
  // inserted above the live prompt; the pair is what trimScrollback() drops.
  function printLine(nodes) {
    var line = document.createElement('span');
    line.className = 'term-line';
    for (var i = 0; i < nodes.length; i++) {
      line.appendChild(nodes[i]);
    }
    pre.insertBefore(line, livePrompt);
    pre.insertBefore(textNode('\n'), livePrompt);
    trimScrollback();
    pre.scrollTop = pre.scrollHeight; // the box scrolls, like a terminal
  }

  function printText(text) {
    printLine([textNode(text)]);
  }

  function trimScrollback() {
    var lines = pre.querySelectorAll('.term-line');
    for (var i = 0; i < lines.length - MAX_SCROLLBACK; i++) {
      var newline = lines[i].nextSibling;
      if (newline && newline.nodeType === Node.TEXT_NODE) {
        pre.removeChild(newline);
      }
      pre.removeChild(lines[i]);
    }
  }

  function pad(text, width) {
    while (text.length < width) text = ' ' + text;
    return text;
  }

  function padRight(text, width) {
    while (text.length < width) text += ' ';
    return text;
  }

  // Commands write through a sink, so a pipeline can collect what they print
  // instead of showing it. The screen sink is the terminal itself.
  var screenSink = {
    text: printText,
    line: printLine,
    lines: null
  };

  function captureSink() {
    var lines = [];
    return {
      text: function (str) { lines.push(str); },
      line: function (nodes) {
        var text = '';
        for (var i = 0; i < nodes.length; i++) text += nodes[i].textContent;
        lines.push(text);
      },
      lines: lines
    };
  }

  // ------------------------------------------------------- deleting the page

  // Fade an element out, then drop it from the DOM. The page's entrance
  // animation pins opacity via fill-mode (which outranks transitions and
  // inline styles), so the fade must be a WAAPI animation: those win.
  function vaporize(el, done) {
    function finish() {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (done) done();
    }
    if (reducedMotion || !el.animate) {
      finish();
      return;
    }
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
    window.setTimeout(finish, FADE_MS);
  }

  var farewellShown = false;

  // The terminal's dying words, shown whenever the terminal itself goes: via
  // rm terminal, exit, shutdown, or the end of rm -rf /.
  function farewell() {
    if (farewellShown) return;
    farewellShown = true;
    var line = document.createElement('p');
    line.className = 'term-shutdown';
    line.textContent = 'Connection to sebiwi closed.';
    // Inside <main>, not <body>: main's min-height would otherwise push
    // the line below the fold on short viewports.
    (document.querySelector('main') || document.body).appendChild(line);
  }

  // rm -rf / ends with the site powering off like an old CRT: white flash,
  // collapse to a scanline, then a dot, then black. The styles are injected
  // here, not in style.css, so no page pays for them until the moment the
  // effect runs. Reduced motion cuts straight to black.
  var TV_CSS =
    '.tv-off{position:fixed;inset:0;z-index:2147483647;background:#000}' +
    '.tv-off::after{content:"";position:absolute;inset:0;background:#fff;' +
    'animation:tv-collapse .6s cubic-bezier(.23,1,.32,1) forwards}' +
    '@keyframes tv-collapse{' +
    '0%{transform:scale(1,1);opacity:1}' +
    '55%{transform:scale(1,.004)}' +
    '85%{transform:scale(.001,.004);opacity:1}' +
    '100%{transform:scale(.001,.004);opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.tv-off::after{animation:none;opacity:0}}';

  function tvOff(then) {
    var style = document.createElement('style');
    style.textContent = TV_CSS;
    document.head.appendChild(style);
    var screen = document.createElement('div');
    screen.className = 'tv-off';
    screen.setAttribute('aria-hidden', 'true');
    document.body.appendChild(screen);
    if (then) window.setTimeout(then, reducedMotion ? 0 : 700);
  }

  // Powering down on purpose: exit, shutdown, reboot. A beat to read the
  // parting line, then the screen goes.
  function powerOff(then) {
    input.disabled = true;
    input.blur();
    farewell();
    window.setTimeout(function () { tvOff(then); }, reducedMotion ? 0 : 1200);
  }

  var wiping = false;

  // rm -rf /: everything goes, bottom up, terminal last, then the parting line
  // on the bare page, then the TV switches off. A reload brings it all back.
  function wipeEverything() {
    if (wiping) return;
    wiping = true;
    input.disabled = true;
    input.blur();
    var doomed = [];
    for (var i = files.length - 1; i >= 0; i--) {
      var el = elementOf(files[i]);
      if (el && el !== terminal) doomed.push(el);
    }
    doomed.push(terminal);
    (function step(index) {
      if (index >= doomed.length) {
        farewell();
        // A beat to read the farewell line before the screen goes dark.
        window.setTimeout(tvOff, reducedMotion ? 0 : 1200);
        return;
      }
      vaporize(doomed[index], function () {
        window.setTimeout(function () {
          step(index + 1);
        }, reducedMotion ? 0 : WIPE_STEP_MS);
      });
    })(0);
  }

  function rmOne(target, recursive, force, verbose, out) {
    // '~' counts as everything too: rm -rf ~ is the canonical spelling.
    if (target === '/' || target === '/*' || target === '~' || target === '~/' || target === '*') {
      if (recursive && force) {
        wipeEverything();
      } else if (recursive) {
        out.text("rm: it is dangerous to operate recursively on '" + target + "'");
      } else {
        out.text("rm: cannot remove '" + target + "': Is a directory");
      }
      return recursive && force ? 0 : 1;
    }
    var file = resolve(target);
    if (!file) {
      if (!force) out.text("rm: cannot remove '" + target + "': No such file or directory");
      return force ? 0 : 1;
    }
    if (file.kind === 'dir' && !recursive) {
      out.text("rm: cannot remove '" + file.name + "': Is a directory");
      return 1;
    }
    if (verbose) out.text("removed '" + file.name + "'");
    if (file.kind === 'element') {
      var el = elementOf(file);
      vaporize(el, el === terminal ? farewell : null); // silent on success, like the real thing
      return 0;
    }
    // A listing entry (a directory with -r, or a file): gone from the listing,
    // and from the navbar, so the deletion shows.
    file.removed = true;
    if (file.name === HISTORY_FILE) forgetHistory();
    var navLink = file.navSelector ? document.querySelector(file.navSelector) : null;
    if (navLink) vaporize(navLink);
    return 0;
  }

  // rm -rf on every last thing: that is the whole site, and the whole show.
  function coversEverything(targets) {
    var left = listing(true);
    for (var i = 0; i < left.length; i++) {
      var name = left[i].name.replace(/\/$/, '');
      var found = false;
      for (var j = 0; j < targets.length; j++) {
        if (targets[j].replace(/\/$/, '').replace(/^\.\//, '') === name) found = true;
      }
      if (!found) return false;
    }
    return left.length > 0;
  }

  // ----------------------------------------------------------------- reading

  function catOne(target, out) {
    var file = resolve(target);
    if (!file) {
      out.text('cat: ' + target + ': No such file or directory');
      return 1;
    }
    if (file.kind === 'dir') {
      out.text('cat: ' + file.name + ': Is a directory');
      return 1;
    }
    var lines = fileLines(file);
    if (!lines) {
      out.text('cat: ' + file.name + ': Is a widget');
      return 1;
    }
    for (var i = 0; i < lines.length; i++) out.text(lines[i]);
    return 0;
  }

  // What a filter reads: the files it was given, or the pipe behind it.
  function inputLines(targets, io, name) {
    if (!targets.length) {
      if (io.stdin) return { lines: io.stdin, status: 0 };
      io.out.text(name + ': missing operand');
      return { lines: null, status: 1 };
    }
    var lines = [];
    var status = 0;
    for (var i = 0; i < targets.length; i++) {
      var file = resolve(targets[i]);
      if (!file) {
        io.out.text(name + ': ' + targets[i] + ': No such file or directory');
        status = 1;
      } else if (file.kind === 'dir') {
        io.out.text(name + ': ' + file.name + ': Is a directory');
        status = 1;
      } else {
        var body = fileLines(file);
        if (!body) {
          io.out.text(name + ': ' + file.name + ': Is a widget');
          status = 1;
        } else {
          lines = lines.concat(body);
        }
      }
    }
    return { lines: lines, status: status };
  }

  function writeFile(redirect, lines) {
    var file = resolve(redirect.name);
    if (file && file.kind === 'dir') {
      printText('sebiwish: ' + file.name + ': Is a directory');
      return 1;
    }
    if (file && file.kind === 'element') {
      printText('sebiwish: ' + file.name + ': Permission denied');
      return 1;
    }
    if (!file) {
      file = {
        name: redirect.name,
        kind: 'file',
        content: '',
        hidden: redirect.name.charAt(0) === '.'
      };
      files.push(file);
    }
    var body = lines.join('\n');
    file.content = redirect.append && file.content ? file.content + '\n' + body : body;
    return 0;
  }

  // ------------------------------------------------------------------- state

  var lastStatus = 0;

  // The environment, such as it is: env prints it, echo expands it, export and
  // unset change it.
  var ENV = [
    ['USER', 'sebiwi'],
    ['HOME', '/'],
    ['PWD', '/'],
    ['SHELL', '/bin/sebiwish'],
    ['SHLVL', '1'],
    ['TERM', 'xterm-256comic'],
    ['EDITOR', 'pencil'],
    ['PATH', '/blog:/comics:/about'],
    ['HOSTNAME', 'scoreplay'],
    ['LANG', 'en_US.UTF-8']
  ];

  function envIndex(name) {
    for (var i = 0; i < ENV.length; i++) {
      if (ENV[i][0] === name) return i;
    }
    return -1;
  }

  function envValue(name) {
    var i = envIndex(name);
    return i === -1 ? null : ENV[i][1];
  }

  // export goes through here, so whatever it sets is exported.
  function envSet(name, value) {
    var i = envIndex(name);
    if (i === -1) ENV.push([name, value]);
    else ENV[i] = [name, value];
  }

  // NAME=value on its own: a shell variable. echo sees it, env doesn't, and
  // child shells never hear of it until it is exported.
  function shellSet(name, value) {
    var i = envIndex(name);
    if (i === -1) ENV.push([name, value, true]);
    else ENV[i][1] = value;
  }

  function isExported(entry) {
    return !entry[2];
  }

  // A NAME=value word, split. The value expands like any word, minus the globs.
  function assignmentOf(token) {
    var m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(token.text);
    if (!m) return null;
    return { name: m[1], value: token.quote === "'" ? m[2] : expandVars(m[2]) };
  }

  // $NAME, ${NAME}, $? and $$, like a shell: anything unset expands to nothing.
  function expandVars(text) {
    return text.replace(/\$\{(\w+)\}|\$(\w+)|\$([?$])/g, function (match, braced, bare, special) {
      if (special === '?') return String(lastStatus);
      if (special === '$') return String(basePid + shells.length);
      var name = braced || bare;
      if (name === 'RANDOM') return String(Math.floor(Math.random() * 32768));
      var value = envValue(name);
      return value === null ? '' : value;
    });
  }

  // Aliases, and the ones .bashrc claims are there really are.
  var ALIASES = {
    ll: 'ls -l',
    la: 'ls -a',
    please: 'sudo',
    '..': 'cd ..'
  };

  // The shells under this one, innermost last. Each keeps its parent's
  // environment to put back on exit, which is the whole of being a subshell,
  // and starts with only what the parent exported.
  var shells = [];
  var basePid = 404;  // $$ of the outermost shell here; tmux windows get their own
  var exited = false; // set by exit in a subshell: the rest of its line goes with it
  var swapped = false; // set when tmux changes screens: $? belongs to the old one

  function copyEnv() {
    var copy = [];
    for (var i = 0; i < ENV.length; i++) {
      if (isExported(ENV[i])) copy.push(ENV[i].slice());
    }
    return copy;
  }

  function enterShell() {
    shells.push(ENV);
    ENV = copyEnv();
    envSet('SHLVL', String((parseInt(envValue('SHLVL'), 10) || 0) + 1));
  }

  function leaveShell() {
    ENV = shells.pop();
  }

  // ----------------------------------------------------------------- parsing

  var OPERATORS = [';', '|', '>', '<', '&'];

  // Whitespace splits words, quotes group them, and a token remembers whether
  // it was single-quoted so expansion can leave it alone. The operators
  // ; && || | > >> < << <<- <<< come out on their own, and a # that starts a
  // word ends the line.
  function tokenize(line) {
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

  function globToRegExp(pattern) {
    var out = '^';
    for (var i = 0; i < pattern.length; i++) {
      var c = pattern.charAt(i);
      if (c === '*') out += '[^/]*';
      else if (c === '?') out += '[^/]';
      else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(out + '/?$');
  }

  // A word becomes several when it globs, and stays itself when nothing
  // matches, same as a shell. Dotfiles only match a pattern that asks for them.
  function expandWord(token) {
    if (token.quote === "'") return [token.text];
    var text = expandVars(token.text);
    if (token.quoted || !/[*?]/.test(text)) return [text];
    var re = globToRegExp(text);
    var hits = [];
    var pool = listing(text.charAt(0) === '.');
    for (var i = 0; i < pool.length; i++) {
      if (re.test(pool[i].name)) hits.push(pool[i].name);
    }
    return hits.length ? hits : [text];
  }

  // A line is segments joined by ; && ||; a segment is a pipeline of stages;
  // a stage is a command with an optional > or >> target and an optional
  // input: < a file, <<< a string, or << a heredoc, whose body arrives later
  // (the line editor collects it) and is matched up by index. Words stay words
  // until their stage runs, so `false; echo $?` sees the false.
  function parse(tokens) {
    var segments = [];
    var seg = { join: ';', stages: [] };
    var stage = { words: [], redirect: null, input: null };
    var heredocs = [];
    var error = null;

    function pushStage() {
      if (stage.words.length || stage.redirect || stage.input) seg.stages.push(stage);
      stage = { words: [], redirect: null, input: null };
    }
    function pushSeg(join) {
      pushStage();
      if (seg.stages.length) segments.push(seg);
      seg = { join: join, stages: [] };
    }

    for (var i = 0; i < tokens.length && !error; i++) {
      var t = tokens[i];
      if (!t.op) {
        stage.words.push(t);
        continue;
      }
      if (t.text === '|') {
        pushStage();
      } else if (t.text === ';' || t.text === '&') {
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

  // -------------------------------------------------------------------- jobs

  // A running command. Only a lone command can run on a timer (a pipeline has
  // somewhere to put its output and no patience), and while one runs the prompt
  // steps out of the way and only ctrl+c is listened to.
  var job = null;

  function startJob(opts) {
    livePrompt.classList.add('is-running');
    var ticks = 0;
    var timer = window.setInterval(function () {
      ticks++;
      if (opts.tick(ticks) === false) endJob(false);
    }, opts.every);
    job = {
      stubborn: !!opts.stubborn, // ctrl+c bounces off it, the way it does off sl
      end: function (interrupted) {
        window.clearInterval(timer);
        job = null;
        livePrompt.classList.remove('is-running');
        if (opts.onEnd) opts.onEnd(interrupted);
        renderLine();
      }
    };
  }

  function endJob(interrupted) {
    if (job) job.end(interrupted);
  }

  // ---------------------------------------------------------------- the toys

  // uname fields, keyed by flag letter. -a prints them in this order.
  var UNAME = [
    ['s', 'sebiwiOS'],
    ['n', 'scoreplay'],
    ['r', '4.0.4-comic'],
    ['v', '#1 SMP PREEMPT_HANDDRAWN Sun Jul 13 07:19:00 UTC 2026'],
    ['m', 'pencil64'],
    ['o', 'sebiwiOS']
  ];

  // Typing another distro's package manager gets you corrected. Rudely.
  var packageManagers = {
    apt: 'Ubuntu',
    'apt-get': 'Ubuntu',
    aptitude: 'Ubuntu',
    dpkg: 'Debian',
    snap: 'Ubuntu',
    yum: 'CentOS',
    dnf: 'Fedora',
    rpm: 'Fedora',
    flatpak: 'Fedora',
    pacman: 'Arch Linux',
    yay: 'Arch Linux',
    apk: 'Alpine',
    zypper: 'openSUSE',
    emerge: 'Gentoo',
    nix: 'NixOS',
    'nix-env': 'NixOS',
    brew: 'macOS',
    port: 'macOS'
  };

  var FORTUNES = [
    'The bug is in the last place you looked, which is why you stopped looking.',
    'A comic is a postmortem with better pacing.',
    'Every incident is a design review you scheduled by accident.',
    'You are not stuck. You are between abstractions.',
    'The retry storm is coming from inside the house.',
    'Ship the small thing. The big thing is made of small things.'
  ];

  var NEOFETCH_LOGO = [' o/', '/|', '/ \\'];

  var TIMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function two(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function clockTime() {
    var now = new Date();
    return two(now.getHours()) + ':' + two(now.getMinutes()) + ':' + two(now.getSeconds());
  }

  // ---------------------------------------------------------------- the docs

  // One table, three readers: help lists what isn't hidden, man prints any of
  // it in full, and the toys stay a surprise.
  var DOCS = {
    ls: { args: '[-la]', blurb: 'list files', man: 'Lists what the page still has. -a shows the dotfiles, -l the long form. The listing is read off the page, so it is never a lie.' },
    cd: { args: '<dir>', blurb: 'go somewhere real', man: 'Directories here are real pages, so cd navigates to them. cd .. and cd - walk back through the browser history, and cd ~ goes home.' },
    pwd: { args: '', blurb: 'where you are', man: 'Always /. There is one directory and you are standing in it.' },
    cat: { args: '<file>', blurb: 'read a file', man: 'Prints a file, or its own standard input in a pipeline. hint.txt and the dotfiles are read straight off the page.' },
    echo: { args: '<text>', blurb: 'say it back', man: 'Prints its arguments. $VARS expand unless single-quoted. -n and -e are swallowed, because every line here is a line.' },
    touch: { args: '<file>', blurb: 'invent a file', man: 'Creates an empty file. It shows up in ls, completes with tab, and rm can delete it, but it will not survive a reload. Touching a name the shell has deleted brings that file back as itself.' },
    mkdir: { args: '<dir>', blurb: 'invent a directory', man: 'Creates a directory. It is not a page, so cd has nowhere to take you.' },
    rm: { args: '[-rf] <file>', blurb: 'remove a file. Or everything.', man: 'Deletes for real. Page elements leave the page, directories take their navbar link with them, and rm -rf / ends the show.' },
    grep: { args: '<pattern>', blurb: 'find lines', man: 'Filters lines by pattern, from files or from a pipe. -i ignores case, -v inverts, -c counts.' },
    clear: { args: '', blurb: 'clear the screen', man: 'Clears the scrollback. ctrl+l does the same without the typing.' },
    ink: { args: '<cmd> <pkg>', blurb: 'install what is missing', man: 'The package manager. ink install <pkg> inks a package into the shell, ink remove rubs it out, ink list shows what is inked and ink search what could be. Packages last until the tab closes.' },
    help: { args: '', blurb: 'you are here', man: 'Lists the commands worth knowing. The rest are for people who type things to see what happens.' },
    // Hidden from help, documented for anyone who thinks to ask.
    man: { args: '<command>', blurb: '', hidden: true, man: 'Prints one of these. You are reading it.' },
    history: { args: '', blurb: '', hidden: true, man: 'Lists the commands you have run, kept in sessionStorage so a reload does not forget them. !! runs the last one, !7 runs the seventh, !ls the most recent ls. The history is .sebiwi_history: delete that file and the shell forgets everything and stops taking notes, until touch makes it again.' },
    env: { args: '', blurb: '', hidden: true, man: 'Prints the environment. export changes it, unset removes from it, echo expands it. NAME=value sets a shell variable, which stays out of it until exported.' },
    set: { args: '', blurb: '', hidden: true, man: 'Prints every variable, the ones env shows and the shell variables it does not.' },
    ping: { args: '<host>', blurb: '', hidden: true, man: 'Pings, forever, one packet a second, until ctrl+c. Everything resolves to 127.0.0.1. It is cozy that way.' },
    uname: { args: '[-a]', blurb: '', hidden: true, man: 'Prints system information. The system is sebiwiOS and the machine is a pencil.' },
    sudo: { args: '<command>', blurb: '', hidden: true, man: 'Runs a command as another user. Not here it does not.' },
    sebiwish: { args: "[-c 'command']", blurb: '', hidden: true, man: "The shell, inside the shell. SHLVL goes up, the environment is a copy, and exit comes back here instead of turning the site off. -c runs one line in a subshell and returns its status. bash, sh and zsh are sebiwish with a different hat." },
    neofetch: { args: '', blurb: '', hidden: true, man: 'Prints the machine and a small person waving. The same person waves on the about page.' }
  };

  DOCS.bash = DOCS.sh = DOCS.zsh = DOCS.sebiwish;

  var HELP_ORDER = ['ls', 'cd', 'pwd', 'cat', 'echo', 'touch', 'mkdir', 'rm', 'grep', 'ink', 'clear', 'help'];

  var KEY_HELP = [
    ['up/down', 'walk the history'],
    ['ctrl+r', 'search the history'],
    ['ctrl+a/e/w/u/k', 'readline, the useful bits'],
    ['ctrl+c', 'give up on the line'],
    ['ctrl+l', 'clear the screen'],
    ['ctrl+d', 'leave'],
    ['tab', 'complete a word'],
    ['esc', 'leave the prompt']
  ];

  // ------------------------------------------------------------ the commands

  function flagsOf(args) {
    var flags = '';
    for (var i = 0; i < args.length; i++) {
      if (args[i].charAt(0) === '-' && args[i].length > 1) flags += args[i].slice(1);
    }
    return flags;
  }

  function operandsOf(args) {
    var operands = [];
    for (var i = 0; i < args.length; i++) {
      if (args[i].charAt(0) !== '-' || args[i].length === 1) operands.push(args[i]);
    }
    return operands;
  }

  // -n 5, -n5, and for -n the old -5 that head and tail still take.
  function numberFlag(args, letter, fallback) {
    for (var i = 0; i < args.length; i++) {
      if (letter === 'n' && /^-\d+$/.test(args[i])) return parseInt(args[i].slice(1), 10);
      if (args[i] === '-' + letter && args[i + 1] !== undefined) return parseInt(args[i + 1], 10);
      if (args[i].indexOf('-' + letter) === 0 && args[i].length > 2) return parseInt(args[i].slice(2), 10);
    }
    return fallback;
  }

  // Operands with the values of -x flags removed, so `head -n 2 file` doesn't
  // read a file called 2.
  function operandsWithout(args, letters) {
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

  function navigate(url) {
    window.location.href = url;
  }

  var commands = {
    help: function (args, io) {
      io.out.text('available commands:');
      for (var i = 0; i < HELP_ORDER.length; i++) {
        var name = HELP_ORDER[i];
        var doc = DOCS[name];
        io.out.text('  ' + padRight((name + ' ' + doc.args).trim(), 16) + doc.blurb);
      }
      io.out.text('keys:');
      for (var k = 0; k < KEY_HELP.length; k++) {
        io.out.text('  ' + padRight(KEY_HELP[k][0], 16) + KEY_HELP[k][1]);
      }
      io.out.text('also: pipes, < > redirection, << heredocs, ; && ||, globs, $VARS, and man <command>.');
    },

    man: function (args, io) {
      var name = args[0];
      if (!name) {
        io.out.text('What manual page do you want?');
        return 1;
      }
      var doc = DOCS[name];
      if (!doc) {
        io.out.text('No manual entry for ' + name);
        return 1;
      }
      io.out.text(name.toUpperCase() + '(1)');
      io.out.text('NAME');
      io.out.text('     ' + name + ' - ' + (doc.blurb || DOCS[name].man.split('.')[0].toLowerCase()));
      io.out.text('SYNOPSIS');
      io.out.text('     ' + (name + ' ' + doc.args).trim());
      io.out.text('DESCRIPTION');
      io.out.text('     ' + doc.man);
    },

    ls: function (args, io) {
      var flags = flagsOf(args);
      var long = flags.indexOf('l') !== -1;
      var all = flags.indexOf('a') !== -1;
      var named = operandsOf(args);
      var visible = [];
      var status = 0;
      var i;
      if (named.length) {
        for (i = 0; i < named.length; i++) {
          var one = resolve(named[i]);
          if (one) {
            visible.push(one);
          } else {
            io.out.text('ls: ' + named[i] + ': No such file or directory');
            status = 1;
          }
        }
      } else {
        visible = listing(all);
      }
      if (long) {
        io.out.text('total ' + visible.length);
        for (i = 0; i < visible.length; i++) {
          io.out.line(lsLongLine(visible[i]));
        }
        return status;
      }
      // Off a tty, ls prints one name per line, which is the only reason
      // `ls | grep something` is any use.
      if (!io.tty) {
        for (i = 0; i < visible.length; i++) io.out.text(visible[i].name);
        return status;
      }
      var nodes = [];
      if (all && !named.length) nodes.push(textNode('.  ..  '));
      for (i = 0; i < visible.length; i++) {
        if (i) nodes.push(textNode('  '));
        nodes.push(visible[i].url ? fileLink(visible[i]) : textNode(visible[i].name));
      }
      if (nodes.length) io.out.line(nodes);
      return status;
    },

    cd: function (args, io) {
      var target = args[0] || '~';
      if (target === '~' || target === '~/' || target === '/') {
        navigate('/');
        return;
      }
      // '..' walks back through the browser's history: the page you came from
      // is the directory you came from. '../..' walks back twice, and so on,
      // and '-' is the same idea with the shell's own spelling. Arriving here
      // cold (a bad link, a bookmark) leaves nothing to go back to, so the walk
      // falls back to the site root.
      var segments = target === '-' ? ['..'] : target.replace(/\/+$/, '').split('/');
      var hops = 0;
      var relative = true;
      for (var s = 0; s < segments.length; s++) {
        if (segments[s] === '..') hops++;
        else if (segments[s] !== '.') relative = false;
      }
      if (relative) {
        if (!hops) return; // cd . stays put, silently
        var back = Math.min(hops, window.history.length - 1);
        if (back > 0) window.history.go(-back);
        else navigate('/');
        return;
      }
      var file = resolve(target);
      if (!file) {
        io.out.text('cd: no such file or directory: ' + target);
        return 1;
      }
      if (file.kind !== 'dir') {
        io.out.text('cd: not a directory: ' + target);
        return 1;
      }
      if (!file.url) {
        io.out.text('cd: ' + file.name + ': nowhere real to go');
        return 1;
      }
      navigate(file.url);
    },

    open: function (args, io) {
      var file = args[0] ? resolve(args[0]) : null;
      if (file && file.url) {
        navigate(file.url);
        return;
      }
      io.out.text('open: ' + (args[0] || '') + ': nothing to open it with');
      return 1;
    },

    // The two commands that exist only to have an exit status.
    'true': function () {
      return 0;
    },

    'false': function () {
      return 1;
    },

    pwd: function (args, io) {
      io.out.text(envValue('PWD') || '/');
    },

    cat: function (args, io) {
      var targets = operandsOf(args);
      if (!targets.length) {
        if (io.stdin) {
          for (var s = 0; s < io.stdin.length; s++) io.out.text(io.stdin[s]);
          return;
        }
        io.out.text('cat: missing operand');
        return 1;
      }
      var status = 0;
      for (var j = 0; j < targets.length; j++) {
        if (catOne(targets[j], io.out) !== 0) status = 1;
      }
      return status;
    },

    // The line comes back as one line: -n and -e are swallowed, because every
    // line here is a line whatever you ask. Quoting and $VAR expansion happen
    // before echo ever sees the words.
    echo: function (args, io) {
      var words = args.slice();
      var escapes = false;
      while (words.length && /^-[neE]+$/.test(words[0])) {
        if (words[0].indexOf('e') !== -1) escapes = true;
        words.shift();
      }
      var text = words.join(' ');
      if (escapes) {
        text = text.replace(/\\t/g, '\t');
        var lines = text.split(/\\n/);
        for (var i = 0; i < lines.length; i++) io.out.text(lines[i]);
        return;
      }
      io.out.text(text);
    },

    env: function (args, io) {
      for (var i = 0; i < ENV.length; i++) {
        if (isExported(ENV[i])) io.out.text(ENV[i][0] + '=' + ENV[i][1]);
      }
    },

    printenv: function (args, io) {
      if (!args.length) return commands.env(args, io);
      var at = envIndex(args[0]);
      if (at === -1 || !isExported(ENV[at])) return 1;
      io.out.text(ENV[at][1]);
    },

    // Everything, exported or not, the way set with no arguments shows it.
    set: function (args, io) {
      var names = [];
      for (var i = 0; i < ENV.length; i++) names.push(ENV[i]);
      names.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
      for (var j = 0; j < names.length; j++) io.out.text(names[j][0] + '=' + names[j][1]);
    },

    export: function (args, io) {
      if (!args.length) return commands.env(args, io);
      for (var i = 0; i < args.length; i++) {
        var eq = args[i].indexOf('=');
        var name = eq === -1 ? args[i] : args[i].slice(0, eq);
        if (!/^[A-Za-z_]\w*$/.test(name)) {
          io.out.text("export: `" + args[i] + "': not a valid identifier");
          return 1;
        }
        var known = envValue(name);
        envSet(name, eq !== -1 ? args[i].slice(eq + 1) : known === null ? '' : known);
      }
    },

    unset: function (args, io) {
      for (var i = 0; i < args.length; i++) {
        var at = envIndex(args[i]);
        if (at !== -1) ENV.splice(at, 1);
      }
    },

    alias: function (args, io) {
      var names = Object.keys(ALIASES).sort();
      for (var i = 0; i < names.length; i++) {
        io.out.text("alias " + names[i] + "='" + ALIASES[names[i]] + "'");
      }
    },

    touch: function (args, io) {
      var targets = operandsOf(args);
      if (!targets.length) {
        io.out.text('touch: missing file operand');
        return 1;
      }
      for (var i = 0; i < targets.length; i++) {
        var existing = resolve(targets[i]);
        if (existing) continue; // real touch just moves the clock forward
        var known = deletedFile(targets[i]);
        if (known) {
          known.removed = false;
          continue;
        }
        files.push({
          name: targets[i],
          kind: 'file',
          content: '',
          hidden: targets[i].charAt(0) === '.'
        });
      }
    },

    mkdir: function (args, io) {
      var targets = operandsOf(args);
      if (!targets.length) {
        io.out.text('mkdir: missing operand');
        return 1;
      }
      var status = 0;
      for (var i = 0; i < targets.length; i++) {
        var name = targets[i].replace(/\/+$/, '');
        if (resolve(name)) {
          io.out.text("mkdir: cannot create directory '" + name + "': File exists");
          status = 1;
          continue;
        }
        files.push({ name: name + '/', kind: 'dir', size: 4096, hidden: name.charAt(0) === '.' });
      }
      return status;
    },

    rmdir: function (args, io) {
      var targets = operandsOf(args);
      if (!targets.length) {
        io.out.text('rmdir: missing operand');
        return 1;
      }
      var status = 0;
      for (var i = 0; i < targets.length; i++) {
        var file = resolve(targets[i]);
        if (!file) {
          io.out.text("rmdir: failed to remove '" + targets[i] + "': No such file or directory");
          status = 1;
        } else if (file.kind !== 'dir') {
          io.out.text("rmdir: failed to remove '" + file.name + "': Not a directory");
          status = 1;
        } else if (file.url) {
          // The real directories have a whole website in them.
          io.out.text("rmdir: failed to remove '" + file.name + "': Directory not empty");
          status = 1;
        } else {
          file.removed = true;
        }
      }
      return status;
    },

    rm: function (args, io) {
      var flags = flagsOf(args);
      var targets = operandsOf(args);
      if (!targets.length) {
        io.out.text('rm: missing operand');
        return 1;
      }
      var recursive = flags.indexOf('r') !== -1 || flags.indexOf('R') !== -1;
      var force = flags.indexOf('f') !== -1;
      var verbose = flags.indexOf('v') !== -1;
      if (recursive && force && coversEverything(targets)) {
        wipeEverything();
        return 0;
      }
      var status = 0;
      for (var j = 0; j < targets.length; j++) {
        if (rmOne(targets[j], recursive, force, verbose, io.out) !== 0) status = 1;
      }
      return status;
    },

    chmod: function (args, io) {
      io.out.text('chmod: these are load-bearing. leave them alone.');
      return 1;
    },

    grep: function (args, io) {
      var flags = flagsOf(args);
      var operands = operandsOf(args);
      var pattern = operands.shift();
      if (pattern === undefined) {
        io.out.text('usage: grep [-icv] pattern [file ...]');
        return 2;
      }
      var read = inputLines(operands, io, 'grep');
      if (!read.lines) return read.status;
      var re;
      try {
        re = new RegExp(pattern, flags.indexOf('i') !== -1 ? 'i' : '');
      } catch (err) {
        io.out.text('grep: ' + pattern + ': invalid pattern');
        return 2;
      }
      var invert = flags.indexOf('v') !== -1;
      var hits = [];
      for (var i = 0; i < read.lines.length; i++) {
        if (re.test(read.lines[i]) !== invert) hits.push(read.lines[i]);
      }
      if (flags.indexOf('c') !== -1) {
        io.out.text(String(hits.length));
        return hits.length ? 0 : 1;
      }
      for (var h = 0; h < hits.length; h++) io.out.text(hits[h]);
      return hits.length ? 0 : 1;
    },

    wc: function (args, io) {
      var flags = flagsOf(args);
      var read = inputLines(operandsOf(args), io, 'wc');
      if (!read.lines) return read.status;
      var body = read.lines.join('\n');
      var lines = read.lines.length;
      var words = body.split(/\s+/).filter(Boolean).length;
      var chars = body.length + (lines ? 1 : 0);
      if (flags.indexOf('l') !== -1) io.out.text(String(lines));
      else if (flags.indexOf('w') !== -1) io.out.text(String(words));
      else if (flags.indexOf('c') !== -1) io.out.text(String(chars));
      else io.out.text(pad(String(lines), 7) + pad(String(words), 7) + pad(String(chars), 7));
      return read.status;
    },

    head: function (args, io) {
      var count = numberFlag(args, 'n', 10);
      var read = inputLines(operandsWithout(args, 'n'), io, 'head');
      if (!read.lines) return read.status;
      var slice = read.lines.slice(0, count);
      for (var i = 0; i < slice.length; i++) io.out.text(slice[i]);
      return read.status;
    },

    tail: function (args, io) {
      var count = numberFlag(args, 'n', 10);
      var read = inputLines(operandsWithout(args, 'n'), io, 'tail');
      if (!read.lines) return read.status;
      var slice = count >= read.lines.length ? read.lines : read.lines.slice(read.lines.length - count);
      for (var i = 0; i < slice.length; i++) io.out.text(slice[i]);
      return read.status;
    },

    sort: function (args, io) {
      var flags = flagsOf(args);
      var read = inputLines(operandsOf(args), io, 'sort');
      if (!read.lines) return read.status;
      var sorted = read.lines.slice().sort();
      if (flags.indexOf('r') !== -1) sorted.reverse();
      for (var i = 0; i < sorted.length; i++) io.out.text(sorted[i]);
      return read.status;
    },

    uniq: function (args, io) {
      var read = inputLines(operandsOf(args), io, 'uniq');
      if (!read.lines) return read.status;
      var last = null;
      for (var i = 0; i < read.lines.length; i++) {
        if (read.lines[i] !== last) io.out.text(read.lines[i]);
        last = read.lines[i];
      }
      return read.status;
    },

    tree: function (args, io) {
      var entries = listing(flagsOf(args).indexOf('a') !== -1);
      var dirs = 0;
      var plain = 0;
      io.out.text('.');
      for (var i = 0; i < entries.length; i++) {
        var last = i === entries.length - 1;
        var branch = last ? '`-- ' : '|-- ';
        if (entries[i].url) io.out.line([textNode(branch), fileLink(entries[i])]);
        else io.out.text(branch + entries[i].name);
        if (entries[i].kind === 'dir') dirs++;
        else plain++;
      }
      io.out.text('');
      io.out.text(dirs + ' directories, ' + plain + ' files');
    },

    which: function (args, io) {
      var status = 0;
      for (var i = 0; i < args.length; i++) {
        if (Object.prototype.hasOwnProperty.call(commands, args[i]) || ALIASES[args[i]]) {
          io.out.text('/bin/' + args[i]);
        } else {
          io.out.text('which: no ' + args[i] + ' in (' + envValue('PATH') + ')');
          status = 1;
        }
      }
      return status;
    },

    history: function (args, io) {
      if (!historyKept()) {
        io.out.text('sebiwish: history: ' + HISTORY_FILE + ': No such file or directory');
        return 1;
      }
      if (args[0] === '-c') {
        cmdHistory = [];
        histIndex = 0;
        saveHistory();
        return;
      }
      for (var i = 0; i < cmdHistory.length; i++) {
        io.out.text(pad(String(i + 1), 5) + '  ' + cmdHistory[i]);
      }
    },

    clear: function () {
      while (pre.firstChild !== livePrompt) {
        pre.removeChild(pre.firstChild);
      }
    },

    date: function (args, io) {
      var now = new Date();
      io.out.text(TIMES[now.getDay()] + ' ' + MONTHS[now.getMonth()] + ' ' + two(now.getDate()) + ' ' +
        clockTime() + ' PENCIL ' + now.getFullYear());
    },

    uptime: function (args, io) {
      io.out.text(' ' + clockTime() + '  up 4 days,  4:04,  1 user,  load average: 0.04, 0.04, 0.04');
    },

    whoami: function (args, io) {
      io.out.text(envValue('USER') || 'sebiwi');
    },

    uname: function (args, io) {
      var picked = {};
      var any = false;
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) !== '-') {
          io.out.text("uname: extra operand '" + args[i] + "'");
          return 1;
        }
        var flags = args[i] === '--all' ? 'a' : args[i].slice(1);
        for (var j = 0; j < flags.length; j++) {
          var c = flags.charAt(j);
          if (c === 'a') {
            for (var k = 0; k < UNAME.length; k++) picked[UNAME[k][0]] = true;
          } else if (c === 'p' || c === 'i') {
            picked.m = true; // processor and hardware platform: also pencil64
          } else {
            var known = false;
            for (var m = 0; m < UNAME.length; m++) {
              if (UNAME[m][0] === c) known = true;
            }
            if (!known) {
              io.out.text("uname: invalid option -- '" + c + "'");
              return 1;
            }
            picked[c] = true;
          }
        }
        any = true;
      }
      if (!any) picked.s = true;
      var parts = [];
      for (var n = 0; n < UNAME.length; n++) {
        if (picked[UNAME[n][0]]) parts.push(UNAME[n][1]);
      }
      io.out.text(parts.join(' '));
    },

    neofetch: function (args, io) {
      var info = [
        'sebiwi@scoreplay',
        '----------------',
        'OS: sebiwiOS 4.0.4-comic',
        'Host: scoreplay (pencil64)',
        'Kernel: 4.0.4-comic',
        'Shell: sebiwish',
        'Terminal: 404',
        'Uptime: 4 days, 4:04',
        'Memory: 42MiB / 404MiB'
      ];
      for (var i = 0; i < info.length; i++) {
        io.out.text(padRight(NEOFETCH_LOGO[i] || '', 8) + info[i]);
      }
    },

    top: function (args, io) {
      io.out.text('top - ' + clockTime() + ' up 4 days,  4:04,  1 user,  load average: 0.04, 0.04, 0.04');
      io.out.text('Tasks:   4 total,   1 running,   3 sleeping');
      io.out.text('  PID USER      %CPU %MEM COMMAND');
      io.out.text('    1 sebiwi     0.4  0.4 hugo');
      io.out.text('   42 sebiwi     0.0  0.1 sebiwish');
      io.out.text('  404 sebiwi     4.0  0.4 pencil');
      io.out.text(' 1998 sebiwi     0.1  0.0 coffee --refill');
    },

    ps: function (args, io) {
      io.out.text('  PID TTY          TIME CMD');
      io.out.text('    1 ?        00:00:04 hugo');
      io.out.text('   42 ttys004  00:00:00 sebiwish');
      io.out.text('  404 ttys004  00:00:00 pencil');
      var inside = tmux && tmux.attached;
      var outer = inside ? tmux.outside.state.shells.length : shells.length;
      for (var i = 1; i <= outer; i++) {
        io.out.text('  ' + (404 + i) + ' ttys004  00:00:00 sebiwish');
      }
      if (tmux) io.out.text('  ' + TMUX_PID + ' ?        00:00:00 tmux: server');
      if (!inside) return;
      for (var j = 0; j <= shells.length; j++) {
        io.out.text('  ' + (basePid + j) + ' ttys' + ('00' + currentPane().tty).slice(-3) + '  00:00:00 sebiwish');
      }
    },

    df: function (args, io) {
      io.out.text('Filesystem      Size  Used Avail Use% Mounted on');
      io.out.text('/dev/pencil0    404M  400M  4.0M  99% /');
      io.out.text('sketchbook       42M   42M     0 100% /comics');
      io.out.text('tmpfs           4.0M  1.2M  2.8M  30% /tmp');
    },

    fortune: function (args, io) {
      io.out.text(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]);
    },

    cowsay: function (args, io) {
      var text = args.join(' ') || 'moo';
      var top = '';
      var bottom = '';
      for (var i = 0; i < text.length + 2; i++) {
        top += '_';
        bottom += '-';
      }
      io.out.text(' ' + top);
      io.out.text('< ' + text + ' >');
      io.out.text(' ' + bottom);
      io.out.text('        \\   ^__^');
      io.out.text('         \\  (oo)\\_______');
      io.out.text('            (__)\\       )\\/\\');
      io.out.text('                ||----w |');
      io.out.text('                ||     ||');
    },

    sudo: function (args, io) {
      io.out.line([styled('term-err', 'sebiwi is not in the sudoers file. This incident has been reported.')]);
      return 1;
    },

    su: function (args, io) {
      io.out.text('su: Authentication failure');
      return 1;
    },

    git: function (args, io) {
      var sub = args[0] || '';
      if (sub === 'status') {
        io.out.text('fatal: not a git repository (or any of the parent directories): .git');
        io.out.text('(this is a website. the repository is somewhere much nicer.)');
        return 128;
      }
      if (sub === 'log') {
        io.out.text('commit 404404404404404404404404404404404404404');
        io.out.text('Author: sebiwi <sebiwi@scoreplay>');
        io.out.text('    fix(404): the page still does not exist');
        return 0;
      }
      if (sub === 'push') {
        io.out.text('Everything up-to-date. Suspiciously so.');
        return 0;
      }
      io.out.text('git: this is a website, not a repository.');
      return 1;
    },

    hugo: function (args, io) {
      io.out.text('hugo: already built. you are standing in the output.');
    },

    npm: function (args, io) {
      io.out.text('npm: this site is 140 pages of Hugo. there is no node_modules.');
      return 1;
    },

    vim: function (args, io) {
      io.out.text('vim: you are already inside a text interface you cannot leave.');
      io.out.text('(try :q. it will not work either.)');
      return 1;
    },

    nano: function (args, io) {
      io.out.text('nano: no. use the pencil.');
      return 1;
    },

    emacs: function (args, io) {
      io.out.text('emacs: not enough memory. this is a 404 page.');
      return 1;
    },

    curl: function (args, io) {
      io.out.text('curl: (6) Could not resolve host: there is no network, only sebiwi');
      return 6;
    },

    ssh: function (args, io) {
      io.out.text('ssh: connect to host ' + (args[0] || 'sebiwi') + ' port 22: There is no network, only sebiwi');
      return 255;
    },

    ifconfig: function (args, io) {
      io.out.text('lo0: flags=73<UP,LOOPBACK,COMFY> mtu 16384');
      io.out.text('        inet 127.0.0.1 netmask 0xff000000');
      io.out.text("        status: there's no place like it");
      io.out.text('pen0: flags=8863<UP,BROADCAST,SMUDGED> mtu 1500');
      io.out.text('        inet 10.0.4.4 netmask 0xffffff00 broadcast 10.0.4.255');
      io.out.text('        ether 5e:b1:w1:00:04:04 (hand-lettered)');
      io.out.text('        status: drawing packets by hand');
    },

    ip: function (args, io) {
      var sub = args[0] || '';
      if (sub === 'a' || sub === 'addr' || sub === 'address') {
        io.out.text('1: lo0: <LOOPBACK,UP,COMFY> mtu 16384');
        io.out.text('    inet 127.0.0.1/8 scope host');
        io.out.text('2: pen0: <BROADCAST,UP,SMUDGED> mtu 1500');
        io.out.text('    inet 10.0.4.4/24 scope global pen0');
        return;
      }
      if (sub === 'r' || sub === 'route') {
        io.out.text('default via the-couch dev pen0 metric 42');
        return;
      }
      io.out.text('Usage: ip { addr | route }   (this is a very small ip)');
    },

    ping: function (args, io) {
      var operands = operandsWithout(args, 'c');
      var host = operands[0];
      if (!host) {
        io.out.text('ping: usage error: Destination address required');
        return 2;
      }
      var count = numberFlag(args, 'c', null);
      var sent = 0;
      io.out.text('PING ' + host + ' (127.0.0.1): 56 data bytes');

      function packet() {
        io.out.text('64 bytes from ' + host + ': icmp_seq=' + sent + ' ttl=42 time=0.00' + (3 + (sent % 3)) + ' ms' +
          (sent === 1 ? ' (hand-delivered)' : ''));
        sent++;
        return count === null || sent < count;
      }

      function stats() {
        io.out.text('--- ' + host + ' ping statistics ---');
        io.out.text(sent + ' packets transmitted, ' + sent + ' packets received, 0.0% packet loss');
        io.out.text("(everything here resolves to 127.0.0.1. it's cozy that way.)");
      }

      // In a pipeline there is no waiting around: two packets and the summary,
      // the way ping -c 2 would have done it.
      if (!io.async) {
        packet();
        if (count === null || count > 1) packet();
        stats();
        return 0;
      }
      packet();
      if (count === 1) {
        stats();
        return 0;
      }
      startJob({ every: 1000, tick: packet, onEnd: stats });
      return 0;
    },

    sleep: function (args, io) {
      var seconds = parseFloat(args[0]);
      if (isNaN(seconds)) {
        io.out.text('sleep: missing operand');
        return 1;
      }
      if (!io.async) return 0; // a pipeline has no patience
      startJob({ every: Math.min(seconds, 30) * 1000, tick: function () { return false; } });
      return 0;
    },

    yes: function (args, io) {
      var text = args.join(' ') || 'y';
      if (!io.async) {
        for (var i = 0; i < 10; i++) io.out.text(text);
        return 0;
      }
      io.out.text(text);
      startJob({
        every: 120,
        tick: function (ticks) {
          io.out.text(text);
          return ticks < YES_LIMIT;
        }
      });
      return 0;
    },

    kill: function (args, io) {
      var target = args[args.length - 1];
      if (!target) {
        io.out.text('kill: usage: kill pid | %job | terminal');
        return 2;
      }
      if (target === '%1' || target === '%') {
        if (job) {
          endJob(true);
          return 0;
        }
        io.out.text('kill: %1: no such job');
        return 1;
      }
      var file = resolve(target);
      if (file && file.kind === 'element') return rmOne(target, false, true, false, io.out);
      io.out.text('kill: (' + target + ') - Operation not permitted');
      return 1;
    },

    killall: function (args, io) {
      if (args[0] === 'hugo') {
        io.out.text('killall: hugo: Operation not permitted (it is holding the page up)');
        return 1;
      }
      io.out.text('killall: no process found');
      return 1;
    },

    shutdown: function (args, io) {
      io.out.text('Broadcast message from sebiwi@scoreplay:');
      io.out.text('        The system is going down NOW!');
      powerOff();
    },

    reboot: function (args, io) {
      io.out.text('Broadcast message from sebiwi@scoreplay:');
      io.out.text('        The system is going down for reboot NOW!');
      powerOff(function () { window.location.reload(); });
    },

    sebiwish: function (args, io) {
      if (args[0] === '-c') {
        if (args[1] === undefined) {
          io.out.text('sebiwish: -c: option requires an argument');
          return 2;
        }
        var depth = shells.length;
        enterShell();
        execute(args[1]);
        while (shells.length > depth) leaveShell();
        return lastStatus;
      }
      // A script on standard input (sebiwish << EOF, or a pipe) runs line by
      // line in a subshell, until it ends or exits.
      if (!args.length && io.stdin) {
        var level = shells.length;
        enterShell();
        for (var l = 0; l < io.stdin.length && shells.length > level; l++) {
          if (io.stdin[l].trim()) execute(io.stdin[l]);
        }
        while (shells.length > level) leaveShell();
        return lastStatus;
      }
      if (args.length) {
        var script = resolve(args[0]);
        io.out.text('sebiwish: ' + args[0] + ': ' + (script ? 'cannot execute binary file' : 'No such file or directory'));
        return script ? 126 : 127;
      }
      enterShell();
    },

    exit: function (args, io) {
      var code = args.length ? parseInt(args[0], 10) : lastStatus;
      if (isNaN(code)) {
        io.out.text('sebiwish: exit: ' + args[0] + ': numeric argument required');
        code = 2;
      }
      if (exitShell()) {
        exited = true;
        return code & 255;
      }
      io.out.text('logout');
      powerOff();
    },

    logout: function (args, io) {
      if (shells.length) {
        io.out.text("sebiwish: logout: not login shell: use `exit'");
        return 1;
      }
      return commands.exit(args, io);
    }
  };

  commands.poweroff = commands.shutdown;
  commands.halt = commands.shutdown;
  commands.bash = commands.sebiwish;
  commands.sh = commands.sebiwish;
  commands.zsh = commands.sebiwish;
  commands.chown = commands.chmod;
  commands.vi = commands.vim;
  commands.wget = commands.curl;
  commands.telnet = commands.ssh;
  commands.yarn = commands.npm;
  commands.pnpm = commands.npm;
  commands['xdg-open'] = commands.open;

  // -------------------------------------------------------------------- ink

  // ink is the house package manager: the pencil sketches, ink makes it stay.
  // A package is a command the shell ships without. Installing one puts it in
  // `commands` and its page in DOCS, so which, man and tab completion find it
  // the moment it lands, and not a moment before. The dependencies are for
  // show, and so is the download. Nothing outlives the tab.
  var INK_DEPS = { libevent: '2.1.12', ncurses: '6.5', coal: '1.0.4', rainbows: '7.7.7' };
  var INK_STEPS = 10;  // ticks per progress bar
  var INK_TICK_MS = 70;
  var BAR_WIDTH = 16;
  var inked = {}; // name -> true, packages and dependencies alike

  var PACKAGES = {
    tmux: {
      version: '3.5a',
      deps: ['libevent', 'ncurses'],
      blurb: 'terminal multiplexer, for people with one terminal',
      args: '[new|attach|ls|detach|kill-server]',
      man: 'Runs shells in windows inside a session that outlives them. ctrl+b is the prefix: c opens a window, n and p and 0-9 move between them, d detaches. % splits a pane left and right, " top and bottom, o and the arrows move between panes, x kills one, z zooms one, ctrl or alt with an arrow resizes one, a click picks one and a drag moves a border. tmux attach comes back, tmux ls lists the session, exit closes a pane, and the last exit ends it all.'
    },
    sl: {
      version: '5.02',
      deps: ['coal'],
      blurb: 'steam locomotive, for when ls is too long to type',
      args: '',
      man: 'Corrects the habit of typing sl for ls. A train crosses the terminal and ctrl+c does nothing about it. That is the lesson.'
    },
    lolcat: {
      version: '100.0.1',
      deps: ['rainbows'],
      blurb: 'rainbows, from a pipe',
      args: '[file]',
      man: 'Prints its files or its standard input in every color the terminal has. fortune | lolcat is the canonical use. There is no other use.'
    }
  };

  function inkVersion(name) {
    return PACKAGES[name] ? PACKAGES[name].version : INK_DEPS[name];
  }

  function bar(name, step) {
    var filled = Math.round(BAR_WIDTH * step / INK_STEPS);
    var bars = new Array(filled + 1).join('#') + new Array(BAR_WIDTH - filled + 1).join('-');
    return padRight(name + ' ' + inkVersion(name), 16) + ' [' + bars + '] ' + pad(Math.round(100 * step / INK_STEPS) + '%', 4);
  }

  function inkLand(name) {
    inked[name] = true;
    var pkg = PACKAGES[name];
    if (!pkg) return;
    commands[name] = pkg.run;
    DOCS[name] = { args: pkg.args, blurb: '', hidden: true, man: pkg.man };
  }

  function inkInstall(names, io) {
    if (!names.length) {
      io.out.text('ink: install what? ink search lists what there is.');
      return 1;
    }
    var status = 0;
    var wanted = [];
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!Object.prototype.hasOwnProperty.call(PACKAGES, name)) {
        io.out.text("ink: no package named '" + name + "'. ink search lists what there is.");
        status = 1;
      } else if (inked[name]) {
        io.out.text('ink: ' + name + ' ' + PACKAGES[name].version + ' is already inked');
      } else if (wanted.indexOf(name) === -1) {
        wanted.push(name);
      }
    }
    if (!wanted.length) return status;

    // Dependencies first, each once, then what was asked for.
    var queue = [];
    for (var w = 0; w < wanted.length; w++) {
      var deps = PACKAGES[wanted[w]].deps;
      for (var d = 0; d < deps.length; d++) {
        if (!inked[deps[d]] && queue.indexOf(deps[d]) === -1) queue.push(deps[d]);
      }
    }
    queue = queue.concat(wanted);
    io.out.text('==> Resolving ' + wanted.join(' '));
    io.out.text('==> Inking ' + queue.length + ' package' + (queue.length === 1 ? '' : 's') + ': ' + queue.join(' '));

    function done() {
      for (var k = 0; k < wanted.length; k++) {
        io.out.text('==> ' + wanted[k] + ' ' + PACKAGES[wanted[k]].version + ' inked. Try: ' + wanted[k]);
      }
    }

    // In a pipeline there is no download to watch, only the result.
    if (!io.async) {
      for (var q = 0; q < queue.length; q++) {
        io.out.text(bar(queue[q], INK_STEPS));
        inkLand(queue[q]);
      }
      done();
      return status;
    }

    var at = 0;
    var step = 0;
    var line = textNode(bar(queue[0], 0));
    io.out.line([line]);
    startJob({
      every: INK_TICK_MS,
      tick: function () {
        step++;
        line.nodeValue = bar(queue[at], step);
        if (step < INK_STEPS) return true;
        inkLand(queue[at]);
        at++;
        if (at >= queue.length) return false;
        step = 0;
        line = textNode(bar(queue[at], 0));
        io.out.line([line]);
        return true;
      },
      onEnd: function (interrupted) {
        if (!interrupted) {
          done();
          return;
        }
        var missed = [];
        for (var m = 0; m < wanted.length; m++) {
          if (!inked[wanted[m]]) missed.push(wanted[m]);
        }
        io.out.text('ink: interrupted. Not inked: ' + missed.join(' '));
      }
    });
    return status;
  }

  function inkRemove(names, io) {
    if (!names.length) {
      io.out.text('ink: remove what? ink list shows what is inked.');
      return 1;
    }
    var status = 0;
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (name === 'ink') {
        io.out.text('ink: ink holds the rest together. Not removing it.');
        status = 1;
      } else if (!PACKAGES[name] || !inked[name]) {
        io.out.text('ink: ' + name + ' is not inked');
        status = 1;
      } else {
        delete inked[name];
        delete commands[name];
        delete DOCS[name];
        io.out.text('==> Uninking ' + name + ' ' + PACKAGES[name].version + '... done');
      }
    }
    return status;
  }

  function inkUsage(io) {
    io.out.text('usage: ink <command> [package...]');
    io.out.text('  install <pkg>   ink a package into the shell');
    io.out.text('  remove <pkg>    rub it back out');
    io.out.text('  list            what is inked');
    io.out.text('  search [term]   what could be');
  }

  commands.ink = function (args, io) {
    var sub = args[0];
    var names = args.slice(1);
    if (sub === 'install' || sub === 'add' || sub === 'i') return inkInstall(names, io);
    if (sub === 'remove' || sub === 'uninstall' || sub === 'rm') return inkRemove(names, io);
    if (sub === 'list' || sub === 'ls') {
      var any = false;
      for (var name in PACKAGES) {
        if (inked[name]) {
          io.out.text(padRight(name, 8) + ' ' + PACKAGES[name].version);
          any = true;
        }
      }
      for (var dep in INK_DEPS) {
        if (inked[dep]) io.out.text(padRight(dep, 8) + ' ' + INK_DEPS[dep] + ' (dependency)');
      }
      if (!any) io.out.text('nothing inked yet. ink search shows what could be.');
      return 0;
    }
    if (sub === 'search') {
      var term = (names[0] || '').toLowerCase();
      var hits = 0;
      for (var pkg in PACKAGES) {
        if (pkg.indexOf(term) === -1 && PACKAGES[pkg].blurb.indexOf(term) === -1) continue;
        io.out.text(padRight(pkg + ' ' + PACKAGES[pkg].version, 16) + (inked[pkg] ? '[inked] ' : '') + PACKAGES[pkg].blurb);
        hits++;
      }
      if (!hits) {
        io.out.text("ink: nothing matches '" + term + "'");
        return 1;
      }
      return 0;
    }
    if (sub === '-v' || sub === '--version' || sub === 'version') {
      io.out.text('ink 4.0.4 (fresh, do not smudge)');
      return 0;
    }
    if (sub === undefined || sub === 'help' || sub === '-h' || sub === '--help') {
      inkUsage(io);
      return sub === undefined ? 1 : 0;
    }
    io.out.text("ink: unknown command '" + sub + "'");
    inkUsage(io);
    return 1;
  };

  // lolcat: every character its own color, the hue drifting along the line
  // and down the page. Through a pipe the colors are lost, like the real one.
  PACKAGES.lolcat.run = function (args, io) {
    var got = inputLines(operandsOf(args), io, 'lolcat');
    if (!got.lines) return got.status;
    for (var i = 0; i < got.lines.length; i++) {
      var text = got.lines[i];
      if (!io.tty) {
        io.out.text(text);
        continue;
      }
      var nodes = [];
      for (var c = 0; c < text.length; c++) {
        var span = styled('', text.charAt(c));
        span.style.color = 'hsl(' + ((i * 12 + c * 7) % 360) + ', 85%, 70%)';
        nodes.push(span);
      }
      io.out.line(nodes);
    }
    return got.status;
  };

  // sl: the little train from sl -l, towing its coal, right to left across
  // however wide this terminal is. ctrl+c is ignored, as tradition demands.
  var SL_BODY = [
    '     ++      +------ ____                 ',
    '     ||      |+-+ |  |   \\@@@@@@@@@@@     ',
    '   /---------|| | |  |    \\@@@@@@@@@@@@@_ ',
    '  + ========  +-+ |  |                  | '
  ];
  var SL_WHEELS = [
    [' _|--O========O~\\-+  |__________________| ', '//// \\_/      \\_/       (O)       (O)     '],
    [' _|--/O========O\\-+  |__________________| ', '//// \\_/      \\_/       (O)       (O)     '],
    [' _|--/~O========O-+  |__________________| ', '//// \\_/      \\_/       (O)       (O)     '],
    [' _|--/~\\------/~\\-+  |__________________| ', '//// \\_O========O       (O)       (O)     '],
    [' _|--/~\\------/~\\-+  |__________________| ', '//// \\O========O/       (O)       (O)     '],
    [' _|--/~\\------/~\\-+  |__________________| ', '//// O========O_/       (O)       (O)     ']
  ];
  var SL_SMOKE = [['   (@@)  (  ) (@)', '  ( )'], ['   (  ) (@@)  ( )', '  (@)']];

  // How many characters fit across the terminal, measured, not guessed.
  function termCols() {
    var probe = styled('', '0000000000');
    pre.insertBefore(probe, livePrompt);
    var charWidth = probe.getBoundingClientRect().width / 10;
    pre.removeChild(probe);
    return charWidth ? Math.max(20, Math.floor(pre.clientWidth / charWidth) - 1) : 40;
  }

  function slFrame(x, cols, n) {
    var rows = SL_SMOKE[Math.floor(n / 4) % 2].concat(SL_BODY, SL_WHEELS[n % SL_WHEELS.length]);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = x < 0 ? rows[i].slice(-x) : new Array(x + 1).join(' ') + rows[i];
      out.push(row.slice(0, cols).replace(/\s+$/, ''));
    }
    return out.join('\n');
  }

  PACKAGES.sl.run = function (args, io) {
    var cols = io.tty ? termCols() : 40;
    if (!io.async || reducedMotion) {
      var still = slFrame(0, cols, 0).split('\n');
      for (var i = 0; i < still.length; i++) io.out.text(still[i]);
      return 0;
    }
    var x = cols;
    var frame = textNode(slFrame(x, cols, 0));
    var block = document.createElement('span');
    block.className = 'term-line';
    block.appendChild(frame);
    pre.insertBefore(block, livePrompt);
    pre.scrollTop = pre.scrollHeight;
    startJob({
      every: 40,
      stubborn: true,
      tick: function (n) {
        x--;
        frame.nodeValue = slFrame(x, cols, n);
        return x > -SL_BODY[0].length;
      },
      onEnd: function () {
        if (block.parentNode) block.parentNode.removeChild(block); // the train leaves no trace
      }
    });
    return 0;
  };

  // ------------------------------------------------------------------- tmux

  // One session, many windows. A window is a screen (the nodes above the live
  // prompt, parked in an array while another screen shows) and a shell (its
  // environment, its subshells, its $?). Attaching parks the page's own screen
  // and shell the same way, and detaching puts them back.
  var TMUX_PID = 600;
  var TMUX_SOCKET = '/tmp/tmux-501/default';
  var tmux = null;
  var tmuxBar = null;
  var prefixArmed = false;
  var messageTimer = null;

  var TMUX_KEYS = [
    ['C-b c', 'new window'],
    ['C-b n', 'next window'],
    ['C-b p', 'previous window'],
    ['C-b l', 'last window'],
    ['C-b 0-9', 'select window'],
    ['C-b d', 'detach'],
    ['C-b %', 'split left and right'],
    ['C-b "', 'split top and bottom'],
    ['C-b o', 'next pane'],
    ['C-b ;', 'last pane'],
    ['C-b ←→↑↓', 'pane in that direction'],
    ['C-b x', 'kill the pane'],
    ['C-b z', 'zoom the pane'],
    ['C-b C-←→↑↓', 'resize by one'],
    ['C-b M-←→↑↓', 'resize by five'],
    ['C-b ?', 'this list']
  ];

  function takeScreen() {
    var nodes = [];
    while (pre.firstChild !== livePrompt) nodes.push(pre.removeChild(pre.firstChild));
    return nodes;
  }

  function putScreen(nodes) {
    for (var i = 0; i < nodes.length; i++) pre.insertBefore(nodes[i], livePrompt);
    pre.scrollTop = pre.scrollHeight;
  }

  function saveShell() {
    return { env: ENV, shells: shells, status: lastStatus, pid: basePid };
  }

  function loadShell(state) {
    ENV = state.env;
    shells = state.shells;
    lastStatus = state.status;
    basePid = state.pid;
    swapped = true;
  }

  // A pane is a screen and a shell. The current pane's screen is the live
  // terminal itself; every other pane keeps its lines in a <pre> of its own,
  // which is also what shows when its window is split.
  function newPane() {
    var env = [];
    for (var i = 0; i < tmux.env.length; i++) env.push(tmux.env[i].slice());
    var el = document.createElement('pre');
    el.className = 'term-404 term-pane';
    el.setAttribute('aria-hidden', 'true');
    var pane = { el: el, id: tmux.nextPane++, tty: tmux.nextTty++, state: { env: env, shells: [], status: 0, pid: tmux.nextPid } };
    tmux.nextPid += 10;
    // A pane's shell starts from the environment tmux was started with, one
    // level down, and knows it is inside tmux.
    var saved = ENV;
    ENV = env;
    envSet('SHLVL', String((parseInt(envValue('SHLVL'), 10) || 0) + 1));
    envSet('TMUX', TMUX_SOCKET + ',' + TMUX_PID + ',0');
    envSet('TMUX_PANE', '%' + pane.id);
    envSet('TERM', 'tmux-256comic');
    ENV = saved;
    return pane;
  }

  // A window's layout is a tree, as in tmux: a leaf is a pane, and a split
  // is two halves side by side (h) or one above the other (v). panes lists the
  // leaves in order, which is the order o, list-panes and -t count in.
  function newWindow() {
    var pane = newPane();
    tmux.windows.push({ root: pane, panes: [pane], active: 0, last: 0 });
    return tmux.windows.length - 1;
  }

  function leavesOf(node, out) {
    out = out || [];
    if (!node.dir) out.push(node);
    else {
      leavesOf(node.a, out);
      leavesOf(node.b, out);
    }
    return out;
  }

  function parentOf(node, child) {
    if (!node.dir) return null;
    if (node.a === child || node.b === child) return node;
    return parentOf(node.a, child) || parentOf(node.b, child);
  }

  function replaceNode(win, node, other) {
    var parent = parentOf(win.root, node);
    if (!parent) win.root = other;
    else if (parent.a === node) parent.a = other;
    else parent.b = other;
    win.panes = leavesOf(win.root);
  }

  // Whether a pane reaches the given edge (start or end) of a node along dir:
  // the border there belongs to it, and turns green when it is current.
  function touches(node, pane, dir, edge) {
    if (node === pane) return true;
    if (!node.dir) return false;
    if (node.dir === dir) return touches(edge === 'end' ? node.b : node.a, pane, dir, edge);
    return touches(node.a, pane, dir, edge) || touches(node.b, pane, dir, edge);
  }

  function currentWindow() {
    return tmux.windows[tmux.current];
  }

  function currentPane() {
    var win = currentWindow();
    return win.panes[win.active];
  }

  // The live screen goes back into the pane's own <pre>, and the shell with it.
  // A pane waiting in the background still shows its prompt, minus the cursor.
  function parkPane() {
    var pane = currentPane();
    var nodes = takeScreen();
    for (var i = 0; i < nodes.length; i++) pane.el.appendChild(nodes[i]);
    var idle = styled('term-idle', '');
    idle.appendChild(styled('term-prompt', '$'));
    pane.el.appendChild(idle);
    pane.state = saveShell();
  }

  function showPane() {
    var pane = currentPane();
    var nodes = [];
    while (pane.el.firstChild) {
      var node = pane.el.removeChild(pane.el.firstChild);
      if (!node.classList || !node.classList.contains('term-idle')) nodes.push(node);
    }
    putScreen(nodes);
    loadShell(pane.state);
  }

  // A split window nests its halves in boxes, with the live terminal in the
  // current pane's place. The border between two halves is green when the
  // current pane runs along it. Moving the live <pre> drops focus, so focus
  // comes back with it.
  var panesBox = null;

  function boxFor(win, node) {
    var active = win.panes[win.active];
    if (!node.dir) return node === active ? pre : node.el;
    var box = node.box || (node.box = document.createElement('div'));
    box.className = 'term-split is-' + node.dir;
    while (box.firstChild) box.removeChild(box.firstChild);
    var first = boxFor(win, node.a);
    var second = boxFor(win, node.b);
    first.style.flexGrow = String(node.ratio);
    second.style.flexGrow = String(1 - node.ratio);
    first.classList.remove('is-hot');
    second.classList.toggle('is-hot', touches(node.a, active, node.dir, 'end') || touches(node.b, active, node.dir, 'start'));
    box.appendChild(first);
    box.appendChild(second);
    return box;
  }

  function layout() {
    var focused = document.activeElement === input;
    var win = tmux && tmux.attached ? currentWindow() : null;
    if (!win || !win.root.dir || win.zoomed) {
      if (panesBox && panesBox.parentNode) {
        panesBox.parentNode.insertBefore(pre, panesBox);
        panesBox.parentNode.removeChild(panesBox);
      }
      pre.classList.remove('is-hot');
      pre.style.flexGrow = '';
    } else {
      if (!panesBox) {
        panesBox = document.createElement('div');
        panesBox.className = 'term-panes';
      }
      if (!panesBox.parentNode) pre.parentNode.insertBefore(panesBox, pre);
      while (panesBox.firstChild) panesBox.removeChild(panesBox.firstChild);
      panesBox.appendChild(boxFor(win, win.root));
      for (var j = 0; j < win.panes.length; j++) {
        var el = j === win.active ? pre : win.panes[j].el;
        el.scrollTop = el.scrollHeight;
      }
    }
    if (focused) input.focus({ preventScroll: true });
  }

  function park() {
    parkPane();
  }

  function show(index) {
    if (index !== tmux.current) tmux.last = tmux.current;
    tmux.current = index;
    showPane();
    layout();
    renderBar();
  }

  function selectWindow(index) {
    if (index === tmux.current) return;
    park();
    show(index);
  }

  function selectPane(index) {
    var win = currentWindow();
    if (index === win.active || index < 0 || index >= win.panes.length) return;
    unzoom(win);
    parkPane();
    win.last = win.active;
    win.active = index;
    showPane();
    layout();
  }

  // Zoom: the current pane takes the whole window until it is toggled back,
  // or until another pane is picked or a split is made.
  function toggleZoom() {
    var win = currentWindow();
    if (!win.root.dir) return;
    win.zoomed = !win.zoomed;
    layout();
    renderBar();
  }

  function unzoom(win) {
    if (!win.zoomed) return;
    win.zoomed = false;
    layout();
    renderBar();
  }

  // Resizing moves a border, the way resize-pane does: -L and -R move the
  // nearest left-right border around the current pane that way, -U and -D the
  // nearest top-bottom one. A half never shrinks below a few cells.
  var MIN_PANE_PX = 48;

  function setRatio(node, px) {
    var box = node.box.getBoundingClientRect();
    var size = node.dir === 'h' ? box.width : box.height;
    if (!size) return;
    var min = Math.min(0.45, MIN_PANE_PX / size);
    node.ratio = Math.max(min, Math.min(1 - min, px / size));
  }

  function resizePane(way, cells) {
    var win = currentWindow();
    var dir = way === 'Left' || way === 'Right' ? 'h' : 'v';
    var split = parentOf(win.root, win.panes[win.active]);
    while (split && split.dir !== dir) split = parentOf(win.root, split);
    if (!split || win.zoomed) return;
    var probe = styled('', '0000000000');
    pre.insertBefore(probe, livePrompt);
    var rect = probe.getBoundingClientRect();
    pre.removeChild(probe);
    var cell = dir === 'h' ? rect.width / 10 : rect.height;
    var box = split.box.getBoundingClientRect();
    var size = dir === 'h' ? box.width : box.height;
    var sign = way === 'Left' || way === 'Up' ? -1 : 1;
    setRatio(split, split.ratio * size + sign * cells * (cell || 8));
    layout();
  }

  // Dragging a border with the mouse (or a finger) moves it, as in tmux with
  // the mouse on. A border is the leading edge of a split's second half.
  var drag = null;
  var dragged = false;

  function borderAt(target, x, y) {
    var win = currentWindow();
    for (var el = target; el && el !== panesBox; el = el.parentNode) {
      var parent = el.parentNode;
      if (!parent || !parent.classList || !parent.classList.contains('term-split') || el !== parent.lastChild) continue;
      var r = el.getBoundingClientRect();
      var across = parent.classList.contains('is-h');
      if (Math.abs(across ? x - r.left : y - r.top) > 6) continue;
      var nodes = [win.root];
      while (nodes.length) {
        var n = nodes.pop();
        if (!n.dir) continue;
        if (n.box === parent) return n;
        nodes.push(n.a, n.b);
      }
    }
    return null;
  }

  function startDrag(e) {
    if (!tmux || !tmux.attached || job || !panesBox || !panesBox.parentNode) return;
    var node = borderAt(e.target, e.clientX, e.clientY);
    if (!node) return;
    e.preventDefault();
    drag = node;
    dragged = true;
    document.addEventListener('pointermove', moveDrag);
    document.addEventListener('pointerup', endDrag);
  }

  function moveDrag(e) {
    var box = drag.box.getBoundingClientRect();
    setRatio(drag, drag.dir === 'h' ? e.clientX - box.left : e.clientY - box.top);
    layout();
  }

  function endDrag() {
    drag = null;
    document.removeEventListener('pointermove', moveDrag);
    document.removeEventListener('pointerup', endDrag);
  }

  // A split halves the current pane and nothing else. tmux refuses one that
  // leaves a half too narrow or too short, and so does this.
  function roomFor(win, dir) {
    var probe = styled('', '0000000000');
    pre.insertBefore(probe, livePrompt);
    var rect = probe.getBoundingClientRect();
    pre.removeChild(probe);
    var height = win.root.dir ? pre.clientHeight : parseFloat(window.getComputedStyle(pre).maxHeight);
    var cols = Math.floor(pre.clientWidth / (rect.width / 10 || 8));
    var rows = Math.floor(height / (rect.height || 20)) || 10;
    return dir === 'h' ? Math.floor(cols / 2) - 2 >= 12 : Math.floor(rows / 2) >= 3;
  }

  // % splits the current pane left and right, " top and bottom, and the new
  // half becomes current.
  function splitPane(dir) {
    var win = currentWindow();
    unzoom(win);
    if (!roomFor(win, dir)) {
      tmuxMessage('no space for new pane');
      return false;
    }
    parkPane();
    var old = win.panes[win.active];
    var fresh = newPane();
    replaceNode(win, old, { dir: dir, a: old, b: fresh, ratio: 0.5 });
    win.last = win.panes.indexOf(old);
    win.active = win.panes.indexOf(fresh);
    showPane();
    layout();
    return true;
  }

  function attach() {
    tmux.outside = { nodes: takeScreen(), state: saveShell() };
    tmux.attached = true;
    show(tmux.current);
  }

  // Back to the page's own screen and shell, with tmux's parting words on it.
  function leaveTmux(message) {
    tmux.attached = false;
    layout();
    putScreen(tmux.outside.nodes);
    tmux.outside.state.status = 0; // the tmux client that just returned
    loadShell(tmux.outside.state);
    tmux.outside = null;
    prefixArmed = false;
    renderBar();
    printText(message);
  }

  function detach() {
    park();
    leaveTmux('[detached (from session 0)]');
  }

  // The pane's shell is gone: the pane goes with it, the window with its last
  // pane, and the session with the last window.
  function closePane() {
    var win = currentWindow();
    var gone = win.panes[win.active];
    var before = win.panes[win.last];
    win.zoomed = false;
    takeScreen();
    if (win.root !== gone) {
      // The other half takes the space, and tmux falls back to the pane used
      // before this one.
      var parent = parentOf(win.root, gone);
      var sibling = parent.a === gone ? parent.b : parent.a;
      replaceNode(win, parent, sibling);
      var next = before !== gone ? before : leavesOf(sibling)[0];
      win.active = win.last = win.panes.indexOf(next);
      showPane();
      layout();
      return;
    }
    tmux.windows.splice(tmux.current, 1);
    if (!tmux.windows.length) {
      leaveTmux('[exited]');
      tmux = null;
      return;
    }
    tmux.last = 0;
    tmux.current = Math.min(tmux.current, tmux.windows.length - 1);
    showPane();
    layout();
    renderBar();
  }

  function killServer() {
    if (tmux.attached) {
      takeScreen();
      leaveTmux('[server exited]');
    }
    tmux = null;
  }

  // Leaving the current shell: a subshell hands back to its parent, a tmux
  // window closes, and only the shell the page started with is left to
  // power the site off.
  function exitShell() {
    if (shells.length) {
      leaveShell();
      return true;
    }
    if (tmux && tmux.attached) {
      closePane();
      return true;
    }
    return false;
  }

  function tmuxStamp(date) {
    return TIMES[date.getDay()] + ' ' + MONTHS[date.getMonth()] + ' ' + two(date.getDate()) + ' ' +
      two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds()) + ' ' + date.getFullYear();
  }

  // The status line: the session, the windows (* current, - last), and on the
  // right the host and the time. Built on first attach; hidden when detached.
  function renderBar() {
    if (!tmuxBar) {
      tmuxBar = document.createElement('div');
      tmuxBar.className = 'term-tmux';
      tmuxBar.appendChild(document.createElement('span'));
      tmuxBar.appendChild(document.createElement('span'));
      pre.parentNode.appendChild(tmuxBar);
    }
    tmuxBar.hidden = !(tmux && tmux.attached);
    if (tmuxBar.hidden || tmuxBar.classList.contains('is-message')) return;
    var names = [];
    for (var i = 0; i < tmux.windows.length; i++) {
      names.push(i + ':sebiwish' + (i === tmux.current ? '*' : i === tmux.last ? '-' : '') + (tmux.windows[i].zoomed ? 'Z' : ''));
    }
    var now = new Date();
    tmuxBar.firstChild.textContent = '[0] ' + names.join(' ');
    tmuxBar.lastChild.textContent = '"sebiwi@scoreplay" ' + two(now.getHours()) + ':' + two(now.getMinutes()) + ' ' +
      two(now.getDate()) + '-' + MONTHS[now.getMonth()] + '-' + String(now.getFullYear()).slice(2);
  }

  // display-message: the status line says one thing, briefly.
  function tmuxMessage(text) {
    renderBar();
    window.clearTimeout(messageTimer);
    tmuxBar.classList.add('is-message');
    tmuxBar.firstChild.textContent = text;
    tmuxBar.lastChild.textContent = '';
    messageTimer = window.setTimeout(function () {
      tmuxBar.classList.remove('is-message');
      renderBar();
    }, 2000);
  }

  function listKeys(out) {
    for (var i = 0; i < TMUX_KEYS.length; i++) out.text(padRight(TMUX_KEYS[i][0], 12) + TMUX_KEYS[i][1]);
  }

  // Arrows go by what is on the screen: the nearest pane on that side that
  // overlaps this one, and the most overlap when two are as near. At the
  // edge they stop (tmux would wrap; this is close enough to feel right).
  function movePane(way) {
    var win = currentWindow();
    var a = pre.getBoundingClientRect();
    var best = -1;
    var bestGap = Infinity;
    var bestOverlap = 0;
    for (var i = 0; i < win.panes.length; i++) {
      if (i === win.active) continue;
      var r = win.panes[i].el.getBoundingClientRect();
      var across = way === 'Left' || way === 'Right';
      var gap = way === 'Left' ? a.left - r.right : way === 'Right' ? r.left - a.right :
        way === 'Up' ? a.top - r.bottom : r.top - a.bottom;
      var overlap = across ? Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top) :
        Math.min(r.right, a.right) - Math.max(r.left, a.left);
      if (gap < -2 || overlap <= 0) continue;
      if (gap < bestGap - 2 || (Math.abs(gap - bestGap) <= 2 && overlap > bestOverlap)) {
        best = i;
        bestGap = gap;
        bestOverlap = overlap;
      }
    }
    if (best !== -1) selectPane(best);
  }

  // step: how far a modified arrow resizes, 1 cell with ctrl and 5 with alt.
  // Those keys repeat, as tmux's do: for half a second another one needs no
  // prefix.
  var repeatUntil = 0;

  function tmuxKey(key, step) {
    var count = tmux.windows.length;
    if (/^Arrow/.test(key) && step) {
      resizePane(key.slice(5), step);
      repeatUntil = Date.now() + 500;
      return;
    }
    if (key === 'd') detach();
    else if (key === 'c') selectWindow(newWindow());
    else if (key === 'n') selectWindow((tmux.current + 1) % count);
    else if (key === 'p') selectWindow((tmux.current + count - 1) % count);
    else if (key === 'l') selectWindow(tmux.last < count ? tmux.last : tmux.current);
    else if (key === '%') splitPane('h');
    else if (key === '"') splitPane('v');
    else if (key === 'o') selectPane((currentWindow().active + 1) % currentWindow().panes.length);
    else if (key === ';') selectPane(currentWindow().last);
    else if (key === 'x') closePane();
    else if (key === 'z') toggleZoom();
    else if (/^Arrow/.test(key)) movePane(key.slice(5));
    else if (key === '?') listKeys(screenSink);
    else if (/^[0-9]$/.test(key)) {
      var index = parseInt(key, 10);
      if (index < count) selectWindow(index);
      else tmuxMessage("can't find window: " + index);
    }
  }

  var TMUX_SUBCOMMANDS = {
    'new': 'new', 'new-session': 'new',
    attach: 'attach', a: 'attach', at: 'attach', 'attach-session': 'attach',
    ls: 'ls', 'list-sessions': 'ls',
    detach: 'detach', 'detach-client': 'detach',
    'kill-server': 'kill', 'kill-session': 'kill',
    'new-window': 'neww', neww: 'neww',
    'next-window': 'next', next: 'next',
    'previous-window': 'prev', prev: 'prev',
    'split-window': 'split', splitw: 'split',
    'select-pane': 'selectp', selectp: 'selectp',
    'kill-pane': 'killp', killp: 'killp',
    'list-panes': 'lsp', lsp: 'lsp',
    'resize-pane': 'resizep', resizep: 'resizep',
    'list-keys': 'keys', lsk: 'keys'
  };

  PACKAGES.tmux.run = function (args, io) {
    if (args[0] === '-V') {
      io.out.text('tmux ' + PACKAGES.tmux.version);
      return 0;
    }
    var sub = TMUX_SUBCOMMANDS[args[0] || 'new'];
    if (!sub) {
      io.out.text('unknown command: ' + args[0]);
      return 1;
    }
    var inside = tmux && tmux.attached;
    if (sub === 'new' || sub === 'attach') {
      if (envValue('TMUX') || inside) {
        io.out.text('sessions should be nested with care, unset $TMUX to force');
        return 1;
      }
      if (sub === 'attach' && !tmux) {
        io.out.text('no sessions');
        return 1;
      }
      if (!io.tty) {
        io.out.text('open terminal failed: not a terminal');
        return 1;
      }
      // One session is plenty here: tmux with one already running joins it.
      if (!tmux) {
        tmux = { windows: [], current: 0, last: 0, attached: false, env: copyEnv(), created: new Date(), outside: null, nextPid: TMUX_PID + 1, nextPane: 0, nextTty: 5 };
        newWindow();
      }
      attach();
      return 0;
    }
    if (sub === 'ls' || sub === 'kill') {
      if (!tmux) {
        io.out.text('no server running on ' + TMUX_SOCKET);
        return 1;
      }
      if (sub === 'kill') {
        killServer();
        return 0;
      }
      var count = tmux.windows.length;
      io.out.text('0: ' + count + ' window' + (count === 1 ? '' : 's') + ' (created ' + tmuxStamp(tmux.created) + ')' +
        (inside ? ' (attached)' : ''));
      return 0;
    }
    if (sub === 'keys') {
      listKeys(io.out);
      return 0;
    }
    if (!inside) {
      io.out.text('no current client');
      return 1;
    }
    if (sub === 'detach') detach();
    else if (sub === 'neww') selectWindow(newWindow());
    else if (sub === 'next') tmuxKey('n');
    else if (sub === 'prev') tmuxKey('p');
    else if (sub === 'split') return splitPane(args.indexOf('-h') !== -1 ? 'h' : 'v') ? 0 : 1;
    else if (sub === 'killp') closePane();
    else if (sub === 'resizep') {
      var sizeWays = { '-L': 'Left', '-R': 'Right', '-U': 'Up', '-D': 'Down' };
      if (args.indexOf('-Z') !== -1) toggleZoom();
      for (var r = 1; r < args.length; r++) {
        if (sizeWays[args[r]]) resizePane(sizeWays[args[r]], parseInt(args[r + 1], 10) || 1);
      }
    }
    else if (sub === 'selectp') {
      var flag = args[1] || '';
      var ways = { '-L': 'Left', '-R': 'Right', '-U': 'Up', '-D': 'Down' };
      if (ways[flag]) movePane(ways[flag]);
      else if (flag === '-t' && /^%?\d+$/.test(args[2] || '')) {
        var win = currentWindow();
        var target = parseInt(args[2].replace('%', ''), 10);
        var found = -1;
        for (var p = 0; p < win.panes.length; p++) {
          if (args[2].charAt(0) === '%' ? win.panes[p].id === target : p === target) found = p;
        }
        if (found === -1) {
          io.out.text("can't find pane: " + args[2]);
          return 1;
        }
        selectPane(found);
      }
    } else if (sub === 'lsp') {
      var panes = currentWindow().panes;
      for (var q = 0; q < panes.length; q++) {
        io.out.text(q + ': [' + 'sebiwish' + '] %' + panes[q].id +
          (q === currentWindow().active ? ' (active)' : ''));
      }
    }
    return 0;
  };

  function lsLongLine(file) {
    var mode = file.kind === 'dir' ? 'drwxr-xr-x' : file.name === 'terminal' ? '-rwxr-xr-x' : '-rw-r--r--';
    var meta = mode + ' 1 sebiwi sebiwi ' + pad(String(sizeOf(file)), 5) + ' Jul 13 07:19 ';
    return file.url ? [textNode(meta), fileLink(file)] : [textNode(meta + file.name)];
  }

  // --------------------------------------------------------------- execution

  function invoke(argv, io) {
    var name = argv[0];
    if (!name) return 0;
    if (ALIASES[name]) {
      argv = ALIASES[name].split(' ').concat(argv.slice(1));
      name = argv[0];
    }
    if (Object.prototype.hasOwnProperty.call(commands, name)) {
      var result = commands[name](argv.slice(1), io);
      return typeof result === 'number' ? result : 0;
    }
    if (Object.prototype.hasOwnProperty.call(PACKAGES, name)) {
      io.out.text("Command '" + name + "' not found, but can be installed with:");
      io.out.text('');
      io.out.text('ink install ' + name);
      return 127;
    }
    io.out.text(name + ': command not found');
    if (Object.prototype.hasOwnProperty.call(packageManagers, name)) {
      io.out.line([styled('term-err', "This isn't " + packageManagers[name] + ', genius.')]);
      io.out.text('Here we ink: ink install <tool>');
    }
    return 127;
  }

  // X=1 cmd: the command (and any shell it starts) sees X exported, and the
  // shell that ran it gets its old X back afterwards. The env array is held on
  // to, so the put-back lands in this shell even when cmd started another.
  function invokeWith(assigns, argv, io) {
    var env = ENV;
    var saved = [];
    for (var a = 0; a < assigns.length; a++) {
      var at = envIndex(assigns[a].name);
      saved.push(at === -1 ? null : ENV[at].slice());
      envSet(assigns[a].name, assigns[a].value);
    }
    var status = invoke(argv, io);
    for (var b = assigns.length - 1; b >= 0; b--) {
      var idx = -1;
      for (var e = 0; e < env.length; e++) {
        if (env[e][0] === assigns[b].name) idx = e;
      }
      if (saved[b]) {
        if (idx === -1) env.push(saved[b]);
        else env[idx] = saved[b];
      } else if (idx !== -1) {
        env.splice(idx, 1);
      }
    }
    return status;
  }

  // What a stage's < << <<< hands it as standard input, or null when the file
  // can't be read (the command is then skipped, as a shell does). Heredoc
  // bodies expand $VARS unless the delimiter was quoted.
  function stageInput(input, docs) {
    if (input.file) {
      var got = inputLines([expandWord(input.file)[0]], { out: screenSink }, 'sebiwish');
      return got.status ? null : got.lines;
    }
    if (input.string) {
      return [input.string.quote === "'" ? input.string.text : expandVars(input.string.text)];
    }
    var doc = docs[input.heredoc];
    var lines = [];
    for (var i = 0; i < doc.lines.length; i++) lines.push(doc.literal ? doc.lines[i] : expandVars(doc.lines[i]));
    return lines;
  }

  function runPipeline(stages, canAsync, docs) {
    var stdin = null;
    var status = 0;
    for (var i = 0; i < stages.length; i++) {
      var last = i === stages.length - 1;
      var words = stages[i].words;
      var assigns = [];
      var assign;
      while (assigns.length < words.length && (assign = assignmentOf(words[assigns.length]))) assigns.push(assign);
      var argv = [];
      for (var w = assigns.length; w < words.length; w++) argv = argv.concat(expandWord(words[w]));
      var redirect = stages[i].redirect && {
        name: expandWord(stages[i].redirect.word)[0],
        append: stages[i].redirect.append
      };
      var sink = last && !redirect ? screenSink : captureSink();
      if (stages[i].input) {
        var fed = stageInput(stages[i].input, docs);
        if (fed === null) {
          status = 1;
          stdin = [];
          continue;
        }
        stdin = fed;
      }
      var io = { out: sink, stdin: stdin, tty: sink === screenSink, async: canAsync && last && !redirect };
      if (!argv.length && assigns.length) {
        // A pipeline runs each stage in a subshell, so there it sets nothing.
        if (stages.length === 1) {
          for (var a = 0; a < assigns.length; a++) shellSet(assigns[a].name, assigns[a].value);
        }
        status = 0;
      } else if (assigns.length) {
        status = invokeWith(assigns, argv, io);
      } else {
        status = invoke(argv, io);
      }
      if (redirect) status = writeFile(redirect, sink.lines) || status;
      else if (!last) stdin = sink.lines;
    }
    return status;
  }

  // bodies: the heredoc bodies the line editor collected, in order. A line
  // run any other way (sebiwish -c) has none, and its heredocs end at once.
  function execute(line, bodies) {
    var parsed = parse(tokenize(line));
    if (parsed.error) {
      printText(parsed.error);
      lastStatus = 2;
      return;
    }
    var docs = [];
    for (var h = 0; h < parsed.heredocs.length; h++) {
      var body = bodies && bodies[h];
      if (!body) {
        printText(eofWarning(parsed.heredocs[h].delim));
        body = [];
      }
      docs.push({ lines: body, literal: parsed.heredocs[h].literal });
    }
    var segments = parsed.segments;
    var canAsync = segments.length === 1 && segments[0].stages.length === 1;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.join === '&&' && lastStatus !== 0) continue;
      if (seg.join === '||' && lastStatus === 0) continue;
      swapped = false;
      var status = runPipeline(seg.stages, canAsync, docs);
      if (!swapped) lastStatus = status;
      if (job) break; // whatever follows can wait for a prompt that is busy
      if (exited) break; // that shell is gone, and so is the rest of its line
    }
    exited = false;
  }

  // ----------------------------------------------------------------- history

  var cmdHistory = loadHistory();
  var histIndex = cmdHistory.length; // cmdHistory.length means "the line being typed"
  var draft = '';                    // that line, parked while up/down browse older ones
  var search = null;                 // { query, at, saved } while ctrl+r is open
  var killRing = '';

  // The history is the file. With .sebiwi_history deleted there is nothing to
  // list, expand, recall or search, and nothing new gets written down either.
  // touch .sebiwi_history makes the file again and the shell starts over.
  function historyKept() {
    return !!resolve(HISTORY_FILE);
  }

  // rm .sebiwi_history: the commands go with it, sessionStorage and all.
  function forgetHistory() {
    cmdHistory = [];
    histIndex = 0;
    draft = '';
    try {
      window.sessionStorage.removeItem(HISTORY_KEY);
    } catch (err) {
      /* nothing to be done about it */
    }
  }

  function loadHistory() {
    try {
      var raw = window.sessionStorage.getItem(HISTORY_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed.slice(-MAX_HISTORY) : [];
    } catch (err) {
      return []; // private windows and blocked storage: the history is just short
    }
  }

  function saveHistory() {
    try {
      window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(cmdHistory.slice(-MAX_HISTORY)));
    } catch (err) {
      /* nothing to be done about it */
    }
  }

  // !! is the last command, !7 the seventh, !ls the most recent ls. A shell
  // shows you what it decided to run, so this does too.
  function historyExpand(line) {
    if (line.indexOf('!') === -1) return { line: line, echo: false };
    var failed = null;
    var out = line.replace(/!(!|-?\d+|[A-Za-z][\w-]*)/g, function (match, ref) {
      var hit = null;
      if (ref === '!') {
        hit = cmdHistory[cmdHistory.length - 1];
      } else if (/^-?\d+$/.test(ref)) {
        var n = parseInt(ref, 10);
        hit = n < 0 ? cmdHistory[cmdHistory.length + n] : cmdHistory[n - 1];
      } else {
        for (var i = cmdHistory.length - 1; i >= 0; i--) {
          if (cmdHistory[i].indexOf(ref) === 0) {
            hit = cmdHistory[i];
            break;
          }
        }
      }
      if (hit === undefined || hit === null) {
        failed = match;
        return match;
      }
      return hit;
    });
    if (failed) return { line: null, error: 'sebiwish: ' + failed + ': event not found' };
    return { line: out, echo: out !== line };
  }

  // A line with heredocs waits for their bodies: the prompt turns to >, and
  // each line typed is body until one is exactly the delimiter (after leading
  // tabs, for <<-). The last delimiter runs the line.
  var pending = null; // { line, docs, bodies, at }

  function ps1() {
    return pending ? '>' : '$';
  }

  function eofWarning(delim) {
    return 'sebiwish: warning: here-document at line 1 delimited by end-of-file (wanted `' + delim + "')";
  }

  function heredocsOf(line) {
    var parsed = parse(tokenize(line));
    return parsed.error ? [] : parsed.heredocs;
  }

  function finishHeredoc() {
    var line = pending.line;
    var bodies = pending.bodies;
    pending = null;
    promptLabel.textContent = ps1();
    execute(line, bodies);
  }

  function feedHeredoc(raw) {
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
  function endHeredocs() {
    for (var i = pending.at; i < pending.docs.length; i++) {
      printText(eofWarning(pending.docs[i].delim));
      if (!pending.bodies[i]) pending.bodies.push([]);
    }
    finishHeredoc();
  }

  function submit(raw) {
    var expanded = historyExpand(raw);
    if (expanded.line === null) {
      printText(expanded.error);
      lastStatus = 1;
      return;
    }
    var line = expanded.line;
    if (expanded.echo) printLine([styled('term-prompt', '$'), textNode(' ' + line)]);
    var trimmed = line.trim();
    // Like a shell: blank lines and immediate repeats don't pile up. With no
    // history file, nothing is written down at all.
    if (trimmed && historyKept() && cmdHistory[cmdHistory.length - 1] !== trimmed) {
      cmdHistory.push(trimmed);
      if (cmdHistory.length > MAX_HISTORY) cmdHistory.shift();
      saveHistory();
    }
    histIndex = cmdHistory.length;
    draft = '';
    if (!trimmed) return;
    var docs = heredocsOf(line);
    if (docs.length) {
      pending = { line: line, docs: docs, bodies: [[]], at: 0 };
      promptLabel.textContent = ps1();
      return;
    }
    execute(line);
  }

  function run(raw) {
    printLine([styled('term-prompt', ps1()), textNode(' ' + raw)]);
    if (pending) feedHeredoc(raw);
    else submit(raw);
  }

  // ------------------------------------------------------------- line editor

  function caretPos() {
    var at = input.selectionStart;
    if (at === null || at === undefined || at > input.value.length) return input.value.length;
    return at;
  }

  // The visible line: text before the caret, the character under it, the rest.
  // The cursor is a real position, not a block parked at the end.
  function renderLine() {
    if (search) {
      var label = search.at === -1 && search.query ? 'failed reverse-i-search' : 'reverse-i-search';
      promptLabel.textContent = '(' + label + ')`' + search.query + "':";
      echo.textContent = matchedLine();
      cursor.textContent = ' ';
      tail.textContent = '';
      return;
    }
    var value = input.value;
    var at = caretPos();
    echo.textContent = value.slice(0, at);
    cursor.textContent = value.charAt(at) || ' ';
    tail.textContent = value.slice(at + 1);
  }

  // A key the prompt takes is the prompt's: stopping propagation keeps it away
  // from the page's own shortcuts, and ctrl+k is one of theirs (the search
  // modal). preventDefault alone would leave the modal opening under us.
  function consume(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function setCaret(at) {
    at = Math.max(0, Math.min(at, input.value.length));
    try {
      input.setSelectionRange(at, at);
    } catch (err) {
      /* a detached or disabled input has no caret to move */
    }
    renderLine();
  }

  function setLine(text, at) {
    input.value = text;
    setCaret(at === undefined ? text.length : at);
  }

  function recallHistory(step) {
    var next = histIndex + step;
    if (next < 0 || next > cmdHistory.length) return;
    if (histIndex === cmdHistory.length) draft = input.value;
    histIndex = next;
    setLine(histIndex === cmdHistory.length ? draft : cmdHistory[histIndex]);
  }

  function wordStart(text, at) {
    var i = at;
    while (i > 0 && /\s/.test(text.charAt(i - 1))) i--;
    while (i > 0 && !/\s/.test(text.charAt(i - 1))) i--;
    return i;
  }

  function wordEnd(text, at) {
    var i = at;
    while (i < text.length && /\s/.test(text.charAt(i))) i++;
    while (i < text.length && !/\s/.test(text.charAt(i))) i++;
    return i;
  }

  // Everything the kill chords have in common: cut a range, keep it for ctrl+y.
  function kill(from, to) {
    var value = input.value;
    killRing = value.slice(from, to);
    setLine(value.slice(0, from) + value.slice(to), from);
  }

  // ------------------------------------------------------- reverse-i-search

  function findMatch(query, from) {
    for (var i = from; i >= 0; i--) {
      if (cmdHistory[i].indexOf(query) !== -1) return i;
    }
    return -1;
  }

  function matchedLine() {
    return search.at === -1 ? '' : cmdHistory[search.at];
  }

  function startSearch() {
    search = { query: '', at: -1, saved: input.value };
    input.value = '';
    renderLine();
  }

  function endSearch(line) {
    search = null;
    promptLabel.textContent = ps1();
    setLine(line);
  }

  // Leaving the search on a match: it becomes the line being edited, and up/down
  // carry on from where that match sits in the history.
  function acceptSearch() {
    if (search.at === -1) {
      endSearch(search.saved);
      return;
    }
    draft = search.saved;
    histIndex = search.at;
    endSearch(cmdHistory[search.at]);
  }

  // ---------------------------------------------------------- tab completion

  // What a word could be, given the command it belongs to.
  function candidates(word, argv, firstWord) {
    var pool = [];
    var i;
    if (firstWord) {
      pool = Object.keys(commands).concat(Object.keys(ALIASES)).sort();
    } else if (argv[0] === 'cd' || argv[0] === 'rmdir' || argv[0] === 'open') {
      var dirs = listing(word.charAt(0) === '.');
      for (i = 0; i < dirs.length; i++) {
        if (dirs[i].kind === 'dir') pool.push(dirs[i].name);
      }
    } else if (argv[0] === 'man' || argv[0] === 'which' || argv[0] === 'help') {
      pool = Object.keys(commands).concat(Object.keys(ALIASES)).sort();
    } else if (argv[0] === 'ink' && argv.length === 1) {
      pool = ['install', 'list', 'remove', 'search'];
    } else if (argv[0] === 'ink') {
      pool = Object.keys(PACKAGES);
    } else if (argv[0] === 'export' || argv[0] === 'unset' || argv[0] === 'printenv') {
      for (i = 0; i < ENV.length; i++) pool.push(ENV[i][0]);
    } else {
      var entries = listing(word.charAt(0) === '.');
      for (i = 0; i < entries.length; i++) pool.push(entries[i].name);
    }
    var hits = [];
    for (i = 0; i < pool.length; i++) {
      if (pool[i].indexOf(word) === 0) hits.push(pool[i]);
    }
    return hits;
  }

  function commonPrefix(words) {
    var prefix = words[0];
    for (var i = 1; i < words.length; i++) {
      while (prefix && words[i].indexOf(prefix) !== 0) prefix = prefix.slice(0, -1);
    }
    return prefix;
  }

  // Completion works on the word under the caret, so it behaves the same
  // whether the caret is at the end of the line or back inside it.
  function complete() {
    var value = input.value;
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
  function renderInput() {
    if (search) {
      search.query = input.value;
      search.at = search.query ? findMatch(search.query, cmdHistory.length - 1) : -1;
    }
    renderLine();
  }

  input.addEventListener('input', renderInput);

  // Pasting several lines runs the complete ones and leaves the last at the
  // prompt, which is what a terminal does with a multi-line paste.
  input.addEventListener('paste', function (e) {
    var clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard || job) return;
    var text = clipboard.getData('text');
    if (!text || text.indexOf('\n') === -1) return; // one line: let the browser paste it
    e.preventDefault();
    var at = caretPos();
    var before = input.value.slice(0, at);
    var after = input.value.slice(at);
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length - 1; i++) {
      var whole = (i === 0 ? before : '') + lines[i];
      setLine('');
      run(whole);
    }
    setLine(lines[lines.length - 1] + after, lines[lines.length - 1].length);
  });

  input.addEventListener('keydown', function (e) {
    // Terminal chords only on plain ctrl, and only while the prompt has focus,
    // so cmd+R and the rest of the browser's shortcuts stay untouched.
    var chord = e.ctrlKey && !e.metaKey && !e.altKey;
    var meta = e.altKey && !e.ctrlKey && !e.metaKey;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var value = input.value;
    var at = caretPos();

    // While something is running the prompt is not yours: only ctrl+c is.
    if (job) {
      if (chord && key === 'c' && job.stubborn) {
        consume(e);
      } else if (chord && key === 'c') {
        consume(e);
        printText('^C');
        endJob(true);
      } else if (e.key.length === 1 || e.key === 'Enter') {
        consume(e);
      }
      return;
    }

    // tmux sees keys before the shell does: ctrl+b arms the prefix, and the
    // next key (modifiers aside) is a tmux command, not typing.
    if (tmux && tmux.attached && !search) {
      if (prefixArmed) {
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
        consume(e);
        prefixArmed = false;
        if (chord && key === 'b') setCaret(at - 1); // the prefix twice sends it through
        else tmuxKey(e.key, e.ctrlKey ? 1 : e.altKey ? 5 : 0);
        return;
      }
      if (/^Arrow/.test(e.key) && (e.ctrlKey || e.altKey) && Date.now() < repeatUntil) {
        consume(e);
        tmuxKey(e.key, e.ctrlKey ? 1 : 5);
        return;
      }
      if (chord && key === 'b') {
        consume(e);
        prefixArmed = true;
        return;
      }
    }

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
        promptLabel.textContent = ps1();
        lastStatus = 130;
      }
      setLine('');
      histIndex = cmdHistory.length;
      draft = '';
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
      input.blur();
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey && !chord && !e.metaKey && !e.altKey) {
      if (search) acceptSearch();
      // Nothing typed: tab keeps its day job and moves focus off the prompt.
      // shift+tab is never touched, so backwards always works too.
      if (input.value === '') return;
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
      var raw = input.value;
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
      kill(wordStart(value, at), at);
      return;
    }
    if (chord && key === 'u') {
      consume(e);
      kill(0, at);
      return;
    }
    if (chord && key === 'k') {
      consume(e);
      kill(at, value.length);
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
      if (!value && (shells.length || (tmux && tmux.attached))) {
        printLine([styled('term-prompt', '$'), textNode(' exit')]);
        exitShell();
        return;
      }
      if (!value) {
        printLine([styled('term-prompt', '$'), textNode(' logout')]);
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
      kill(at, wordEnd(value, at));
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

  // Clicking the terminal focuses the prompt (this is what opens the keyboard
  // on mobile) unless the click is a link or a text selection.
  terminal.addEventListener('pointerdown', function (e) {
    dragged = false;
    startDrag(e);
  });

  // Over a border, the pointer turns into a resize arrow.
  terminal.addEventListener('pointermove', function (e) {
    if (drag || !panesBox || !panesBox.parentNode || !tmux || !tmux.attached) return;
    var node = borderAt(e.target, e.clientX, e.clientY);
    panesBox.classList.toggle('is-col', !!node && node.dir === 'h');
    panesBox.classList.toggle('is-row', !!node && node.dir === 'v');
  });

  terminal.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    // tmux with the mouse on: clicking a pane selects it, unless the click
    // ends the drag of a border.
    var pane = e.target.closest('.term-pane');
    if (dragged) {
      dragged = false;
      pane = null;
    }
    if (pane && tmux && tmux.attached && !job) {
      var panes = currentWindow().panes;
      for (var i = 0; i < panes.length; i++) {
        if (panes[i].el === pane) selectPane(i);
      }
    }
    var selection = window.getSelection();
    if (selection && selection.type === 'Range') return;
    input.focus({ preventScroll: true });
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
    if (!input.isConnected || input.disabled || job) return;
    var active = document.activeElement;
    // e.target covers a keystroke aimed at the prompt while focus sits
    // elsewhere: its own handler has it, and completing twice would be wrong.
    if (active === input || e.target === input) return;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    // Space keeps its native meaning where it has one: activating a focused
    // control, or scrolling when nothing has been typed yet. Commands never
    // start with a space, so an empty-buffer Space can safely go to the page.
    if (!completing && e.key === ' ' && active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'SUMMARY')) return;
    if (!completing && e.key === ' ' && input.value === '') return;
    var modal = document.getElementById('search-modal');
    if (modal && !modal.hasAttribute('hidden')) return;
    // Nothing typed: tab keeps its day job and moves focus through the page.
    // shift+tab is never touched, so the terminal can't trap a keyboard.
    if (completing && input.value === '') return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    if (completing) {
      complete();
      return;
    }
    setLine(input.value + e.key);
  });

  livePrompt.classList.add('is-live'); // the cursor becomes an inverted cell
  renderLine();
})();
