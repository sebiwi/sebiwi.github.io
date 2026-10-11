// sudo and su. The password prompt is a job in front that takes the keys and
// shows nothing of them, not even a cursor moving. What was typed lives in
// one local variable, is checked, and is dropped: never echoed, never in the
// history, never in the input element.

import { LECTURE, USERS, accepts, cached, createAuth, grant, revoke } from '../auth.js';
import { dom } from '../dom.js';
import { enterShell, envSet } from '../env.js';
import { invoke, invokeWith } from '../exec.js';
import { setCwd } from '../fsview.js';
import { endJob, jobs, startJob, toForeground } from '../jobs.js';
import { INPUT_PLACEHOLDER } from '../lineeditor.js';
import { find } from '../proc.js';
import { table } from '../procs.js';
import { commands } from '../registry.js';
import { printText } from '../screen.js';
import { sh } from '../state.js';

var auth = createAuth();

function now() {
  return Date.now();
}

// The prompt answers with a promise: true for a password, false once the
// tries are used up (after saying so). The promise carries the prompt's job,
// so the line waits on it (exec.js waitFor) and ctrl+c interrupts it. Once
// answered, the job stops taking keys: ctrl+c then reaches what runs next.
export function askPassword(label, tries, failure) {
  var typed = '';
  var failures = 0;
  var settle;
  var answer = new Promise(function (resolve) {
    settle = resolve;
  });
  printText(label);
  var job = startJob({
    onKey: function (e, key, chord) {
      if (chord && key === 'c') {
        typed = '';
        printText('^C');
        endJob(job, 'interrupted', 1);
        return true;
      }
      if (e.key === 'Enter') {
        var ok = accepts(typed);
        typed = '';
        if (ok) {
          answered(true);
          return true;
        }
        failures++;
        if (failures >= tries) {
          printText(failure);
          answered(false);
          return true;
        }
        printText('Sorry, try again.');
        printText(label);
        return true;
      }
      if (e.key === 'Backspace') {
        typed = typed.slice(0, -1);
        return true;
      }
      if (e.key.length === 1 && !chord && !e.metaKey && !e.altKey) typed += e.key;
      return true; // everything else is swallowed: no cursor to move, nothing to edit
    },
    onPaste: function (text) {
      typed += text.split(/\r?\n/)[0];
    },
    onInput: function (text, deleting) {
      typed = deleting ? typed.slice(0, -1) : typed + text;
    },
    onEnd: function () {
      dom.input.value = '';
    }
  });
  dom.input.value = INPUT_PLACEHOLDER; // see lineeditor.js: a mobile Backspace needs something to delete
  function answered(ok) {
    job.opts.onKey = job.opts.onPaste = job.opts.onInput = null;
    dom.input.value = '';
    settle(ok);
  }
  answer.job = job;
  return answer;
}

// A shell as someone else: the subshell machinery, with that user's
// identity, and with -i / - / -l their home as the directory. sudo passes
// who asked, for SUDO_USER, as the real sudo does; su does not.
export function userShell(user, login, asker) {
  enterShell();
  if (asker) envSet('SUDO_USER', asker);
  sh.uid = user;
  envSet('USER', user);
  envSet('LOGNAME', user);
  envSet('HOME', USERS[user].home);
  var proc = find(table, sh.pid);
  if (proc) proc.user = user;
  if (login) setCwd(USERS[user].home);
}

// Runs argv as root, the way sudo does: USER, LOGNAME and HOME are root's,
// and SUDO_USER says who asked. When the command starts a shell (sudo
// bash), that shell stays root's and the one that asked stays ours.
export function asRoot(argv, io) {
  var asker = sh.uid;
  var depth = sh.shells.length;
  sh.uid = 'root';
  try {
    return invokeWith([
      { name: 'USER', value: 'root' },
      { name: 'LOGNAME', value: 'root' },
      { name: 'HOME', value: '/root' },
      { name: 'SUDO_USER', value: asker }
    ], argv, io);
  } finally {
    if (sh.shells.length > depth) sh.shells[depth].uid = asker;
    else sh.uid = asker;
  }
}

function usage(out) {
  out.text('usage: sudo -h | -K | -k | -V');
  out.text('usage: sudo [-u user] [-i | -s] [command [arg ...]]');
}

var SHELLS = /^(sebiwish|bash|sh|zsh)$/;

