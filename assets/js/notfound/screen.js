// Printing: lines above the live prompt, the scrollback cap, and the sinks
// a pipeline writes through.

import { dom } from './dom.js';

export var MAX_SCROLLBACK = 100;

export function textNode(text) {
  return document.createTextNode(text);
}

export function styled(className, text) {
  var span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

export function fileLink(file) {
  var link = document.createElement('a');
  link.className = 'term-link';
  link.href = file.url;
  link.textContent = file.name;
  return link;
}

// Every printed line is a .term-line span followed by a newline text node,
// inserted above the live prompt; the pair is what trimScrollback() drops.
export function printLine(nodes) {
  var line = document.createElement('span');
  line.className = 'term-line';
  for (var i = 0; i < nodes.length; i++) {
    line.appendChild(nodes[i]);
  }
  dom.pre.insertBefore(line, dom.livePrompt);
  dom.pre.insertBefore(textNode('\n'), dom.livePrompt);
  trimScrollback();
  dom.pre.scrollTop = dom.pre.scrollHeight; // the box scrolls, like a terminal
}

export function printText(text) {
  printLine([textNode(text)]);
}

export function trimScrollback() {
  var lines = dom.pre.querySelectorAll('.term-line');
  for (var i = 0; i < lines.length - MAX_SCROLLBACK; i++) {
    var newline = lines[i].nextSibling;
    if (newline && newline.nodeType === Node.TEXT_NODE) {
      dom.pre.removeChild(newline);
    }
    dom.pre.removeChild(lines[i]);
  }
}

// Commands write through a sink, so a pipeline can collect what they print
// instead of showing it. The screen sink is the terminal itself.
export var screenSink = {
  text: printText,
  line: printLine,
  lines: null
};

export function captureSink() {
  var lines = [];
  return {
    text: function (str) { lines.push(str); },
    line: function (nodes) {
      var text = '';
      for (var i = 0; i < nodes.length; i++) text += nodes[i].textContent;
      lines.push(text);
    },
    lines: lines
  };
}


// How many characters fit across the terminal, measured, not guessed.
export function termCols() {
  var probe = styled('', '0000000000');
  dom.pre.insertBefore(probe, dom.livePrompt);
  var charWidth = probe.getBoundingClientRect().width / 10;
  dom.pre.removeChild(probe);
  return charWidth ? Math.max(20, Math.floor(dom.pre.clientWidth / charWidth) - 1) : 40;
}

// How many lines fit in the terminal box: its max-height (or 20 lines when
// it grows freely), less a line for the status.
export function termRows() {
  var probe = styled('', '0');
  dom.pre.insertBefore(probe, dom.livePrompt);
  var line = probe.getBoundingClientRect().height || 20;
  dom.pre.removeChild(probe);
  var max = parseFloat(window.getComputedStyle(dom.pre).maxHeight);
  var height = isNaN(max) ? line * 20 : max;
  return Math.max(5, Math.floor(height / line) - 1);
}

// Full-screen programs (less, htop) draw over the terminal and give it back
// untouched when they quit, the way a terminal's alternate screen does.
export function enterAltScreen() {
  var saved = [];
  while (dom.pre.firstChild !== dom.livePrompt) saved.push(dom.pre.removeChild(dom.pre.firstChild));
  var view = document.createElement('span');
  view.className = 'term-line';
  dom.pre.insertBefore(view, dom.livePrompt);
  return {
    view: view,
    restore: function () {
      if (view.parentNode) view.parentNode.removeChild(view);
      for (var i = 0; i < saved.length; i++) dom.pre.insertBefore(saved[i], dom.livePrompt);
      dom.pre.scrollTop = dom.pre.scrollHeight;
    }
  };
}
