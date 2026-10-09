/** HTML/JS for the QA comments overlay — no Comment/Interact mode. */

export function pageHtml(opts: {
  previewUrl: string;
  streamPath: string | null;
  project: string;
}): string {
  const preview = JSON.stringify(opts.previewUrl);
  const streamPath = JSON.stringify(opts.streamPath);
  const project = JSON.stringify(opts.project);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Morpheus QA comments — ${opts.project}</title>
<style>
  :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0d10; color: #e8eaed; height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #22262c; background: #12151a; }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; flex: 1; }
  header .hint-top { font-size: 12px; color: #c4c7c5; text-align: right; max-width: 420px; line-height: 1.35; }
  .btn { appearance: none; border: 1px solid #3c4043; background: #1e2228; color: #e8eaed; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
  .btn:hover { background: #2a2f36; }
  .btn.primary { background: #8ab4f8; color: #0b0d10; border-color: #8ab4f8; font-weight: 600; }
  .btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
  main { flex: 1; display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
  .stage-wrap { position: relative; background: #12151a; min-height: 0; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 16px; }
  /* Pixel size is set in JS so the hit box matches the contained picture. */
  .stage { position: relative; touch-action: none; flex: 0 0 auto; width: 390px; height: 844px; outline: none; }
  .stage img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; background: #12151a; user-select: none; }
  .pins { position: absolute; inset: 0; pointer-events: none; }
  .pin { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%; background: #fdd663; color: #0b0d10; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px #0b0d10; cursor: pointer; z-index: 2; pointer-events: auto; }
  .pin.focused { outline: 2px solid #8ab4f8; outline-offset: 2px; }
  aside { border-left: 1px solid #22262c; background: #12151a; display: flex; flex-direction: column; min-height: 0; }
  aside h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #9aa0a6; margin: 12px 14px 6px; }
  #list { list-style: none; margin: 0; padding: 0 10px; overflow: auto; flex: 1; }
  #list li { background: #1e2228; border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 13px; cursor: pointer; }
  #list li.focused { outline: 1px solid #8ab4f8; }
  #list li .idx { color: #fdd663; font-weight: 700; margin-right: 6px; }
  #list li .empty { color: #9aa0a6; font-style: italic; }
  .composer { padding: 12px; border-top: 1px solid #22262c; display: flex; flex-direction: column; gap: 8px; }
  textarea { width: 100%; min-height: 88px; resize: vertical; border-radius: 8px; border: 1px solid #3c4043; background: #0b0d10; color: #e8eaed; padding: 8px; font: inherit; }
  textarea:disabled { opacity: 0.5; }
  .row { display: flex; gap: 8px; }
  .row .btn { flex: 1; }
  #status { font-size: 12px; color: #9aa0a6; min-height: 1.2em; }
  #status.ok { color: #81c995; }
  #status.err { color: #f28b82; }
  .shortcut-hint { font-size: 11px; color: #9aa0a6; }
  .missing { color: #f28b82; padding: 24px; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>QA comments · <span id="projectLabel"></span></h1>
  <div class="hint-top">Right click to add comment. Press Esc twice to Delete</div>
</header>
<main>
  <div class="stage-wrap">
    <div class="stage" id="stage" tabindex="0">
      <img id="stream" alt="simulator stream" draggable="false"/>
      <div class="pins" id="pins"></div>
      <div class="missing" id="missing" hidden>No MJPEG stream — pass --stream-url or start serve-sim first.</div>
    </div>
  </div>
  <aside>
    <h2>Comments</h2>
    <ul id="list"></ul>
    <div class="composer">
      <div id="status">Right-click the frame to place a pin</div>
      <textarea id="text" placeholder="Comment for this pin… (Enter to save, Shift+Enter newline)" disabled></textarea>
      <div class="shortcut-hint">Enter saves pin · Shift+Enter newline · ⌘Enter / Ctrl+Enter sends batch</div>
      <div class="row">
        <button class="btn primary" id="send" type="button" disabled>Send batch</button>
      </div>
    </div>
  </aside>
</main>
<script>
(() => {
  const previewUrl = ${preview};
  const streamPath = ${streamPath};
  const project = ${project};
  document.getElementById('projectLabel').textContent = project;

  const stream = document.getElementById('stream');
  const pinsEl = document.getElementById('pins');
  const stage = document.getElementById('stage');
  const missing = document.getElementById('missing');
  const listEl = document.getElementById('list');
  const textEl = document.getElementById('text');
  const sendBtn = document.getElementById('send');
  const status = document.getElementById('status');

  if (streamPath) {
    stream.src = streamPath;
  } else {
    stream.hidden = true;
    missing.hidden = false;
  }

  const stageWrap = document.querySelector('.stage-wrap');

  // Contain-fit in pixels. The stage box is the picture, so taps are not
  // swallowed by a CSS-sized wrapper or by letterboxing inside it.
  function layoutStream() {
    if (!stageWrap) return;
    const wrap = stageWrap.getBoundingClientRect();
    const style = getComputedStyle(stageWrap);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const availW = wrap.width - padX;
    const availH = wrap.height - padY;
    const nw = stream.naturalWidth || 390;
    const nh = stream.naturalHeight || 844;
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.min(availW / nw, availH / nh);
    stage.style.width = Math.max(1, Math.floor(nw * scale)) + 'px';
    stage.style.height = Math.max(1, Math.floor(nh * scale)) + 'px';
    requestAnimationFrame(renderPins);
  }

  /** @type {{id:string, n:number, normX:number, normY:number, text:string, createdAt:string}[]} */
  let pins = [];
  let focusedId = null;
  let escArmedAt = 0;
  let nextN = 1;

  // Unsent pins and the draft being typed outlive a page reload, a server
  // restart or a simulator relaunch: they live in sessionStorage until Send
  // succeeds or the tab is closed.
  const storageKey = 'morpheus-qa-comments:' + project + ':' + previewUrl;
  function persist() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        pins,
        nextN,
        focusedId,
        draft: textEl.disabled ? null : textEl.value,
      }));
    } catch (_) {}
  }
  function forget() {
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
  }
  function restore() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) {}
    if (!saved || !Array.isArray(saved.pins) || saved.pins.length === 0) return false;
    const usable = saved.pins
      .filter((p) => p && typeof p.id === 'string' && Number.isInteger(p.n) && p.n > 0
        && typeof p.normX === 'number' && typeof p.normY === 'number')
      .map((p) => ({ ...p, text: typeof p.text === 'string' ? p.text : '', createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString() }));
    if (usable.length === 0) {
      forget();
      return false;
    }
    pins = usable;
    const highest = Math.max(...pins.map((p) => p.n));
    nextN = Number.isInteger(saved.nextN) && saved.nextN > highest ? saved.nextN : highest + 1;
    if (typeof saved.focusedId === 'string' && pins.some((p) => p.id === saved.focusedId)) {
      focusedId = saved.focusedId;
      textEl.disabled = false;
      textEl.value = typeof saved.draft === 'string' ? saved.draft : (pins.find((p) => p.id === focusedId)?.text ?? '');
    }
    return true;
  }
  let dragging = false;
  let pointerSent = false;
  let lastCoords = null;

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = kind || '';
  }

  function focused() {
    return pins.find((p) => p.id === focusedId) || null;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderList() {
    listEl.innerHTML = '';
    pins.forEach((p) => {
      const li = document.createElement('li');
      if (p.id === focusedId) li.classList.add('focused');
      const body = p.text.trim()
        ? escapeHtml(p.text)
        : '<span class="empty">(no text yet)</span>';
      li.innerHTML = '<span class="idx">' + p.n + '</span>' + body;
      li.onclick = () => focusPin(p.id);
      listEl.appendChild(li);
    });
    sendBtn.disabled = !pins.some((p) => p.text.trim());
  }

  function renderPins() {
    pinsEl.innerHTML = '';
    const box = contentBox();
    const stageRect = stage.getBoundingClientRect();
    const originX = box ? box.left - stageRect.left : 0;
    const originY = box ? box.top - stageRect.top : 0;
    const boxW = box ? box.width : 0;
    const boxH = box ? box.height : 0;
    pins.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'pin' + (p.id === focusedId ? ' focused' : '');
      el.textContent = String(p.n);
      el.style.left = (originX + p.normX * boxW) + 'px';
      el.style.top = (originY + p.normY * boxH) + 'px';
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
      });
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        focusPin(p.id);
      });
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        focusPin(p.id);
      });
      pinsEl.appendChild(el);
    });
  }

  function focusPin(id) {
    const p = pins.find((x) => x.id === id);
    if (!p) return;
    focusedId = id;
    textEl.disabled = false;
    textEl.value = p.text;
    textEl.focus();
    setStatus('Editing pin ' + p.n + ' — Enter saves, Esc Esc deletes');
    renderList();
    renderPins();
    persist();
  }

  function saveOpenPin() {
    const p = focused();
    if (!p) return;
    p.text = textEl.value;
    renderList();
    persist();
    setStatus('Saved pin ' + p.n + (p.text.trim() ? '' : ' (empty)'), 'ok');
  }

  function deleteFocusedPin() {
    const p = focused();
    if (!p) return;
    pins = pins.filter((x) => x.id !== p.id);
    focusedId = null;
    textEl.value = '';
    textEl.disabled = true;
    setStatus('Deleted pin ' + p.n);
    renderList();
    renderPins();
    persist();
  }

  function placePin(normX, normY) {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const pin = {
      id,
      n: nextN++,
      normX,
      normY,
      text: '',
      createdAt: new Date().toISOString(),
    };
    pins.push(pin);
    focusedId = id;
    textEl.disabled = false;
    textEl.value = '';
    textEl.focus();
    setStatus('Pin ' + pin.n + ' placed — type a comment, Enter to save');
    renderList();
    renderPins();
    persist();
  }

  // Picture rect inside the stage after object-fit: contain (no letterbox when aspects match).
  function contentBox() {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nw = stream.naturalWidth;
    const nh = stream.naturalHeight;
    if (!nw || !nh) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    const scale = Math.min(rect.width / nw, rect.height / nh);
    const width = nw * scale;
    const height = nh * scale;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height,
    };
  }

  function coordsFromEvent(ev) {
    const box = contentBox();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const x = ev.clientX - box.left;
    const y = ev.clientY - box.top;
    if (x < -0.5 || y < -0.5 || x > box.width + 0.5 || y > box.height + 0.5) return null;
    return {
      normX: Math.min(1, Math.max(0, x / box.width)),
      normY: Math.min(1, Math.max(0, y / box.height)),
    };
  }

  let simFocused = false;
  const heldKeys = new Set();

  function commentEditorFocused() {
    return document.activeElement === textEl;
  }

  textEl.addEventListener('focus', () => { simFocused = false; });
  textEl.addEventListener('input', persist);
  document.querySelector('aside')?.addEventListener('pointerdown', () => { simFocused = false; });

  async function sendKey(type, code) {
    try {
      await fetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, code }),
      });
    } catch (err) {
      console.warn('key failed', err);
    }
  }

  function forwardKey(ev, type) {
    if (!simFocused || commentEditorFocused()) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (!ev.code) return;
    ev.preventDefault();
    if (type === 'down') heldKeys.add(ev.code);
    else heldKeys.delete(ev.code);
    void sendKey(type, ev.code);
  }

  // One ordered chain: a begin must reach the server before its end, and
  // parallel fetches do not promise that.
  let touchChain = Promise.resolve();
  function sendTouch(type, normX, normY) {
    touchChain = touchChain
      .then(() =>
        fetch('/api/touch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, normX, normY }),
        }),
      )
      .then(() => undefined, (err) => { console.warn('touch failed', err); });
    return touchChain;
  }

  // Right-click → pin (do not forward as a touch)
  stage.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (ev.target && ev.target.classList && ev.target.classList.contains('pin')) return;
    const c = coordsFromEvent(ev);
    if (!c) return;
    placePin(c.normX, c.normY);
  });

  // Left pointer on the picture → drive the simulator via HID.
  // Pin layer is pointer-events: none, so empty-frame clicks hit the image and bubble here.
  // Send the touch before setPointerCapture: a capture failure must not drop the tap.
  // Below this, pointer jitter must not become a drag (iOS won't fire the control).
  const TAP_SLOP = 0.012;
  let downCoords = null;
  let dragged = false;
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (ev.target && ev.target.classList && ev.target.classList.contains('pin')) return;
    const c = coordsFromEvent(ev);
    if (!c) return;
    dragging = true;
    dragged = false;
    pointerSent = true;
    lastCoords = c;
    downCoords = c;
    simFocused = true;
    escArmedAt = 0;
    try { stage.focus({ preventScroll: true }); } catch (_) {}
    void sendTouch('begin', c.normX, c.normY);
    try { stage.setPointerCapture(ev.pointerId); } catch (_) {}
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!dragging || !downCoords) return;
    const c = coordsFromEvent(ev);
    if (!c) return;
    lastCoords = c;
    const dx = c.normX - downCoords.normX;
    const dy = c.normY - downCoords.normY;
    if (!dragged && Math.hypot(dx, dy) < TAP_SLOP) return;
    dragged = true;
    void sendTouch('move', c.normX, c.normY);
  });
  function endPointer(ev) {
    if (!dragging) return;
    dragging = false;
    const c = (ev && coordsFromEvent(ev)) || lastCoords;
    if (c) void sendTouch('end', c.normX, c.normY);
    if (ev) {
      try { stage.releasePointerCapture(ev.pointerId); } catch (_) {}
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  textEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    if (ev.metaKey || ev.ctrlKey) return; // send batch
    if (ev.shiftKey) return; // newline
    ev.preventDefault();
    saveOpenPin();
  });

  window.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      if (sendBtn.disabled) return;
      ev.preventDefault();
      void sendBatch();
      return;
    }
    if (ev.key === 'Escape' && (commentEditorFocused() || (escArmedAt && focused() && !simFocused))) {
      const now = Date.now();
      if (escArmedAt && now - escArmedAt < 1000 && focused()) {
        ev.preventDefault();
        deleteFocusedPin();
        escArmedAt = 0;
        return;
      }
      escArmedAt = now;
      // First Esc: leave the text field (keep pin + text as currently typed)
      if (document.activeElement === textEl) {
        saveOpenPin();
        textEl.blur();
        setStatus('Press Esc again to delete pin ' + (focused()?.n ?? ''));
      }
      return;
    }
    forwardKey(ev, 'down');
  });
  window.addEventListener('keyup', (ev) => {
    if (!heldKeys.has(ev.code)) return;
    heldKeys.delete(ev.code);
    ev.preventDefault();
    void sendKey('up', ev.code);
  });

  async function captureFrame() {
    if (stream.hidden || !stream.naturalWidth) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = stream.naturalWidth;
      canvas.height = stream.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(stream, 0, 0);
      return {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      };
    } catch (err) {
      console.warn('frame capture failed', err);
      return null;
    }
  }

  async function sendBatch() {
    saveOpenPin();
    const ready = pins.filter((p) => p.text.trim());
    if (ready.length === 0) return;
    sendBtn.disabled = true;
    setStatus('Sending…');
    const frameInfo = await captureFrame();
    const body = {
      preview: { url: previewUrl, kind: 'serve-sim' },
      comments: ready.map((p) => ({
        id: 'c' + p.n,
        text: p.text.trim(),
        createdAt: p.createdAt,
        anchor: { normX: p.normX, normY: p.normY },
      })),
      frame: frameInfo
        ? { path: 'frame.png', width: frameInfo.width, height: frameInfo.height, dataUrl: frameInfo.dataUrl }
        : stream.naturalWidth
          ? { width: stream.naturalWidth, height: stream.naturalHeight }
          : { width: 390, height: 844 },
    };
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      pins = [];
      nextN = 1;
      focusedId = null;
      textEl.value = '';
      textEl.disabled = true;
      forget();
      renderList();
      renderPins();
      setStatus('Queued ' + json.id + ' · ' + json.pendingCount + ' open batch(es). ' + (json.wakeConfigured ? 'Agent wake configured.' : 'No agent wake configured; message your agent to resume.'), 'ok');
    } catch (err) {
      setStatus(String(err.message || err), 'err');
      sendBtn.disabled = !pins.some((p) => p.text.trim());
    }
  }

  sendBtn.onclick = () => { void sendBatch(); };
  if (restore()) {
    renderList();
    renderPins();
    setStatus('Restored ' + pins.length + ' unsent pin' + (pins.length === 1 ? '' : 's') + ' from before the reload');
  }
  window.addEventListener('resize', () => requestAnimationFrame(layoutStream));
  stream.addEventListener('load', () => requestAnimationFrame(layoutStream));
  if (stageWrap && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => layoutStream()).observe(stageWrap);
  }
  layoutStream();
  // MJPEG often gains naturalWidth without another load event.
  let sizeWatch = 0;
  const sizeTimer = setInterval(() => {
    sizeWatch += 1;
    layoutStream();
    if ((stream.naturalWidth && stream.naturalHeight) || sizeWatch > 40) clearInterval(sizeTimer);
  }, 150);
})();
</script>
</body>
</html>`;
}
