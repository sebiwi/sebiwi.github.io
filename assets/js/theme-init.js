// Applies the remembered dark theme before first paint (prevents a flash).
// Must be loaded synchronously in <head> (no defer/async) so it runs before
// the body renders. Default is light; only an explicit stored 'dark' opts in.
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    }
  } catch (e) { /* ignore storage errors */ }
})();
