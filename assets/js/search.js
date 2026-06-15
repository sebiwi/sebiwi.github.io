// Search Modal Management
(function() {
  'use strict';

  // Configuration constants
  const MAX_QUERY_LENGTH = 100;
  const MAX_RESULTS = 10;
  const EXCERPT_LENGTH = 15;
  const SEARCH_DEBOUNCE_MS = 300;
  const SCREEN_READER_ANNOUNCEMENT_TIMEOUT_MS = 3000;

  // State
  let pagefind = null;
  let selectedIndex = -1;
  let results = [];
  let previousFocus = null;
  let focusTrapHandler = null;

  // DOM elements
  const modal = document.getElementById('search-modal');
  const backdrop = modal?.querySelector('.search-backdrop');
  const input = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  const statusBar = document.getElementById('search-status');

  if (!modal || !input || !resultsContainer) {
    console.warn('Search modal elements not found');
    return;
  }

  // Debounce helper
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Initialize Pagefind (lazy load)
  async function initSearch() {
    if (pagefind) return pagefind;

    try {
      showLoading();
      pagefind = await import('/pagefind/pagefind.js');
      await pagefind.options({
        excerptLength: EXCERPT_LENGTH
      });
      return pagefind;
    } catch (error) {
      console.error('Failed to load search:', error);
      showError('Search is temporarily unavailable');
      return null;
    }
  }

  // Perform search
  async function performSearch(query) {
    if (!query.trim()) {
      showEmpty();
      return;
    }

    if (query.length > MAX_QUERY_LENGTH) {
      query = query.substring(0, MAX_QUERY_LENGTH);
    }

    const search = await initSearch();
    if (!search) return;

    try {
      const started = performance.now();
      const searchResults = await search.search(query);
      const elapsedMs = Math.max(1, Math.round(performance.now() - started));
      results = searchResults.results;

      if (results.length === 0) {
        showNoResults(query);
        updateStatus(query, 0, 0, elapsedMs);
        return;
      }

      await renderResults(results);
      selectedIndex = -1;

      const total = results.length;
      const displayed = Math.min(total, MAX_RESULTS);
      updateStatus(query, displayed, total, elapsedMs);

      // Announce to screen readers
      announceToScreenReader(`${total} result${total !== 1 ? 's' : ''} found`);
    } catch (error) {
      console.error('Search error:', error);
      showError('An error occurred during search');
    }
  }

  // Render search results as fzf-style TUI lines
  async function renderResults(results) {
    const html = await Promise.all(
      results.slice(0, MAX_RESULTS).map(async (result, index) => {
        const data = await result.data();
        const rawUrl = data.url;
        // Validate URL to prevent XSS via javascript: URLs
        const url = (rawUrl && (rawUrl.startsWith('/') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) ? rawUrl : '/';
        const title = data.meta?.title || 'Untitled';
        const excerpt = data.excerpt || '';

        // Determine content type from URL
        const isComic = url.includes('/comics/');
        const type = isComic ? 'comic' : 'post';

        return `
          <a href="${url}"
             class="search-result"
             data-index="${index}"
             role="option"
             aria-selected="false">
            <div class="result-line">
              <span class="result-path">${escapeHtml(urlToPath(url))}</span>
              <span class="result-type ${isComic ? 'is-comic' : 'is-post'}">[${type}]</span>
            </div>
            <div class="result-title">${escapeHtml(title)}</div>
            ${excerpt ? `<div class="result-excerpt">${excerpt}</div>` : ''}
          </a>
        `;
      })
    );

    resultsContainer.innerHTML = html.join('');
  }

  // Render the fzf-style status line: "10/23 ── 'query' (4ms)"
  function updateStatus(query, displayed, total, elapsedMs) {
    if (!statusBar) return;
    if (!total) {
      statusBar.innerHTML = `<span class="status-count">0/0</span> ── no match for <span class="status-query">'${escapeHtml(query)}'</span> (${elapsedMs}ms)`;
      return;
    }
    statusBar.innerHTML = `<span class="status-count">${displayed}/${total}</span> ── matched <span class="status-query">'${escapeHtml(query)}'</span> (${elapsedMs}ms)`;
  }

  function clearStatus() {
    if (statusBar) statusBar.innerHTML = '';
  }

  // Show states
  function showEmpty() {
    resultsContainer.innerHTML = '<div class="search-empty">~ awaiting input …</div>';
    clearStatus();
    results = [];
    selectedIndex = -1;
  }

  function showLoading() {
    resultsContainer.innerHTML = '<div class="search-loading">$ loading index…</div>';
  }

  function showError(message) {
    resultsContainer.innerHTML = `<div class="search-error">${escapeHtml(message)}</div>`;
    clearStatus();
    results = [];
    selectedIndex = -1;
  }

  function showNoResults(query) {
    resultsContainer.innerHTML = `
      <div class="no-results">
        <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
        <p class="suggestion">Try different keywords or browse <a href="/blog/">all posts</a></p>
      </div>
    `;
    results = [];
    selectedIndex = -1;
  }

  // Keyboard navigation
  function updateSelection(newIndex) {
    const resultElements = resultsContainer.querySelectorAll('.search-result');

    // Remove previous selection
    if (selectedIndex >= 0 && resultElements[selectedIndex]) {
      resultElements[selectedIndex].classList.remove('selected');
      resultElements[selectedIndex].setAttribute('aria-selected', 'false');
    }

    selectedIndex = newIndex;

    // Add new selection
    if (selectedIndex >= 0 && resultElements[selectedIndex]) {
      resultElements[selectedIndex].classList.add('selected');
      resultElements[selectedIndex].setAttribute('aria-selected', 'true');
      resultElements[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function navigateResults(direction) {
    const resultElements = resultsContainer.querySelectorAll('.search-result');
    if (resultElements.length === 0) return;

    let newIndex = selectedIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = resultElements.length - 1;
    if (newIndex >= resultElements.length) newIndex = 0;

    updateSelection(newIndex);
  }

  function selectResult() {
    const resultElements = resultsContainer.querySelectorAll('.search-result');
    if (selectedIndex >= 0 && resultElements[selectedIndex]) {
      resultElements[selectedIndex].click();
    }
  }

  // Modal controls
  function openModal() {
    if (!modal.hasAttribute('hidden')) return;

    previousFocus = document.activeElement;
    modal.removeAttribute('hidden');
    input.value = '';
    showEmpty();
    input.focus();
    document.body.style.overflow = 'hidden';

    // Trap focus
    trapFocus(modal);
  }

  function closeModal() {
    if (modal.hasAttribute('hidden')) return;

    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';

    // Remove focus trap
    if (focusTrapHandler) {
      modal.removeEventListener('keydown', focusTrapHandler);
      focusTrapHandler = null;
    }

    // Restore focus
    if (previousFocus) {
      previousFocus.focus();
      previousFocus = null;
    }
  }

  // Focus trap. Recomputes focusable elements on every Tab so that search
  // results (added to the DOM after the modal opens) are included — otherwise
  // Tab stays stuck on the input.
  function trapFocus(element) {
    // Remove previous handler if exists
    if (focusTrapHandler) {
      element.removeEventListener('keydown', focusTrapHandler);
    }

    focusTrapHandler = function(e) {
      if (e.key !== 'Tab') return;

      const focusable = element.querySelectorAll(
        'input, button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    element.addEventListener('keydown', focusTrapHandler);
  }

  // Screen reader announcements
  function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);

    setTimeout(() => announcement.remove(), SCREEN_READER_ANNOUNCEMENT_TIMEOUT_MS);
  }

  // Utilities
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Turn a result URL into a terminal-style file path:
  //   /blog/foo/  -> ./blog/foo.md   |   /  -> ./index.md
  function urlToPath(url) {
    let path = url;
    const schemeIndex = path.indexOf('://');
    if (schemeIndex !== -1) {
      const slash = path.indexOf('/', schemeIndex + 3);
      path = slash === -1 ? '/' : path.slice(slash);
    }
    path = path.split(/[?#]/)[0].replace(/\/+$/, '');
    if (!path) return './index.md';
    return '.' + path + '.md';
  }

  // Event listeners

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Open modal with Cmd/Ctrl + K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openModal();
      return;
    }

    // Close modal with Escape (catches case where modal listener doesn't fire)
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
      closeModal();
    }
  });

  // Click-to-open trigger (search button, the mobile/desktop affordance)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-search-trigger]');
    if (trigger) {
      e.preventDefault();
      openModal();
    }
  });

  // Modal keyboard navigation
  modal.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeModal();
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateResults(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigateResults(-1);
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectResult();
        }
        break;
    }
  });

  // Search input
  input.addEventListener('input', debounce((e) => {
    performSearch(e.target.value);
  }, SEARCH_DEBOUNCE_MS));

  // Backdrop click
  backdrop.addEventListener('click', closeModal);

  // Result clicks
  resultsContainer.addEventListener('click', (e) => {
    const result = e.target.closest('.search-result');
    if (result) {
      closeModal();
    }
  });

  // Close on navigation
  window.addEventListener('popstate', closeModal);

})();
