// Search Modal Management
(function() {
  'use strict';

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
        excerptLength: 15
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

    if (query.length > 100) {
      query = query.substring(0, 100);
    }

    const search = await initSearch();
    if (!search) return;

    try {
      const searchResults = await search.search(query);
      results = searchResults.results;

      if (results.length === 0) {
        showNoResults(query);
        return;
      }

      await renderResults(results);
      selectedIndex = -1;

      // Announce to screen readers
      const count = results.length;
      announceToScreenReader(`${count} result${count !== 1 ? 's' : ''} found`);
    } catch (error) {
      console.error('Search error:', error);
      showError('An error occurred during search');
    }
  }

  // Render search results
  async function renderResults(results) {
    const html = await Promise.all(
      results.slice(0, 10).map(async (result, index) => {
        const data = await result.data();
        const url = data.url;
        const title = data.meta?.title || 'Untitled';
        const excerpt = data.excerpt || '';
        const date = data.meta?.date || '';

        // Determine content type from URL
        let type = 'post';
        if (url.includes('/comics/')) type = 'comic';

        return `
          <a href="${url}"
             class="search-result"
             data-index="${index}"
             role="option"
             aria-selected="false">
            <div class="result-title">
              ${escapeHtml(title)}
              <span class="result-type">${type}</span>
            </div>
            ${excerpt ? `<div class="result-excerpt">${excerpt}</div>` : ''}
            ${date ? `<div class="result-meta">${formatDate(date)}</div>` : ''}
          </a>
        `;
      })
    );

    const countHtml = `<div class="result-count">${results.length} result${results.length !== 1 ? 's' : ''}</div>`;
    resultsContainer.innerHTML = countHtml + html.join('');
  }

  // Show states
  function showEmpty() {
    resultsContainer.innerHTML = '<div class="search-empty">Start typing to search...</div>';
    results = [];
    selectedIndex = -1;
  }

  function showLoading() {
    resultsContainer.innerHTML = '<div class="search-loading">Loading search...</div>';
  }

  function showError(message) {
    resultsContainer.innerHTML = `<div class="search-error">${escapeHtml(message)}</div>`;
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

  // Focus trap
  function trapFocus(element) {
    // Remove previous handler if exists
    if (focusTrapHandler) {
      element.removeEventListener('keydown', focusTrapHandler);
    }

    const focusableElements = element.querySelectorAll(
      'input, button, a[href], [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    focusTrapHandler = function(e) {
      if (e.key !== 'Tab') return;

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

    setTimeout(() => announcement.remove(), 1000);
  }

  // Utilities
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
  }, 300));

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
