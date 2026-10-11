// Running a line: words, aliases, assignments, pipelines, redirections.

import { assignmentOf, enterShell, envIndex, envSet, envValue, expandVars, leaveShell, shellSet } from './env.js';
import { inputLines, writeFile } from './fileio.js';
import { ctx, fs } from './fsview.js';
import { providerOf } from './inkdb.js';
import { endJob, finishReserved, jobs, reserve, startJob } from './jobs.js';
import { globToRegExp, parse, tokenize } from './parse.js';
import { BUILTINS, commands, packageManagers } from './registry.js';
import { captureSink, printText, screenSink, styled } from './screen.js';
import { HOME } from './skeleton.js';
import { ALIASES, sh } from './state.js';
import { ERR, can, entries, isDirLike, lookup, readLines } from './vfs.js';

// --------------------------------------------------------------- execution

// A word becomes several when it globs, and stays itself when nothing
// matches, same as a shell. Dotfiles only match a pattern that asks for them.
// Only the last path component globs (dir/*.txt, not */x).
export function expandWord(token) {
  if (token.quote === "'") return [token.text];
  var text = expandVars(token.text);
  if (!token.quoted && (text === '~' || text.indexOf('~/') === 0)) {
    text = (envValue('HOME') || HOME) + text.slice(1);
  }
  if (token.quoted || !/[*?]/.test(text)) return [text];
  var cut = text.lastIndexOf('/');
  var dirPart = cut === -1 ? '' : text.slice(0, cut + 1);
  var base = text.slice(cut + 1);
  if (!base || /[*?]/.test(dirPart)) return [text];
  var c = ctx();
  var dir = lookup(fs, dirPart || '.', c);
  if (dir.error || !isDirLike(dir.node) || !can(dir.node, c.user, 4)) return [text];
  var re = globToRegExp(base);
  var hits = [];
  var kids = entries(dir.node);
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].name.charAt(0) === '.' && base.charAt(0) !== '.') continue;
    if (re.test(kids[i].name)) hits.push(dirPart + kids[i].name);
  }
  return hits.length ? hits : [text];
}

export function executable(n, path) {
  if (isDirLike(n)) return { error: 'EISDIR' };
  if (!can(n, sh.uid, 1)) return { error: 'EACCES' };
  if (n.exec && commands[n.exec]) return { exec: n.exec, path: path };
  var lines = readLines(n);
  if (lines) return { script: lines, path: path };
  return { error: 'EACCES' };
}

// What a command name means: the file at that path when it has a slash in
// it, otherwise the first executable of that name along $PATH.
export function findCommand(name) {
  var c = ctx();
  if (name.indexOf('/') !== -1) {
    var at = lookup(fs, name, c);
    return at.error ? { error: at.error } : executable(at.node, at.path);
  }
  var dirs = (envValue('PATH') || '').split(':');
  for (var i = 0; i < dirs.length; i++) {
    if (!dirs[i]) continue;
    var hit = lookup(fs, dirs[i].replace(/\/+$/, '') + '/' + name, c);
    if (!hit.error && !isDirLike(hit.node) && can(hit.node, c.user, 1)) return executable(hit.node, hit.path);
  }
  return { missing: true };
}

// A text file with an x bit runs as a script: line by line, in a subshell,
// until it ends or exits.
export function runScript(lines) {
  var level = sh.shells.length;
  enterShell();
  for (var i = 0; i < lines.length && sh.shells.length > level; i++) {
    var line = lines[i].trim();
    if (line && line.charAt(0) !== '#') execute(line);
  }
  while (sh.shells.length > level) leaveShell();
  return sh.lastStatus;
}

// A command answers with a status, or with a promise of one when it waits
// on something (curl on the network): runStages parks the pipeline for that.
export function call(fn, argv, io) {
  var result = commands[fn](argv.slice(1), io);
  if (isPending(result)) return result;
  return typeof result === 'number' ? result : 0;
}

function isPending(result) {
  return !!result && typeof result.then === 'function';
}

