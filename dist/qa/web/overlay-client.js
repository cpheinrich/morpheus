/**
 * The script the web overlay injects into every page (MO-26-10-06-18.13.32). Plain ES5-style
 * JavaScript with no build step, kept free of backticks and template placeholders so it can live
 * here as a raw string; the server substitutes the project name. It renders into a shadow root on
 * <html>, outside React's tree, so hydration never sees it.
 *
 * Right-click (or Comment mode + click) pins a comment on the element under the pointer; the
 * anchor records a CSS path that resolved to exactly that element, the point within it, the page
 * point as a fraction of the whole page, and the scroll and viewport. Send captures the whole page
 * with modern-screenshot (served from /__qa/), excluding the overlay, and posts the batch; a failed
 * capture still sends, without a frame.
 */
export const WEB_OVERLAY_JS = String.raw `(function () {
  "use strict";
  if (window.__morpheusQa) return;
  var PROJECT = __MORPHEUS_QA_PROJECT__;
  var STORE = "morpheus-qa:" + location.pathname + location.search;

  // ---- pure helpers (exposed for tests) -------------------------------------------------------
  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function unique(selector) {
    try { return document.querySelectorAll(selector).length === 1; } catch (e) { return false; }
  }
  /** A CSS path that resolves to exactly this element: an id or test id when one is unique, else nth-of-type steps. */
  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    var steps = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id && unique("#" + cssEscape(node.id))) { steps.unshift("#" + cssEscape(node.id)); break; }
      var testId = node.getAttribute("data-testid");
      if (testId && unique("[data-testid=\"" + testId.replace(/"/g, "\\\"") + "\"]")) { steps.unshift("[data-testid=\"" + testId.replace(/"/g, "\\\"") + "\"]"); break; }
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { steps.unshift(tag); break; }
      var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
      steps.unshift(same.length > 1 ? tag + ":nth-of-type(" + (same.indexOf(node) + 1) + ")" : tag);
      if (unique(steps.join(" > "))) break;
      node = parent;
    }
    var selector = steps.join(" > ");
    return unique(selector) && document.querySelector(selector) === el ? selector : null;
  }
  function pageSize() {
    var d = document.documentElement, b = document.body;
    // Never zero: a document with no layout yet would make every fraction NaN.
    return {
      width: Math.max(d.scrollWidth, b ? b.scrollWidth : 0, d.clientWidth, window.innerWidth, 1),
      height: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.clientHeight, window.innerHeight, 1)
    };
  }
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  /** The anchor for a pin at viewport point (cx, cy) on element el. */
  function anchorFor(el, cx, cy) {
    var rect = el.getBoundingClientRect();
    var size = pageSize();
    var x = cx + window.scrollX, y = cy + window.scrollY;
    var text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    var anchor = {
      normX: clamp(x / size.width), normY: clamp(y / size.height), x: Math.round(x), y: Math.round(y),
      page: {
        url: location.href, title: document.title || undefined, scrollX: Math.round(window.scrollX), scrollY: Math.round(window.scrollY),
        viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, pageWidth: size.width, pageHeight: size.height
      }
    };
    var selector = cssPath(el);
    if (selector) {
      anchor.element = {
        selector: selector, tag: el.tagName.toLowerCase(),
        offsetX: clamp(rect.width ? (cx - rect.left) / rect.width : 0), offsetY: clamp(rect.height ? (cy - rect.top) / rect.height : 0)
      };
      if (text) anchor.element.text = text;
    }
    if (!anchor.page.title) delete anchor.page.title;
    return anchor;
  }

  // ---- UI ---------------------------------------------------------------------------------------
  var host = document.createElement("morpheus-qa");
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    ".bar{position:fixed;right:16px;bottom:16px;width:300px;max-height:60vh;display:flex;flex-direction:column;gap:8px;padding:12px;" +
    "background:#171918;color:#f2f0e9;border:1px solid rgba(242,240,233,.2);border-radius:8px;font:12px/1.4 -apple-system,system-ui,sans-serif;pointer-events:auto;box-shadow:0 8px 30px rgba(0,0,0,.35)}" +
    ".row{display:flex;gap:8px;align-items:center}.grow{flex:1}" +
    "button{font:inherit;color:inherit;background:rgba(242,240,233,.1);border:1px solid rgba(242,240,233,.25);border-radius:5px;padding:5px 9px;cursor:pointer}" +
    "button.on{background:#a8c4bb;color:#171918;border-color:#a8c4bb}button:disabled{opacity:.5;cursor:default}" +
    ".list{overflow:auto;display:flex;flex-direction:column;gap:6px}" +
    ".item{display:flex;gap:6px;align-items:flex-start}.num{min-width:18px;height:18px;border-radius:9px;background:#e4572e;color:#fff;font-weight:600;display:flex;align-items:center;justify-content:center;font-size:11px}" +
    "textarea{flex:1;min-height:34px;resize:vertical;font:inherit;color:#171918;background:#f2f0e9;border:0;border-radius:4px;padding:4px 6px}" +
    ".x{padding:0 6px;line-height:18px}" +
    ".status{color:#9ba6a2;min-height:16px}.hint{color:#9ba6a2}" +
    ".pin{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:11px;background:#e4572e;color:#fff;border:2px solid #fff;font:600 11px/18px -apple-system,system-ui,sans-serif;text-align:center;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4)}" +
    ".hl{position:fixed;border:2px solid #e4572e;background:rgba(228,87,46,.08);pointer-events:none;display:none;border-radius:2px}" +
    ".min .list,.min .hint{display:none}" +
    "</style>" +
    "<div class=hl></div><div class=pins></div>" +
    "<div class=bar><div class=row><strong class=grow>QA comments · " + String(PROJECT).replace(/[<&]/g, "") + "</strong><button class=min-toggle title='Collapse'>–</button></div>" +
    "<div class=hint>Right-click anything to pin a comment, or turn on Comment and click. Enter saves, ⌘Enter sends, Esc leaves Comment.</div>" +
    "<div class=row><button class=mode>Comment</button><span class=grow></span><button class=send disabled>Send</button></div>" +
    "<div class=list></div><div class=status></div></div>";
  var bar = root.querySelector(".bar"), list = root.querySelector(".list"), pinsLayer = root.querySelector(".pins");
  var hl = root.querySelector(".hl"), modeBtn = root.querySelector(".mode"), sendBtn = root.querySelector(".send"), statusEl = root.querySelector(".status");
  var pins = [], commenting = false, sending = false;

  function setStatus(text) { statusEl.textContent = text || ""; }
  function save() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(pins.map(function (p) { return { anchor: p.anchor, text: p.text }; })));
    } catch (e) { /* storage may be unavailable */ }
  }
  function position(p) {
    var x, y;
    var el = p.el && p.el.isConnected ? p.el : (p.anchor.element ? document.querySelector(p.anchor.element.selector) : null);
    if (el) {
      p.el = el;
      var r = el.getBoundingClientRect();
      x = r.left + r.width * p.anchor.element.offsetX; y = r.top + r.height * p.anchor.element.offsetY;
    } else { x = p.anchor.x - window.scrollX; y = p.anchor.y - window.scrollY; }
    p.marker.style.left = x + "px"; p.marker.style.top = y + "px";
  }
  function render() {
    list.textContent = "";
    pinsLayer.textContent = "";
    pins.forEach(function (p, i) {
      var marker = document.createElement("div");
      marker.className = "pin"; marker.textContent = String(i + 1); marker.title = p.text || "";
      marker.addEventListener("click", function () { p.box && p.box.focus(); });
      p.marker = marker; pinsLayer.appendChild(marker); position(p);
      var item = document.createElement("div"); item.className = "item";
      var num = document.createElement("div"); num.className = "num"; num.textContent = String(i + 1);
      var box = document.createElement("textarea"); box.value = p.text || ""; box.placeholder = "Comment for pin " + (i + 1);
      box.addEventListener("input", function () { p.text = box.value; save(); refresh(); });
      box.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); box.blur(); }
      });
      var del = document.createElement("button"); del.className = "x"; del.textContent = "×"; del.title = "Delete pin";
      del.addEventListener("click", function () { pins.splice(pins.indexOf(p), 1); save(); render(); });
      p.box = box; item.appendChild(num); item.appendChild(box); item.appendChild(del); list.appendChild(item);
    });
    refresh();
  }
  function refresh() {
    var ready = pins.filter(function (p) { return (p.text || "").trim(); }).length;
    sendBtn.disabled = sending || ready === 0;
    sendBtn.textContent = ready ? "Send " + ready : "Send";
  }
  function addPin(el, cx, cy) {
    var p = { el: el, anchor: anchorFor(el, cx, cy), text: "" };
    pins.push(p); save(); render(); p.box.focus();
  }
  function ours(target) { return target === host || (target && target.closest && target.closest("morpheus-qa")); }
  function targetAt(cx, cy) {
    host.style.display = "none";
    var el = document.elementFromPoint(cx, cy);
    host.style.display = "";
    return el;
  }
  function setMode(on) {
    commenting = on; modeBtn.classList.toggle("on", on); document.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hl.style.display = "none";
  }

  document.addEventListener("contextmenu", function (e) {
    if (ours(e.target) || e.shiftKey) return; // Shift+right-click keeps the browser's own menu.
    e.preventDefault(); e.stopPropagation();
    var el = targetAt(e.clientX, e.clientY); if (el) addPin(el, e.clientX, e.clientY);
  }, true);
  document.addEventListener("click", function (e) {
    if (!commenting || ours(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    var el = targetAt(e.clientX, e.clientY); if (el) addPin(el, e.clientX, e.clientY);
  }, true);
  document.addEventListener("mousemove", function (e) {
    if (!commenting) return;
    var el = targetAt(e.clientX, e.clientY);
    if (!el) { hl.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    hl.style.display = "block"; hl.style.left = r.left + "px"; hl.style.top = r.top + "px"; hl.style.width = r.width + "px"; hl.style.height = r.height + "px";
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && commenting) setMode(false);
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && pins.length) { e.preventDefault(); send(); }
  }, true);
  modeBtn.addEventListener("click", function () { setMode(!commenting); });
  sendBtn.addEventListener("click", function () { send(); });
  root.querySelector(".min-toggle").addEventListener("click", function () { bar.classList.toggle("min"); });
  var raf = 0;
  function follow() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; pins.forEach(position); }); }
  window.addEventListener("scroll", follow, true); window.addEventListener("resize", follow);
  new MutationObserver(follow).observe(document.documentElement, { subtree: true, childList: true, attributes: true });

  function loadLibrary() {
    if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script"); s.src = "/__qa/modern-screenshot.js";
      s.onload = function () { window.modernScreenshot ? resolve(window.modernScreenshot) : reject(new Error("capture library missing")); };
      s.onerror = function () { reject(new Error("capture library failed to load")); };
      document.head.appendChild(s);
    });
  }
  function absolutize(css, base) {
    return css.replace(/url\((['"]?)([^'")]+)\1\)/g, function (m, q, u) {
      if (/^(data:|https?:|blob:)/.test(u)) return m;
      try { return "url(" + q + new URL(u, base).href + q + ")"; } catch (e) { return m; }
    });
  }
  /**
   * The @font-face rules of every stylesheet the page cannot read through the CSSOM (Google Fonts,
   * a CDN). The capture library inlines fonts only from readable sheets, so without these the image
   * falls back to another font and text reflows — found on the Lakina page, where the heading
   * wrapped onto the tagline. Font hosts serve their CSS with CORS, so it is fetched directly.
   */
  function crossOriginFaces() {
    var tasks = Array.prototype.map.call(document.styleSheets, function (sheet) {
      try { void sheet.cssRules; return Promise.resolve(""); } catch (e) { /* unreadable: fetch it */ }
      if (!sheet.href) return Promise.resolve("");
      return fetch(sheet.href, { mode: "cors", credentials: "omit" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (text) { return absolutize((text.match(/@font-face\s*\{[^}]*\}/g) || []).join("\n"), sheet.href); })
        .catch(function () { return ""; });
    });
    return Promise.all(tasks).then(function (parts) { return parts.join("\n").trim(); });
  }
  /** The whole page as a PNG, overlay excluded. Never blocks Send: a failed capture sends without a frame. */
  function capture() {
    var size = pageSize();
    // Readable for the duration of the capture only: the same rules the page already loaded, as a
    // same-origin sheet the library can read and inline. Removed whatever happens.
    var faces = null;
    var work = Promise.all([loadLibrary(), crossOriginFaces(), document.fonts ? document.fonts.ready : null]).then(function (loaded) {
      if (loaded[1]) {
        faces = document.createElement("style");
        faces.setAttribute("data-morpheus-qa", "fonts");
        faces.textContent = loaded[1];
        document.head.appendChild(faces);
      }
      return loaded[0].domToPng(document.documentElement, {
        width: size.width, height: size.height, scale: 1,
        filter: function (node) { return node !== host && node !== faces; }
      });
    }).then(function (dataUrl) {
      if (faces) faces.remove();
      return dataUrl;
    }, function (error) {
      if (faces) faces.remove();
      throw error;
    }).then(function (dataUrl) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve({ dataUrl: dataUrl, width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = function () { resolve(null); };
        img.src = dataUrl;
      });
    });
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 20000); });
    return Promise.race([work, timeout]).catch(function () { return null; });
  }
  function send() {
    var ready = pins.filter(function (p) { return (p.text || "").trim(); });
    if (!ready.length || sending) return;
    sending = true; refresh(); setStatus("Capturing the page…");
    capture().then(function (frame) {
      setStatus("Sending…");
      var now = new Date().toISOString();
      var body = {
        preview: { url: location.href, kind: "web", label: document.title || location.pathname },
        comments: ready.map(function (p, i) { return { id: "c" + (i + 1), text: p.text.trim(), createdAt: now, anchor: p.anchor }; })
      };
      if (frame) body.frame = { width: frame.width, height: frame.height, capturedAt: now, dataUrl: frame.dataUrl };
      return fetch("/__qa/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return [j, frame]; }); });
    }).then(function (result) {
      pins = pins.filter(function (p) { return ready.indexOf(p) < 0; }); save(); render();
      setStatus("Sent " + result[0].id + (result[1] ? "" : " (no page image: capture failed)") + " → local/qa-comments/pending/");
    }).catch(function (e) { setStatus("Send failed: " + e.message + ". Pins kept."); })
      .then(function () { sending = false; refresh(); });
  }

  function mount() {
    (document.documentElement || document).appendChild(host);
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORE) || "[]");
      pins = saved.map(function (s) { return { el: null, anchor: s.anchor, text: s.text }; });
    } catch (e) { pins = []; }
    render();
  }
  window.__morpheusQa = { cssPath: cssPath, anchorFor: anchorFor, pins: function () { return pins; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
`;
//# sourceMappingURL=overlay-client.js.map