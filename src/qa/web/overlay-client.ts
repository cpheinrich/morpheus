/**
 * The web overlay's script (MO-26-10-06-18.13.32, column layout MO-26-10-07-13.27.17). Plain
 * ES5-style JavaScript with no build step, kept free of backticks and template placeholders so it
 * can live here as a raw string; the server substitutes the project name.
 *
 * Layout. A top-level page request gets the overlay's shell (`shellHtml` in server.ts): the site in
 * a same-origin frame on the left and a full-height comment column on the right, the same shape as
 * the iOS overlay. The site therefore has a genuinely narrower viewport, so its fixed elements and
 * media queries behave. The script runs in three places:
 *
 * - **Shell** (`window.__morpheusQaShell`): draws the column and drives the framed site's document.
 * - **Framed site**: the proxy injects the script into every HTML page; inside the shell's frame it
 *   does nothing, because the shell drives it.
 * - **Inline fallback**: a top-level page that reached the site without the shell (a browser that
 *   sends no Sec-Fetch-Dest) gets the same column fixed on the right of its own document.
 *
 * Theme. The column takes the site's own computed background, text colour and font, and switches
 * with it (light, dark, or a theme toggle), so it reads as part of whichever product it sits on.
 *
 * Pins. Right-click (or Comment mode + click) pins a comment on the element under the pointer; the
 * anchor records a CSS path that resolved to exactly that element, the point within it, the page
 * point as a fraction of the whole page, and the scroll and viewport. Send captures the whole page
 * with modern-screenshot (loaded into the site's own window), and posts the batch; a failed capture
 * still sends, without a frame.
 */
