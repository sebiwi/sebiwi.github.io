// Applies the remembered dark theme before first paint (prevents a flash).
// Must be loaded synchronously in <head> (no defer/async) so it runs before
// the body renders. Default is light; only an explicit stored 'dark' opts in.
// Also retints the theme-color meta (mobile browser chrome) to match; the
// meta is parsed just before this script, so it is already queryable.
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.dataset.theme = 'dark';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#16161e');
    }
  } catch (e) { /* ignore storage errors */ }
})();