export function invoke(argv, io) {
  var name = argv[0];
  if (!name) return 0;
  if (ALIASES[name]) {
    argv = ALIASES[name].split(' ').concat(argv.slice(1));
    name = argv[0];
  }
  if (BUILTINS.indexOf(name) !== -1) return call(name, argv, io);
  var found = findCommand(name);
  if (found.exec) return call(found.exec, argv, io);
  if (found.script) return runScript(found.script);
  if (found.error) {
    io.out.text('sebiwish: ' + name + ': ' + ERR[found.error]);
    return found.error === 'ENOENT' ? 127 : 126;
  }
  var pkg = providerOf(name);
  if (pkg) {
    io.out.text("Command '" + name + "' not found, but can be installed with:");
    io.out.text('sudo ink draw ' + pkg);
    return 127;
  }
  io.out.text(name + ': command not found');
  if (Object.prototype.hasOwnProperty.call(packageManagers, name)) {
    io.out.line([styled('term-err', "This isn't " + packageManagers[name] + ', genius.')]);
    io.out.text('Here we ink: sudo ink draw <tool>');
  }
  return 127;
}

// X=1 cmd: the command (and any shell it starts) sees X exported, and the
// shell that ran it gets its old X back afterwards. The env array is held on
// to, so the put-back lands in this shell even when cmd started another.
export function invokeWith(assigns, argv, io) {
  var env = sh.env;
  var saved = [];
  for (var a = 0; a < assigns.length; a++) {
    var at = envIndex(assigns[a].name);
    saved.push(at === -1 ? null : sh.env[at].slice());
    envSet(assigns[a].name, assigns[a].value);
  }
  var status = invoke(argv, io);
  for (var b = assigns.length - 1; b >= 0; b--) {
    var idx = -1;
    for (var e = 0; e < env.length; e++) {
      if (env[e][0] === assigns[b].name) idx = e;
    }
    if (saved[b]) {
      if (idx === -1) env.push(saved[b]);
      else env[idx] = saved[b];
    } else if (idx !== -1) {
      env.splice(idx, 1);
    }
  }
  return status;
}

// What a stage's < << <<< hands it as standard input, or null when the file
// can't be read (the command is then skipped, as a shell does). Heredoc
// bodies expand $VARS unless the delimiter was quoted.
export function stageInput(input, docs) {
  if (input.file) {
    var got = inputLines([expandWord(input.file)[0]], { out: screenSink }, 'sebiwish');
    return got.status ? null : got.lines;
  }
  if (input.string) {
    return [input.string.quote === "'" ? input.string.text : expandVars(input.string.text)];
  }
  var doc = docs[input.heredoc];
  var lines = [];
  for (var i = 0; i < doc.lines.length; i++) lines.push(doc.literal ? doc.lines[i] : expandVars(doc.lines[i]));
  return lines;
}

export function runPipeline(stages, canAsync, docs, background) {
  return runStages(stages, 0, null, 0, canAsync, docs, background);
}

// The stages from `from` on, reading `stdin`. A stage that answers later
// parks the rest of the pipeline in a job (see waitFor) and the pipeline's
// status, for now, is 0: the line waits on that job, as for any job.
function runStages(stages, from, stdin, status, canAsync, docs, background) {
  for (var i = from; i < stages.length; i++) {
    var last = i === stages.length - 1;
    var words = stages[i].words;
    var assigns = [];
    var assign;
    while (assigns.length < words.length && (assign = assignmentOf(words[assigns.length]))) assigns.push(assign);
    var argv = [];
    for (var w = assigns.length; w < words.length; w++) argv = argv.concat(expandWord(words[w]));
    var redirect = stages[i].redirect && {
      name: expandWord(stages[i].redirect.word)[0],
      append: stages[i].redirect.append
    };
    var sink = last && !redirect ? screenSink : captureSink();
    if (stages[i].input) {
      var fed = stageInput(stages[i].input, docs);
      if (fed === null) {
        status = 1;
        stdin = [];
        continue;
      }
      stdin = fed;
    }
    var io = { out: sink, stdin: stdin, tty: sink === screenSink, async: canAsync && last && !redirect, canWait: !!canAsync, background: !!background };
    if (!argv.length && assigns.length) {
      // A pipeline runs each stage in a subshell, so there it sets nothing.
      if (stages.length === 1) {
        for (var a = 0; a < assigns.length; a++) shellSet(assigns[a].name, assigns[a].value);
      }
      status = 0;
    } else {
      var result = assigns.length ? invokeWith(assigns, argv, io) : invoke(argv, io);
      if (isPending(result)) {
        waitFor(result, stages, i, sink, redirect, last, canAsync, docs, background);
        return 0;
      }
      status = result;
    }
    if (redirect) status = writeFile(redirect, sink.lines) || status;
    else if (!last) stdin = sink.lines;
  }
  return status;
}

