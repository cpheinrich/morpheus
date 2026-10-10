/** HTML/JS for the QA comments overlay — no Comment/Interact mode. */
export function pageHtml(opts) {
    const preview = JSON.stringify(opts.previewUrl);
    const streamPath = JSON.stringify(opts.streamPath);
    const axPath = JSON.stringify(opts.axPath);
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
  .placement-preview { border: 1px solid #3c4043; border-radius: 8px; padding: 6px; font-size: 11px; color: #c4c7c5; }
  .placement-preview img { display: block; max-width: 100%; max-height: 180px; margin: 5px auto 0; }
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
      <div class="placement-preview" id="placementPreview" hidden><span id="placementLabel"></span><img id="placementImage" alt="Captured placement screen"/></div>
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
  const axPath = ${axPath};
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

  /** @type {{id:string, n:number, normX:number, normY:number, text:string, createdAt:string, screenId?:string, axAnchor?:object, frame?:object, displayX?:number, displayY?:number}[]} */
  let pins = [];
  const frameMemory = new Map();
  const pinScreenReads = new Map();
  const placementPreview = document.getElementById('placementPreview');
  const placementImage = document.getElementById('placementImage');
  const placementLabel = document.getElementById('placementLabel');
  function showPlacement(pin) {
    const frame = pin && frameMemory.get(pin.id);
    placementPreview.hidden = !frame?.dataUrl;
    if (frame?.dataUrl) {
      placementImage.src = frame.dataUrl;
      placementLabel.textContent = 'Captured pin ' + pin.n + ' · ' + (pin.screenId || 'screen ID unavailable');
    }
  }
  let frameDb = null;
  function openFrameDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (frameDb) return frameDb;
    frameDb = new Promise((resolve) => {
      const request = indexedDB.open('morpheus-qa-pin-frames', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('frames');
      request.onsuccess = () => {
        const db = request.result;
        resolve(db);
        const cursor = db.transaction('frames', 'readwrite').objectStore('frames').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          const capturedAt = Date.parse(row.value?.capturedAt || '');
          if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > 24 * 60 * 60 * 1000) {
            row.delete();
          }
          row.continue();
        };
      };
      request.onerror = () => resolve(null);
    });
    return frameDb;
  }
  async function storedFrame(id, value) {
    const db = await openFrameDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('frames', value === undefined ? 'readonly' : 'readwrite');
      const request = value === undefined
        ? tx.objectStore('frames').get(id)
        : value === null ? tx.objectStore('frames').delete(id) : tx.objectStore('frames').put(value, id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }
  let latestAx = null;
  let currentScreenId = null;
  function nearestAxAnchor(snapshot, normX, normY) {
    if (!snapshot || !snapshot.screen || !snapshot.elements) return null;
    const x = normX * snapshot.screen.width;
    const y = normY * snapshot.screen.height;
    let best = null;
    for (const e of snapshot.elements) {
      const r = e.frame;
      if (!r || r.width <= 0 || r.height <= 0) continue;
      const dx = Math.max(r.x - x, 0, x - r.x - r.width);
      const dy = Math.max(r.y - y, 0, y - r.y - r.height);
      const distance = Math.hypot(dx, dy);
      if (distance > 80) continue;
      const semantic = typeof e.id === 'string' && !/^\\d+(\\.\\d+)*$/.test(e.id);
      const score = distance * 10 + Math.sqrt(r.width * r.height) + (semantic ? 0 : 100);
      if (!best || score < best.score) best = { score, id: e.id, path: e.path, dx: x - r.x, dy: y - r.y };
    }
    return best ? { id: best.id, path: best.path, dx: best.dx, dy: best.dy } : null;
  }
  function stablePlacementAnchor(atClick, before, after, normX, normY) {
    if (!atClick?.screen || !before?.screen || !after?.screen ||
        Math.abs(atClick.screen.width - before.screen.width) > 1 ||
        Math.abs(atClick.screen.height - before.screen.height) > 1 ||
        Math.abs(before.screen.width - after.screen.width) > 1 ||
        Math.abs(before.screen.height - after.screen.height) > 1) {
      throw new Error('Screen size changed during placement');
    }
    const clicked = nearestAxAnchor(atClick, normX, normY);
    const first = nearestAxAnchor(before, normX, normY);
    const last = nearestAxAnchor(after, normX, normY);
    const same = (a, b) => (!a && !b) || (a && b && a.id === b.id &&
      Math.abs(a.dx - b.dx) <= 2 && Math.abs(a.dy - b.dy) <= 2);
    if (!same(clicked, first) || !same(first, last)) {
      throw new Error('Content moved during placement capture');
    }
    return first || undefined;
  }
  function updatePinPositions() {
    if (!latestAx || !latestAx.screen) return;
    const w = latestAx.screen.width;
    const h = latestAx.screen.height;
    for (const p of pins) {
      if (p.screenId && p.screenId !== currentScreenId) {
        p.displayX = -1;
        p.displayY = -1;
        continue;
      }
      if (!p.axAnchor) {
        p.displayX = p.normX;
        p.displayY = p.normY;
        continue;
      }
      const e = latestAx.elements.find((item) => item.id === p.axAnchor.id && item.path === p.axAnchor.path)
        || latestAx.elements.find((item) => item.id === p.axAnchor.id);
      if (!e) {
        p.displayX = -1;
        p.displayY = -1;
        continue;
      }
      p.displayX = (e.frame.x + p.axAnchor.dx) / w;
      p.displayY = (e.frame.y + p.axAnchor.dy) / h;
    }
    renderPins();
  }
  if (axPath) {
    const axStream = new EventSource(axPath);
    const clearAx = () => {
      latestAx = null;
      currentScreenId = null;
      for (const pin of pins) {
        pin.displayX = -1;
        pin.displayY = -1;
      }
      renderPins();
    };
    axStream.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data);
        if (!snapshot.screen || !Array.isArray(snapshot.elements) || snapshot.errors?.length) {
          clearAx();
          return;
        }
        latestAx = snapshot;
        currentScreenId = typeof snapshot.screenId === 'string' ? snapshot.screenId : null;
        updatePinPositions();
      } catch (_) { clearAx(); }
    };
    axStream.onerror = clearAx;
  }
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
        pins: pins.map(({ displayX, displayY, ...p }) => p),
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
    pins = usable.map((p) => ({
      ...p,
      ...(axPath && p.screenId ? { displayX: -1, displayY: -1 } : {}),
    }));
    for (const pin of pins) {
      void storedFrame(pin.id).then((frame) => {
        if (!pins.includes(pin)) return;
        if (frame) frameMemory.set(pin.id, frame);
        if (focusedId === pin.id) showPlacement(pin);
        updatePinPositions();
      });
    }
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
      const x = p.displayX ?? p.normX;
      const y = p.displayY ?? p.normY;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const el = document.createElement('div');
      el.className = 'pin' + (p.id === focusedId ? ' focused' : '');
      el.textContent = String(p.n);
      el.style.left = (originX + x * boxW) + 'px';
      el.style.top = (originY + y * boxH) + 'px';
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
    showPlacement(p);
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
    frameMemory.delete(p.id);
    void storedFrame(p.id, null);
    focusedId = null;
    textEl.value = '';
    textEl.disabled = true;
    showPlacement(null);
    setStatus('Deleted pin ' + p.n);
    renderList();
    renderPins();
    persist();
  }

  function placePin(normX, normY) {
    const frame = axPath ? null : captureFrame();
    const screenIdAtClick = currentScreenId;
    const axAtClick = latestAx;
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const pin = {
      id,
      n: nextN++,
      normX,
      normY,
      text: '',
      createdAt: new Date().toISOString(),
      frame: frame ? { width: frame.width, height: frame.height, capturedAt: frame.capturedAt } : undefined,
    };
    if (frame) {
      frameMemory.set(id, frame);
      void storedFrame(id, frame);
    }
    pins.push(pin);
    focusedId = id;
    textEl.disabled = false;
    textEl.value = '';
    textEl.focus();
    showPlacement(pin);
    setStatus(axPath ? 'Capturing pin ' + pin.n + ' from the simulator…'
      : frame ? 'Pin ' + pin.n + ' placed — type a comment, Enter to save'
        : 'Placement image unavailable. Wait for the stream, then replace this pin.', axPath || frame ? undefined : 'err');
    renderList();
    renderPins();
    persist();
    if (axPath) {
      const read = fetch('/api/placement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Placement capture unavailable');
        if (!pins.includes(pin)) return;
        if (!screenIdAtClick || result.screenId !== screenIdAtClick) {
          throw new Error('Screen changed during placement');
        }
        const anchor = stablePlacementAnchor(axAtClick, result.beforeSnapshot, result.snapshot, normX, normY);
        pin.screenId = result.screenId;
        pin.axAnchor = anchor;
        pin.frame = { width: result.frame.width, height: result.frame.height, capturedAt: result.frame.capturedAt };
        frameMemory.set(id, result.frame);
        void storedFrame(id, result.frame);
        if (focusedId === id) {
          showPlacement(pin);
          setStatus('Pin ' + pin.n + ' captured · review its snapshot, then type your comment');
        }
        updatePinPositions();
        persist();
      }).catch((error) => {
        if (focusedId === id && pins.includes(pin)) setStatus(String(error.message || error) + '. Delete and replace this pin.', 'err');
      }).finally(() => pinScreenReads.delete(id));
      pinScreenReads.set(id, read);
    }
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
    void placePin(c.normX, c.normY);
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

  function captureFrame() {
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
        capturedAt: new Date().toISOString(),
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
    await Promise.all(ready.map((pin) => pinScreenReads.get(pin.id)));
    const frameInfo = await captureFrame();
    const comments = await Promise.all(ready.map(async (p) => {
      const savedFrame = frameMemory.get(p.id) || await storedFrame(p.id);
      return {
        id: 'c' + p.n,
        text: p.text.trim(),
        createdAt: p.createdAt,
        anchor: { normX: p.normX, normY: p.normY },
        ...(p.screenId ? { screenId: p.screenId } : {}),
        ...(p.frame ? { frame: { ...p.frame, ...(savedFrame ? { dataUrl: savedFrame.dataUrl } : {}) } } : {}),
      };
    }));
    if (comments.some((comment) => !comment.frame?.dataUrl)) {
      setStatus('A pin lost its placement image. Delete and place that pin again before sending.', 'err');
      sendBtn.disabled = false;
      return;
    }
    if (axPath && comments.some((comment) => !comment.screenId)) {
      setStatus('A pin has no screen ID. Wait for the simulator, then replace that pin before sending.', 'err');
      sendBtn.disabled = false;
      return;
    }
    const body = {
      preview: { url: previewUrl, kind: 'serve-sim' },
      comments,
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
      for (const p of pins) {
        frameMemory.delete(p.id);
        void storedFrame(p.id, null);
      }
      pins = [];
      nextN = 1;
      focusedId = null;
      textEl.value = '';
      textEl.disabled = true;
      showPlacement(null);
      forget();
      renderList();
      renderPins();
      setStatus('Queued ' + json.id + ' · ' + json.pendingCount + ' open batch(es). ' + (json.responderActive ? 'Background responder running.' : json.wakeConfigured ? 'Agent wake configured.' : 'No agent wake configured; message your agent to resume.'), 'ok');
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
//# sourceMappingURL=overlay-page.js.map