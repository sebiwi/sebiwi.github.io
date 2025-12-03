// Code block enhancements: language headers and copy buttons
document.addEventListener('DOMContentLoaded', function() {
  // Process all highlight blocks
  const highlights = document.querySelectorAll('.highlight');

  highlights.forEach(function(highlight) {
    // Get the language from the class name
    const pre = highlight.querySelector('pre');
    if (!pre) return;

    let language = 'text';

    // Check highlight div classes first (Hugo adds language-* here)
    const highlightClasses = highlight.className.split(' ');
    for (let className of highlightClasses) {
      if (className.startsWith('language-')) {
        language = className.replace('language-', '');
        break;
      }
    }

    // If not found, check pre element classes
    if (language === 'text') {
      const preClasses = pre.className.split(' ');
      for (let className of preClasses) {
        if (className.startsWith('language-')) {
          language = className.replace('language-', '');
          break;
        }
      }
    }

    // Check code element classes as fallback
    if (language === 'text') {
      const code = pre.querySelector('code');
      if (code) {
        const codeClasses = code.className.split(' ');
        for (let className of codeClasses) {
          if (className.startsWith('language-')) {
            language = className.replace('language-', '');
            break;
          }
        }
      }
    }

    // Create header with language and copy button
    const header = document.createElement('div');
    header.className = 'code-header';

    const langLabel = document.createElement('span');
    langLabel.className = 'code-language';
    langLabel.textContent = (language === 'text' || language === 'fallback') ? '' : language;

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');

    // Add click handler for copy button
    copyButton.addEventListener('click', function() {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;

      navigator.clipboard.writeText(text).then(function() {
        copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        copyButton.classList.add('copied');

        setTimeout(function() {
          copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
          copyButton.classList.remove('copied');
        }, 2000);
      }).catch(function(err) {
        copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        setTimeout(function() {
          copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        }, 2000);
      });
    });

    header.appendChild(langLabel);
    header.appendChild(copyButton);

    // Insert header before the pre element
    highlight.insertBefore(header, pre);
    highlight.classList.add('with-header');
  });

  // Also handle standalone pre blocks without highlight wrapper
  const standalonePres = document.querySelectorAll('.post-content > pre, .post-content pre:not(.highlight pre)');

  standalonePres.forEach(function(pre) {
    // Skip if already processed or inside a highlight
    if (pre.closest('.highlight')) return;

    // Wrap in highlight div
    const wrapper = document.createElement('div');
    wrapper.className = 'highlight with-header';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    // Get language from wrapper or pre classes
    let language = 'text';
    const wrapperClasses = wrapper.className.split(' ');
    for (let className of wrapperClasses) {
      if (className.startsWith('language-')) {
        language = className.replace('language-', '');
        break;
      }
    }

    if (language === 'text') {
      const preClasses = pre.className.split(' ');
      for (let className of preClasses) {
        if (className.startsWith('language-')) {
          language = className.replace('language-', '');
          break;
        }
      }
    }

    if (language === 'text') {
      const code = pre.querySelector('code');
      if (code) {
        const codeClasses = code.className.split(' ');
        for (let className of codeClasses) {
          if (className.startsWith('language-')) {
            language = className.replace('language-', '');
            break;
          }
        }
      }
    }

    // Create header
    const header = document.createElement('div');
    header.className = 'code-header';

    const langLabel = document.createElement('span');
    langLabel.className = 'code-language';
    langLabel.textContent = (language === 'text' || language === 'fallback') ? '' : language;

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');

    copyButton.addEventListener('click', function() {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;

      navigator.clipboard.writeText(text).then(function() {
        copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        copyButton.classList.add('copied');

        setTimeout(function() {
          copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
          copyButton.classList.remove('copied');
        }, 2000);
      }).catch(function(err) {
        copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        setTimeout(function() {
          copyButton.innerHTML = '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        }, 2000);
      });
    });

    header.appendChild(langLabel);
    header.appendChild(copyButton);

    wrapper.insertBefore(header, pre);
  });
});
