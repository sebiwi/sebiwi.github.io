// What ink can draw, and in which order. No DOM: ink.js does the drawing.
// A package is a set of commands the base system ships without; its
// dependencies are libraries, drawn first, once each.

export var PACKAGES = {
  cowsay: { version: '3.04', deps: [], bins: ['cowsay'], blurb: 'a cow, saying things' },
  curl: { version: '8.11.0', deps: ['libcurl'], bins: ['curl'], blurb: 'transfer a URL, given a network' },
  emacs: { version: '30.1', deps: ['ncurses'], bins: ['emacs'], blurb: 'an operating system lacking a good editor' },
  fortune: { version: '9708', deps: ['fortune-data'], bins: ['fortune'], blurb: 'wisdom, at random' },
  git: { version: '2.47.0', deps: ['libcurl'], bins: ['git'], blurb: 'version control, for a site that is not a repository' },
  htop: { version: '3.3.0', deps: ['ncurses'], bins: ['htop'], blurb: 'top, with a cursor' },
  hugo: { version: '0.167.0', deps: [], bins: ['hugo'], blurb: 'the thing that built this page' },
  jq: { version: '1.7.1', deps: ['oniguruma'], bins: ['jq'], blurb: 'sed for JSON' },
  less: { version: '668', deps: ['ncurses'], bins: ['less'], blurb: 'more, but both ways' },
  lolcat: { version: '100.0.1', deps: ['rainbows'], bins: ['lolcat'], blurb: 'rainbows, from a pipe' },
  nano: { version: '8.2', deps: ['ncurses'], bins: ['nano'], blurb: 'a small editor' },
  neofetch: { version: '7.1.0', deps: [], bins: ['neofetch'], blurb: 'the machine, and a small person waving' },
  nodejs: { version: '22.11.0', deps: [], bins: ['node', 'npm', 'npx', 'yarn', 'pnpm'], blurb: 'JavaScript, and the package managers it brought' },
  sl: { version: '5.02', deps: ['coal'], bins: ['sl'], blurb: 'steam locomotive, for when ls is too long to type' },
  tmux: { version: '3.5a', deps: ['libevent', 'ncurses'], bins: ['tmux'], blurb: 'terminal multiplexer, for people with one terminal' },
  tree: { version: '2.2.1', deps: [], bins: ['tree'], blurb: 'directories, drawn as a tree' },
  vim: { version: '9.1', deps: ['ncurses'], bins: ['vim', 'vi'], blurb: 'an editor you cannot leave' },
  wget: { version: '1.25.0', deps: [], bins: ['wget'], blurb: 'download a URL, given a network' }
};

export var LIBS = {
  libevent: '2.1.12',
  ncurses: '6.5',
  coal: '1.0.4',
  rainbows: '7.7.7',
  libcurl: '8.11.0',
  'fortune-data': '1.99.1',
  oniguruma: '6.9.9'
};

export function versionOf(name) {
  return PACKAGES[name] ? PACKAGES[name].version : LIBS[name];
}

export function providerOf(command) {
  for (var name in PACKAGES) {
    if (PACKAGES[name].bins.indexOf(command) !== -1) return name;
  }
  return null;
}

export function planDraw(names, drawn) {
  var plan = { queue: [], wanted: [], unknown: [], already: [] };
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (!Object.prototype.hasOwnProperty.call(PACKAGES, name)) {
      if (plan.unknown.indexOf(name) === -1) plan.unknown.push(name);
    } else if (drawn[name]) {
      if (plan.already.indexOf(name) === -1) plan.already.push(name);
    } else if (plan.wanted.indexOf(name) === -1) {
      plan.wanted.push(name);
    }
  }
  for (var w = 0; w < plan.wanted.length; w++) {
    var deps = PACKAGES[plan.wanted[w]].deps;
    for (var d = 0; d < deps.length; d++) {
      if (!drawn[deps[d]] && plan.queue.indexOf(deps[d]) === -1) plan.queue.push(deps[d]);
    }
  }
  plan.queue = plan.queue.concat(plan.wanted);
  return plan;
}

export function libFile(lib) {
  return (lib.indexOf('lib') === 0 ? lib : 'lib' + lib) + '.so.' + LIBS[lib].split('.')[0];
}

export function searchPackages(term) {
  term = (term || '').toLowerCase();
  return Object.keys(PACKAGES).filter(function (name) {
    return name.indexOf(term) !== -1 || PACKAGES[name].blurb.indexOf(term) !== -1;
  });
}
