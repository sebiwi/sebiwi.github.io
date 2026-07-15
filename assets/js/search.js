// Search Modal Management
(function() {
  'use strict';

  // Configuration constants
  const MAX_QUERY_LENGTH = 100;
  const MAX_RESULTS = 10;
  const EXCERPT_LENGTH = 15;
  const SEARCH_DEBOUNCE_MS = 300;

  // State
  let pagefind = null;
  let selectedIndex = -1;
  let results = [];
  let searchSeq = 0; // monotonic token; a query whose token is stale drops its results
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

    // Claim a sequence token. After every await we bail if a newer query has
    // started, so a slow earlier search can't overwrite a newer one's results.
    const seq = ++searchSeq;

    const search = await initSearch();
    if (!search) return;
    if (seq !== searchSeq) return;

    try {
      const started = performance.now();
      const searchResults = await search.search(query);
      if (seq !== searchSeq) return;
      const elapsedMs = Math.max(1, Math.round(performance.now() - started));
      results = searchResults.results;

      if (results.length === 0) {
        showNoResults(query);
        updateStatus(query, 0, 0, elapsedMs);
        announceToScreenReader('No results found');
        return;
      }

      await renderResults(results, seq);
      if (seq !== searchSeq) return;
      selectedIndex = -1;

      const total = results.length;
      const displayed = Math.min(total, MAX_RESULTS);
      updateStatus(query, displayed, total, elapsedMs);

      // Announce to screen readers
      announceToScreenReader(`${total} result${total !== 1 ? 's' : ''} found`);
    } catch (error) {
      // A stale query that rejects late must not clobber a newer query's
      // rendered results with an error state.
      if (seq !== searchSeq) return;
      console.error('Search error:', error);
      showError('An error occurred during search');
    }
  }

  // Render search results as fzf-style TUI lines
  async function renderResults(results, seq) {
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
          <a href="${escapeHtml(url)}"
             class="search-result"
             id="search-result-${index}"
             data-index="${index}"
             role="option"
             aria-selected="false">
            <div class="result-line">
              <span class="result-path">${escapeHtml(urlToPath(url))}</span>
              <span class="result-type ${isComic ? 'is-comic' : 'is-post'}">[${type}]</span>
            </div>
            <div class="result-title">${escapeHtml(title)}</div>
            ${excerpt ? `<div class="result-excerpt">${
              // Excerpt is the one field inserted as raw HTML: Pagefind highlights
              // matched terms by wrapping them in <mark>, so escaping here would
              // render literal tags. Safe because the index is built from our own
              // first-party content and Pagefind controls the excerpt markup —
              // every other field above is escapeHtml'd.
              excerpt
            }</div>` : ''}
          </a>
        `;
      })
    );

    // Dropped if a newer query started while we awaited the per-result data().
    if (seq !== undefined && seq !== searchSeq) return;
    resultsContainer.innerHTML = html.join('');
    setExpanded(true);
    // If the user had Tabbed onto a result, replacing the list just destroyed
    // the focused element and dropped focus to <body> — outside the trap.
    if (!modal.contains(document.activeElement)) {
      input.focus({ preventScroll: true });
    }
  }

  // Combobox state: tells AT whether the listbox currently holds options.
  // Also clears the active-descendant pointer whenever the list (re)renders.
  function setExpanded(expanded) {
    input.setAttribute('aria-expanded', String(expanded));
    input.removeAttribute('aria-activedescendant');
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
    // Entering the empty state invalidates any in-flight search, so its late
    // results can't render under an empty input (covers both clearing the
    // query and reopening the modal).
    searchSeq++;
    resultsContainer.innerHTML = '<div class="search-empty" role="presentation">~ awaiting input …</div>';
    clearStatus();
    results = [];
    selectedIndex = -1;
    setExpanded(false);
  }

  function showLoading() {
    resultsContainer.innerHTML = '<div class="search-loading" role="presentation">$ loading index…</div>';
    setExpanded(false);
  }

  function showError(message) {
    resultsContainer.innerHTML = `<div class="search-error" role="presentation">${escapeHtml(message)}</div>`;
    clearStatus();
    results = [];
    selectedIndex = -1;
    setExpanded(false);
    announceToScreenReader(message);
  }

  function showNoResults(query) {
    resultsContainer.innerHTML = `
      <div class="no-results" role="presentation">
        <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
        <p class="suggestion">Try different keywords or browse <a href="/blog/">all posts</a></p>
      </div>
    `;
    results = [];
    selectedIndex = -1;
    setExpanded(false);
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
      // The input keeps DOM focus; this tells AT which option is current.
      input.setAttribute('aria-activedescendant', resultElements[selectedIndex].id);
    } else {
      input.removeAttribute('aria-activedescendant');
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

    // Drop any in-flight search; its results must not appear on reopen.
    searchSeq++;
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

  // Screen reader announcements. One persistent live region, updated in
  // place: regions inserted already containing text are not reliably
  // announced (VoiceOver notably). The clear-then-set dance lets the same
  // message announce twice in a row.
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'visually-hidden';
  document.body.appendChild(announcer);
  let announceTimer = null;

  function announceToScreenReader(message) {
    announcer.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { announcer.textContent = message; }, 50);
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

  // The Cmd/Ctrl+K handler below accepts both, but every rendered hint
  // (modal badge, search-button tooltip, 404 copy) defaults to the Mac
  // glyph — swap them on non-Apple platforms.
  if (!/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)) {
    document.querySelectorAll('[data-shortcut-hint]').forEach((el) => {
      // Keep the styled key span (13px glyph) when the hint has one.
      const key = el.querySelector('.search-shortcut-key');
      if (key && key.nextSibling) {
        key.textContent = 'Ctrl';
        key.nextSibling.textContent = '+K';
      } else {
        el.textContent = 'Ctrl+K';
      }
    });
    document.querySelectorAll('[data-search-trigger]').forEach((el) => {
      if (el.title) el.title = 'Search (Ctrl+K)';
    });
  }

  // Event listeners

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // mid-IME keystrokes belong to the composition

    // Open modal with Cmd/Ctrl + K. Case-insensitive ('K' with CapsLock on);
    // Shift/Alt excluded so browser shortcuts like Cmd+Shift+K stay intact.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
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
    // During IME composition, Escape cancels the composition and Enter commits
    // it — those keystrokes must not close the modal or select a result.
    if (e.isComposing) return;
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

  // Backdrop click (optional element — guard so a missing backdrop can't abort
  // the rest of the listener setup, e.g. Cmd/K and Escape).
  backdrop?.addEventListener('click', closeModal);

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
