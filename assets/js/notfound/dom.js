// The page elements the shell drives, found once at boot.

export var dom = {
  pre: null, livePrompt: null, input: null, echo: null, terminal: null,
  promptLabel: null, cursor: null, tail: null
};

export var reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initDom(doc) {
  dom.pre = doc.querySelector('.term-404');
  dom.livePrompt = doc.querySelector('[data-term-live]');
  dom.input = doc.querySelector('[data-term-input]');
  dom.echo = doc.querySelector('[data-term-typed]');
  dom.terminal = doc.querySelector('.terminal-404');
  if (!dom.pre || !dom.livePrompt || !dom.input || !dom.echo || !dom.terminal) return false;
  // The live prompt is four pieces: the '$' (ctrl+r borrows it), the text
  // before the caret, the character under it, and the text after.
  dom.promptLabel = dom.livePrompt.querySelector('.term-prompt');
  dom.cursor = dom.livePrompt.querySelector('.term-cursor');
  dom.tail = dom.livePrompt.querySelector('[data-term-rest]');
  return !!(dom.promptLabel && dom.cursor && dom.tail);
}
