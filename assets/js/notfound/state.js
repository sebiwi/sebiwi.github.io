// The live shell: what $?, $$, env and the subshell stack read and write.
// tmux swaps these fields when it changes panes, so nothing may hold on to
// sh.env across a command that can switch screens.
//
// shells: the shells under this one, innermost last. Each keeps its parent's
// environment, directory and user ({ env, cwd, uid }) to put back on exit,
// which is the whole of being a subshell.
// pid: $$, the current shell's process (the login shell is 42); tmux panes
// and subshells get their own.
// exited: set by exit in a subshell: the rest of its line goes with it.
// swapped: set when tmux changes screens: $? belongs to the old one.
export var sh = {
  env: [
    ['USER', 'sebiwi'], ['LOGNAME', 'sebiwi'], ['HOME', '/home/sebiwi'], ['PWD', '/home/sebiwi'],
    ['SHELL', '/bin/sebiwish'], ['SHLVL', '1'], ['TERM', 'xterm-256comic'], ['EDITOR', 'pencil'],
    ['PATH', '/usr/bin:/bin'], ['HOSTNAME', 'scoreplay'], ['LANG', 'en_US.UTF-8']
  ],
  shells: [],
  lastStatus: 0,
  pid: 42,
  exited: false,
  swapped: false,
  cwd: '/home/sebiwi', // the current directory, as cd last set it
  uid: 'sebiwi',       // who the shell runs as
  warnedStopped: false // exit said 'There are stopped jobs.' once already
};

// Aliases, and the ones .bashrc claims are there really are.
export var ALIASES = { ll: 'ls -l', la: 'ls -a', please: 'sudo', '..': 'cd ..' };
