/**
 * Production web QA (MO-26-11-15-18.52.12): the comment column mounted inline on a deployed site.
 *
 * The host renders its own launcher, checks that the signed-in account may run QA, then lazily
 * imports this module and calls `mountWebQa`. Nothing here runs on import. The panel is ordinary
 * bundled script: no proxy, frame, eval or injected HTML, and its styles live in a shadow root so
 * neither the site nor the panel restyles the other.
 *
 * It shares the localhost overlay's look and keys (pin colour, column, site-derived theme; Enter
 * saves, Shift+Enter newline, Esc Esc deletes, ⌘/Ctrl+Enter sends) but records far less: see
 * `schema.ts`. Pin mode intercepts page clicks to place pins; Browse mode and an unmounted panel
 * leave the site's own clicks, menus and keys alone.
 */
import { canPin, freeze, loadSession, outcomeMessage, pinAt, markerPoint, reopenPending, saveSession, sessionKey, settle, skipBuild, } from "./drafts.js";
import { WEB_QA_LIMITS } from "./schema.js";
import { QA_COLUMN_PX, QA_PIN_COLOR, siteTheme, themeVariables } from "./visuals.js";
/** The host uses this only for a response that rejected the request before writing. */
export class WebQaRejectedError extends Error {
}
const CSS = `:host{all:initial}*{box-sizing:border-box}
.panel{position:fixed;top:0;right:0;bottom:0;width:${QA_COLUMN_PX}px;display:flex;flex-direction:column;pointer-events:auto;overflow-y:auto;overscroll-behavior:contain;
background:var(--qa-bg);color:var(--qa-fg);border-left:1px solid var(--qa-rule);font:13px/1.45 var(--qa-font);color-scheme:var(--qa-scheme);box-shadow:-2px 0 12px rgba(0,0,0,.12)}
header{padding:12px 16px;border-bottom:1px solid var(--qa-rule);display:flex;flex-direction:column;gap:8px}
.row{display:flex;align-items:center;gap:8px}.row strong{flex:1;font-weight:600;font-size:14px}
.modes{display:inline-flex;border:1px solid var(--qa-rule);border-radius:6px;overflow:hidden}.modes button{border:0;border-radius:0}
.hint,.keys,.count{color:var(--qa-muted);font-size:12px;margin:0}
ol{list-style:none;margin:0;padding:8px 12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:8px}
li{display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--qa-rule);border-radius:8px;background:var(--qa-panel)}
li.focused{border-color:var(--qa-fg)}li.pending{opacity:.7}
li .open{flex:1;text-align:left;border:0;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}
li .meta{display:block;color:var(--qa-muted);font-size:11px}.empty{color:var(--qa-muted);font-style:italic}
.num{flex:0 0 auto;min-width:20px;height:20px;border-radius:10px;background:${QA_PIN_COLOR};color:#fff;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center}
.none{color:var(--qa-muted);padding:4px}
.pending-box{margin:0 12px;padding:8px;border:1px solid ${QA_PIN_COLOR};border-radius:6px;display:flex;flex-direction:column;gap:6px}
.composer{padding:12px 16px 16px;border-top:1px solid var(--qa-rule);display:flex;flex-direction:column;gap:8px}
textarea{width:100%;min-height:80px;resize:vertical;font:inherit;color:var(--qa-fg);background:var(--qa-field);border:1px solid var(--qa-rule);border-radius:8px;padding:8px}
textarea:disabled{opacity:.5}select{font:inherit}
label{display:flex;align-items:center;gap:6px}
.batch-notes{display:grid;gap:5px;padding:12px 16px 0;font-weight:600}.batch-notes textarea{min-height:58px;font-weight:400}
.status{min-height:1.3em;font-size:12px;color:var(--qa-muted);margin:0}.status.ok{color:var(--qa-ok)}.status.err{color:#d93025}
button{font:inherit;color:var(--qa-fg);background:transparent;border:1px solid var(--qa-rule);border-radius:6px;padding:6px 10px;cursor:pointer}
button:disabled{opacity:.45;cursor:default}button[aria-pressed=true]{background:var(--qa-fg);color:var(--qa-bg)}
button.primary{background:var(--qa-fg);color:var(--qa-bg);border-color:var(--qa-fg);font-weight:600;padding:8px 12px}
button.x{border:0;padding:0 4px;line-height:20px;color:var(--qa-muted)}
:focus-visible{outline:2px solid ${QA_PIN_COLOR};outline-offset:2px}
.pin{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:12px;background:${QA_PIN_COLOR};color:#fff;border:2px solid #fff;padding:0;
font:700 11px/20px system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4);pointer-events:none}
.pin.live{pointer-events:auto}.pin.pending{opacity:.6}.pin.focused{outline:2px solid ${QA_PIN_COLOR};outline-offset:2px}
[hidden]{display:none!important}
@media (max-width:999px){.panel{top:auto;left:0;width:auto;max-height:55vh;border-left:0;border-top:1px solid var(--qa-rule);box-shadow:0 -2px 12px rgba(0,0,0,.12)}ol{max-height:18vh}}`;
const SCOPES = [["element", "Element"], ["view", "Current view"], ["page", "Whole page"]];
// Events Pin mode keeps from the site: the press, its click, and the context menu.
const PIN_EVENTS = ["pointerdown", "mousedown", "mouseup", "click", "auxclick", "contextmenu"];
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
        if (value === false)
            continue;
        el.setAttribute(name, value === true ? "" : value);
    }
    el.append(...children);
    return el;
}
function uuid() {
    if (typeof crypto.randomUUID === "function")
        return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const x = Array.from(b, n => n.toString(16).padStart(2, "0")).join("");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
function applyStyles(root) {
    // A constructed sheet is not inline style, so a strict style-src CSP still admits it.
    try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        root.adoptedStyleSheets = [sheet];
        return;
    }
    catch { /* older engines: fall back to a style element */ }
    root.append(h("style", {}, CSS));
}
function safeStorage() {
    try {
        return window.sessionStorage;
    }
    catch {
        return null;
    }
}
/** Mount the QA panel in Pin mode. Returns a function that removes every trace of it from the page. */
export function mountWebQa(options) {
    const { project, accountKey, canBuild, submit, onClose } = options;
    const storage = safeStorage();
    const key = sessionKey(project, accountKey, location.origin);
    let session = loadSession(storage, key);
    let pinMode = true, busy = false, mounted = true, focusedId = null;
    let deleteArm = null;
    let lastPath = location.pathname, frame = 0;
    const pageStyle = document.documentElement.style;
    const priorCursor = pageStyle.cursor;
    const priorMargin = pageStyle.marginInlineEnd;
    const host = h("morpheus-web-qa");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const root = host.attachShadow({ mode: "open" });
    applyStyles(root);
    // ---- static structure -------------------------------------------------------------------------
    const pinBtn = h("button", { type: "button", "aria-pressed": "true" }, "Pin");
    const browseBtn = h("button", { type: "button", "aria-pressed": "false" }, "Browse");
    const closeBtn = h("button", { type: "button", class: "x", "aria-label": "Close QA" }, "✕");
    const hint = h("p", { class: "hint" });
    const pageBtn = h("button", { type: "button" }, "Comment on this page");
    const list = h("ol", { "aria-label": "Comments" });
    const notesEl = h("textarea", { "aria-label": "Notes", maxlength: String(WEB_QA_LIMITS.notesChars), placeholder: "Guidance for this batch…" });
    const pendingBox = h("div", { class: "pending-box", role: "group", "aria-label": "Unsent batch" });
    const scopeEl = h("select", { "aria-label": "Applies to" }, ...SCOPES.map(([v, label]) => h("option", { value: v }, label)));
    const textEl = h("textarea", { "aria-label": "Comment", maxlength: String(WEB_QA_LIMITS.textChars), placeholder: "Comment for this pin…" });
    const countEl = h("p", { class: "count", "aria-hidden": "true" });
    const buildEl = h("input", { type: "checkbox" });
    const flagEl = h("input", { type: "checkbox" });
    const flagRow = h("label", {}, flagEl, "Feature flag");
    const buildRow = h("div", {}, h("label", {}, buildEl, "Build and deploy"), flagRow);
    const statusEl = h("p", { class: "status", role: "status", "aria-live": "polite" });
    const sendBtn = h("button", { type: "button", class: "primary" }, "Send");
    const pinsEl = h("div", { class: "pins" });
    const panel = h("aside", { class: "panel", "aria-label": `QA comments for ${project}` }, h("header", {}, h("div", { class: "row" }, h("strong", {}, `QA · ${project}`), closeBtn), h("div", { class: "row" }, h("div", { class: "modes", role: "group", "aria-label": "Mode" }, pinBtn, browseBtn), pageBtn), hint), h("label", { class: "batch-notes" }, "Notes", notesEl), list, pendingBox, h("div", { class: "composer" }, h("label", {}, "Applies to", scopeEl), textEl, countEl, h("p", { class: "keys" }, "Enter saves · Shift+Enter newline · Esc Esc deletes · ⌘Enter sends"), buildRow, statusEl, sendBtn));
    buildRow.hidden = !canBuild;
    root.append(pinsEl, panel);
    // ---- state helpers ----------------------------------------------------------------------------
    const focused = () => session.drafts.find(d => d.id === focusedId);
    function storeAttempt(next) {
        if (!storage || saveSession(storage, key, next))
            return true;
        // If there was a stored draft, starting now could restore its editable text
        // after reload and send it again under a second batch ID.
        try {
            return storage.getItem(key) === null;
        }
        catch {
            return false;
        }
    }
    function persist() {
        if (!saveSession(storage, key, session))
            setStatus("This browser would not keep the draft; it is lost on reload.", "err");
    }
    function setStatus(message, kind = "") {
        statusEl.textContent = message;
        statusEl.className = `status ${kind}`.trim();
    }
    function update(next) { session = next; persist(); render(); }
    // ---- rendering --------------------------------------------------------------------------------
    function render() {
        pinBtn.setAttribute("aria-pressed", String(pinMode));
        browseBtn.setAttribute("aria-pressed", String(!pinMode));
        hint.textContent = pinMode
            ? "Click anything on the page to pin a comment. Esc or Browse returns the site to normal."
            : "The site works normally. Choose Pin to add comments.";
        renderList();
        renderPending();
        notesEl.disabled = !!session.pending;
        const notes = session.pending?.batch.notes ?? session.notes ?? "";
        if (notesEl.value !== notes)
            notesEl.value = notes;
        const d = focused();
        textEl.disabled = scopeEl.disabled = !d;
        if (!d)
            textEl.value = "";
        else if (textEl.value !== d.text)
            textEl.value = d.text;
        if (d)
            scopeEl.value = d.scope;
        countEl.textContent = `${textEl.value.length}/${WEB_QA_LIMITS.textChars}`;
        buildEl.checked = session.buildAndDeploy;
        flagEl.checked = session.makeFeatureFlag;
        flagRow.hidden = !session.buildAndDeploy;
        sendBtn.textContent = busy ? "Sending…" : session.pending ? "Retry" : "Send";
        sendBtn.disabled = busy || (!session.pending && !session.drafts.some(x => x.text.trim()));
        renderPins();
    }
    function renderList() {
        const items = session.drafts.map((d, i) => {
            const del = h("button", { type: "button", class: "x", "aria-label": `Delete comment ${i + 1}` }, "✕");
            del.addEventListener("click", () => remove(d.id));
            const open = h("button", { type: "button", class: "open" }, d.text.trim() ? d.text : h("span", { class: "empty" }, "No text yet"), h("span", { class: "meta" }, `${SCOPES.find(s => s[0] === d.scope)[1]} · ${d.path}`));
            open.addEventListener("click", () => select(d.id));
            return h("li", { class: d.id === focusedId ? "focused" : "" }, h("span", { class: "num", "aria-hidden": "true" }, String(i + 1)), open, del);
        });
        list.replaceChildren(...(items.length ? items : [h("li", { class: "none" }, pinMode ? "No comments yet." : "No comments yet. Choose Pin to add one.")]));
    }
    function renderPending() {
        const p = session.pending;
        pendingBox.hidden = !p;
        if (!p) {
            pendingBox.replaceChildren();
            return;
        }
        const n = p.batch.comments.length;
        const options = p.batch.buildAndDeploy ? (p.batch.makeFeatureFlag ? " Build and deploy behind a feature flag." : " Build and deploy.") : "";
        const text = p.state === "build-retry"
            ? `${n} saved comment${n === 1 ? "" : "s"}; the build request has not queued.${options}`
            : `${n} comment${n === 1 ? "" : "s"} ${p.state === "rejected" ? "rejected" : "not confirmed"}.${options}`;
        if (p.state === "unconfirmed") {
            pendingBox.replaceChildren(h("span", {}, text));
            return;
        }
        const secondary = h("button", { type: "button" }, p.state === "build-retry" ? "Skip build" : "Edit again");
        secondary.disabled = busy;
        secondary.addEventListener("click", () => {
            update(p.state === "build-retry" ? skipBuild(session) : reopenPending(session));
            setStatus(p.state === "build-retry" ? "Build request dropped; comments stay saved." : "Comments returned to drafts.");
        });
        pendingBox.replaceChildren(h("span", {}, text), h("div", { class: "row" }, secondary));
    }
    function renderPins() {
        const markers = [];
        const draw = (d, label, pending) => {
            const at = markerPoint(d, window, document);
            if (!at)
                return;
            const pin = h("button", { type: "button", class: ["pin", pinMode && !pending ? "live" : "", pending ? "pending" : "", d.id === focusedId ? "focused" : ""].join(" "), "aria-label": `Comment ${label}`, tabindex: "-1" }, label);
            pin.style.left = `${at.x}px`;
            pin.style.top = `${at.y}px`;
            if (!pending)
                pin.addEventListener("click", () => select(d.id));
            markers.push(pin);
        };
        session.drafts.forEach((d, i) => draw(d, String(i + 1), false));
        session.pending?.drafts.forEach(d => draw(d, "•", true));
        pinsEl.replaceChildren(...markers);
    }
    function follow() {
        if (frame || !mounted)
            return;
        frame = requestAnimationFrame(() => { frame = 0; renderPins(); });
    }
    function applyTheme() {
        for (const [name, value] of Object.entries(themeVariables(siteTheme(window))))
            host.style.setProperty(name, value);
    }
    // ---- pins and editing -------------------------------------------------------------------------
    function addPin(target, clientX, clientY, scope = "element") {
        if (!canPin(session)) {
            setStatus(`At most ${WEB_QA_LIMITS.comments} comments per batch; send these first.`, "err");
            return;
        }
        const result = pinAt(window, target, clientX, clientY, uuid());
        if ("error" in result) {
            setStatus(result.error, "err");
            return;
        }
        result.draft.scope = scope;
        deleteArm = null;
        focusedId = result.draft.id;
        textEl.value = "";
        update({ ...session, drafts: [...session.drafts, result.draft] });
        setStatus(`Pin ${session.drafts.length} placed; type a comment.`);
        textEl.focus();
    }
    function select(id) {
        deleteArm = null;
        focusedId = id;
        textEl.value = focused()?.text ?? "";
        render();
        textEl.focus();
    }
    function remove(id) {
        deleteArm = null;
        if (focusedId === id)
            focusedId = null;
        update({ ...session, drafts: session.drafts.filter(d => d.id !== id) });
        setStatus("Comment deleted.");
    }
    function edit(change) {
        const d = focused();
        if (!d)
            return;
        session = { ...session, drafts: session.drafts.map(x => (x === d ? { ...x, ...change } : x)) };
        persist();
        renderList();
        countEl.textContent = `${textEl.value.length}/${WEB_QA_LIMITS.textChars}`;
        sendBtn.disabled = busy || (!session.pending && !session.drafts.some(x => x.text.trim()));
    }
    function saveAndClear() {
        deleteArm = null;
        focusedId = null;
        textEl.value = "";
        render();
    }
    async function send() {
        if (busy)
            return;
        const canCorrect = !session.pending || session.pending.state === "rejected";
        const frozen = freeze(session, session.pending?.batch.batchId ?? uuid(), canBuild);
        if ("error" in frozen) {
            setStatus(frozen.error, "err");
            return;
        }
        // The frozen batch is stored before the request so a lost response or reload retries this UUID.
        const next = { ...frozen.session, pending: { ...frozen.session.pending, state: "unconfirmed" } };
        if (!storeAttempt(next)) {
            setStatus("Browser storage could not keep this batch safe to retry. Try Send again before reloading.", "err");
            return;
        }
        if (frozen.session.pending?.drafts.some(d => d.id === focusedId))
            focusedId = null;
        busy = true;
        session = next;
        render();
        setStatus("Sending…");
        let receipt;
        try {
            receipt = await submit(structuredClone(frozen.batch));
        }
        catch (error) {
            if (mounted && canCorrect && error instanceof WebQaRejectedError && session.pending) {
                busy = false;
                update({ ...session, pending: { ...session.pending, state: "rejected" } });
                setStatus(error.message, "err");
                return;
            }
        }
        busy = false;
        if (!mounted)
            return;
        const result = settle(session, receipt);
        session = result.session;
        persist();
        render();
        setStatus(outcomeMessage(result.outcome, frozen.batch.comments.length), result.outcome === "saved" || result.outcome === "queued" ? "ok" : "err");
    }
    // ---- page events: only in Pin mode ------------------------------------------------------------
    const ours = (e) => e.composedPath().some(node => node === host || (node instanceof Element && node.hasAttribute("data-qa-chrome")));
    function pinTarget(e) {
        const path = e.composedPath().filter((node) => node instanceof Element);
        // Slotted content has both DOM ancestors and ancestors in the composed event path.
        if (path.some(el => el.hasAttribute("data-qa-private"))) {
            setStatus("This area is private; pin something nearby instead.", "err");
            return;
        }
        return path[0];
    }
    function onPagePointer(e) {
        if (ours(e))
            return;
        const mouse = e;
        if (e.type === "contextmenu" && mouse.shiftKey)
            return; // Shift+right-click keeps the browser menu.
        e.preventDefault();
        e.stopImmediatePropagation();
        const placing = e.type === "contextmenu" || (e.type === "click" && mouse.button === 0);
        if (!placing)
            return;
        const target = pinTarget(e);
        if (target)
            addPin(target, mouse.clientX, mouse.clientY);
    }
    function onPageKey(e) {
        if (ours(e))
            return;
        if (e.key === "Escape") {
            e.preventDefault();
            setMode(false);
            return;
        }
        // Keyboard pinning: Enter on a focused page element pins its centre.
        if (e.key === "Enter" && e.target !== document.body) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = pinTarget(e);
            if (!target)
                return;
            const r = target.getBoundingClientRect();
            addPin(target, r.left + r.width / 2, r.top + r.height / 2);
        }
    }
    let listening = false;
    function setListening(on) {
        if (on === listening)
            return;
        listening = on;
        for (const type of PIN_EVENTS) {
            if (on)
                window.addEventListener(type, onPagePointer, true);
            else
                window.removeEventListener(type, onPagePointer, true);
        }
        if (on)
            window.addEventListener("keydown", onPageKey, true);
        else
            window.removeEventListener("keydown", onPageKey, true);
        pageStyle.cursor = on ? "crosshair" : priorCursor;
    }
    function setMode(pin) {
        pinMode = pin;
        setListening(pin);
        render();
    }
    // ---- panel events -----------------------------------------------------------------------------
    pinBtn.addEventListener("click", () => setMode(true));
    browseBtn.addEventListener("click", () => setMode(false));
    closeBtn.addEventListener("click", () => { unmount(); onClose(); });
    pageBtn.addEventListener("click", () => addPin(document.body, innerWidth / 2, innerHeight / 2, "page"));
    sendBtn.addEventListener("click", () => { void send(); });
    scopeEl.addEventListener("change", () => edit({ scope: scopeEl.value }));
    textEl.addEventListener("input", () => edit({ text: textEl.value }));
    notesEl.addEventListener("input", () => {
        session = { ...session, notes: notesEl.value };
        persist();
    });
    buildEl.addEventListener("change", () => update({ ...session, buildAndDeploy: buildEl.checked, makeFeatureFlag: buildEl.checked && session.makeFeatureFlag }));
    flagEl.addEventListener("change", () => update({ ...session, makeFeatureFlag: session.buildAndDeploy && flagEl.checked }));
    textEl.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            saveAndClear();
            void send();
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveAndClear();
            setStatus("Saved. Send when ready.");
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            if (!e.repeat)
                escape();
        }
    });
    panel.addEventListener("keydown", e => {
        if (e.target === textEl)
            return;
        if (e.key === "Escape") {
            e.preventDefault();
            if (!e.repeat) {
                if (deleteArmed())
                    escape();
                else
                    setMode(false);
            }
        }
        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
        }
    });
    function deleteArmed() {
        return !!deleteArm && deleteArm.id === focusedId && Date.now() - deleteArm.at < 1000;
    }
    function escape() {
        const d = focused();
        if (!d)
            return;
        if (deleteArmed()) {
            remove(d.id);
            return;
        }
        deleteArm = { id: d.id, at: Date.now() };
        textEl.blur();
        sendBtn.focus();
        setStatus(`Press Esc again to delete pin ${session.drafts.indexOf(d) + 1}.`);
    }
    // Single-page navigation changes the path without an event this panel can rely on.
    const timer = window.setInterval(() => {
        applyTheme();
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            renderPins();
        }
    }, 500);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    function layout() {
        pageStyle.marginInlineEnd = window.innerWidth >= 1000 ? `${QA_COLUMN_PX}px` : priorMargin;
        follow();
    }
    window.addEventListener("resize", layout);
    function unmount() {
        if (!mounted)
            return;
        mounted = false;
        setListening(false);
        window.clearInterval(timer);
        if (frame)
            cancelAnimationFrame(frame);
        window.removeEventListener("scroll", follow, { capture: true });
        window.removeEventListener("resize", layout);
        pageStyle.marginInlineEnd = priorMargin;
        host.remove();
    }
    document.body.append(host);
    layout();
    applyTheme();
    setMode(true);
    if (session.pending)
        setStatus(outcomeMessage(session.pending.state === "build-retry" ? "build-retry" : "unconfirmed", session.pending.batch.comments.length), "err");
    pinBtn.focus();
    return unmount;
}
//# sourceMappingURL=mount.js.map