Object.assign(commands, {
  sudo: function (args, io) {
    var opts = { user: 'root' };
    var i = 0;
    for (; i < args.length && args[i].charAt(0) === '-'; i++) {
      var a = args[i];
      if (a === '-k' || a === '-K') {
        revoke(auth);
        if (i === args.length - 1) return 0;
      } else if (a === '-v') {
        opts.validate = true;
      } else if (a === '-l') {
        opts.list = true;
      } else if (a === '-i') {
        opts.shell = opts.login = true;
      } else if (a === '-s') {
        opts.shell = true;
      } else if (a === '-u') {
        opts.user = args[++i];
      } else if (a === '-h' || a === '--help') {
        usage(io.out);
        return 0;
      } else if (a === '--') {
        i++;
        break;
      } else {
        io.out.text("sudo: invalid option -- '" + a.slice(1) + "'");
        usage(io.out);
        return 1;
      }
    }
    var argv = args.slice(i);
    if (!USERS[opts.user]) {
      io.out.text('sudo: unknown user ' + opts.user);
      return 1;
    }
    // sudo su, sudo su -, sudo bash: a shell as the target user.
    if (argv[0] === 'su' || (argv.length === 1 && SHELLS.test(argv[0]))) {
      opts.shell = true;
      opts.login = opts.login || argv[1] === '-' || argv[1] === '-l' || argv[1] === '--login';
      argv = [];
    }
    if (!argv.length && !opts.shell && !opts.list && !opts.validate) {
      usage(io.out);
      return 1;
    }
    var line = ('sudo ' + args.join(' ')).trim();
    function run() {
      if (opts.list) {
        io.out.text('Matching Defaults entries for ' + sh.uid + ' on scoreplay:');
        io.out.text('    env_reset, timestamp_timeout=5');
        io.out.text('');
        io.out.text('User ' + sh.uid + ' may run the following commands on scoreplay:');
        io.out.text('    (ALL : ALL) ALL');
        return 0;
      }
      if (opts.validate) return 0;
      if (opts.shell) {
        userShell(opts.user, opts.login, sh.uid);
        return 0;
      }
      return opts.user === 'root' ? asRoot(argv, io) : invoke(argv, io);
    }
    if (sh.uid === 'root' || cached(auth, now())) {
      grant(auth, now());
      return run();
    }
    if (!io.canWait || io.background) {
      io.out.text('sudo: a terminal is required to read the password; either use the -S option to read from standard input or configure an askpass helper');
      return 1;
    }
    if (!auth.lectured) {
      for (var l = 0; l < LECTURE.length; l++) io.out.text(LECTURE[l]);
      auth.lectured = true;
    }
    var asked = askPassword('[sudo] password for ' + sh.uid + ': ', 3, 'sudo: 3 incorrect password attempts');
    var running = null;
    var done = asked.then(function (ok) {
      if (!ok) return 1;
      grant(auth, now());
      var outer = jobs.launch;
      jobs.launch = { cmd: argv.join(' ') || line, background: false };
      var status = run();
      jobs.launch = outer;
      if (status && typeof status.then === 'function') {
        running = status; // curl, wget: the line waits for their answer
        return status;
      }
      // A command that starts a job of its own (ink's progress bars) takes
      // the front; when it ends, sudo's own job is back in front to end the
      // line's wait, or to carry its ctrl+c.
      if (jobs.fg && jobs.fg !== asked.job) {
        var inner = jobs.fg;
        return new Promise(function (resolve) {
          inner.then = function (code, how) {
            toForeground(asked.job);
            if (how === 'interrupted') endJob(asked.job, 'interrupted', code);
            else resolve(code);
          };
        });
      }
      return status;
    });
    done.job = asked.job;
    done.abort = function () {
      if (running && running.abort) running.abort();
    };
    return done;
  },

  su: function (args, io) {
    var login = false;
    var user = 'root';
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-' || args[i] === '-l' || args[i] === '--login') login = true;
      else if (args[i].charAt(0) !== '-') user = args[i];
    }
    if (!USERS[user]) {
      io.out.text('su: user ' + user + ' does not exist');
      return 1;
    }
    if (sh.uid === 'root') {
      userShell(user, login);
      return 0;
    }
    if (!io.canWait || io.background) {
      io.out.text('su: must be run from a terminal');
      return 1;
    }
    var asked = askPassword('Password: ', 1, 'su: Authentication failure');
    var done = asked.then(function (ok) {
      if (!ok) return 1;
      userShell(user, login);
      return 0;
    });
    done.job = asked.job;
    return done;
  }
});
