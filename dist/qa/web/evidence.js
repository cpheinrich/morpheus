import { domToCanvas } from "modern-screenshot";
import { WEB_QA_COUNT_MAX, WEB_QA_JPEG_MAX_CHARS, WEB_QA_JPEG_MAX_EDGE, WEB_QA_LIMITS, WebQaEvidenceElement, WebQaEvidenceStatus, } from "./schema.js";
import { rgba, siteTheme } from "./visuals.js";
const BODY_LIMIT = 2 * 1024 * 1024;
const NODE_LIMIT = 2500;
const TEXT_LIMIT = 60_000;
const MEDIA_LIMIT = 512 * 1024;
const MEDIA_COUNT_LIMIT = 12;
const MASK = "#656a72";
const HTML = "http://www.w3.org/1999/xhtml";
const SKIP = "head, script, style, link, meta, template, noscript, [data-qa-chrome], morpheus-web-qa, [data-qa-capture-frame]";
const MASKED = "[data-qa-private], [contenteditable]:not([contenteditable=false]), [is], input, textarea, select, option, output, datalist, meter, progress, iframe, frame, object, embed, audio, [role=textbox], [role=searchbox], [role=combobox], [role=spinbutton]";
const TAGS = new Set("a abbr address article aside b bdi bdo blockquote button caption cite code col colgroup dd del details dfn div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i ins kbd label legend li main mark menu nav ol p pre q s samp section small span strong sub summary sup table tbody td tfoot th thead time tr u ul var wbr".split(" "));
const STYLES = ("display visibility opacity position top right bottom left z-index box-sizing width height min-width min-height max-width max-height aspect-ratio " +
    "margin padding border border-radius border-top border-right border-bottom border-left outline outline-offset box-shadow background-color color " +
    "font-family font-size font-style font-weight font-stretch line-height letter-spacing word-spacing text-align text-decoration text-transform text-indent text-shadow " +
    "white-space overflow-wrap word-break direction writing-mode vertical-align overflow-x overflow-y text-overflow " +
    "flex flex-direction flex-wrap order justify-content justify-items justify-self align-content align-items align-self gap " +
    "grid-template-columns grid-template-rows grid-row grid-column grid-auto-flow grid-auto-columns grid-auto-rows " +
    "transform transform-origin object-fit object-position float clear list-style-type list-style-position border-collapse border-spacing table-layout").split(" ");
