// 404 page: fills in the path the visitor tried to reach, then hides an
// easter egg — the terminal prompt is real. A tiny shell supports help, ls,
// cd, cat, echo, clear and rm, and rm genuinely deletes things: page elements vanish
// from the page, directories take their navbar link with them, and rm -rf /
// wipes everything, then the whole site powers off like an old CRT.
// The line editor is shell-shaped too: ↑/↓ walk the command history, ctrl+r
// searches it, ctrl+c cancels the line, tab completes a word, and cd .. walks
// back through the browser's history. Tab is only ever taken from a keyboard
// user when there is a word to complete, so the prompt can't trap them: an
// empty prompt, shift+tab and escape all still move focus out.
// There are also toys: uname (this is sebiwiOS), env (echo expands these),
// ifconfig/ip/ping (there is no network, only sebiwi), and package managers
// that question your judgment.
// Nothing persists: reloading restores the page.
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

  // The live prompt's '$'. ctrl+r borrows it for the search prompt.
  var promptLabel = livePrompt.querySelector('.term-prompt');
  if (!promptLabel) return;

  var FADE_MS = 180;
  var WIPE_STEP_MS = 300;
  var MAX_SCROLLBACK = 100;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // What the shell can see. The directories are read off the links of the
  // static `ls ~/` line above the prompt (a trailing slash in the link text
  // means directory, so the listing can carry a file too), which keeps the
  // shell from drifting from what the page shows; "element" entries map rm
  // targets to parts of this page, and the one flagged text can be cat'd.
  // Sizes are for ls -l flavor only.
  var files = [];
  var lsLinks = pre.querySelectorAll('a.term-link');
  for (var li = 0; li < lsLinks.length; li++) {
    var lsName = (lsLinks[li].textContent || '').trim();
    var lsUrl = lsLinks[li].getAttribute('href');
    var isDir = lsName.slice(-1) === '/';
    files.push({
      name: lsName,
      kind: isDir ? 'dir' : 'page',
      url: lsUrl,
      size: isDir ? 4096 : 1998,
      navSelector: '.top-nav a[href="' + lsUrl + '"]'
    });
  }
  files.push(
    { name: 'nav', kind: 'element', selector: '.top-nav', size: 512 },
    { name: 'controls', kind: 'element', selector: '.page-controls', size: 256 },
    { name: 'hint.txt', kind: 'element', selector: '[data-404-hint]', size: 42, text: true },
    { name: 'terminal', kind: 'element', selector: '.terminal-404', size: 8192 }
  );

  function elementOf(file) {
    return file.kind === 'element' ? document.querySelector(file.selector) : null;
  }

  // Elements live until removed from the DOM; directories and pages carry a
  // removed flag instead (deleting them can't unpublish the real site).
  function exists(file) {
    if (file.kind === 'element') return !!elementOf(file);
    return !file.removed;
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

  // Fade an element out, then drop it from the DOM. The page's entrance
  // animation pins opacity via fill-mode (which outranks transitions and
  // inline styles), so the fade must be a WAAPI animation — those win.
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

  // The terminal's dying words, shown whenever the terminal itself goes —
  // via rm terminal or at the end of rm -rf /.
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
  // here — not in style.css — so no page pays for them until the moment the
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

  function tvOff() {
    var style = document.createElement('style');
    style.textContent = TV_CSS;
    document.head.appendChild(style);
    var screen = document.createElement('div');
    screen.className = 'tv-off';
    screen.setAttribute('aria-hidden', 'true');
    document.body.appendChild(screen);
  }

  var wiping = false;

  // rm -rf /: everything goes — bottom up, terminal last — then the parting
  // line on the bare page, then the TV switches off. A reload brings it all
  // back.
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

  function rmOne(target, recursive, force) {
    // '~' counts as everything too: rm -rf ~ is the canonical spelling.
    if (target === '/' || target === '/*' || target === '~' || target === '~/') {
      if (recursive && force) {
        wipeEverything();
      } else if (recursive) {
        printText("rm: it is dangerous to operate recursively on '" + target + "'");
      } else {
        printText("rm: cannot remove '" + target + "': Is a directory");
      }
      return;
    }
    var file = resolve(target);
    if (!file) {
      printText("rm: cannot remove '" + target + "': No such file or directory");
      return;
    }
    if (file.kind === 'dir' && !recursive) {
      printText("rm: cannot remove '" + file.name + "': Is a directory");
      return;
    }
    if (file.kind === 'element') {
      var el = elementOf(file);
      vaporize(el, el === terminal ? farewell : null); // silent on success, like the real thing
      return;
    }
    // A listing entry (a directory with -r, or a file): gone from the
    // listing — and from the navbar, so the deletion shows.
    file.removed = true;
    var navLink = document.querySelector(file.navSelector);
    if (navLink) vaporize(navLink);
  }

  // cat prints what is really on the page, so it can't drift from it. Only
  // hint.txt is text; the other page entries are furniture, not files.
  function catOne(target) {
    var file = resolve(target);
    if (!file) {
      printText('cat: ' + target + ': No such file or directory');
    } else if (file.kind === 'dir') {
      printText('cat: ' + file.name + ': Is a directory');
    } else if (!file.text) {
      printText('cat: ' + file.name + ': Is a widget');
    } else {
      printText(elementOf(file).textContent.replace(/\s+/g, ' ').trim());
    }
  }

  function lsLongLine(file) {
    var mode = file.kind === 'dir' ? 'drwxr-xr-x' : file.name === 'terminal' ? '-rwxr-xr-x' : '-rw-r--r--';
    var meta = mode + ' 1 sebiwi sebiwi ' + pad(String(file.size), 5) + ' Jul 13 07:19 ';
    return file.url ? [textNode(meta), fileLink(file)] : [textNode(meta + file.name)];
  }

  // uname fields, keyed by flag letter. -a prints them in this order.
  var UNAME = [
    ['s', 'sebiwiOS'],
    ['n', 'scoreplay'],
    ['r', '4.0.4-comic'],
    ['v', '#1 SMP PREEMPT_HANDDRAWN Sun Jul 13 07:19:00 UTC 2026'],
    ['m', 'pencil64'],
    ['o', 'sebiwiOS']
  ];

  // The environment, such as it is: env prints it, echo expands it.
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

  function envValue(name) {
    for (var i = 0; i < ENV.length; i++) {
      if (ENV[i][0] === name) return ENV[i][1];
    }
    return null;
  }

  // $NAME and ${NAME}, like a shell: anything unset expands to nothing.
  function expand(text) {
    return text.replace(/\$\{(\w+)\}|\$(\w+)/g, function (match, braced, bare) {
      var value = envValue(braced || bare);
      return value === null ? '' : value;
    });
  }

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

  var commands = {
    help: function () {
      printText('available commands:');
      printText('  ls [-l]         list files');
      printText('  cd <dir>        go somewhere real');
      printText('  cat <file>      read a file');
      printText('  echo <text>     say it back');
      printText('  rm [-r] <file>  remove a file. Or everything.');
      printText('  clear           clear the screen');
      printText('  help            you are here');
      printText('keys:');
      printText('  up/down         walk the history');
      printText('  ctrl+r          search the history');
      printText('  ctrl+c          give up on the line');
      printText('  tab             complete a word');
      printText('  esc             leave the prompt');
    },

    ls: function (args) {
      var long = false;
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) === '-' && args[i].indexOf('l') !== -1) long = true;
      }
      var visible = [];
      for (var j = 0; j < files.length; j++) {
        if (exists(files[j])) visible.push(files[j]);
      }
      if (long) {
        printText('total ' + visible.length);
        for (var k = 0; k < visible.length; k++) {
          printLine(lsLongLine(visible[k]));
        }
        return;
      }
      var nodes = [];
      for (var m = 0; m < visible.length; m++) {
        if (nodes.length) nodes.push(textNode('  '));
        nodes.push(visible[m].url ? fileLink(visible[m]) : textNode(visible[m].name));
      }
      printLine(nodes);
    },

    cd: function (args) {
      var target = args[0] || '~';
      if (target === '~' || target === '~/' || target === '/') {
        window.location.href = '/';
        return;
      }
      // '..' walks back through the browser's history: the page you came from
      // is the directory you came from. '../..' walks back twice, and so on.
      // Arriving here cold (a bad link, a bookmark) leaves nothing to go back
      // to, so the walk falls back to the site root.
      var segments = target.replace(/\/+$/, '').split('/');
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
        else window.location.href = '/';
        return;
      }
      var file = resolve(target);
      if (file && file.kind === 'dir') {
        window.location.href = file.url;
      } else if (file) {
        printText('cd: not a directory: ' + target);
      } else {
        printText('cd: no such file or directory: ' + target);
      }
    },

    cat: function (args) {
      var targets = [];
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) !== '-') targets.push(args[i]);
      }
      if (!targets.length) {
        printText('cat: missing operand');
        return;
      }
      for (var j = 0; j < targets.length; j++) {
        catOne(targets[j]);
      }
    },

    // The line comes back as one line: -n and -e are swallowed, because every
    // line here is a line whatever you ask. Surrounding quotes come off, since
    // the prompt splits on spaces and would otherwise print them, and single
    // quotes keep a $ literal, same as a real shell.
    echo: function (args) {
      var words = args.slice();
      while (words.length && /^-[neE]+$/.test(words[0])) words.shift();
      var text = words.join(' ');
      var quote = text.charAt(0);
      var quoted = (quote === '"' || quote === "'") && text.length > 1 && text.slice(-1) === quote;
      if (quoted) text = text.slice(1, -1);
      printText(quoted && quote === "'" ? text : expand(text));
    },

    clear: function () {
      while (pre.firstChild !== livePrompt) {
        pre.removeChild(pre.firstChild);
      }
    },

    env: function () {
      for (var i = 0; i < ENV.length; i++) {
        printText(ENV[i][0] + '=' + ENV[i][1]);
      }
    },

    uname: function (args) {
      var picked = {};
      var any = false;
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) !== '-') {
          printText("uname: extra operand '" + args[i] + "'");
          return;
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
              printText("uname: invalid option -- '" + c + "'");
              return;
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
      printText(parts.join(' '));
    },

    ifconfig: function () {
      printText('lo0: flags=73<UP,LOOPBACK,COMFY> mtu 16384');
      printText('        inet 127.0.0.1 netmask 0xff000000');
      printText("        status: there's no place like it");
      printText('pen0: flags=8863<UP,BROADCAST,SMUDGED> mtu 1500');
      printText('        inet 10.0.4.4 netmask 0xffffff00 broadcast 10.0.4.255');
      printText('        ether 5e:b1:w1:00:04:04 (hand-lettered)');
      printText('        status: drawing packets by hand');
    },

    ip: function (args) {
      var sub = args[0] || '';
      if (sub === 'a' || sub === 'addr' || sub === 'address') {
        printText('1: lo0: <LOOPBACK,UP,COMFY> mtu 16384');
        printText('    inet 127.0.0.1/8 scope host');
        printText('2: pen0: <BROADCAST,UP,SMUDGED> mtu 1500');
        printText('    inet 10.0.4.4/24 scope global pen0');
        return;
      }
      if (sub === 'r' || sub === 'route') {
        printText('default via the-couch dev pen0 metric 42');
        return;
      }
      printText('Usage: ip { addr | route }   (this is a very small ip)');
    },

    ping: function (args) {
      var host = null;
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) !== '-') {
          host = args[i];
          break;
        }
      }
      if (!host) {
        printText('ping: usage error: Destination address required');
        return;
      }
      printText('PING ' + host + ' (127.0.0.1): 56 data bytes');
      printText('64 bytes from ' + host + ': icmp_seq=0 ttl=42 time=0.004 ms');
      printText('64 bytes from ' + host + ': icmp_seq=1 ttl=42 time=0.003 ms (hand-delivered)');
      printText('--- ' + host + ' ping statistics ---');
      printText('2 packets transmitted, 2 packets received, 0.0% packet loss');
      printText("(everything here resolves to 127.0.0.1. it's cozy that way.)");
    },

    rm: function (args) {
      var flags = '';
      var targets = [];
      for (var i = 0; i < args.length; i++) {
        if (args[i].charAt(0) === '-') {
          flags += args[i];
        } else {
          targets.push(args[i]);
        }
      }
      if (!targets.length) {
        printText('rm: missing operand');
        return;
      }
      var recursive = flags.indexOf('r') !== -1;
      var force = flags.indexOf('f') !== -1;
      for (var j = 0; j < targets.length; j++) {
        rmOne(targets[j], recursive, force);
      }
    }
  };

  function run(raw) {
    printLine([styled('term-prompt', '$'), textNode(' ' + raw)]);
    var argv = raw.trim().split(/\s+/).filter(Boolean);
    if (!argv.length) return;
    var name = argv[0];
    if (Object.prototype.hasOwnProperty.call(commands, name)) {
      commands[name](argv.slice(1));
    } else {
      printText(name + ': command not found');
      if (Object.prototype.hasOwnProperty.call(packageManagers, name)) {
        printLine([styled('term-err', "This isn't " + packageManagers[name] + ', genius.')]);
      }
    }
  }

  // Line editing. The real input holds the line (or, during ctrl+r, the search
  // query); the echo span is what the visitor actually sees, so every change
  // has to go through setLine() or renderSearch().
  var cmdHistory = [];
  var histIndex = 0; // cmdHistory.length means "the line being typed"
  var draft = '';    // that line, parked while up/down browse older ones
  var search = null; // { query, at, saved } while ctrl+r is open

  function setLine(text) {
    input.value = text;
    echo.textContent = text;
  }

  function submit(raw) {
    var trimmed = raw.trim();
    // Like a shell: blank lines and immediate repeats don't pile up.
    if (trimmed && cmdHistory[cmdHistory.length - 1] !== trimmed) cmdHistory.push(trimmed);
    histIndex = cmdHistory.length;
    draft = '';
    run(raw);
  }

  function recallHistory(step) {
    var next = histIndex + step;
    if (next < 0 || next > cmdHistory.length) return;
    if (histIndex === cmdHistory.length) draft = input.value;
    histIndex = next;
    setLine(histIndex === cmdHistory.length ? draft : cmdHistory[histIndex]);
  }

  // Newest first, from `from` backwards. -1 when nothing matches.
  function findMatch(query, from) {
    for (var i = from; i >= 0; i--) {
      if (cmdHistory[i].indexOf(query) !== -1) return i;
    }
    return -1;
  }

  function matchedLine() {
    return search.at === -1 ? '' : cmdHistory[search.at];
  }

  function renderSearch() {
    var label = search.at === -1 && search.query ? 'failed reverse-i-search' : 'reverse-i-search';
    promptLabel.textContent = '(' + label + ')`' + search.query + "':";
    echo.textContent = matchedLine();
  }

  function startSearch() {
    search = { query: '', at: -1, saved: input.value };
    input.value = '';
    renderSearch();
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

  // Show whatever the input now holds: the line being typed, or — while ctrl+r
  // is open — the query and the command it turned up.
  function renderInput() {
    if (!search) {
      echo.textContent = input.value;
      return;
    }
    search.query = input.value;
    search.at = search.query ? findMatch(search.query, cmdHistory.length - 1) : -1;
    renderSearch();
  }

  // Tab completion, on the last word of the line: command names in the first
  // position, file names after that. Deleted files stop completing, same as
  // they stop resolving.
  function candidates(word, firstWord) {
    var pool = [];
    var i;
    if (firstWord) {
      pool = Object.keys(commands).sort();
    } else {
      for (i = 0; i < files.length; i++) {
        if (exists(files[i])) pool.push(files[i].name);
      }
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

  function complete() {
    var line = input.value;
    var start = line.search(/\S*$/); // where the word under the cursor begins
    var word = line.slice(start);
    var hits = candidates(word, line.slice(0, start).trim() === '');
    if (!hits.length) return; // nothing to say, like a shell with no match
    if (hits.length === 1) {
      // A directory keeps its slash and no space, so it reads like a path.
      var hit = hits[0];
      setLine(line.slice(0, start) + hit + (hit.slice(-1) === '/' ? '' : ' '));
      return;
    }
    var prefix = commonPrefix(hits);
    if (prefix.length > word.length) {
      setLine(line.slice(0, start) + prefix);
      return;
    }
    // As far as the common prefix goes: show what's on offer. The line being
    // typed needs no redraw — the live prompt below the listing *is* the redraw.
    printText(hits.join('  '));
  }

  input.addEventListener('input', renderInput);

  input.addEventListener('keydown', function (e) {
    // Terminal chords only on plain ctrl, and only while the prompt has focus,
    // so cmd+R and the rest of the browser's shortcuts stay untouched.
    var chord = e.ctrlKey && !e.metaKey && !e.altKey;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (chord && key === 'r') {
      e.preventDefault();
      if (!search) {
        startSearch();
      } else {
        // Again: the next older match, or stay put when there isn't one.
        var older = findMatch(search.query, search.at === -1 ? -1 : search.at - 1);
        if (older !== -1) search.at = older;
        renderSearch();
      }
      return;
    }

    if (chord && key === 'c') {
      // A selection keeps the native copy: on Windows and Linux ctrl+c is how
      // you copy, and silently eating that would be rude.
      var selection = window.getSelection();
      if (selection && selection.type === 'Range') return;
      e.preventDefault();
      var abandoned = search ? matchedLine() : input.value;
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
      e.preventDefault();
      endSearch(search.saved);
      return;
    }

    if (e.key === 'Escape') {
      if (search) {
        e.preventDefault();
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
      e.preventDefault();
      complete();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (search) acceptSearch();
      else recallHistory(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (search) acceptSearch();
      var raw = input.value;
      setLine('');
      submit(raw);
    }
  });

  // Clicking the terminal focuses the prompt (this is what opens the keyboard
  // on mobile) — unless the click is a link or a text selection.
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
    if (!input.isConnected || input.disabled) return;
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
    input.value += e.key;
    renderInput();
  });
})();