export const WEB_OVERLAY_JS = String.raw`(function () {
  "use strict";
  if (window.__morpheusQa) return;
  var PROJECT = __MORPHEUS_QA_PROJECT__;
  var COLUMN = 340;

  // A document framed by a same-origin parent — the shell's frame, which the shell drives, or a
  // frame the site embeds itself — draws nothing. The shell never counts as framed, and neither does
  // a page whose parent is another origin (a tool showing the overlay in its own frame): those own
  // the column.
  var framed = false;
  if (!window.__morpheusQaShell) {
    try { framed = window.parent !== window && !!window.parent.document; } catch (e) { framed = false; }
  }
  if (framed) { window.__morpheusQa = { framed: true }; return; }
  var shell = !!window.__morpheusQaShell;

  // ---- pure helpers over a site document (exposed for tests) -----------------------------------
  function isElement(node) { return !!node && node.nodeType === 1; }
  function cssEscape(win, value) {
    return win.CSS && win.CSS.escape ? win.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function unique(doc, selector) {
    try { return doc.querySelectorAll(selector).length === 1; } catch (e) { return false; }
  }
  /** A CSS path that resolves to exactly this element: an id or test id when one is unique, else nth-of-type steps. */
  function cssPath(el) {
    if (!isElement(el)) return null;
    var doc = el.ownerDocument, win = doc.defaultView || window;
    var steps = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== doc.documentElement) {
      if (node.id && unique(doc, "#" + cssEscape(win, node.id))) { steps.unshift("#" + cssEscape(win, node.id)); break; }
      var testId = node.getAttribute("data-testid");
      if (testId && unique(doc, "[data-testid=\"" + testId.replace(/"/g, "\\\"") + "\"]")) { steps.unshift("[data-testid=\"" + testId.replace(/"/g, "\\\"") + "\"]"); break; }
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { steps.unshift(tag); break; }
      var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
      steps.unshift(same.length > 1 ? tag + ":nth-of-type(" + (same.indexOf(node) + 1) + ")" : tag);
      if (unique(doc, steps.join(" > "))) break;
      node = parent;
    }
    var selector = steps.join(" > ");
    return unique(doc, selector) && doc.querySelector(selector) === el ? selector : null;
  }
  function pageSize(win) {
    var d = win.document.documentElement, b = win.document.body;
    // Never zero: a document with no layout yet would make every fraction NaN.
    return {
      width: Math.max(d.scrollWidth, b ? b.scrollWidth : 0, d.clientWidth, win.innerWidth, 1),
      height: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.clientHeight, win.innerHeight, 1)
    };
  }
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  /** The anchor for a pin at the site viewport point (cx, cy) on element el. */
  function anchorFor(el, cx, cy) {
    var win = el.ownerDocument.defaultView || window;
    var rect = el.getBoundingClientRect();
    var size = pageSize(win);
    var x = cx + win.scrollX, y = cy + win.scrollY;
    var text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    var anchor = {
      normX: clamp(x / size.width), normY: clamp(y / size.height), x: Math.round(x), y: Math.round(y),
      page: {
        url: win.location.href, title: win.document.title || undefined, scrollX: Math.round(win.scrollX), scrollY: Math.round(win.scrollY),
        viewportWidth: win.innerWidth, viewportHeight: win.innerHeight, pageWidth: size.width, pageHeight: size.height
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
  /** "rgb(…)" or "rgba(…)" to [r, g, b, a]; null when unparseable. */
  function parseColor(value) {
    var m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(value || "");
    if (!m) return null;
    var a = m[4] === undefined ? 1 : (m[4].slice(-1) === "%" ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return [+m[1], +m[2], +m[3], a];
  }
  function luminance(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
  }
  /** The site's own surface, ink and type: the first opaque background up from body, its text colour and font. */
  function siteTheme(win) {
    var doc = win.document, bg = null, fg = null, font = "";
    var nodes = [doc.body, doc.documentElement];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue;
      var style = win.getComputedStyle(nodes[i]);
      var c = parseColor(style.backgroundColor);
      if (!bg && c && c[3] > 0.5) bg = c;
      if (!fg) fg = parseColor(style.color);
      if (!font) font = style.fontFamily;
    }
    if (!bg) bg = [255, 255, 255, 1];
    var dark = luminance(bg) < 0.4;
    if (!fg || Math.abs(luminance(fg) - luminance(bg)) < 0.3) fg = dark ? [240, 240, 240, 1] : [20, 20, 20, 1];
    return { bg: bg, fg: fg, dark: dark, font: font || "system-ui, -apple-system, sans-serif" };
  }
  function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")"; }

  // ---- the column -------------------------------------------------------------------------------
  var ui = document.createElement("morpheus-qa");
  ui.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  var root = ui.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    ".col{position:fixed;top:0;right:0;bottom:0;width:" + COLUMN + "px;display:flex;flex-direction:column;pointer-events:auto;" +
    "background:var(--qa-bg);color:var(--qa-fg);border-left:1px solid var(--qa-rule);font:13px/1.45 var(--qa-font);color-scheme:var(--qa-scheme)}" +
    "header{padding:14px 16px 12px;border-bottom:1px solid var(--qa-rule);display:flex;flex-direction:column;gap:8px}" +
    ".title{display:flex;align-items:center;gap:8px}.title strong{flex:1;font-weight:600;font-size:14px}" +
    ".hint{color:var(--qa-muted);font-size:12px}" +
    "h2{margin:12px 16px 6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--qa-muted)}" +
    "ol{list-style:none;margin:0;padding:0 12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:8px}" +
    "li{display:flex;gap:8px;align-items:flex-start;padding:10px;border:1px solid var(--qa-rule);border-radius:8px;background:var(--qa-panel);cursor:pointer}" +
    "li.focused{border-color:var(--qa-fg)}" +
    "li .body{flex:1;white-space:pre-wrap;overflow-wrap:anywhere}li .empty{color:var(--qa-muted);font-style:italic}" +
    ".num{flex:0 0 auto;min-width:20px;height:20px;border-radius:10px;background:#e4572e;color:#fff;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center}" +
    ".none{color:var(--qa-muted);padding:4px 4px 0}" +
    ".composer{padding:12px 16px 16px;border-top:1px solid var(--qa-rule);display:flex;flex-direction:column;gap:8px}" +
    "textarea{width:100%;min-height:88px;resize:vertical;font:inherit;color:var(--qa-fg);background:var(--qa-field);border:1px solid var(--qa-rule);border-radius:8px;padding:8px}" +
    "textarea:focus{outline:none;border-color:var(--qa-fg)}textarea:disabled{opacity:.5}" +
    ".status{min-height:1.3em;font-size:12px;color:var(--qa-muted)}.status.ok{color:var(--qa-ok)}.status.err{color:#d93025}" +
    ".keys{font-size:11px;color:var(--qa-muted)}" +
    "button{font:inherit;color:var(--qa-fg);background:transparent;border:1px solid var(--qa-rule);border-radius:6px;padding:6px 10px;cursor:pointer}" +
    "button:hover:not(:disabled){border-color:var(--qa-fg)}button:disabled{opacity:.45;cursor:default}" +
    "button.on{background:var(--qa-fg);color:var(--qa-bg);border-color:var(--qa-fg)}" +
    "button.primary{background:var(--qa-fg);color:var(--qa-bg);border-color:var(--qa-fg);font-weight:600;padding:8px 12px}" +
    "li button.x{border:0;padding:0 4px;line-height:20px;color:var(--qa-muted)}" +
    ".pin{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:12px;background:#e4572e;color:#fff;border:2px solid #fff;" +
    "font:700 11px/20px system-ui,-apple-system,sans-serif;text-align:center;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4)}" +
    ".pin.focused{outline:2px solid #e4572e;outline-offset:2px}" +
    ".hl{position:fixed;border:2px solid #e4572e;background:rgba(228,87,46,.08);pointer-events:none;display:none;border-radius:2px}" +
    ".clip{position:fixed;top:0;left:0;bottom:0;overflow:hidden;pointer-events:none}" +
    ".away{font-size:12px;padding:8px;border:1px solid #e4572e;border-radius:6px}.away button{margin-top:6px}[hidden]{display:none}" +
    "</style>" +
    "<div class=clip><div class=hl></div><div class=pins></div></div>" +
    "<aside class=col>" +
    "<header><div class=title><strong></strong></div><div class=title><button class=mode type=button title='Click to pin instead of using the site'>Comment</button><span style='flex:1'></span><button class=layout type=button></button></div>" +
    "<div class=hint>Right-click anything in the page to pin a comment, or turn on Comment and click.</div>" +
    "<div class=away hidden>The page left this site (a sign-in redirect?) and cannot be shown beside the column. <button class=go type=button>Continue full page</button></div></header>" +
    "<h2>Comments</h2><ol></ol>" +
    "<div class=composer><div class=status></div>" +
    "<textarea placeholder='Comment for this pin…' disabled></textarea>" +
    "<div class=keys>Enter saves · Shift+Enter newline · Esc Esc deletes · ⌘Enter sends</div>" +
    "<button class=primary type=button disabled>Send batch</button></div>" +
    "</aside>";
  root.querySelector(".title strong").textContent = "QA comments · " + String(PROJECT);
  var col = root.querySelector(".col"), listEl = root.querySelector("ol"), pinsLayer = root.querySelector(".pins"), clip = root.querySelector(".clip");
  var hl = root.querySelector(".hl"), modeBtn = root.querySelector(".mode"), sendBtn = root.querySelector(".primary");
  var textEl = root.querySelector("textarea"), statusEl = root.querySelector(".status");
  var layoutBtn = root.querySelector(".layout"), awayEl = root.querySelector(".away");
  var LAYOUT_COOKIE = "morpheus_qa_layout";
  var lastSiteUrl = location.href;
  /**
   * Full page: the server skips the shell while this cookie says inline, for flows a frame cannot
   * hold (a redirect to a provider that refuses framing). Column clears it.
   */
  function setLayout(inline, url) {
    document.cookie = LAYOUT_COOKIE + "=" + (inline ? "inline" : "") + "; path=/; SameSite=Lax" + (inline ? "" : "; max-age=0");
    location.href = url || lastSiteUrl;
  }
  layoutBtn.textContent = shell ? "Full page" : "Column";
  layoutBtn.title = shell ? "Show the site full width with the column inside it (for sign-in redirects)" : "Put the site back in a frame beside the column";
  layoutBtn.addEventListener("click", function () { setLayout(shell, site ? site.win.location.href : lastSiteUrl); });
  root.querySelector(".go").addEventListener("click", function () { setLayout(true, lastSiteUrl); });

  var pins = [], nextN = 1, focusedId = null, commenting = false, sending = false, escArmedAt = 0;
  var site = null; // { win, doc, offsetX, offsetY }
  var storeKey = null;

  function frameEl() { return shell ? document.getElementById("morpheus-qa-site") : null; }
  function siteWindow() {
    var f = frameEl();
    if (!shell) return window;
    try { return f && f.contentWindow && f.contentWindow.document ? f.contentWindow : null; } catch (e) { return null; }
  }
  function pagePath(win) { return win.location.pathname + win.location.search; }

  function setStatus(text, kind) { statusEl.textContent = text || ""; statusEl.className = "status" + (kind ? " " + kind : ""); }
  function persist() {
    if (!storeKey) return;
    try { sessionStorage.setItem(storeKey, JSON.stringify({ pins: pins.map(function (p) { return { id: p.id, n: p.n, anchor: p.anchor, text: p.text }; }), nextN: nextN })); } catch (e) { /* storage may be unavailable */ }
  }
  function restore() {
    pins = []; nextN = 1; focusedId = null;
    try {
      var saved = JSON.parse(sessionStorage.getItem(storeKey) || "null");
      if (saved && saved.pins && saved.pins.length) {
        pins = saved.pins.filter(function (p) { return p && p.anchor && typeof p.n === "number"; }).map(function (p) { return { id: p.id, n: p.n, anchor: p.anchor, text: p.text || "", el: null }; });
        nextN = Math.max(saved.nextN || 1, pins.reduce(function (m, p) { return Math.max(m, p.n + 1); }, 1));
      }
    } catch (e) { pins = []; }
    textEl.value = ""; textEl.disabled = true;
  }
  function focused() { for (var i = 0; i < pins.length; i++) if (pins[i].id === focusedId) return pins[i]; return null; }

  function position(p) {
    if (!site) return;
    var x, y, doc = site.doc;
    var el = p.el && p.el.isConnected ? p.el : (p.anchor.element ? doc.querySelector(p.anchor.element.selector) : null);
    if (el) {
      p.el = el;
      var r = el.getBoundingClientRect();
      x = r.left + r.width * p.anchor.element.offsetX; y = r.top + r.height * p.anchor.element.offsetY;
    } else { x = p.anchor.x - site.win.scrollX; y = p.anchor.y - site.win.scrollY; }
    p.marker.style.left = (x + site.offsetX) + "px"; p.marker.style.top = (y + site.offsetY) + "px";
  }
  function renderPins() {
    pinsLayer.textContent = "";
    pins.forEach(function (p) {
      var marker = document.createElement("div");
      marker.className = "pin" + (p.id === focusedId ? " focused" : ""); marker.textContent = String(p.n); marker.title = p.text || "";
      marker.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); focusPin(p.id); });
      marker.addEventListener("contextmenu", function (e) { e.preventDefault(); e.stopPropagation(); focusPin(p.id); });
      p.marker = marker; pinsLayer.appendChild(marker); position(p);
    });
  }
  function renderList() {
    listEl.textContent = "";
    if (!pins.length) {
      var none = document.createElement("li"); none.className = "none"; none.style.border = "0"; none.style.background = "transparent"; none.style.cursor = "default";
      none.textContent = "No comments on this page yet."; listEl.appendChild(none);
    }
    pins.forEach(function (p) {
      var li = document.createElement("li"); if (p.id === focusedId) li.className = "focused";
      var num = document.createElement("span"); num.className = "num"; num.textContent = String(p.n);
      var body = document.createElement("span"); body.className = "body";
      if ((p.text || "").trim()) body.textContent = p.text; else { var em = document.createElement("span"); em.className = "empty"; em.textContent = "(no text yet)"; body.appendChild(em); }
      var del = document.createElement("button"); del.className = "x"; del.type = "button"; del.textContent = "×"; del.title = "Delete pin " + p.n;
      del.addEventListener("click", function (e) { e.stopPropagation(); focusedId = p.id; deleteFocused(); });
      li.addEventListener("click", function () { focusPin(p.id); });
      li.appendChild(num); li.appendChild(body); li.appendChild(del); listEl.appendChild(li);
    });
    var ready = pins.filter(function (p) { return (p.text || "").trim(); }).length;
    sendBtn.disabled = sending || ready === 0;
    sendBtn.textContent = ready ? "Send batch (" + ready + ")" : "Send batch";
  }
  function render() { renderList(); renderPins(); }

  function focusPin(id) {
    var p = null; pins.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    focusedId = id; textEl.disabled = false; textEl.value = p.text || ""; textEl.focus();
    setStatus("Editing pin " + p.n + ". Enter saves, Esc Esc deletes.");
    render(); persist();
  }
  function saveFocused(quiet) {
    var p = focused(); if (!p) return;
    p.text = textEl.value; render(); persist();
    if (!quiet) setStatus("Saved pin " + p.n + ((p.text || "").trim() ? "" : " (empty)"), "ok");
  }
  function deleteFocused() {
    var p = focused(); if (!p) return;
    pins = pins.filter(function (x) { return x !== p; });
    focusedId = null; textEl.value = ""; textEl.disabled = true;
    setStatus("Deleted pin " + p.n); render(); persist();
  }
  function addPin(el, cx, cy) {
    var p = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), n: nextN++, el: el, anchor: anchorFor(el, cx, cy), text: "" };
    pins.push(p); focusedId = p.id; textEl.disabled = false; textEl.value = ""; render(); persist(); textEl.focus();
    setStatus("Pin " + p.n + " placed. Type a comment, Enter saves.");
  }
  function setMode(on) {
    commenting = on; modeBtn.classList.toggle("on", on);
    if (site) site.doc.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hl.style.display = "none";
  }

  textEl.addEventListener("input", function () { var p = focused(); if (p) { p.text = textEl.value; persist(); } });
  textEl.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveFocused(true); send(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveFocused(false); textEl.blur(); escArmedAt = 0; return; }
    if (e.key === "Escape") { e.preventDefault(); escape(); }
  });
  function escape() {
    var now = Date.now();
    if (escArmedAt && now - escArmedAt < 1000 && focused()) { deleteFocused(); escArmedAt = 0; return; }
    escArmedAt = now;
    if (commenting) setMode(false);
    if (focused()) { saveFocused(true); textEl.blur(); setStatus("Press Esc again to delete pin " + focused().n); }
  }
  function onKey(e) {
    // Keys typed in the column are the textarea's own handler's; handling them here as well ran
    // Esc twice in one keypress and deleted the pin (found in review).
    if (e.composedPath && e.composedPath().indexOf(ui) >= 0) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && pins.length) { e.preventDefault(); send(); return; }
    if (e.key !== "Escape") return;
    // The second Esc of "Esc Esc deletes" lands here once the first has left the comment box. Only
    // the box arms it, so Esc used by the site itself (closing its own dialogs) never deletes a pin.
    if (escArmedAt && Date.now() - escArmedAt < 1000 && focused()) { e.preventDefault(); deleteFocused(); escArmedAt = 0; return; }
    if (commenting) setMode(false);
  }
  document.addEventListener("keydown", onKey, true);
  modeBtn.addEventListener("click", function () { setMode(!commenting); });
  sendBtn.addEventListener("click", function () { saveFocused(true); send(); });

  // ---- the site: listeners, theme and layout, re-attached whenever its document changes ----------
  function applyTheme() {
    if (!site) return;
    var t;
    try { t = siteTheme(site.win); } catch (e) { return; }
    var s = ui.style;
    s.setProperty("--qa-bg", rgba(t.bg, 1));
    s.setProperty("--qa-fg", rgba(t.fg, 1));
    s.setProperty("--qa-muted", rgba(t.fg, 0.62));
    s.setProperty("--qa-rule", rgba(t.fg, 0.16));
    s.setProperty("--qa-panel", rgba(t.fg, 0.04));
    s.setProperty("--qa-field", t.dark ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.6)");
    s.setProperty("--qa-ok", t.dark ? "#81c995" : "#1e7e34");
    s.setProperty("--qa-font", t.font);
    s.setProperty("--qa-scheme", t.dark ? "dark" : "light");
    if (shell) document.documentElement.style.background = rgba(t.bg, 1);
  }
  function layout() {
    var w = Math.max(0, window.innerWidth - COLUMN);
    clip.style.width = w + "px";
    var f = frameEl();
    if (f) f.style.width = w + "px";
    if (site) { var r = f ? f.getBoundingClientRect() : { left: 0, top: 0 }; site.offsetX = r.left; site.offsetY = r.top; }
    follow();
  }
  var raf = 0;
  function follow() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; pins.forEach(function (p) { if (p.marker) position(p); }); }); }
  function targetAt(cx, cy) {
    if (shell) return site.doc.elementFromPoint(cx, cy);
    ui.style.display = "none";
    var el = document.elementFromPoint(cx, cy);
    ui.style.display = "";
    return el;
  }
  function ours(target) { return !shell && (target === ui || (target && target.closest && target.closest("morpheus-qa"))); }
  function attach(win) {
    var doc = win.document;
    site = { win: win, doc: doc, offsetX: 0, offsetY: 0 };
    storeKey = "morpheus-qa:" + pagePath(win);
    doc.addEventListener("contextmenu", function (e) {
      if (ours(e.target) || e.shiftKey) return; // Shift+right-click keeps the browser's own menu.
      e.preventDefault(); e.stopPropagation();
      var el = targetAt(e.clientX, e.clientY); if (isElement(el)) addPin(el, e.clientX, e.clientY);
    }, true);
    doc.addEventListener("click", function (e) {
      if (!commenting || ours(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      var el = targetAt(e.clientX, e.clientY); if (isElement(el)) addPin(el, e.clientX, e.clientY);
    }, true);
    doc.addEventListener("mousemove", function (e) {
      if (!commenting) return;
      var el = targetAt(e.clientX, e.clientY);
      if (!isElement(el)) { hl.style.display = "none"; return; }
      var r = el.getBoundingClientRect();
      hl.style.display = "block"; hl.style.left = (r.left + site.offsetX) + "px"; hl.style.top = (r.top + site.offsetY) + "px"; hl.style.width = r.width + "px"; hl.style.height = r.height + "px";
    }, true);
    if (shell) doc.addEventListener("keydown", onKey, true);
    win.addEventListener("scroll", follow, true); win.addEventListener("resize", follow);
    try { new win.MutationObserver(function () { follow(); }).observe(doc.documentElement, { subtree: true, childList: true, attributes: true }); } catch (e) { /* detached */ }
    setMode(commenting);
    restore(); layout(); applyTheme(); render();
    if (shell) syncAddress(win);
  }
  /** The shell's address bar and title follow the framed page, so a reload returns to it. */
  function syncAddress(win) {
    var path = win.location.pathname + win.location.search + win.location.hash;
    if (path !== location.pathname + location.search + location.hash) {
      try { history.replaceState(null, "", path); } catch (e) { /* cross-origin navigation */ }
    }
    if (win.document.title && document.title !== win.document.title) document.title = win.document.title;
  }
  function watch() {
    var win = siteWindow();
    if (!win) return;
    var doc;
    try { doc = win.document; void doc.documentElement; } catch (e) { awayEl.hidden = false; return; } // navigated off-origin
    awayEl.hidden = true;
    // The frame's initial about:blank is not the site; its "pathname" would rewrite the address bar.
    if (win.location.protocol !== location.protocol) return;
    if (!site || site.doc !== doc) { if (doc.readyState !== "loading" && doc.documentElement) attach(win); return; }
    if (storeKey !== "morpheus-qa:" + pagePath(win)) { storeKey = "morpheus-qa:" + pagePath(win); restore(); render(); setStatus(""); }
    if (shell) syncAddress(win);
    lastSiteUrl = win.location.href;
    applyTheme();
  }

  // ---- capture and send --------------------------------------------------------------------------
  function loadLibrary(win) {
    if (win.modernScreenshot) return Promise.resolve(win.modernScreenshot);
    return new Promise(function (resolve, reject) {
      var s = win.document.createElement("script"); s.src = "/__qa/modern-screenshot.js";
      s.onload = function () { win.modernScreenshot ? resolve(win.modernScreenshot) : reject(new Error("capture library missing")); };
      s.onerror = function () { reject(new Error("capture library failed to load")); };
      win.document.head.appendChild(s);
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
   * falls back to another font and text reflows. Font hosts serve their CSS with CORS.
   */
  function crossOriginFaces(doc) {
    var tasks = Array.prototype.map.call(doc.styleSheets, function (sheet) {
      try { void sheet.cssRules; return Promise.resolve(""); } catch (e) { /* unreadable: fetch it */ }
      if (!sheet.href) return Promise.resolve("");
      return fetch(sheet.href, { mode: "cors", credentials: "omit" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (text) { return absolutize((text.match(/@font-face\s*\{[^}]*\}/g) || []).join("\n"), sheet.href); })
        .catch(function () { return ""; });
    });
    return Promise.all(tasks).then(function (parts) { return parts.join("\n").trim(); });
  }
  /** The whole site page as a PNG, overlay excluded. Never blocks Send: a failed capture sends without a frame. */
  function capture() {
    var win = site.win, doc = site.doc, size = pageSize(win), faces = null;
    var work = Promise.all([loadLibrary(win), crossOriginFaces(doc), doc.fonts ? doc.fonts.ready : null]).then(function (loaded) {
      if (loaded[1]) {
        faces = doc.createElement("style"); faces.setAttribute("data-morpheus-qa", "fonts"); faces.textContent = loaded[1];
        doc.head.appendChild(faces);
      }
      return loaded[0].domToPng(doc.documentElement, {
        width: size.width, height: size.height, scale: 1,
        filter: function (node) { return node !== ui && node !== faces; }
      });
    }).then(function (dataUrl) { if (faces) faces.remove(); return dataUrl; }, function (error) { if (faces) faces.remove(); throw error; })
      .then(function (dataUrl) {
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
    if (!ready.length || sending || !site) return;
    sending = true; renderList(); setStatus("Capturing the page…");
    capture().then(function (frame) {
      setStatus("Sending…");
      var now = new Date().toISOString();
      var body = {
        preview: { url: site.win.location.href, kind: "web", label: site.doc.title || site.win.location.pathname },
        comments: ready.map(function (p) { return { id: "c" + p.n, text: p.text.trim(), createdAt: now, anchor: p.anchor }; })
      };
      if (frame) body.frame = { width: frame.width, height: frame.height, capturedAt: now, dataUrl: frame.dataUrl };
      return fetch("/__qa/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return [j, frame]; }); });
    }).then(function (result) {
      pins = pins.filter(function (p) { return ready.indexOf(p) < 0; });
      if (!pins.length) nextN = 1;
      focusedId = null; textEl.value = ""; textEl.disabled = true; persist(); render();
      setStatus("Sent " + result[0].id + (result[1] ? "" : " (no page image: capture failed)") + " → local/qa-comments/pending/", "ok");
    }).catch(function (e) { setStatus("Send failed: " + e.message + ". Pins kept.", "err"); })
      .then(function () { sending = false; renderList(); });
  }

  function mount() {
    (document.documentElement || document).appendChild(ui);
    if (!shell) {
      // Inline fallback: make room for the column in the page's own flow.
      document.documentElement.style.setProperty("margin-right", COLUMN + "px", "important");
      attach(window);
    }
    window.addEventListener("resize", layout);
    layout();
    setInterval(watch, 300);
    var f = frameEl(); if (f) f.addEventListener("load", watch);
    watch();
  }
  window.__morpheusQa = {
    cssPath: cssPath, anchorFor: anchorFor, siteTheme: siteTheme, parseColor: parseColor,
    pins: function () { return pins; }, shell: shell
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
`;

/** Width of the comment column, mirrored in the shell's initial frame width so the first paint is right. */
export const WEB_OVERLAY_COLUMN_PX = 340;
