// 404 page: show the path the visitor actually tried to reach.
(function () {
  'use strict';
  var el = document.querySelector('[data-404-path]');
  if (el && window.location && window.location.pathname) {
    el.textContent = window.location.pathname;
  }
})();
