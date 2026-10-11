// The command table and its docs: help, man and which read from here.

export var commands = {};

// Builtins run inside the shell, whatever $PATH says. The ones in
// BUILTIN_ONLY have no file in /bin; the rest also exist as /bin files, as
// echo, pwd, kill, true and false do on a real system.
export var BUILTINS = ['cd', 'echo', 'pwd', 'export', 'unset', 'alias', 'set', 'exit', 'logout', 'history', 'help', 'true', 'false', 'kill', 'jobs', 'fg', 'bg', 'type', 'source', '.', 'unalias'];
export var BUILTIN_ONLY = ['cd', 'export', 'unset', 'alias', 'set', 'exit', 'logout', 'history', 'help', 'jobs', 'fg', 'bg', 'type', 'source', '.', 'unalias'];

// Typing another distro's package manager gets you corrected. Rudely.
export var packageManagers = {
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

// ---------------------------------------------------------------- the docs

// One table, three readers: help lists what isn't hidden, man prints any of
// it in full, and the toys stay a surprise.
export var DOCS = {
  ls: { args: '[-laAd1] [path...]', blurb: 'list files', man: 'Lists a directory, ~ when given nothing. -a shows the dotfiles and . and .., -A only the dotfiles, -l the long form with modes, owners and sizes, -d the directory itself, -1 one name per line. ~ is read off the page, so it is never a lie.' },
  cd: { args: '<dir>', blurb: 'go somewhere', man: 'Changes directory. The page directories in ~ are real pages, so cd blog navigates to the blog. Everywhere else it is a directory like any other. From ~, /home or /, cd .. walks back through the browser history; cd - goes to $OLDPWD; cd alone goes home.' },
  pwd: { args: '', blurb: 'where you are', man: 'Prints the current directory.' },
  cat: { args: '<file>', blurb: 'read a file', man: 'Prints a file, or its own standard input in a pipeline. hint.txt and the dotfiles are read straight off the page.' },
  echo: { args: '<text>', blurb: 'say it back', man: 'Prints its arguments. $VARS expand unless single-quoted. -n and -e are swallowed, because every line here is a line.' },
  touch: { args: '<file>', blurb: 'invent a file', man: 'Creates an empty file, or moves its clock forward. It shows up in ls, completes with tab, and rm can delete it, but it will not survive a reload. Touching .sebiwi_history after deleting it brings the history file back as itself.' },
  mkdir: { args: '[-p] <dir>', blurb: 'invent a directory', man: 'Creates a directory. -p makes the parents too and does not mind if it exists. cd can go into it.' },
  rm: { args: '[-rfv] <file>', blurb: 'remove a file. Or everything.', man: 'Deletes for real. Page parts leave the page, page directories take their navbar link with them, and rm -rf / ends the show. Directories need -r. -f ignores what is not there.' },
  grep: { args: '<pattern>', blurb: 'find lines', man: 'Filters lines by pattern, from files or from a pipe. -i ignores case, -v inverts, -c counts.' },
  clear: { args: '', blurb: 'clear the screen', man: 'Clears the scrollback. ctrl+l does the same without the typing.' },
  ink: { args: '<draw|erase> <pkg>', blurb: 'draw what is missing', man: 'The package manager. ink draw <pkg> inks a package into the shell (as root: sudo ink draw), ink erase rubs it out, ink list shows what is drawn and ink search what could be. Packages last until the tab closes.' },
  help: { args: '', blurb: 'you are here', man: 'Lists the commands worth knowing. The rest are for people who type things to see what happens.' },
  cp: { args: '[-r] <src> <dest>', blurb: 'copy', man: 'Copies files, and directories with -r. A copy of a page part is just its text: rm the copy and the page does not notice.' },
  mv: { args: '<src> <dest>', blurb: 'move or rename', man: 'Moves or renames. A page part moved is still the part: rm it under its new name and it leaves the page.' },
  find: { args: '<path> [tests]', blurb: 'find files', man: 'Walks a directory tree and prints what matches: -name and -iname take a glob, -type f, d or l, -maxdepth and -mindepth limit the walk.' },
  sed: { args: '<script> [file]', blurb: 'edit a stream', man: 'A stream editor: s/old/new/ with g, i, p and a number, p, d, q and =, on line numbers, $ or /regex/ and ranges of them. -n prints only what p says, -E takes extended regexes, -i edits files in place (not page parts: those are the page).' },
  awk: { args: '<program> [file]', blurb: 'fields and patterns', man: 'Pattern { action } over fields. $1, $NF, NR and NF, BEGIN and END, print and printf, arithmetic, comparisons, ~. awk -F : \'{print $1}\' /etc/passwd lists the users.' },
  // Hidden from help, documented for anyone who thinks to ask.
  jq: { args: '[-rc] <filter> [file]', blurb: '', hidden: true, pkg: 'jq', man: 'Reads JSON. . .key .a.b .[n] .[] keys length, joined with |. -r prints strings raw, -c compact. Try /usr/share/sebiwi/site.json.' },
  htop: { args: '', blurb: '', hidden: true, pkg: 'htop', man: 'Every process, live. Up and down pick one, F9 or k kills it, q quits. Kill navd and watch the navbar go.' },
  less: { args: '[file]', blurb: '', hidden: true, pkg: 'less', man: 'more, but both ways: space and b page, j and k scroll, g and G jump, /text searches and n and N repeat it, q quits. The screen comes back as it was.' },
  more: { args: '[file]', blurb: '', hidden: true, man: 'Pages through text, a screen at a time: space for the next one, enter for a line, q to stop.' },
  cal: { args: '[[month] year]', blurb: '', hidden: true, man: 'A calendar: this month, a month, or a whole year.' },
  alias: { args: '[name=value]', blurb: '', hidden: true, man: 'Lists the aliases, or makes one. unalias undoes it.' },
  source: { args: '<file>', blurb: '', hidden: true, man: 'Runs a file in this shell, so what it sets stays set. . is the short name. source ~/.bashrc does what you think.' },
  type: { args: '<name>', blurb: '', hidden: true, man: 'Says what a name is: an alias, a builtin, or a file on $PATH.' },
  diff: { args: '[-u] <a> <b>', blurb: '', hidden: true, man: 'Compares two files line by line. -u for the unified format.' },
  xargs: { args: '[-n N] [-I R] <command>', blurb: '', hidden: true, man: 'Turns its input into arguments for a command, N at a time with -n, or once per line with -I.' },
  tee: { args: '[-a] <file>', blurb: '', hidden: true, man: 'Copies its input to files and to its output. -a appends.' },
  cut: { args: '-d <c> -f <list> | -c <list>', blurb: '', hidden: true, man: 'Cuts out fields (-f, split on -d, tab by default) or characters (-c). Lists: 1,3 or 2-4 or 3-.' },
  tr: { args: '[-cds] <set1> [set2]', blurb: '', hidden: true, man: 'Translates characters: tr a-z A-Z shouts. -d deletes, -s squeezes repeats, -c complements. Ranges, \\n and \\t, and [:digit:]-style classes.' },
  file: { args: '<file>', blurb: '', hidden: true, man: 'Says what a file is: text, a directory, a binary, a symlink, a page, or a piece of this page.' },
  stat: { args: '[-L] [-c fmt] <file>', blurb: '', hidden: true, man: 'Everything the filesystem knows about a file. -c takes %a %A %U %G %s %n %F %i.' },
  ln: { args: '[-s] <target> <name>', blurb: '', hidden: true, man: 'Makes a link: hard by default (the same file under two names; it lasts until the last name goes), symbolic with -s (a name that points at a path).' },
  curl: { args: '[-iIsfL] [-X method] [-d data] [-H header] [-o file] <url>', blurb: '', hidden: true, pkg: 'curl', man: 'Fetches a URL for real: the host is looked up with DNS, then asked over HTTPS (a bare host means https). A web page may only read replies from sites that allow it (CORS), so for the others curl says the host answered but the reply stays unread. -i adds the headers, -I asks for them only, -X, -d and -H shape the request, -o and -O save to a file, -f fails on HTTP errors. curl https://api.github.com/zen | lolcat.' },
  wget: { args: '[-q] [-O file] <url>', blurb: '', hidden: true, pkg: 'wget', man: 'Downloads a URL into a file here, named after the URL unless -O says otherwise. -q keeps it quiet. Same network rules as curl.' },
  lolcat: { args: '[file]', blurb: '', hidden: true, pkg: 'lolcat', man: 'Prints its files or its standard input in every color the terminal has. fortune | lolcat is the canonical use. There is no other use.' },
  sl: { args: '', blurb: '', hidden: true, pkg: 'sl', man: 'Corrects the habit of typing sl for ls. A train crosses the terminal and ctrl+c does nothing about it. That is the lesson.' },
  tmux: { args: '[new|attach|ls|detach|kill-server]', blurb: '', hidden: true, pkg: 'tmux', man: 'Runs shells in windows inside a session that outlives them. ctrl+b is the prefix: c opens a window, n and p and 0-9 move between them, d detaches. % splits a pane left and right, " top and bottom, o and the arrows move between panes, x kills one, z zooms one, ctrl or alt with an arrow resizes one, a click picks one and a drag moves a border. tmux attach comes back, tmux ls lists the session, exit closes a pane, and the last exit ends it all.' },
  git: { args: '<command>', blurb: '', hidden: true, pkg: 'git', man: 'Version control, for a website that is not a repository.' },
  vim: { args: '[file]', blurb: '', hidden: true, pkg: 'vim', man: 'An editor. You will not get out.' },
  tree: { args: '[-a] [dir]', blurb: '', hidden: true, pkg: 'tree', man: 'Draws a directory and everything under it.' },
  fortune: { args: '', blurb: '', hidden: true, pkg: 'fortune', man: 'One piece of wisdom, picked at random.' },
  cowsay: { args: '[text]', blurb: '', hidden: true, pkg: 'cowsay', man: 'A cow says what you give it. moo when you give it nothing.' },
  whoami: { args: '', blurb: '', hidden: true, man: 'Prints who you are, in letters.' },
  id: { args: '[user]', blurb: '', hidden: true, man: 'Prints who you are, in numbers.' },
  su: { args: '[-] [user]', blurb: '', hidden: true, man: 'Becomes another user, root unless told. - makes it a login shell, in that user\'s home.' },
  bg: { args: '[%job]', blurb: '', hidden: true, man: 'Lets a stopped job carry on in the background.' },
  fg: { args: '[%job]', blurb: '', hidden: true, man: 'Brings a job to the front, the current one unless told which: %1, %-, %ping.' },
  jobs: { args: '[-l]', blurb: '', hidden: true, man: 'Lists the jobs: Running in the background, or Stopped by ctrl+z. -l adds the pids. Anything can run in the background with a & at the end.' },
  pkill: { args: '[-SIG] [-f] <pattern>', blurb: '', hidden: true, man: 'kill, by pattern. -f matches the whole command line.' },
  killall: { args: '[-SIG] <name>', blurb: '', hidden: true, man: 'kill, by name.' },
  kill: { args: '[-SIG] <pid|%job>', blurb: 'stop a process', man: 'Sends a signal, TERM unless told otherwise: -9 or -KILL, -STOP and -CONT, -HUP, -INT. kill -l lists them. A process can only be signalled by its owner, or root. The login shell ignores TERM, like any interactive shell.' },
  top: { args: '', blurb: '', hidden: true, man: 'Every process and what it costs, which here is almost nothing. Refreshes each second; q quits.' },
  ps: { args: '[aux]', blurb: '', hidden: true, man: 'Lists processes: this terminal\'s, or every one with aux (or -e). The page has its own: navd draws the navbar, controlsd the controls, pencil the hint. Kill one and see.' },
  chown: { args: '<user[:group]> <file>', blurb: '', hidden: true, man: 'Gives a file away. Only root can, and the only users here are root and sebiwi.' },
  chmod: { args: '[-R] <mode> <file>', blurb: '', hidden: true, man: 'Changes a file mode, in octal (644) or symbolic (u+x, go-w). Only the owner, or root.' },
  man: { args: '<command>', blurb: '', hidden: true, man: 'Prints one of these. You are reading it.' },
  history: { args: '', blurb: '', hidden: true, man: 'Lists the commands you have run, kept in sessionStorage so a reload does not forget them. !! runs the last one, !7 runs the seventh, !ls the most recent ls. The history is .sebiwi_history: delete that file and the shell forgets everything and stops taking notes, until touch makes it again.' },
  env: { args: '', blurb: '', hidden: true, man: 'Prints the environment. export changes it, unset removes from it, echo expands it. NAME=value sets a shell variable, which stays out of it until exported.' },
  set: { args: '', blurb: '', hidden: true, man: 'Prints every variable, the ones env shows and the shell variables it does not.' },
  ping: { args: '[-c count] <host>', blurb: '', hidden: true, man: 'Pings a host, for real as far as a web page can: the name is looked up with DNS over HTTPS (1.1.1.1), and each second one HTTPS request to the host is timed. A host that answers is up. Unknown names fail as ping fails. ctrl+c stops it; -c stops it for you. localhost and sebiwi never leave the machine.' },
  uname: { args: '[-a]', blurb: '', hidden: true, man: 'Prints system information. The system is sebiwiOS and the machine is a pencil.' },
  sudo: { args: '[-iksl] <command>', blurb: 'do it as root', man: 'Runs a command as root. It asks for your password once, shows nothing while you type it, and remembers it for five minutes; sudo -k makes it forget. sudo -i (or sudo su) opens a root shell with a # prompt: exit comes back. Any password works. It was always anything.' },
  sebiwish: { args: "[-c 'command']", blurb: '', hidden: true, man: "The shell, inside the shell. SHLVL goes up, the environment is a copy, and exit comes back here instead of turning the site off. -c runs one line in a subshell and returns its status. bash, sh and zsh are sebiwish with a different hat." },
  neofetch: { args: '', blurb: '', hidden: true, pkg: 'neofetch', man: 'Prints the machine and a small person waving. The same person waves on the about page.' }
};

DOCS.bash = DOCS.sh = DOCS.zsh = DOCS.sebiwish;

export var HELP_ORDER = ['ls', 'cd', 'pwd', 'cat', 'echo', 'touch', 'mkdir', 'cp', 'mv', 'find', 'rm', 'kill', 'sudo', 'grep', 'sed', 'awk', 'ink', 'clear', 'help'];

export var KEY_HELP = [
  ['up/down', 'walk the history'],
  ['ctrl+r', 'search the history'],
  ['ctrl+a/e/w/u/k', 'readline, the useful bits'],
  ['ctrl+c', 'give up on the line'],
  ['ctrl+z', 'stop what is running'],
  ['ctrl+l', 'clear the screen'],
  ['ctrl+d', 'leave'],
  ['tab', 'complete a word'],
  ['esc', 'leave the prompt']
];

DOCS['.'] = DOCS.source;
DOCS.unalias = DOCS.alias;
