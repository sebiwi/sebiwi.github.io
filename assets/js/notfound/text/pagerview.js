// What a pager shows, without the screen: a window of rows over the lines,
// moved by keys, and searches that move it to the next line that matches.

export function createView(lines, rows) {
  return { lines: lines, top: 0, rows: Math.max(1, rows), query: null };
}

function maxTop(v) {
  return Math.max(0, v.lines.length - v.rows);
}

function clamp(v, top) {
  v.top = Math.max(0, Math.min(top, maxTop(v)));
}

function find(v, from, step) {
  for (var i = from; i >= 0 && i < v.lines.length; i += step) {
    if (v.lines[i].indexOf(v.query) !== -1) return i;
  }
  return -1;
}

export function search(v, query, from) {
  v.query = query;
  var at = find(v, from === undefined ? v.top : from, 1);
  if (at === -1) return false;
  clamp(v, at);
  return true;
}

export function pagerKey(v, key) {
  var out = { quit: false, searching: false };
  if (key === 'q' || key === 'Q') out.quit = true;
  else if (key === '/') out.searching = true;
  else if (key === ' ' || key === 'f' || key === 'PageDown') clamp(v, v.top + v.rows);
  else if (key === 'b' || key === 'PageUp') clamp(v, v.top - v.rows);
  else if (key === 'j' || key === 'ArrowDown' || key === 'Enter') clamp(v, v.top + 1);
  else if (key === 'k' || key === 'ArrowUp') clamp(v, v.top - 1);
  else if (key === 'g' || key === 'Home') clamp(v, 0);
  else if (key === 'G' || key === 'End') clamp(v, maxTop(v));
  else if ((key === 'n' || key === 'N') && v.query) {
    var at = find(v, v.top + (key === 'n' ? 1 : -1), key === 'n' ? 1 : -1);
    if (at !== -1) clamp(v, at);
  }
  return out;
}

export function frame(v) {
  var shown = v.lines.slice(v.top, v.top + v.rows);
  while (shown.length < v.rows) shown.push('~');
  return { lines: shown, status: v.top >= maxTop(v) ? '(END)' : ':' };
}