// A stage waiting on an answer: the rest of its pipeline waits in a job, so
// the prompt waits, ctrl+c abandons it (and aborts what was asked), and &
// puts it in the background. When the answer comes, what the stage printed
// goes on to the next stages, and the job ends with the pipeline's status.
function waitFor(pending, stages, i, sink, redirect, last, canAsync, docs, background) {
  var job = startJob({
    onEnd: function (abnormal) {
      if (abnormal && pending.abort) pending.abort();
    }
  });
  pending.then(function (code) {
    if (job.state === 'Done') return; // interrupted or killed while it waited
    var status = typeof code === 'number' ? code : 0;
    var stdin = null;
    if (redirect) status = writeFile(redirect, sink.lines) || status;
    else if (!last) stdin = sink.lines;
    var outer = jobs.launch;
    jobs.launch = { cmd: job.cmd, background: job.background, reserved: null, started: false };
    status = runStages(stages, i + 1, stdin, status, canAsync, docs, background);
    jobs.launch = outer;
    // A later stage that waits, or that runs on a timer, takes over the
    // front; the line now waits on it instead.
    if (!job.background && jobs.fg && jobs.fg !== job) {
      jobs.fg.then = job.then;
      job.then = null;
      endJob(job, 'done', status, true);
      return;
    }
    endJob(job, 'done', status);
  });
}

// A line runs segment by segment. A segment that leaves a job in front makes
// the rest of the line wait: the job's end picks the line up again, with the
// job's status as $?. Interrupting that job (ctrl+c) drops the rest, the way
// an interrupted shell list does; stopping it (ctrl+z) lets the rest go on.
// Only lines typed at the prompt wait (opts.async); a line run from inside a
// command (sebiwish -c, a script) never starts a timer in the first place.
export function execute(line, bodies, opts) {
  opts = opts || {};
  var parsed = parse(tokenize(line));
  if (parsed.error) {
    printText(parsed.error);
    sh.lastStatus = 2;
    if (opts.done) opts.done();
    return;
  }
  var docs = [];
  for (var h = 0; h < parsed.heredocs.length; h++) {
    var body = bodies && bodies[h];
    if (!body) {
      printText(eofWarning(parsed.heredocs[h].delim));
      body = [];
    }
    docs.push({ lines: body, literal: parsed.heredocs[h].literal });
  }
  step({ segments: parsed.segments, at: 0, docs: docs, async: !!opts.async, done: opts.done });
}

export function step(task) {
  while (task.at < task.segments.length) {
    var seg = task.segments[task.at++];
    if (seg.join === '&&' && sh.lastStatus !== 0) continue;
    if (seg.join === '||' && sh.lastStatus === 0) continue;
    sh.swapped = false;
    var status = seg.background ? launchBackground(seg, task) : launchFront(seg, task);
    if (!sh.swapped) sh.lastStatus = status;
    if (sh.exited) break;
    if (task.async && jobs.fg && !jobs.fg.then) {
      jobs.fg.then = function (code, how) {
        sh.lastStatus = code;
        if (how === 'interrupted') finish(task);
        else step(task);
      };
      return;
    }
  }
  finish(task);
}

export function finish(task) {
  sh.exited = false;
  if (task.done) task.done();
}

export function launchFront(seg, task) {
  var launch = jobs.launch = { cmd: seg.text, background: false, reserved: null, started: false };
  var status = runPipeline(seg.stages, task.async, task.docs, false);
  if (jobs.launch === launch) jobs.launch = null;
  return status;
}

// cmd &: a job number and a pid before anything else, and $? is 0.
export function launchBackground(seg, task) {
  var job = reserve(seg.text, true);
  printText('[' + job.id + '] ' + job.pid);
  var launch = jobs.launch = { cmd: seg.text, background: true, reserved: job, started: false };
  var status = runPipeline(seg.stages, true, task.docs, true);
  if (jobs.launch === launch) jobs.launch = null;
  if (!launch.started) finishReserved(job, status);
  return 0;
}

export function eofWarning(delim) {
  return 'sebiwish: warning: here-document at line 1 delimited by end-of-file (wanted `' + delim + "')";
}
