// Deleting the page: fades, the farewell line, and the CRT power-off.

import { dom, reducedMotion } from './dom.js';

export var FADE_MS = 180;
export var WIPE_STEP_MS = 300;


// Fade an element out, then drop it from the DOM. The page's entrance
// animation pins opacity via fill-mode (which outranks transitions and
// inline styles), so the fade must be a WAAPI animation: those win.
export function vaporize(el, done) {
  function finish() {
    if (el.parentNode) el.parentNode.removeChild(el);
    if (done) done();
  }
  if (reducedMotion || !el.animate) {
    finish();
    return;
  }
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
  window.setTimeout(finish, FADE_MS);
}

export var farewellShown = false;

// The terminal's dying words, shown whenever the terminal itself goes: via
// rm terminal, exit, shutdown, or the end of rm -rf /.
export function farewell() {
  if (farewellShown) return;
  farewellShown = true;
  var line = document.createElement('p');
  line.className = 'term-shutdown';
  line.textContent = 'Connection to sebiwi closed.';
  // Inside <main>, not <body>: main's min-height would otherwise push
  // the line below the fold on short viewports.
  (document.querySelector('main') || document.body).appendChild(line);
}

// rm -rf / ends with the site powering off like an old CRT: white flash,
// collapse to a scanline, then a dot, then black. The styles are injected
// here, not in style.css, so no page pays for them until the moment the
// effect runs. Reduced motion cuts straight to black.
export var TV_CSS =
  '.tv-off{position:fixed;inset:0;z-index:2147483647;background:#000}' +
  '.tv-off::after{content:"";position:absolute;inset:0;background:#fff;' +
  'animation:tv-collapse .6s cubic-bezier(.23,1,.32,1) forwards}' +
  '@keyframes tv-collapse{' +
  '0%{transform:scale(1,1);opacity:1}' +
  '55%{transform:scale(1,.004)}' +
  '85%{transform:scale(.001,.004);opacity:1}' +
  '100%{transform:scale(.001,.004);opacity:0}}' +
  '@media (prefers-reduced-motion:reduce){.tv-off::after{animation:none;opacity:0}}';

export function tvOff(then) {
  var style = document.createElement('style');
  style.textContent = TV_CSS;
  document.head.appendChild(style);
  var screen = document.createElement('div');
  screen.className = 'tv-off';
  screen.setAttribute('aria-hidden', 'true');
  document.body.appendChild(screen);
  if (then) window.setTimeout(then, reducedMotion ? 0 : 700);
}

// Powering down on purpose: exit, shutdown, reboot. A beat to read the
// parting line, then the screen goes.
export function powerOff(then) {
  dom.input.disabled = true;
  dom.input.blur();
  farewell();
  window.setTimeout(function () { tvOff(then); }, reducedMotion ? 0 : 1200);
}

export var wiping = false;

// rm -rf /: everything goes, bottom up, terminal last, then the parting line
// on the bare page, then the TV switches off. A reload brings it all back.
export function wipeEverything(doomed) {
  if (wiping) return;
  wiping = true;
  dom.input.disabled = true;
  dom.input.blur();
  (function step(index) {
    if (index >= doomed.length) {
      farewell();
      // A beat to read the farewell line before the screen goes dark.
      window.setTimeout(tvOff, reducedMotion ? 0 : 1200);
      return;
    }
    vaporize(doomed[index], function () {
      window.setTimeout(function () {
        step(index + 1);
      }, reducedMotion ? 0 : WIPE_STEP_MS);
    });
  })(0);
}
