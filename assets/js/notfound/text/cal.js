// cal: one month, Sunday first, the header centered over the 20 columns of
// the grid. Dates are computed in UTC, so every machine agrees.

export var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function calendar(month, year) {
  var title = MONTH_NAMES[month - 1] + ' ' + year;
  var lines = [new Array(Math.floor((20 - title.length) / 2) + 1).join(' ') + title, 'Su Mo Tu We Th Fr Sa'];
  var first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  var days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  var cells = [];
  for (var i = 0; i < first; i++) cells.push('  ');
  for (var d = 1; d <= days; d++) cells.push(d < 10 ? ' ' + d : String(d));
  for (var w = 0; w < cells.length; w += 7) lines.push(cells.slice(w, w + 7).join(' ').replace(/\s+$/, ''));
  return lines;
}
