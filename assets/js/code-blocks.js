// Code block enhancements: language headers and copy buttons.
document.addEventListener('DOMContentLoaded', function () {
  // --- Icons (single SVG shell, swappable inner shapes) ---
  function icon(inner) {
    return '<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + inner + '</svg>';
  }

  var ICONS = {
    copy: icon('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
    check: icon('<polyline points="20 6 9 17 4 12"></polyline>'),
    error: icon('<line x1="18" y1="6" x2="6" y2="18"></line>' +
      '<line x1="6" y1="6" x2="18" y2="18"></line>')
  };

  // --- Find the language from the wrapper, the <pre>, or the <code> classes ---
  function detectLanguage(wrapper, pre) {
    var code = pre ? pre.querySelector('code') : null;
    var sources = [wrapper, pre, code];
    for (var i = 0; i < sources.length; i++) {
      if (!sources[i]) continue;
      var classes = sources[i].className.split(' ');
      for (var j = 0; j < classes.length; j++) {
        if (classes[j].indexOf('language-') === 0) {
          return classes[j].replace('language-', '');
        }
      }
    }
    return 'text';
  }

  // --- Build a terminal-style header (dots + language + copy button) for a <pre> ---
  function buildHeader(pre, language) {
    var header = document.createElement('div');
    header.className = 'code-header';

    var dots = document.createElement('span');
    dots.className = 'code-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<span class="code-dot"></span><span class="code-dot"></span><span class="code-dot"></span>';

    var langLabel = document.createElement('span');
    langLabel.className = 'code-language';
    langLabel.textContent = (language === 'text' || language === 'fallback') ? '' : language;

    var copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.innerHTML = ICONS.copy;
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');
    copyButton.addEventListener('click', function () {
      var code = pre.querySelector('code');
      var text = code ? code.textContent : pre.textContent;

      navigator.clipboard.writeText(text).then(function () {
        copyButton.innerHTML = ICONS.check;
        copyButton.classList.add('copied');
        setTimeout(function () {
          copyButton.innerHTML = ICONS.copy;
          copyButton.classList.remove('copied');
        }, 2000);
      }).catch(function () {
        copyButton.innerHTML = ICONS.error;
        setTimeout(function () {
          copyButton.innerHTML = ICONS.copy;
        }, 2000);
      });
    });

    header.appendChild(dots);
    header.appendChild(langLabel);
    header.appendChild(copyButton);
    return header;
  }

  // Highlighted code blocks (Hugo wraps these in .highlight).
  document.querySelectorAll('.highlight').forEach(function (highlight) {
    var pre = highlight.querySelector('pre');
    if (!pre) return;
    highlight.insertBefore(buildHeader(pre, detectLanguage(highlight, pre)), pre);
    highlight.classList.add('with-header');
  });

  // Standalone <pre> blocks without a .highlight wrapper.
  document.querySelectorAll('.post-content > pre, .post-content pre:not(.highlight pre)').forEach(function (pre) {
    if (pre.closest('.highlight')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'highlight with-header';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    wrapper.insertBefore(buildHeader(pre, detectLanguage(wrapper, pre)), pre);
  });
});
