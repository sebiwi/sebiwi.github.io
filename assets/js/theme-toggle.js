// Dark-mode toggle. Default is light; the choice is remembered in localStorage.
// The no-flash <head> script applies the stored theme before paint; this just
// handles clicks and keeps the button's pressed state in sync.
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
    try {
      localStorage.setItem('theme', goingDark ? 'dark' : 'light');
    } catch (e) { /* ignore storage errors */ }
    sync();
  });

  sync();
})();
