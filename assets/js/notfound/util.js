// Small text helpers: padding and the clock.

export function pad(text, width) {
  while (text.length < width) text = ' ' + text;
  return text;
}

export function padRight(text, width) {
  while (text.length < width) text += ' ';
  return text;
}

export var TIMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function two(n) {
  return n < 10 ? '0' + n : String(n);
}

export function clockTime() {
  var now = new Date();
  return two(now.getHours()) + ':' + two(now.getMinutes()) + ':' + two(now.getSeconds());
}
