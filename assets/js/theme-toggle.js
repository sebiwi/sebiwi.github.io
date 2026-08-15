// Dark-mode toggle. Default is light; the choice is remembered in localStorage.
// The no-flash <head> script (theme-init.js) applies the stored theme before
// paint and owns window.__theme; this wires the button, persists clicks, and
// re-applies the stored theme on bfcache restores (which skip the head script).
(function () {
  'use strict';

  const root = document.documentElement;
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;

  function sync() {
    toggle.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  }

  toggle.addEventListener('click', () => {
    const goingDark = root.dataset.theme !== 'dark';
    window.__theme.apply(goingDark);
    try {
      localStorage.setItem('theme', goingDark ? 'dark' : 'light');
    } catch (e) { /* ignore storage errors */ }
    sync();
  });

  // bfcache restores skip the <head> init script, so navigating Back to this
  // page could resurrect a theme that was changed on another page (or in
  // another tab) in the meantime. Re-apply the stored choice.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    window.__theme.apply(window.__theme.storedDark());
    sync();
  });

  sync();
})();
