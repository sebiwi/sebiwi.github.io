// 404 page: fills in the path the visitor tried to reach, then hides an easter
// egg. The terminal prompt is real, and what sits behind it is a small but
// honest shell.
//
// The language: quoted words, $VAR expansion, globs, ; && || chaining, pipes,
// > and >> redirection, $? exit status, ! history expansion, aliases.
// The filesystem: read off the `ls ~/` line above the prompt, so the shell
// can't drift from what the page shows. touch, mkdir and > add to it, and rm
// genuinely deletes: page elements vanish, directories take their navbar link
// with them, and rm -rf / wipes everything, then the whole site powers off
// like an old CRT.
// The line editor: a cursor that sits where the caret really is, the readline
// chords (ctrl+a/e/b/f/w/u/k/y/d/l and alt+b/f/d), up/down through a history
// kept in sessionStorage, ctrl+r reverse search, tab completion, ctrl+c. The
// history lives in .sebiwi_history, so rm on that file ends all of it.
// Jobs: ping, sleep and yes print on a timer and ctrl+c interrupts them, which
// is the only reason ctrl+c means anything.
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

  function envSet(name, value) {
    var i = envIndex(name);
    if (i === -1) ENV.push([name, value]);
    else ENV[i][1] = value;
  }

  // $NAME, ${NAME}, $? and $$, like a shell: anything unset expands to nothing.
  function expandVars(text) {
    return text.replace(/\$\{(\w+)\}|\$(\w+)|\$([?$])/g, function (match, braced, bare, special) {
      if (special === '?') return String(lastStatus);
      if (special === '$') return '404';
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

  // ----------------------------------------------------------------- parsing

  var OPERATORS = [';', '|', '>', '&'];

  // Whitespace splits words, quotes group them, and a token remembers whether
  // it was single-quoted so expansion can leave it alone. The operators
  // ; && || | > >> come out on their own.
  function tokenize(line) {
    var tokens = [];
    var i = 0;
    while (i < line.length) {
      var ch = line.charAt(i);
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      var two = line.substr(i, 2);
      if (two === '&&' || two === '||' || two === '>>') {
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
  // a stage is a command with an optional > or >> target.
  function parse(tokens) {
    var segments = [];
    var seg = { join: ';', stages: [] };
    var stage = { argv: [], redirect: null };
    var error = null;

    function pushStage() {
      if (stage.argv.length || stage.redirect) seg.stages.push(stage);
      stage = { argv: [], redirect: null };
    }
    function pushSeg(join) {
      pushStage();
      if (seg.stages.length) segments.push(seg);
      seg = { join: join, stages: [] };
    }

    for (var i = 0; i < tokens.length && !error; i++) {
      var t = tokens[i];
      if (!t.op) {
        stage.argv = stage.argv.concat(expandWord(t));
        continue;
      }
      if (t.text === '|') {
        pushStage();
      } else if (t.text === ';' || t.text === '&') {
        pushSeg(';');
      } else if (t.text === '&&' || t.text === '||') {
        pushSeg(t.text);
      } else {
        var target = tokens[i + 1];
        if (!target || target.op) {
          error = "sebiwish: syntax error near unexpected token `newline'";
        } else {
          stage.redirect = { name: expandWord(target)[0], append: t.text === '>>' };
          i++;
        }
      }
    }
    pushSeg(';');
    return { segments: segments, error: error };
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
    help: { args: '', blurb: 'you are here', man: 'Lists the commands worth knowing. The rest are for people who type things to see what happens.' },
    // Hidden from help, documented for anyone who thinks to ask.
    man: { args: '<command>', blurb: '', hidden: true, man: 'Prints one of these. You are reading it.' },
    history: { args: '', blurb: '', hidden: true, man: 'Lists the commands you have run, kept in sessionStorage so a reload does not forget them. !! runs the last one, !7 runs the seventh, !ls the most recent ls. The history is .sebiwi_history: delete that file and the shell forgets everything and stops taking notes, until touch makes it again.' },
    env: { args: '', blurb: '', hidden: true, man: 'Prints the environment. export changes it, unset removes from it, echo expands it.' },
    ping: { args: '<host>', blurb: '', hidden: true, man: 'Pings, forever, one packet a second, until ctrl+c. Everything resolves to 127.0.0.1. It is cozy that way.' },
    uname: { args: '[-a]', blurb: '', hidden: true, man: 'Prints system information. The system is sebiwiOS and the machine is a pencil.' },
    sudo: { args: '<command>', blurb: '', hidden: true, man: 'Runs a command as another user. Not here it does not.' },
    neofetch: { args: '', blurb: '', hidden: true, man: 'Prints the machine and a small person waving. The same person waves on the about page.' }
  };

  var HELP_ORDER = ['ls', 'cd', 'pwd', 'cat', 'echo', 'touch', 'mkdir', 'rm', 'grep', 'clear', 'help'];

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

  function numberFlag(args, letter, fallback) {
    for (var i = 0; i < args.length; i++) {
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
      io.out.text('also: pipes, > redirection, ; && ||, globs, $VARS, and man <command>.');
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
        io.out.text(ENV[i][0] + '=' + ENV[i][1]);
      }
    },

    printenv: function (args, io) {
      if (!args.length) return commands.env(args, io);
      var value = envValue(args[0]);
      if (value === null) return 1;
      io.out.text(value);
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
        envSet(name, eq === -1 ? '' : args[i].slice(eq + 1));
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

    exit: function (args, io) {
      io.out.text('logout');
      powerOff();
    }
  };

  commands.poweroff = commands.shutdown;
  commands.halt = commands.shutdown;
  commands.logout = commands.exit;
  commands.chown = commands.chmod;
  commands.vi = commands.vim;
  commands.wget = commands.curl;
  commands.telnet = commands.ssh;
  commands.yarn = commands.npm;
  commands.pnpm = commands.npm;
  commands['xdg-open'] = commands.open;

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
    io.out.text(name + ': command not found');
    if (Object.prototype.hasOwnProperty.call(packageManagers, name)) {
      io.out.line([styled('term-err', "This isn't " + packageManagers[name] + ', genius.')]);
    }
    return 127;
  }

  function runPipeline(stages, canAsync) {
    var stdin = null;
    var status = 0;
    for (var i = 0; i < stages.length; i++) {
      var last = i === stages.length - 1;
      var redirect = stages[i].redirect;
      var sink = last && !redirect ? screenSink : captureSink();
      status = invoke(stages[i].argv, {
        out: sink,
        stdin: stdin,
        tty: sink === screenSink,
        async: canAsync && last && !redirect
      });
      if (redirect) status = writeFile(redirect, sink.lines) || status;
      else if (!last) stdin = sink.lines;
    }
    return status;
  }

  function execute(line) {
    var parsed = parse(tokenize(line));
    if (parsed.error) {
      printText(parsed.error);
      lastStatus = 2;
      return;
    }
    var segments = parsed.segments;
    var canAsync = segments.length === 1 && segments[0].stages.length === 1;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.join === '&&' && lastStatus !== 0) continue;
      if (seg.join === '||' && lastStatus === 0) continue;
      lastStatus = runPipeline(seg.stages, canAsync);
      if (job) break; // whatever follows can wait for a prompt that is busy
    }
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
    if (trimmed) execute(line);
  }

  function run(raw) {
    printLine([styled('term-prompt', '$'), textNode(' ' + raw)]);
    submit(raw);
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
    promptLabel.textContent = '$';
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
      if (chord && key === 'c') {
        consume(e);
        printText('^C');
        endJob(true);
      } else if (e.key.length === 1 || e.key === 'Enter') {
        consume(e);
      }
      return;
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
      printLine([styled('term-prompt', '$'), textNode(' ' + abandoned + '^C')]);
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
      // ctrl+d on an empty line is how you leave a shell.
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
  terminal.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
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
