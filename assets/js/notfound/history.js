// The command history: kept in sessionStorage, expanded with !.

export var HISTORY_KEY = 'sebiwi:404:history';
export var HISTORY_FILE = '.sebiwi_history';
export var MAX_HISTORY = 100;

// The history lines, where up/down is in them (lines.length means "the line
// being typed"), and that line, parked while older ones are browsed.
export var hist = { lines: [], index: 0, draft: '' };

// Read at boot, not at import: Node imports this file for its tests.
export function initHistory() {
  hist.lines = loadHistory();
  hist.index = hist.lines.length;
}

// rm .sebiwi_history: the commands go with it, sessionStorage and all.
export function forgetHistory() {
  hist.lines = [];
  hist.index = 0;
  hist.draft = '';
  try {
    window.sessionStorage.removeItem(HISTORY_KEY);
  } catch (err) {
    /* nothing to be done about it */
  }
}

export function loadHistory() {
  try {
    var raw = window.sessionStorage.getItem(HISTORY_KEY);
    var parsed = raw ? JSON.parse(raw) : [];
    return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed.slice(-MAX_HISTORY) : [];
  } catch (err) {
    return []; // private windows and blocked storage: the history is just short
  }
}

export function saveHistory() {
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(hist.lines.slice(-MAX_HISTORY)));
  } catch (err) {
    /* nothing to be done about it */
  }
}

// !! is the last command, !7 the seventh, !ls the most recent ls. A shell
// shows you what it decided to run, so this does too.
export function historyExpand(line, lines) {
  if (line.indexOf('!') === -1) return { line: line, echo: false };
  var failed = null;
  var out = line.replace(/!(!|-?\d+|[A-Za-z][\w-]*)/g, function (match, ref) {
    var hit = null;
    if (ref === '!') {
      hit = lines[lines.length - 1];
    } else if (/^-?\d+$/.test(ref)) {
      var n = parseInt(ref, 10);
      hit = n < 0 ? lines[lines.length + n] : lines[n - 1];
    } else {
      for (var i = lines.length - 1; i >= 0; i--) {
        if (lines[i].indexOf(ref) === 0) {
          hit = lines[i];
          break;
        }
      }
    }
    if (hit === undefined || hit === null) {
      failed = match;
      return match;
    }
    return hit;
  });
  if (failed) return { line: null, error: 'sebiwish: ' + failed + ': event not found' };
  return { line: out, echo: out !== line };
}
