// 404 page: fills in the path the visitor tried to reach, then hides an
// easter egg — the terminal prompt is real. A tiny shell supports help, ls,
// cd, clear and rm, and rm genuinely deletes things: page elements vanish
// from the page, directories take their navbar link with them, and rm -rf /
// wipes everything, then the whole site powers off like an old CRT.
// There are also toys: uname (this is sebiwiOS), ifconfig/ip/ping (there is
// no network, only sebiwi), and package managers that question your judgment.
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

  var FADE_MS = 180;
  var WIPE_STEP_MS = 300;
  var MAX_SCROLLBACK = 100;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // What the shell can see. Directories and about.md are read off the links
  // of the static `ls ~/` line above the prompt (a trailing slash in the
  // link text means directory), so the shell can't drift from what the page
  // shows; "element" entries map rm targets to parts of this page. Sizes are
  // for ls -l flavor only.
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
    { name: 'hint.txt', kind: 'element', selector: '[data-404-hint]', size: 42 },
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
    // Directory (with -r) or about.md: gone from the listing — and from
    // the navbar, so the deletion shows.
    file.removed = true;
    var navLink = document.querySelector(file.navSelector);
    if (navLink) vaporize(navLink);
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
      printText('  rm [-r] <file>  remove a file. Or everything.');
      printText('  clear           clear the screen');
      printText('  help            you are here');
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
      var file = resolve(target);
      if (file && file.kind === 'dir') {
        window.location.href = file.url;
      } else if (file) {
        printText('cd: not a directory: ' + target);
      } else {
        printText('cd: no such file or directory: ' + target);
      }
    },

    clear: function () {
      while (pre.firstChild !== livePrompt) {
        pre.removeChild(pre.firstChild);
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

  input.addEventListener('input', function () {
    echo.textContent = input.value;
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      var raw = input.value;
      input.value = '';
      echo.textContent = '';
      run(raw);
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
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (e.key.length !== 1) return; // printable characters only
    if (!input.isConnected || input.disabled) return;
    var active = document.activeElement;
    if (active === input) return;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    // Space keeps its native meaning where it has one: activating a focused
    // control, or scrolling when nothing has been typed yet. Commands never
    // start with a space, so an empty-buffer Space can safely go to the page.
    if (e.key === ' ' && active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'SUMMARY')) return;
    if (e.key === ' ' && input.value === '') return;
    var modal = document.getElementById('search-modal');
    if (modal && !modal.hasAttribute('hidden')) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    input.value += e.key;
    echo.textContent = input.value;
  });
})();
