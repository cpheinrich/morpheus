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
 * point and viewport. Each click synchronously freezes compact allowlisted semantic HTML and UI
 * state. Send reuses that evidence. Markers only appear in their original route/view and on an
 * element whose identity still matches; the sidebar keeps comments accessible elsewhere.
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
  var ATTRS = ["id", "data-testid", "data-qa-view", "data-entity-id", "data-artist-id", "role", "aria-label", "aria-labelledby", "name", "type", "alt"];
  function short(value, max) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 240); }
  function privateField(el) { return !!el.closest("[data-qa-private],[autocomplete*=password],input[type=password],input[type=file]"); }
  function visible(el) {
    if (!el || !el.isConnected || privateField(el) || el.closest("[hidden],[inert],[aria-hidden=true]")) return false;
    var win = el.ownerDocument.defaultView, r = el.getBoundingClientRect(), style = win.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }
  function semanticText(el) {
    if (privateField(el)) return "";
    // innerText includes only rendered text; exclude controls and explicitly private subtrees.
    // A bounded TreeWalker avoids reading an entire page into the evidence.
    var walker = el.ownerDocument.createTreeWalker(el, 4), text = "", n, count = 0;
    while ((n = walker.nextNode()) && count++ < 100 && text.length < 240) {
      var parent = n.parentElement, readable = !!parent && !parent.closest("script,style,input,textarea,select,[hidden],[aria-hidden=true],[data-qa-private]");
      while (readable && parent) { var style = parent.ownerDocument.defaultView.getComputedStyle(parent); if (style.display === "none" || style.visibility === "hidden") readable = false; parent = parent.parentElement; }
      if (readable) text += " " + n.textContent;
    }
    return short(text);
  }
  function describe(el) {
    var attrs = {}, r = el.getBoundingClientRect(), styles = {}, cs = el.ownerDocument.defaultView.getComputedStyle(el);
    ATTRS.forEach(function (key) { if (el.hasAttribute(key) && !privateField(el)) attrs[key] = short(el.getAttribute(key)); });
    ["display", "position", "color", "background-color", "font-size", "text-decoration-line", "padding", "overflow", "z-index"].forEach(function (key) { styles[key] = short(cs.getPropertyValue(key), 120); });
    return { tag: el.tagName.toLowerCase(), attributes: attrs, text: semanticText(el), styles: styles, bounds: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } };
  }
  function fingerprint(el) {
    var n = describe(el), parents = [], p = el.parentElement;
    while (p && parents.length < 3 && !p.matches("body,html,main,[role=main],dialog,[role=dialog],[aria-modal=true],[data-qa-view]")) { var d = describe(p); parents.push([d.tag, d.attributes, d.text.slice(0, 120)]); p = p.parentElement; }
    return JSON.stringify([n.tag, n.attributes, n.text, parents]);
  }
  function routeFor(win) {
    var query = new URLSearchParams(win.location.search), safe = new URLSearchParams();
    query.forEach(function (value, key) { safe.append(short(key, 64), /token|key|secret|password|auth|code|session|email/i.test(key) ? "[redacted]" : short(value, 120)); });
    return { pathname: short(win.location.pathname), query: short(safe.toString(), 1000), hash: /token|secret|password|auth|key|code=/i.test(win.location.hash) ? "[redacted]" : short(win.location.hash) };
  }
  function safeUrl(win) { var r = routeFor(win); return win.location.origin + r.pathname + (r.query ? "?" + r.query : "") + r.hash; }
  function currentView(doc) {
    var dialogs = Array.prototype.filter.call(doc.querySelectorAll("dialog[open],[role=dialog],[aria-modal=true],[data-qa-view]"), function (el) { return el.getAttribute("aria-modal") !== "false" && visible(el); });
    var root = dialogs.length ? dialogs[dialogs.length - 1] : doc.querySelector("main,[role=main]") || doc.body;
    var kind = dialogs.length ? (root.matches("dialog,[role=dialog],[aria-modal=true]") ? "dialog" : "view") : "page";
    var heading = root.querySelector("h1,h2,[role=heading]");
    var entity = root.querySelector("[data-entity-id],[data-artist-id]");
    // View identity excludes transient filters, search, loading and video state.
    var identity = JSON.stringify([kind, describe(root).attributes, heading ? semanticText(heading) : "", entity ? describe(entity).attributes : {}]);
    return { root: root, kind: kind, identity: identity.slice(0, 2000) };
  }
  function captureContext(el, createdAt) {
    var win = el.ownerDocument.defaultView, doc = el.ownerDocument, view = currentView(doc), ancestors = [], scroll = [], state = [], node = el.parentElement;
    while (node && ancestors.length < 6) { ancestors.push(describe(node)); if (node === view.root) break; node = node.parentElement; }
    node = el;
    while (node && scroll.length < 8) {
      if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) scroll.push({ selector: short(cssPath(node)), x: node.scrollLeft, y: node.scrollTop });
      node = node.parentElement;
    }
    var candidates = view.root.querySelectorAll('[aria-selected=true],[aria-pressed=true],[aria-expanded],[aria-checked],input:checked,select,input[type=search],[role=tab][aria-selected=true],[aria-busy=true],[role=alert],video');
    for (var i = 0; i < candidates.length && state.length < 15; i++) {
      var c = candidates[i]; if (!visible(c)) continue;
      var kind = c.tagName.toLowerCase(), label = c.getAttribute("aria-label") || c.getAttribute("name") || semanticText(c), value = "";
      if (c.matches("input[type=search]")) { kind = "search"; value = c.value; }
      else if (c.matches("select")) value = c.selectedOptions && c.selectedOptions[0] ? c.selectedOptions[0].textContent : "";
      else if (c.matches("video")) value = (c.paused ? "paused" : "playing") + " at " + Math.floor(c.currentTime) + "s";
      else if (c.matches("input")) value = "checked";
      else value = ["aria-selected", "aria-pressed", "aria-expanded", "aria-checked", "aria-busy"].filter(function (a) { return c.hasAttribute(a); }).map(function (a) { return a + "=" + c.getAttribute(a); }).join(" ") || semanticText(c);
      state.push({ kind: kind, label: short(label), value: short(value) });
    }
    state.push({ kind: "theme", label: "color-scheme", value: short(win.getComputedStyle(doc.documentElement).colorScheme) });
    return { version: 1, scope: el === doc.body || el === doc.documentElement ? "page" : "element", capturedAt: createdAt, route: routeFor(win), target: describe(el), ancestors: ancestors, view: { kind: view.kind, identity: view.identity, root: describe(view.root) }, state: state, scroll: scroll, viewport: { width: win.innerWidth, height: win.innerHeight, scrollX: win.scrollX, scrollY: win.scrollY }, limitations: ["Bounded semantic HTML; no application stores or hidden/control values.", "Embedded frames, shadow DOM and media pixels are not captured."] };
  }
  /** Freeze visible DOM, styles and loaded media synchronously; never mount executable clones. */
  function freezeViewport(win) {
    var doc = win.document, w = win.innerWidth, h = win.innerHeight, count = 0, rules = [], scrolls = [], omitted = [], deadline = performance.now() + 120;
    var snapshotDoc = document.implementation.createHTMLDocument("");
    function copy(node) {
      if (node.nodeType === 3) return snapshotDoc.createTextNode(node.textContent);
      if (!isElement(node) || node === ui || node.matches("script,style,link,meta,base,noscript,animate,animateTransform,animateMotion,set")) return null;
      if (performance.now() > deadline) throw new Error("Viewport freeze exceeded 120 ms work limit");
      var r = node.getBoundingClientRect(), cs = win.getComputedStyle(node);
      if (cs.display === "none" || cs.visibility === "hidden") return null;
      // An offscreen subtree cannot paint here unless overflow permits a visible descendant.
      var off = r.bottom < 0 || r.top > h || r.right < 0 || r.left > w;
      if (off && r.top > h && node !== doc.documentElement && node !== doc.body) return null;
      if (++count > 4000) throw new Error("Visible DOM exceeds capture limit");
      if (off && cs.overflow !== "visible" && node !== doc.documentElement && node !== doc.body) return null;
      var omission = node.matches("iframe,object,embed") && !off ? "Embedded media omitted" : node.shadowRoot && !off ? "Shadow DOM omitted" : null;
      var clone;
      if (node.matches("img,canvas,video") && !off) {
        try {
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.min(1600, Math.ceil(r.width))); canvas.height = Math.max(1, Math.min(1600, Math.ceil(r.height)));
        if (node.matches("video") && node.readyState < 2) throw new Error("Video has no decoded placement frame");
        if (node.matches("img") && (!node.complete || !node.naturalWidth)) throw new Error("Image has not loaded at placement");
        canvas.getContext("2d").drawImage(node, 0, 0, canvas.width, canvas.height);
        clone = snapshotDoc.createElement("img"); clone.src = canvas.toDataURL("image/png");
        } catch (e) { omission = "Unloaded or cross-origin " + node.tagName.toLowerCase() + " pixels omitted"; clone = snapshotDoc.createElement("div"); }
      } else {
        clone = node.namespaceURI === "http://www.w3.org/2000/svg" ? snapshotDoc.createElementNS(node.namespaceURI, node.tagName) : snapshotDoc.createElement(node.matches("html,body") || node.tagName.indexOf("-") >= 0 ? "div" : node.tagName.toLowerCase());
        // SVG geometry is data; executable/event/navigation attributes are never copied.
        if (node.namespaceURI === "http://www.w3.org/2000/svg") Array.prototype.forEach.call(node.attributes, function (a) { if (!/^on|href|src/i.test(a.name) && !/href/i.test(a.name)) clone.setAttribute(a.name, a.value); else if (/href/i.test(a.name) && /^#[A-Za-z0-9_-]+$/.test(a.value)) clone.setAttribute(a.name, a.value); });
      }
      for (var i = 0; i < cs.length; i++) clone.style.setProperty(cs[i], cs.getPropertyValue(cs[i]), "important");
      clone.style.setProperty("animation", "none", "important"); clone.style.setProperty("transition", "none", "important");
      if (omission) {
        clone = snapshotDoc.createElement("div");
        for (var v = 0; v < cs.length; v++) clone.style.setProperty(cs[v], cs.getPropertyValue(cs[v]), "important");
        clone.style.setProperty("background", "#ddd", "important"); clone.style.setProperty("color", "#333", "important"); clone.style.setProperty("font-size", "14px", "important");
        clone.textContent = omission;
        if (omitted.indexOf(omission) < 0 && omitted.length < 4) omitted.push(omission);
      } else if (node.matches("input,textarea,select") || privateField(node)) {
        clone = snapshotDoc.createElement("div");
        for (var j = 0; j < cs.length; j++) clone.style.setProperty(cs[j], cs.getPropertyValue(cs[j]), "important");
        clone.textContent = privateField(node) ? "" : node.matches("select") ? (node.selectedOptions[0] ? node.selectedOptions[0].textContent : "") : node.value;
      } else if (!off || node === doc.documentElement || node === doc.body) {
        for (var child = node.firstChild; child; child = child.nextSibling) { var c = copy(child); if (c) clone.appendChild(c); }
      }
      if (cs.position === "fixed") clone.style.setProperty("transform", "translate(" + win.scrollX + "px," + win.scrollY + "px) " + (cs.transform === "none" ? "" : cs.transform), "important");
      if (node.scrollTop || node.scrollLeft) scrolls.push([clone, node.scrollLeft, node.scrollTop]);
      ["::before", "::after"].forEach(function (pseudo) {
        var ps = win.getComputedStyle(node, pseudo);
        if (!ps.content || ps.content === "none" || ps.content === "normal") return;
        var id = "qa-freeze-" + count + "-" + rules.length; clone.classList.add(id);
        var text = "." + id + pseudo + "{";
        for (var k = 0; k < ps.length; k++) text += ps[k] + ":" + ps.getPropertyValue(ps[k]) + " !important;";
        rules.push(text + "}");
      });
      return clone;
    }
    Array.prototype.forEach.call(doc.styleSheets, function (sheet) { try { Array.prototype.forEach.call(sheet.cssRules, function (rule) { if (rule.type === 5) rules.push(rule.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, function (m, q, url) { return "url(" + q + new URL(url, sheet.href || doc.baseURI).href + q + ")"; })); }); } catch (e) { /* unreadable font sheets remain a renderer limitation */ } });
    var frozen = copy(doc.documentElement), wrapper = snapshotDoc.createElement("div");
    wrapper.style.cssText = "position:relative;width:" + w + "px;height:" + h + "px;overflow:hidden;background:" + win.getComputedStyle(doc.body).backgroundColor;
    frozen.style.setProperty("transform", "translate(" + -win.scrollX + "px," + -win.scrollY + "px)", "important");
    // A cloned html element is represented by a div; restore its root formatting context so a
    // first heading's collapsing margin cannot shift fixed dialogs/media down in the JPEG.
    frozen.style.setProperty("display", "flow-root", "important");
    frozen.style.setProperty("width", w + "px", "important");
    wrapper.appendChild(frozen);
    // Preserve inner scroll visually without asking an asynchronous renderer to read live elements.
    scrolls.forEach(function (s) { Array.prototype.forEach.call(s[0].children, function (c) { c.style.setProperty("transform", "translate(" + -s[1] + "px," + -s[2] + "px) " + (c.style.transform === "none" ? "" : c.style.transform), "important"); }); });
    var style = snapshotDoc.createElement("style"); style.textContent = rules.join("\n"); wrapper.insertBefore(style, wrapper.firstChild);
    var xml = new XMLSerializer().serializeToString(wrapper);
    if (new Blob([xml]).size > 2 * 1024 * 1024) throw new Error("Frozen viewport exceeds 2 MiB");
    return { html: xml, width: w, height: h, omitted: omitted, background: win.getComputedStyle(doc.body).backgroundColor };
  }
  var captureLibrary;
  function loadCaptureLibrary() {
    if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
    if (!captureLibrary) captureLibrary = new Promise(function (resolve, reject) {
      var script = document.createElement("script"); script.src = "/__qa/modern-screenshot.js";
      script.onload = function () { resolve(window.modernScreenshot); }; script.onerror = function () { captureLibrary = null; reject(new Error("Capture library unavailable")); };
      document.head.appendChild(script);
    });
    return captureLibrary;
  }
  function encodeViewport(snapshot) {
    var frame = document.createElement("iframe"), scale = Math.min(1, 1600 / Math.max(snapshot.width, snapshot.height));
    frame.setAttribute("sandbox", "allow-same-origin"); frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-100000px;top:0;border:0;pointer-events:none;width:" + snapshot.width + "px;height:" + snapshot.height + "px";
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { frame.remove(); reject(new Error("Viewport image encoding timed out")); }, 15000);
      frame.onload = function () {
        loadCaptureLibrary().then(function (lib) {
          if (!lib) throw new Error("Capture library unavailable");
          return lib.domToJpeg(frame.contentDocument.body.firstElementChild, { width: snapshot.width, height: snapshot.height, scale: scale, quality: 0.5, backgroundColor: snapshot.background || "#ffffff", timeout: 10000 });
        }).then(function (dataUrl) {
          if (!/^data:image\/jpeg;base64,/.test(dataUrl) || dataUrl.length > 512 * 1024) throw new Error("Viewport JPEG invalid or exceeds 512 KiB");
          var encoded = new Image(); encoded.onload = function () { resolve({ dataUrl: dataUrl, width: encoded.naturalWidth, height: encoded.naturalHeight }); }; encoded.onerror = function () { reject(new Error("Encoded JPEG could not be read")); }; encoded.src = dataUrl;
        }).catch(reject).then(function () { clearTimeout(timer); frame.remove(); });
      };
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">' + snapshot.html + '</body></html>';
      document.documentElement.appendChild(frame);
    });
  }
  var imageDb;
  function images() {
    if (!imageDb) imageDb = new Promise(function (resolve, reject) {
      var request = indexedDB.open("morpheus-web-pin-evidence", 1);
      request.onupgradeneeded = function () { request.result.createObjectStore("pins"); };
      request.onsuccess = function () { resolve(request.result); }; request.onerror = function () { reject(new Error("Image storage unavailable")); };
    });
    return imageDb;
  }
  function imageRecord(id, value) {
    return images().then(function (db) { return new Promise(function (resolve, reject) {
      var tx = db.transaction("pins", value === undefined ? "readonly" : "readwrite"), table = tx.objectStore("pins");
      if (value && value.savedAt) {
        var rows = [], cursor = table.openCursor();
        cursor.onsuccess = function () { var c = cursor.result; if (c) { rows.push({ key: c.key, savedAt: c.value.savedAt }); c.continue(); } else { rows.sort(function (a, b) { return b.savedAt - a.savedAt; }); rows.forEach(function (row, i) { if (i >= 59 || row.savedAt < Date.now() - 86400000) table.delete(row.key); }); } };
      }
      var request = value === undefined ? table.get(id) : value === null ? table.delete(id) : table.put(value, id);
      var result;
      request.onsuccess = function () { result = request.result; }; tx.oncomplete = function () { resolve(result); }; tx.onerror = function () { reject(new Error("Image storage failed")); };
    }); });
  }
  function capturePinImage(p, snapshot) {
    var key = storeKey + ":" + p.id;
    p.imageWork = imageRecord(key, { snapshot: snapshot, savedAt: Date.now() }).then(function () { return encodeViewport(snapshot); }).then(function (frame) {
      frame.capturedAt = p.createdAt;
      p.webContext.image.scaleX = frame.width / p.webContext.viewport.width;
      p.webContext.image.scaleY = frame.height / p.webContext.viewport.height;
      return imageRecord(key, { frame: frame, savedAt: Date.now() }).then(function () { p.frame = frame; p.webContext.image.status = "captured"; });
    }).catch(function (error) { p.webContext.image.status = "failed"; p.webContext.image.error = short(error.message, 160); }).then(function () {
      persist(); renderList(); showPlacement();
      if (p.id === focusedId) setStatus(p.webContext.image.status === "captured" ? "Placement HTML and JPEG saved." : "HTML saved; placement image failed: " + p.webContext.image.error, p.webContext.image.status === "captured" ? "ok" : "err");
    });
    return p.imageWork;
  }
  function contains(rect, x, y) { return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; }
  /**
   * The element the person pointed at. elementFromPoint alone returns the top of the stack, which on
   * a card with a stretched link (a::after over the whole card) is the link — whose own box is only
   * its text, so the pin was clamped to the link's left edge (found on Lakina's experiment cards,
   * 2026-10-07). Prefer the first element in the stack whose own box contains the point.
   */
  function pickAt(doc, x, y, skip) {
    var stack = doc.elementsFromPoint ? doc.elementsFromPoint(x, y) : [doc.elementFromPoint(x, y)];
    var first = null;
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (!isElement(el) || (skip && skip(el))) continue;
      if (!first) first = el;
      if (el === doc.documentElement || el === doc.body) break;
      if (contains(el.getBoundingClientRect(), x, y)) return el;
    }
    return first;
  }
  /** The anchor for a pin at the site viewport point (cx, cy) on element el. */
  function anchorFor(el, cx, cy) {
    var win = el.ownerDocument.defaultView || window;
    var rect = el.getBoundingClientRect();
    var size = pageSize(win);
    var x = cx + win.scrollX, y = cy + win.scrollY;
    var text = semanticText(el).slice(0, 120);
    var anchor = {
      normX: clamp(x / size.width), normY: clamp(y / size.height), x: Math.round(x), y: Math.round(y),
      page: {
        url: safeUrl(win), title: short(win.document.title) || undefined, scrollX: Math.round(win.scrollX), scrollY: Math.round(win.scrollY),
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
    "<label>Applies to <select class=scope disabled><option value=element>Element</option><option value=view>Current view</option><option value=page>Whole page</option></select></label>" +
    "<textarea placeholder='Comment for this pin…' disabled maxlength=8000></textarea>" +
    "<img class=placement alt='Frozen placement viewport' hidden style='max-width:100%;max-height:130px;object-fit:contain'>" +
    "<div class=keys>Enter saves · Shift+Enter newline · Esc Esc deletes · ⌘Enter sends</div>" +
    "<button class=primary type=button disabled>Send batch</button></div>" +
    "</aside>";
  root.querySelector(".title strong").textContent = "QA comments · " + String(PROJECT);
  var col = root.querySelector(".col"), listEl = root.querySelector("ol"), pinsLayer = root.querySelector(".pins"), clip = root.querySelector(".clip");
  var hl = root.querySelector(".hl"), modeBtn = root.querySelector(".mode"), sendBtn = root.querySelector(".primary");
  var textEl = root.querySelector("textarea"), statusEl = root.querySelector(".status");
  var scopeEl = root.querySelector(".scope");
  var placementEl = root.querySelector(".placement");
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
  var storeKey = "morpheus-qa:v2:" + PROJECT;
  var restored = false;
  var draftStorageError = false;

  function frameEl() { return shell ? document.getElementById("morpheus-qa-site") : null; }
  function siteWindow() {
    var f = frameEl();
    if (!shell) return window;
    try { return f && f.contentWindow && f.contentWindow.document ? f.contentWindow : null; } catch (e) { return null; }
  }
  function pagePath(win) { return win.location.pathname + win.location.search; }

  function setStatus(text, kind) { statusEl.textContent = (text || "") + (draftStorageError ? " Draft not saved: keep this tab open and Send before reloading." : ""); statusEl.className = "status" + (kind ? " " + kind : ""); }
  function persist() {
    if (!storeKey) return;
    try {
      var data = JSON.stringify({ pins: pins.map(function (p) { return { id: p.id, n: p.n, anchor: p.anchor, text: p.text, byPage: !!p.byPage, createdAt: p.createdAt, webContext: p.webContext, identity: p.identity }; }), nextN: nextN });
      if (new Blob([data]).size > 262144) throw new Error("Draft limit reached");
      sessionStorage.setItem(storeKey, data);
      draftStorageError = false;
    } catch (e) { draftStorageError = true; setStatus("Draft could not be saved.", "err"); }
  }
  function restore() {
    if (restored) return;
    restored = true;
    pins = []; nextN = 1; focusedId = null;
    try {
      var saved = JSON.parse(sessionStorage.getItem(storeKey) || sessionStorage.getItem("morpheus-qa:" + pagePath(site.win)) || "null");
      if (saved && saved.pins && saved.pins.length) {
        pins = saved.pins.slice(0, 30).filter(function (p) { return p && p.anchor && typeof p.n === "number"; }).map(function (p) { if (p.anchor.page && p.anchor.page.url) { try { p.anchor.page.url = safeUrl({ location: new URL(p.anchor.page.url) }); } catch (e) { p.anchor.page.url = "unknown legacy URL"; } } return { id: p.id, n: p.n, anchor: p.anchor, text: String(p.text || "").slice(0, 8000), el: null, byPage: !!p.byPage, createdAt: p.createdAt, webContext: p.webContext, identity: p.identity }; });
        nextN = Math.max(saved.nextN || 1, pins.reduce(function (m, p) { return Math.max(m, p.n + 1); }, 1));
        pins.forEach(function (p) {
          if (!p.webContext || !p.webContext.image) return;
          p.imageWork = imageRecord(storeKey + ":" + p.id).then(function (savedImage) {
            if (savedImage && savedImage.frame) { p.frame = savedImage.frame; p.webContext.image.status = "captured"; }
            else if (savedImage && savedImage.snapshot) return capturePinImage(p, savedImage.snapshot);
            else { p.webContext.image.status = "failed"; p.webContext.image.error = "Placement image is no longer in browser storage"; }
          }).catch(function () { p.webContext.image.status = "failed"; p.webContext.image.error = "Image storage unavailable"; }).then(function () { persist(); renderList(); showPlacement(); });
        });
      }
    } catch (e) { pins = []; }
    textEl.value = ""; textEl.disabled = true;
  }
  function focused() { for (var i = 0; i < pins.length; i++) if (pins[i].id === focusedId) return pins[i]; return null; }
  function showPlacement() { var p = focused(); placementEl.hidden = !p || !p.frame; if (p && p.frame) placementEl.src = p.frame.dataUrl; else placementEl.removeAttribute("src"); }

  function position(p) {
    p.marker.hidden = true;
    if (!site || !p.webContext || p.anchor.page.url !== safeUrl(site.win)) return;
    var view = currentView(site.doc);
    if (view.identity !== p.webContext.view.identity) return;
    var x, y, doc = site.doc;
    var el = p.webContext.scope !== "element" ? (p.webContext.scope === "view" ? view.root : doc.body) : p.el && p.el.ownerDocument === doc && p.el.isConnected ? p.el : (p.anchor.element ? doc.querySelector(p.anchor.element.selector) : null);
    // A recycled selector or detached modal must never fall back to page coordinates.
    if (!el || !visible(el) || (p.webContext.scope === "element" && fingerprint(el) !== p.identity)) return;
    if (el) {
      var r = el.getBoundingClientRect();
      x = r.left + r.width * (p.webContext.scope !== "element" ? 0.5 : p.anchor.element.offsetX); y = r.top + r.height * (p.webContext.scope !== "element" ? 0.5 : p.anchor.element.offsetY);
    } else { x = p.anchor.x - site.win.scrollX; y = p.anchor.y - site.win.scrollY; }
    if (p.webContext.scope === "page" || p.byPage) { x = p.anchor.x - site.win.scrollX; y = p.anchor.y - site.win.scrollY; }
    if (x < 0 || y < 0 || x > site.win.innerWidth || y > site.win.innerHeight) return;
    var hit = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
    if (p.webContext.scope === "element" && hit && !el.contains(hit) && !hit.contains(el)) return;
    p.marker.hidden = false;
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
  function render() { renderList(); renderPins(); showPlacement(); }

  function focusPin(id) {
    var p = null; pins.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    focusedId = id; textEl.disabled = false; textEl.value = p.text || ""; textEl.focus();
    scopeEl.disabled = !p.webContext; scopeEl.value = p.webContext ? p.webContext.scope : "element";
    setStatus("Editing pin " + p.n + (p.webContext ? ". Placement HTML context saved." : ". Legacy pin: no placement HTML context available."));
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
    imageRecord(storeKey + ":" + p.id, null).catch(function () {});
    focusedId = null; textEl.value = ""; textEl.disabled = true;
    setStatus("Deleted pin " + p.n); render(); persist();
  }
  function addPin(el, cx, cy) {
    if (pins.length >= 30) { setStatus("30 draft pins maximum. Send or delete comments first.", "err"); return; }
    var now = new Date().toISOString(), context;
    try { context = captureContext(el, now); } catch (e) { setStatus("Could not capture placement HTML context. Try this pin again.", "err"); return; }
    var snapshot;
    context.image = { status: "pending", coordinateSpace: "viewport", scale: Math.min(1, 1600 / Math.max(site.win.innerWidth, site.win.innerHeight)), quality: 0.5, point: { x: cx, y: cy } };
    try { snapshot = freezeViewport(site.win); if (snapshot.omitted.length) context.image.omitted = snapshot.omitted; } catch (e) { context.image.status = "failed"; context.image.error = short(e.message, 160); }
    var p = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), n: nextN++, el: el, anchor: anchorFor(el, cx, cy), text: "", createdAt: now, webContext: context, identity: fingerprint(el) };
    // A point outside the element's own box (nothing better under it) is drawn where it was clicked.
    // It follows window scroll only; a site that scrolls an inner container moves it off its spot.
    if (!contains(el.getBoundingClientRect(), cx, cy)) p.byPage = true;
    pins.push(p); focusedId = p.id; textEl.disabled = false; textEl.value = ""; render(); persist(); textEl.focus();
    scopeEl.disabled = false; scopeEl.value = context.scope;
    setStatus("Pin " + p.n + " placed. HTML context saved; type a comment.");
    if (snapshot) capturePinImage(p, snapshot);
    else setStatus("HTML saved; placement image failed: " + context.image.error, "err");
  }
  scopeEl.addEventListener("change", function () { var p = focused(); if (p && p.webContext) { p.webContext.scope = scopeEl.value; renderPins(); persist(); } });
  function setMode(on) {
    commenting = on; modeBtn.classList.toggle("on", on);
    if (site) site.doc.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hl.style.display = "none";
  }

  textEl.addEventListener("input", function () { var p = focused(); if (p) { p.text = textEl.value; renderList(); persist(); } });
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
    if (shell) return pickAt(site.doc, cx, cy, null);
    return pickAt(document, cx, cy, function (el) { return el === ui; });
  }
  function ours(target) { return !shell && (target === ui || (target && target.closest && target.closest("morpheus-qa"))); }
  function attach(win) {
    var doc = win.document;
    site = { win: win, doc: doc, offsetX: 0, offsetY: 0 };
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
      var r = isElement(el) ? el.getBoundingClientRect() : null;
      // Nothing under the pointer holds the point: the pin will be drawn at the point, so outline nothing.
      if (!r || !contains(r, e.clientX, e.clientY)) { hl.style.display = "none"; return; }
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
    follow();
    if (shell) syncAddress(win);
    lastSiteUrl = win.location.href;
    applyTheme();
  }

  // ---- capture and send --------------------------------------------------------------------------
  function send() {
    var ready = pins.filter(function (p) { return (p.text || "").trim(); });
    if (!ready.length || sending || !site) return;
    sending = true; renderList(); setStatus("Sending placement context…");
    Promise.all(ready.map(function (p) { return p.imageWork || Promise.resolve(); })).then(function () {
    var body = {
      preview: { url: safeUrl(site.win), kind: "web", label: short(site.doc.title || site.win.location.pathname) },
      comments: ready.map(function (p) {
        var comment = { id: "c" + p.n, text: p.text.trim(), createdAt: p.createdAt || "unknown (legacy pin)", anchor: p.anchor };
        if (p.webContext) comment.webContext = p.webContext;
        if (p.frame) comment.frame = p.frame;
        return comment;
      })
    };
    return fetch("/__qa/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (result) {
      pins = pins.filter(function (p) { return ready.indexOf(p) < 0; });
      ready.forEach(function (p) { imageRecord(storeKey + ":" + p.id, null).catch(function () {}); });
      if (!pins.length) nextN = 1;
      focusedId = null; textEl.value = ""; textEl.disabled = true; persist(); render();
      setStatus("Queued " + result.id + " · " + result.pendingCount + " open batch(es). " + (result.responderActive ? "Background responder running." : result.wakeConfigured ? "Agent wake configured." : "No agent wake configured; message your agent to resume."), "ok");
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
    cssPath: cssPath, anchorFor: anchorFor, siteTheme: siteTheme, parseColor: parseColor, pickAt: pickAt,
    pins: function () { return pins; }, shell: shell
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
`;

/** Width of the comment column, mirrored in the shell's initial frame width so the first paint is right. */
export const WEB_OVERLAY_COLUMN_PX = 340;
