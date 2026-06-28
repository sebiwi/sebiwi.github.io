// About page: terminal "decode" reveal.
// On page load the neofetch panel's text materializes from scrambled glyphs that
// resolve into the real characters in a top-to-bottom wave, then the ASCII figure
// waves. Because the font is monospace, each scrambled glyph is the same width as
// the real one, so the layout never reflows.
//
// `html.about-booting` is set before first paint by a guard in the layout, so the
// lines start invisible (opacity, space reserved). With JS off or reduced motion
// the class is never set and the panel renders fully.
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const panel = document.querySelector('.neofetch');
  if (!panel || !root.classList.contains('about-booting')) return;

  const decodeLines = Array.from(panel.querySelectorAll('.boot-line'));
  const logo = panel.querySelector('.neofetch-logo');

  // Tuning knobs.
  const TICK_MS = 40;        // scramble frame interval
  const SPAN = 22;           // frames over which the resolve wave sweeps the panel
  const JITTER = 3;          // per-character randomness in settle time
  const WAVE_FRAME_MS = 130;

  const GLYPHS = 'ABCDEFGHKMNPRSTVXZ0123456789#%&@$*+=<>?/\\|{}[]~^';
  const rnd = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  // Build a per-line model of its text nodes and per-character settle frames.
  const models = [];
  const nodes = [];
  let total = 0;
  for (const line of decodeLines) {
    const lineNodes = [];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const real = node.nodeValue;
      const entry = { node, real, settle: new Array(real.length) };
      for (let i = 0; i < real.length; i++) {
        if (/\s/.test(real[i])) entry.settle[i] = -1;  // whitespace never scrambles
        else total++;
      }
      lineNodes.push(entry);
      nodes.push(entry);
    }
    models.push({ line, nodes: lineNodes, maxSettle: 0, locked: false });
  }
  let g = 0;
  for (const entry of nodes) {
    for (let i = 0; i < entry.real.length; i++) {
      if (entry.settle[i] === -1) continue;
      entry.settle[i] = Math.round((g / Math.max(total, 1)) * SPAN) + ((Math.random() * (JITTER + 1)) | 0);
      g++;
    }
  }
  for (const m of models) {
    m.maxSettle = m.nodes.reduce((mx, e) => Math.max(mx, ...e.settle, 0), 0);
  }
  const maxFrame = models.reduce((m, x) => Math.max(m, x.maxSettle), 0);

  function render(frame) {
    for (const e of nodes) {
      let out = '';
      for (let i = 0; i < e.real.length; i++) {
        const s = e.settle[i];
        out += (s === -1 || frame >= s) ? e.real[i] : rnd();
      }
      e.node.nodeValue = out;
    }
  }

  // Drop the green glow from any line whose characters have all resolved, so it
  // settles to its real colors as the wave passes — instead of all at once.
  function lockSettled(frame) {
    for (const m of models) {
      if (!m.locked && frame >= m.maxSettle) {
        m.line.classList.remove('is-decoding');
        m.locked = true;
      }
    }
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const LOGO_REST = ' o/\n/|\n/ \\';
  const LOGO_WAVE = ' o-\n/|\n/ \\';
  // Three waves: arm out → rest, ×3.
  const LOGO_FRAMES = [LOGO_WAVE, LOGO_REST, LOGO_WAVE, LOGO_REST, LOGO_WAVE, LOGO_REST];

  async function waveLogo() {
    if (!logo) return;
    logo.style.visibility = 'visible';
    logo.classList.add('is-waking');
    for (const frame of LOGO_FRAMES) {
      logo.textContent = frame;
      await sleep(WAVE_FRAME_MS);
    }
    logo.textContent = LOGO_REST;
  }

  let decodeIntervalId = null;
  let failsafeId = null;

  // Reveal the real text and drop all boot state. Idempotent and safe to call
  // at any point — it also cancels the in-flight decode loop and failsafe, so a
  // partially-decoded panel can never be left frozen or hidden.
  function cleanup() {
    if (decodeIntervalId !== null) { clearInterval(decodeIntervalId); decodeIntervalId = null; }
    if (failsafeId !== null) { clearTimeout(failsafeId); failsafeId = null; }
    render(maxFrame + 1);
    decodeLines.forEach((l) => l.classList.remove('is-decoding'));
    root.classList.remove('about-booting');
  }

  // Failsafe: never leave the panel hidden if something goes wrong.
  failsafeId = setTimeout(cleanup, 4000);

  // Back/forward cache: a restore does NOT re-fire DOMContentLoaded and the
  // restored DOM may be frozen mid-decode (scrambled glyphs, lines still hidden).
  // The closure survives bfcache, so this listener — registered on first load —
  // still fires and cleans up to the final state.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) cleanup();
  });

  function decode() {
    return new Promise((resolve) => {
      let frame = 0;
      render(0);                                       // first paint = scrambled, not real
      decodeLines.forEach((l) => l.classList.add('is-on', 'is-decoding'));
      decodeIntervalId = setInterval(() => {
        frame++;
        if (frame > maxFrame) {
          clearInterval(decodeIntervalId);
          decodeIntervalId = null;
          render(maxFrame + 1);
          decodeLines.forEach((l) => l.classList.remove('is-decoding'));
          resolve();
          return;
        }
        render(frame);
        lockSettled(frame);
      }, TICK_MS);
    });
  }

  (async () => {
    try {
      await decode();
      await waveLogo();
    } finally {
      if (failsafeId !== null) { clearTimeout(failsafeId); failsafeId = null; }
      root.classList.remove('about-booting');
    }
  })();
});
