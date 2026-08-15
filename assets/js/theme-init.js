// Applies the remembered dark theme before first paint (prevents a flash).
// Must be loaded synchronously in <head> (no defer/async) so it runs before
// the body renders. Default is light; only an explicit stored 'dark' opts in.
// Also defines the shared theme module: this script provably runs before the
// deferred site bundle, so theme-toggle.js consumes window.__theme from here.
(function () {
  var root = document.documentElement;

  // Everything "apply a theme" means: the root attribute (absence = light)
  // and the theme-color meta (mobile browser chrome). The tint is read from
  // the CSS custom property so style.css is the palette's only owner; sync
  // <head> scripts wait for earlier stylesheets, so the value is readable
  // here, and the guard skips the retint if the stylesheet failed to load.
  function apply(dark) {
    if (dark) {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    var bg = getComputedStyle(root).getPropertyValue('--color-background').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  }

  function storedDark() {
    try {
      return localStorage.getItem('theme') === 'dark';
    } catch (e) {
      return false; // storage blocked: fall back to the light default
    }
  }

  window.__theme = { apply: apply, storedDark: storedDark };

  if (storedDark()) apply(true);
})();
