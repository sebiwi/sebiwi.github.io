// The toys, and the tools that are jokes.

import { flagsOf, operandsOf } from '../args.js';
import { ctx, fs } from '../fsview.js';
import { commands } from '../registry.js';
import { fileLink, textNode } from '../screen.js';
import { padRight } from '../util.js';
import { can, entries, isDirLike, lookup } from '../vfs.js';

export var FORTUNES = [
  'The bug is in the last place you looked, which is why you stopped looking.',
  'A comic is a postmortem with better pacing.',
  'Every incident is a design review you scheduled by accident.',
  'You are not stuck. You are between abstractions.',
  'The retry storm is coming from inside the house.',
  'Ship the small thing. The big thing is made of small things.'
];

export var NEOFETCH_LOGO = [' o/', '/|', '/ \\'];

Object.assign(commands, {
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

  // tree: the real tree, from . or a path, ASCII like tree --charset=ascii.
  tree: function (args, io) {
    var all = flagsOf(args).indexOf('a') !== -1;
    var start = operandsOf(args)[0] || '.';
    var c = ctx();
    var top = lookup(fs, start, c);
    if (top.error || !isDirLike(top.node)) {
      io.out.text(start + ' [error opening dir]');
      return 2;
    }
    var counts = { dirs: 0, files: 0 };
    io.out.text(start);
    (function branch(n, indent) {
      if (n.type === 'page' || !can(n, c.user, 4)) return;
      var kids = entries(n).filter(function (e) { return all || e.name.charAt(0) !== '.'; });
      for (var i = 0; i < kids.length; i++) {
        var last = i === kids.length - 1;
        var k = kids[i].node;
        var label = kids[i].name + (k.type === 'symlink' ? ' -> ' + k.target : ''); // tree marks nothing, like ls
        if (k.url) io.out.line([textNode(indent + (last ? '`-- ' : '|-- ')), fileLink({ url: k.url, name: label })]);
        else io.out.text(indent + (last ? '`-- ' : '|-- ') + label);
        if (isDirLike(k)) {
          counts.dirs++;
          branch(k, indent + (last ? '    ' : '|   '));
        } else {
          counts.files++;
        }
      }
    })(top.node, '');
    io.out.text('');
    io.out.text(counts.dirs + ' directories, ' + counts.files + ' files');
  },

  node: function (args, io) {
    io.out.text('node: there is no event loop here. Only sebiwi.');
    return 1;
  }
});

commands.vi = commands.vim;
commands.telnet = commands.ssh;
commands.yarn = commands.npm;
commands.pnpm = commands.npm;
commands.npx = commands.npm;
