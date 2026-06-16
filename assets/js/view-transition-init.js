// When a page is entered via a cross-document view transition, the crossfade
// itself reveals the page. Running the CSS entrance animation (.fade-in-element)
// on top of that double-renders content during the overlap — Safari showed a
// duplicated profile image stacked above the title. Mark the document so the
// entrance animation is skipped for this load; a fresh (non-transition) load
// leaves the class off and animates normally.
//
// Must be loaded synchronously in <head> so the listener exists before
// `pagereveal` fires (before the new document's first paint), avoiding a flash.
// The class is left in place for the page's lifetime so the entrance animation
// can't restart once the transition finishes.
window.addEventListener('pagereveal', function (event) {
  if (event.viewTransition) {
    document.documentElement.classList.add('vt-nav');
  }
});
