// Dark-mode toggle. Default is light; the choice is remembered in localStorage.
// The no-flash <head> script applies the stored theme before paint; this
// handles clicks, keeps the button's pressed state in sync, and re-applies
// the stored theme on bfcache restores (which skip the head script).
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
    if (goingDark) {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', goingDark ? '#16161e' : '#ffffff');
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
    let dark = false;
    try {
      dark = localStorage.getItem('theme') === 'dark';
    } catch (err) { /* ignore storage errors */ }
    if (dark) {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#16161e' : '#ffffff');
    sync();
  });

  sync();
})();
