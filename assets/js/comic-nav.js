// Comic reader: left/right arrow keys page to the previous/next comic.
// Reuses the prev/next links already rendered by post-navigation.html.
(function () {
  'use strict';

  function navigate(selector) {
    var link = document.querySelector(selector);
    if (link && link.href) {
      window.location.href = link.href;
    }
  }

  document.addEventListener('keydown', function (e) {
    // Leave modified shortcuts and form fields alone.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    // Don't hijack arrows while the search modal is open.
    var modal = document.getElementById('search-modal');
    if (modal && !modal.hasAttribute('hidden')) return;

    if (e.key === 'ArrowLeft') {
      navigate('.post-navigation .post-nav-link:not(.post-nav-next)');
    } else if (e.key === 'ArrowRight') {
      navigate('.post-navigation .post-nav-next');
    }
  });
})();
