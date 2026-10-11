// 404 page: fills in the path the visitor tried to reach, then hides an easter
// egg. The terminal prompt is real, and what sits behind it is a small but
// honest shell: sebiwish, on sebiwiOS.
//
// The language (parse.js, exec.js): quoted words, $VAR and ~ expansion, globs,
// ; && || chaining, & for the background, pipes (a stage may wait on the
// network), < > and >> redirection, << heredocs and <<< here-strings, #
// comments, NAME=value, $? and $$, ! history expansion, aliases, source.
// The filesystem (vfs.js, skeleton.js, fsview.js): a real tree. / has bin,
// dev, etc, home, proc, root, tmp and usr; ~ is /home/sebiwi, read off the
// page: its directories are the site's pages, and its files nav, controls,
// hint.txt and terminal are pieces of this page. Owners and modes are real,
// /root is locked, and rm genuinely deletes: page parts vanish, page
// directories take their navbar link with them, and rm -rf / wipes it all,
// then the site powers off like an old CRT.
// Processes (proc.js, procs.js, jobs.js): hugo is pid 1, the login shell 42,
// and each page part has a daemon drawing it: kill one and the part goes.
// Jobs run in front or behind with &, ctrl+z, fg and bg; ps, top, htop see
// them all.
// Users (auth.js, commands/sudo.js): sudo asks for a password it never shows
// and takes any; sudo -i and su give a root shell with a # prompt.
// Packages (inkdb.js, ink.js): sudo ink draw installs what the base system
// lacks (tmux, less, htop, jq, curl, cowsay, vim...) into /usr/bin; ink
// erase rubs it out.
// The network (net/): ping, curl and wget are real as far as a web page
// can be: DNS over HTTPS, then timed or real HTTPS requests.
// The line editor (lineeditor.js): readline chords, history in
// sessionStorage (the history is ~/.sebiwi_history: rm it and the shell
// forgets), ctrl+r, tab completion on commands and paths.
// Nothing outlives the tab but the history: reloading restores the page.

import { dom, initDom } from './dom.js';
import { initHistory } from './history.js';
import { initFs, updateTitle } from './fsview.js';
import { initProcs } from './procs.js';
import { initLineEditor, renderLine } from './lineeditor.js';
import { initTmuxMouse } from './tmux.js';
import './commands/core.js';
import './commands/text.js';
import './commands/system.js';
import './commands/toys.js';
import './commands/sudo.js';
import './commands/fileutils.js';
import './ink.js';
import './commands/packages/lolcat.js';
import './commands/packages/sl.js';
import './commands/packages/web.js';
import './pager.js';
import './commands/packages/htop.js';
import './commands/packages/jq.js';

function boot() {
  var attempted = document.querySelector('[data-404-path]');
  if (attempted && window.location && window.location.pathname) {
    attempted.textContent = window.location.pathname;
  }
  if (!initDom(document)) return;
  initHistory();
  initFs();
  initProcs();
  updateTitle();
  initTmuxMouse();
  initLineEditor();
  dom.livePrompt.classList.add('is-live'); // the cursor becomes an inverted cell
  renderLine();
}

boot();
