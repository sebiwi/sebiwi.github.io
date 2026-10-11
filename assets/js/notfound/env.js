// Variables: the environment, shell variables, $NAME expansion, and the
// subshell stack that copies what was exported.

import { reapShell, spawnShell } from './procs.js';
import { sh } from './state.js';

export function envIndex(name) {
  for (var i = 0; i < sh.env.length; i++) {
    if (sh.env[i][0] === name) return i;
  }
  return -1;
}

export function envValue(name) {
  var i = envIndex(name);
  return i === -1 ? null : sh.env[i][1];
}

// export goes through here, so whatever it sets is exported.
export function envSet(name, value) {
  var i = envIndex(name);
  if (i === -1) sh.env.push([name, value]);
  else sh.env[i] = [name, value];
}

// NAME=value on its own: a shell variable. echo sees it, env doesn't, and
// child shells never hear of it until it is exported.
export function shellSet(name, value) {
  var i = envIndex(name);
  if (i === -1) sh.env.push([name, value, true]);
  else sh.env[i][1] = value;
}

export function isExported(entry) {
  return !entry[2];
}

// A NAME=value word, split. The value expands like any word, minus the globs.
export function assignmentOf(token) {
  var m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(token.text);
  if (!m) return null;
  return { name: m[1], value: token.quote === "'" ? m[2] : expandVars(m[2]) };
}

// $NAME, ${NAME}, $? and $$, like a shell: anything unset expands to nothing.
export function expandVars(text) {
  return text.replace(/\$\{(\w+)\}|\$(\w+)|\$([?$])/g, function (match, braced, bare, special) {
    if (special === '?') return String(sh.lastStatus);
    if (special === '$') return String(sh.pid);
    var name = braced || bare;
    if (name === 'RANDOM') return String(Math.floor(Math.random() * 32768));
    if (name === 'EUID' || name === 'UID') return sh.uid === 'root' ? '0' : '1000';
    var value = envValue(name);
    return value === null ? '' : value;
  });
}

export function copyEnv() {
  var copy = [];
  for (var i = 0; i < sh.env.length; i++) {
    if (isExported(sh.env[i])) copy.push(sh.env[i].slice());
  }
  return copy;
}

// A subshell starts with a copy of what was exported, in the same directory,
// as the same user. Leaving it puts all three back: a cd or a su inside a
// subshell never leaks out.
export function enterShell() {
  sh.shells.push({ env: sh.env, cwd: sh.cwd, uid: sh.uid, pid: sh.pid });
  sh.env = copyEnv();
  envSet('SHLVL', String((parseInt(envValue('SHLVL'), 10) || 0) + 1));
  sh.pid = spawnShell(sh.pid);
}

export function leaveShell() {
  reapShell(sh.pid);
  var parent = sh.shells.pop();
  sh.env = parent.env;
  sh.cwd = parent.cwd;
  sh.uid = parent.uid;
  sh.pid = parent.pid;
}