function masked(node) {
    return node.namespaceURI !== HTML || node.localName.includes("-") || !!node.shadowRoot || node.matches(MASKED);
}
function browserInfo(ua) {
    const families = [
        ["Edge", /\b(?:EdgiOS|EdgA|Edg|Edge)\/([\d.]+)/], ["Opera", /\b(?:OPR|Opera)\/([\d.]+)/],
        ["Samsung Internet", /\bSamsungBrowser\/([\d.]+)/], ["Firefox", /\b(?:Firefox|FxiOS)\/([\d.]+)/],
        ["Chromium", /\bChromium\/([\d.]+)/], ["Chrome", /\b(?:HeadlessChrome|Chrome|CriOS)\/([\d.]+)/],
        ["Safari", /\bVersion\/([\d.]+).*\bSafari\//],
    ];
    for (const [family, token] of families) {
        const version = token.exec(ua)?.[1];
        if (version && /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(version))
            return { family, version, versionSource: "user-agent" };
    }
    return { family: /\bSafari\//.test(ua) ? "Safari" : "Unknown", versionSource: "unavailable" };
}
function osFamily(win, ua) {
    if (/Android/i.test(ua))
        return "Android";
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && win.navigator.maxTouchPoints > 1))
        return "iOS";
    if (/Macintosh|Mac OS X/i.test(ua))
        return "macOS";
    if (/Windows/i.test(ua))
        return "Windows";
    if (/CrOS/i.test(ua))
        return "ChromeOS";
    return /Linux/i.test(ua) ? "Linux" : "Unknown";
}
function describe(win, target) {
    const lineage = [];
    for (let node = target; node; node = node.parentElement) {
        if (masked(node) || node.matches(SKIP) || node.getRootNode() !== win.document)
            return undefined;
        if (lineage.length < 4)
            lineage.push(node);
    }
    return lineage.map(node => {
        const rect = node.getBoundingClientRect();
        const style = win.getComputedStyle(node);
        const expanded = node.getAttribute("aria-expanded");
        const selected = node.getAttribute("aria-selected");
        return WebQaEvidenceElement.parse({
            tag: WebQaEvidenceElement.shape.tag.safeParse(node.localName).data ?? "other",
            role: WebQaEvidenceElement.shape.role.safeParse(node.getAttribute("role")).data,
            expanded: expanded === "true" ? true : expanded === "false" ? false : undefined,
            pressed: WebQaEvidenceElement.shape.pressed.safeParse(node.getAttribute("aria-pressed")).data,
            selected: selected === "true" ? true : selected === "false" ? false : undefined,
            position: WebQaEvidenceElement.shape.position.safeParse(style.position).data ?? "static",
            width: Math.min(WEB_QA_LIMITS.viewportMax, Math.round(rect.width)),
            height: Math.min(WEB_QA_LIMITS.viewportMax, Math.round(rect.height)),
            scrollLeft: boundedScroll(node.scrollLeft, -WEB_QA_LIMITS.scrollMax),
            scrollTop: boundedScroll(node.scrollTop, 0),
        });
    });
}
function boundedScroll(value, min) {
    return value ? Math.round(Math.max(min, Math.min(value, WEB_QA_LIMITS.scrollMax))) : undefined;
}
export function evidenceMetadata(win, target, input, errors) {
    const capturedAt = new Date().toISOString();
    const ua = win.navigator.userAgent;
    const dpr = win.devicePixelRatio;
    return {
        schemaVersion: 1, capturedAt, input, browser: browserInfo(ua), os: osFamily(win, ua),
        ...(dpr >= 0.1 && dpr <= 32 ? { dpr: Math.round(dpr * 100) / 100 } : {}),
        theme: siteTheme(win).dark ? "dark" : "light",
        elements: describe(win, target),
        resources: Math.min(WEB_QA_COUNT_MAX, win.performance.getEntriesByType?.("resource").length ?? 0),
        errorsSinceMount: errors,
        status: { kind: "unavailable", reason: "interrupted" },
    };
}
function copyStyle(style, clone) {
    for (const property of STYLES) {
        const value = style.getPropertyValue(property);
        if (value.length <= 500 && !/url\s*\(|image\s*\(|image-set\s*\(/i.test(value))
            clone.style.setProperty(property, value);
    }
}
function mediaSize(node) {
    if (node instanceof HTMLImageElement && node.complete && node.naturalWidth) {
        return { width: node.naturalWidth, height: node.naturalHeight };
    }
    if (node instanceof HTMLVideoElement && node.readyState >= 2) {
        return { width: node.videoWidth, height: node.videoHeight };
    }
    if (node instanceof HTMLCanvasElement)
        return { width: node.width, height: node.height };
}
function mediaPixels(node, budget) {
    if (budget < 1024)
        return;
    const size = mediaSize(node);
    if (!size || !size.width || !size.height)
        return;
    try {
        const scale = Math.min(1, 640 / Math.max(size.width, size.height));
        const canvas = node.ownerDocument.createElement("canvas");
        canvas.width = Math.max(1, Math.round(size.width * scale));
        canvas.height = Math.max(1, Math.round(size.height * scale));
        const context = canvas.getContext("2d");
        if (!context)
            return;
        context.drawImage(node, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/webp", 0.8);
        if (data.length <= budget && /^data:image\/(?:webp|png);base64,/.test(data))
            return data;
        const jpeg = canvas.toDataURL("image/jpeg", 0.76);
        return jpeg.length <= budget && jpeg.startsWith("data:image/jpeg;base64,") ? jpeg : undefined;
    }
    catch {
        return undefined;
    }
}
function maskBox(clone, style, rect) {
    clone.style.backgroundColor = MASK;
    clone.style.boxShadow = "none";
    clone.style.borderColor = MASK;
    if (style.display === "inline" || style.display === "contents")
        clone.style.display = "inline-block";
    if (!rect.width || !rect.height)
        clone.style.visibility = "hidden";
    else if (style.width === "auto" || style.height === "auto") {
        clone.style.boxSizing = "border-box";
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
    }
}
function positionBox(clone, style, rect, positions) {
    const sticky = style.position === "sticky";
    if (!sticky && style.position !== "fixed")
        return false;
    clone.style.position = sticky ? "relative" : "absolute";
    if (sticky)
        clone.style.inset = "auto";
    if (positions) {
        clone.dataset.qaPosition = String(positions.length);
        positions.push({ left: rect.left, top: rect.top });
    }
    return true;
}
function inViewport(rect, width, height) {
    return rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
}
function cloneTag(node, hide, pixels) {
    if (pixels)
        return "img";
    if (!hide && (TAGS.has(node.localName) || node.localName === "br"))
        return node.localName;
    return "div";
}
function freezeViewport(win) {
    const { document: doc, innerWidth: width, innerHeight: height } = win;
    if (width < 1 || height < 1 || width > WEB_QA_LIMITS.viewportMax || height > WEB_QA_LIMITS.viewportMax
        || (win.visualViewport && Math.abs(win.visualViewport.scale - 1) > 0.01))
        return "unsupported";
    const snapshot = doc.implementation.createHTMLDocument("");
    const range = doc.createRange();
    const wrapper = snapshot.createElement("div");
    const positions = [];
    const deadline = win.performance.now() + 180;
    let count = 0, text = 0, media = MEDIA_LIMIT, mediaCount = 0;
    wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${rgba(siteTheme(win).bg, 1)}`;
    function visibleText(node, visible) {
        if (!visible)
            return snapshot.createTextNode("");
        const value = node.nodeValue ?? "";
        if (value.trim()) {
            range.selectNodeContents(node);
            if (!Array.from(range.getClientRects()).some(rect => inViewport(rect, width, height))) {
                return snapshot.createTextNode("");
            }
        }
        text += value.length;
        if (text > TEXT_LIMIT)
            throw new RangeError();
        return snapshot.createTextNode(value);
    }
    function takeMedia(node, rect, style) {
        if (style.visibility !== "visible" || !inViewport(rect, width, height) || mediaCount >= MEDIA_COUNT_LIMIT)
            return;
        mediaCount++;
        const pixels = mediaPixels(node, media);
        if (pixels)
            media -= pixels.length;
        return pixels;
    }
    function copyChildren(node, clone, depth, positioned, visible) {
        const nested = node !== doc.scrollingElement;
        const left = nested ? node.scrollLeft : 0;
        const top = nested ? node.scrollTop : 0;
        if (left || top)
            clone.style.overflow = "hidden";
        for (const child of node.childNodes) {
            const copied = copy(child, depth + 1, -left, -top, positioned, visible);
            if (copied)
                clone.append(copied);
        }
    }
    function copy(node, depth, dx = 0, dy = 0, positioned = false, visible = true) {
        if (++count > NODE_LIMIT || depth > 80 || win.performance.now() > deadline)
            throw new RangeError();
        if (node.nodeType === Node.TEXT_NODE)
            return visibleText(node, visible);
        if (!(node instanceof Element) || node.matches(SKIP))
            return null;
        const style = win.getComputedStyle(node);
        if (style.display === "none" || style.getPropertyValue("content-visibility") === "hidden")
            return null;
        return copyElement(node, style, depth, dx, dy, positioned);
    }
    function copyElement(node, style, depth, dx, dy, positioned) {
        const rect = node.getBoundingClientRect();
        const hidden = masked(node);
        const isMedia = node.matches("img, video, canvas");
        const pixels = !hidden && isMedia ? takeMedia(node, rect, style) : undefined;
        const clone = snapshot.createElement(cloneTag(node, hidden, !!pixels));
        copyStyle(style, clone);
        if (dx || dy)
            clone.style.setProperty("translate", `${dx}px ${dy}px`);
        const fixedOrSticky = positionBox(clone, style, rect, positioned ? undefined : positions);
        if (pixels)
            clone.src = pixels;
        else if (hidden || isMedia)
            maskBox(clone, style, rect);
        else
            copyChildren(node, clone, depth, positioned || fixedOrSticky, style.visibility === "visible");
        return clone;
    }
    try {
        const frozen = copy(doc.documentElement, 0);
        if (!frozen)
            return "unsupported";
        frozen.style.display = "flow-root";
        frozen.style.transform = `translate(${-win.scrollX}px, ${-win.scrollY}px)`;
        wrapper.append(frozen);
        const html = new XMLSerializer().serializeToString(wrapper);
        return new Blob([html]).size > BODY_LIMIT || win.performance.now() > deadline ? "snapshot-limit" : { html, width, height, positions };
    }
    catch (error) {
        return error instanceof RangeError ? "snapshot-limit" : "unsupported";
    }
}
function alignPositioned(root, positions) {
    const adjustments = Array.from(root.querySelectorAll("[data-qa-position]"), node => {
        const { left, top } = positions[Number(node.dataset.qaPosition)];
        const rect = node.getBoundingClientRect();
        const [dx, dy] = (node.style.getPropertyValue("translate") || "0 0").split(" ").map(value => parseFloat(value));
        return { node, translate: `${dx + left - rect.left}px ${dy + top - rect.top}px` };
    });
    for (const { node, translate } of adjustments)
        node.style.setProperty("translate", translate);
}
function encodeJpeg(canvas) {
    const painted = canvas.getContext("2d")?.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3];
    if (!painted)
        return { kind: "unavailable", reason: "render-failed" };
    for (const scale of [1, 0.75, 0.5, 0.33]) {
        let image = canvas;
        if (scale !== 1) {
            image = canvas.ownerDocument.createElement("canvas");
            image.width = Math.max(1, Math.floor(canvas.width * scale));
            image.height = Math.max(1, Math.floor(canvas.height * scale));
            const context = image.getContext("2d");
            if (!context)
                return { kind: "unavailable", reason: "render-failed" };
            context.drawImage(canvas, 0, 0, image.width, image.height);
        }
        const prefix = "data:image/jpeg;base64,";
        const data = image.toDataURL("image/jpeg", 0.58);
        if (!data.startsWith(prefix))
            return { kind: "unavailable", reason: "render-failed" };
        if (data.length > prefix.length + WEB_QA_JPEG_MAX_CHARS)
            continue;
        const parsed = WebQaEvidenceStatus.safeParse({ kind: "captured", jpegBase64: data.slice(prefix.length), width: image.width, height: image.height });
        return parsed.success ? parsed.data : { kind: "unavailable", reason: "render-failed" };
    }
    return { kind: "unavailable", reason: "image-too-large" };
}
async function rasterize(win, shot, container, signal) {
    const iframe = win.document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("data-qa-capture-frame", "");
    iframe.tabIndex = -1;
    iframe.style.cssText = `all:initial!important;position:fixed!important;left:-100000px!important;top:0!important;pointer-events:none!important;border:0!important;width:${shot.width}px!important;height:${shot.height}px!important`;
    const failed = { kind: "unavailable", reason: "render-failed" };
    let timer = 0;
    let stop = () => { };
    try {
        return await new Promise(resolve => {
            stop = () => resolve({ kind: "unavailable", reason: "interrupted" });
            if (signal.aborted)
                return stop();
            signal.addEventListener("abort", stop, { once: true });
            timer = win.setTimeout(() => resolve(failed), 6000);
            iframe.addEventListener("load", () => {
                const root = iframe.contentDocument?.body?.firstElementChild;
                if (!root || signal.aborted)
                    return resolve(failed);
                void (async () => {
                    alignPositioned(root, shot.positions);
                    const canvas = await domToCanvas(root, {
                        width: shot.width, height: shot.height, scale: Math.min(1, WEB_QA_JPEG_MAX_EDGE / Math.max(shot.width, shot.height)),
                        timeout: 3000, font: false, fetchFn: async () => "data:,",
                    });
                    return encodeJpeg(canvas);
                })().then(resolve, () => resolve(failed));
            }, { once: true });
            iframe.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-src about:"><body style="margin:0">${shot.html}</body>`;
            container.append(iframe);
        });
    }
    catch {
        return failed;
    }
    finally {
        win.clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        iframe.remove();
    }
}
export async function captureViewport(win, container, signal) {
    const shot = freezeViewport(win);
    return typeof shot === "string" ? { kind: "unavailable", reason: shot } : rasterize(win, shot, container, signal);
}
//# sourceMappingURL=evidence.js.map