// Drives the 404 shell from a scripted case, then writes what the terminal
// shows into <pre id="transcript"> for transcript.sh to read out of the DOM.
// window.PROBE_CASE holds the case text; transcript.sh inlines it, so no
// fetch races Chrome's virtual clock.
(function () {
  'use strict';

  // No real network in tests: ping's lookups and probes are answered here.
  // Every name resolves to one address except *.invalid, and every probe
  // takes 12.345 ms, so transcripts never depend on the internet.
  window.SEBIWI_NET = {
    resolve: function (host) {
      if (/\.invalid$/.test(host)) return null;
      return host === 'localhost' ? '127.0.0.1' : '93.184.216.34';
    },
    probe: function () {
      return 12.345;
    },
    // curl and wget: a few canned sites. slow.example answers after five
    // seconds of (virtual) time, for ctrl+c and for lines that wait.
    fetch: function (href, opts) {
      var sites = {
        'https://example.com/': { status: 200, headers: [['content-type', 'text/html']], body: '<h1>Example</h1>\n<p>hi</p>\n' },
        'https://example.com/data.json': { status: 200, headers: [['content-type', 'application/json']], body: '{\n  "name": "sebiwi",\n  "pages": 4\n}\n' },
        'https://example.com/missing': { status: 404, headers: [['content-type', 'text/plain']], body: 'not found\n' },
        'https://nocors.example/': { error: 'cors' },
        'https://down.example/': { error: 'connect' }
      };
      if (href === 'https://example.com/post') {
        return { status: 200, headers: [], body: opts.method + ' ' + (opts.body || '') + '\n' };
      }
      if (href === 'https://throw.example/') {
        throw new Error('stub failure'); // a bug inside a stage, for exec's waitFor
      }
      if (href === 'https://slow.example/') {
        return new Promise(function (done) {
          window.setTimeout(function () { done({ status: 200, headers: [], body: 'slow\n' }); }, 5000);
        });
      }
      return sites[href] || { status: 404, headers: [], body: '' };
    }
  };

  function prompt() {
    return document.querySelector('[data-term-input]');
  }

  function press(spec) {
    var parts = spec === '+' ? ['+'] : spec.split('+');
    var key = parts.pop();
    if (key === 'space') key = ' ';
    var target = prompt();
    if (!target || !target.isConnected) target = document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: key,
      code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
      ctrlKey: parts.indexOf('ctrl') !== -1,
      altKey: parts.indexOf('alt') !== -1,
      shiftKey: parts.indexOf('shift') !== -1,
      bubbles: true,
      cancelable: true
    }));
  }

  function type(text) {
    var input = prompt();
    if (!input || !input.isConnected) return;
    input.value = text;
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // What a mobile keyboard sends: no keydown worth reading, only an input
  // event carrying its type (insertText, deleteContentBackward) and text.
  function mobile(spec) {
    var input = prompt();
    if (!input || !input.isConnected) return;
    var parts = spec.split(' ');
    var kind = parts[0];
    var data = parts.length > 1 ? parts.slice(1).join(' ') : null;
    if (kind.indexOf('delete') === 0) input.value = input.value.slice(0, -1);
    else input.value += data || '';
    input.dispatchEvent(new InputEvent('input', { inputType: kind, data: data, bubbles: true }));
  }

  function dump() {
    var term = document.querySelector('.term-404');
    var text = term && term.isConnected ? term.textContent : '[terminal removed]\n';
    var bye = document.querySelector('.term-shutdown');
    if (bye) text += '\n[page] ' + bye.textContent + '\n';
    var out = document.createElement('pre');
    out.id = 'transcript';
    out.textContent = text;
    document.body.appendChild(out);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var steps = String(window.PROBE_CASE || '').replace(/\n+$/, '').split('\n');
    var at = 0;
    (function next() {
      if (at >= steps.length) {
        window.setTimeout(dump, 500);
        return;
      }
      var step = steps[at++];
      var delay = 300;
      if (step.indexOf('#!wait ') === 0) {
        delay = parseInt(step.slice(7), 10);
      } else if (step.indexOf('#!key ') === 0) {
        press(step.slice(6));
      } else if (step.indexOf('#!input ') === 0) {
        mobile(step.slice(8));
      } else if (step.indexOf('#!type ') === 0) {
        type(step.slice(7));
      } else {
        type(step);
        press('Enter');
      }
      window.setTimeout(next, delay);
    })();
  });
})();
