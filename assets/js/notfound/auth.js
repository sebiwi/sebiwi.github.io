// Who is who, and what sudo remembers. No DOM: the prompt lives in
// commands/sudo.js. The password policy is the whole joke: anything that is
// not empty is right. The cache is the real part: five minutes, like
// sudo's timestamp_timeout, and sudo -k forgets.

export var CACHE_MS = 5 * 60 * 1000;

export var USERS = {
  root: { uid: 0, gid: 0, home: '/root', groups: [['root', 0]] },
  sebiwi: { uid: 1000, gid: 1000, home: '/home/sebiwi', groups: [['sebiwi', 1000], ['sudo', 27]] }
};

export var LECTURE = [
  '',
  'We trust you have received the usual lecture from the local System',
  'Administrator. It usually boils down to these three things:',
  '',
  '    #1) Respect the privacy of others.',
  '    #2) Think before you type.',
  '    #3) With great power comes great responsibility.',
  ''
];

export function createAuth() {
  return { until: 0, lectured: false };
}

export function cached(auth, now) {
  return now < auth.until;
}

export function accepts(password) {
  return typeof password === 'string' && password.length > 0;
}

export function grant(auth, now) {
  auth.until = now + CACHE_MS;
}

export function revoke(auth) {
  auth.until = 0;
}

export function idLine(user) {
  var u = USERS[user];
  var groups = u.groups.map(function (g) { return g[1] + '(' + g[0] + ')'; });
  return 'uid=' + u.uid + '(' + user + ') gid=' + u.gid + '(' + user + ') groups=' + groups.join(',');
}
