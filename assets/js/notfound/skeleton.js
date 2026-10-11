// The standard tree every visitor's shell starts with: what a fresh install
// of sebiwiOS looks like before anything is drawn into /usr/bin. The page's
// own entries (the pages, the parts, the dotfiles) are added by fsview.js.

import { node, attach, EPOCH } from './vfs.js';

export var HOME = '/home/sebiwi';

var ETC = {
  hostname: 'scoreplay',
  motd: 'Welcome to sebiwiOS 4.0.4-comic.\nThere is no network, only sebiwi.',
  'os-release': [
    'NAME="sebiwiOS"',
    'VERSION="4.0.4 (Comic)"',
    'ID=sebiwi',
    'PRETTY_NAME="sebiwiOS 4.0.4 (Comic)"',
    'HOME_URL="https://sebiwi.github.io/"'
  ].join('\n'),
  passwd: [
    'root:x:0:0:root:/root:/bin/sebiwish',
    'sebiwi:x:1000:1000:sebiwi,,,:/home/sebiwi:/bin/sebiwish'
  ].join('\n'),
  group: 'root:x:0:\nsudo:x:27:sebiwi\nsebiwi:x:1000:',
  shells: '/bin/sebiwish\n/bin/bash\n/bin/sh\n/bin/zsh'
};

var SUDOERS = [
  'Defaults        env_reset',
  'Defaults        timestamp_timeout=5',
  'root    ALL=(ALL:ALL) ALL',
  '%sudo   ALL=(ALL:ALL) ALL',
  '# the pencil is mightier'
].join('\n');

// A binary looks like a binary to cat, and nothing like one to anything else.
function elf(name) {
  return '\u007fELF\u0002\u0001\u0001 sebiwiOS ' + name + ' (pencil64)';
}

function noise(n) {
  var out = [];
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (var i = 0; i < n; i++) {
    var line = '';
    for (var j = 0; j < 32; j++) line += chars.charAt(Math.floor(Math.random() * chars.length));
    out.push(line);
  }
  return out;
}

export function buildSkeleton(fs, opts) {
  opts = opts || {};
  function dir(parent, name, props) {
    return attach(parent, name, node(fs, 'dir', Object.assign({ uid: 'root', mode: 0o755, mtime: EPOCH }, props || {})));
  }
  function file(parent, name, props) {
    return attach(parent, name, node(fs, 'file', Object.assign({ uid: 'root', mode: 0o644, mtime: EPOCH }, props || {})));
  }

  var root = fs.root;
  var bin = dir(root, 'bin');
  var dev = dir(root, 'dev');
  var etc = dir(root, 'etc');
  var home = dir(root, 'home');
  var proc = dir(root, 'proc', { mode: 0o555, readonly: true, list: opts.procList || function () { return {}; } });
  var rootHome = dir(root, 'root', { mode: 0o700 });
  var tmp = dir(root, 'tmp', { mode: 0o1777 });
  var usr = dir(root, 'usr');
  var usrBin = dir(usr, 'bin');
  var usrLib = dir(usr, 'lib');
  var share = dir(usr, 'share');
  var mine = dir(share, 'sebiwi');
  var me = dir(home, 'sebiwi', { uid: 'sebiwi' });

  var bins = opts.bins || [];
  for (var i = 0; i < bins.length; i++) {
    file(bin, bins[i], { mode: 0o755, exec: bins[i], content: elf(bins[i]), size: 138208 + bins[i].length * 4096 });
  }
  var links = opts.links || {};
  for (var name in links) {
    attach(bin, name, node(fs, 'symlink', { uid: 'root', mode: 0o777, mtime: EPOCH, target: links[name] }));
  }

  for (var key in ETC) file(etc, key, { content: ETC[key] });
  file(etc, 'sudoers', { content: SUDOERS, mode: 0o440 });

  var devProps = { mode: 0o666, dev: true, size: 0 };
  file(dev, 'null', Object.assign({ read: function () { return []; }, write: function () {} }, devProps));
  file(dev, 'zero', Object.assign({ read: function () { return ['', '', '', '', '', '', '', '']; }, write: function () {} }, devProps));
  file(dev, 'random', Object.assign({ read: function () { return (opts.random || noise)(8); }, write: function () {} }, devProps));
  file(dev, 'tty', Object.assign({ read: function () { return []; }, write: opts.ttyWrite || function () {} }, devProps));

  file(mine, 'site.json', { content: JSON.stringify({
    name: 'sebiwi', pages: ['home', 'blog', 'comics', 'about'], shell: 'sebiwish', network: null
  }) });

  file(rootHome, '.bash_history', { content: 'sudo rm -rf /\n# that was close\nexit' });
  file(rootHome, 'notes.txt', { content: 'the root password is anything.\nit was always anything.' });

  return { bin: bin, usrBin: usrBin, usrLib: usrLib, etc: etc, home: home, me: me, proc: proc, tmp: tmp, rootHome: rootHome, dev: dev };
}
