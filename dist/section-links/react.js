"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SECTION_LINK_OPTIONS, assignHeadingIds, eligibleHeading, fragmentId, headingText, sectionHref, sectionScope, } from "./index.js";
/** How far left of a heading the pointer may be and still be on it — the icon sits in that gutter. */
const GUTTER = 40;
const GAP = 6;
const FEEDBACK_MS = 1600;
const DEFAULT_CLASSES = {
    button: "morpheus-section-links__button",
    icon: "morpheus-section-links__icon",
    status: "morpheus-section-links__status",
};
const DEFAULT_COPY = {
    label: "Copy link to “{title}”",
    copied: "Link copied",
    failed: "Could not copy — the link is in the address bar",
};
/**
 * Low-specificity defaults, so a project's own rule for the same class wins without `!important`.
 * The icon takes the heading's colour at reduced opacity, which keeps it on-brand in light and dark
 * themes without the kit knowing either.
 */
const STYLES = `
:where(.morpheus-section-links__button) {
  position: fixed;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  opacity: 0.45;
  text-decoration: none;
  transition: opacity 120ms ease;
  animation: morpheus-section-links-in 120ms ease;
}
:where(.morpheus-section-links__button):hover,
:where(.morpheus-section-links__button):focus-visible,
:where(.morpheus-section-links__button)[data-status="copied"] {
  opacity: 1;
}
:where(.morpheus-section-links__icon) {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
:where(.morpheus-section-links__status) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@keyframes morpheus-section-links-in {
  from { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  :where(.morpheus-section-links__button) { animation: none; transition: none; }
}
`;
/**
 * Hovering a section heading, or the gutter to its left, shows a link icon there; clicking it puts
 * `page#section` in the address bar and on the clipboard. Mount it once in the HQ layout: it finds
 * headings itself, so no page has to change, and pages added later are covered without anyone
 * remembering to opt in.
 *
 * The icon is one floating element rather than a child injected into each heading. React owns the
 * headings' children: an injected node is wiped by the next text update and, inside a Suspense
 * boundary that has not hydrated yet, turns into a hydration mismatch. The only thing written into
 * a heading is a missing `id`.
 */
export function SectionLinks({ selector, scope, exclude, classes, copy }) {
    const options = useMemo(() => ({
        selector: selector ?? DEFAULT_SECTION_LINK_OPTIONS.selector,
        scope: scope ?? DEFAULT_SECTION_LINK_OPTIONS.scope,
        exclude: exclude ?? DEFAULT_SECTION_LINK_OPTIONS.exclude,
    }), [selector, scope, exclude]);
    const classNames = { ...DEFAULT_CLASSES, ...classes };
    const labels = { ...DEFAULT_COPY, ...copy };
    const [target, setTarget] = useState(null);
    const [status, setStatus] = useState("idle");
    const targetRef = useRef(null);
    const buttonRef = useRef(null);
    const generatedRef = useRef(new WeakMap());
    // The navigation whose fragment has been dealt with, by the browser, by this component, or by
    // the reader copying it. Keyed per navigation rather than per URL: returning to the same URL
    // through a link renders fresh headings that need the scroll again, while a heading remounting
    // under the URL the reader is already on must not yank the page.
    const handledRef = useRef(null);
    useEffect(() => {
        let frame = 0;
        const pass = () => {
            frame = 0;
            const assigned = assignHeadingIds(document, options, generatedRef.current);
            const key = navigationKey();
            if (handledRef.current === key)
                return;
            const wanted = fragmentId(window.location.hash);
            if (!wanted) {
                handledRef.current = key;
            }
            else if (assigned.has(wanted)) {
                // The browser, or the router, looked for the fragment before this id existed, so a shared
                // link to a generated id would otherwise leave the reader where they were.
                handledRef.current = key;
                document.getElementById(wanted)?.scrollIntoView();
            }
            else if (document.getElementById(wanted)) {
                handledRef.current = key; // an authored id: the browser has already scrolled to it
            }
            // Otherwise the target has not rendered yet; a later pass will find it.
        };
        pass();
        const observer = new MutationObserver(() => {
            if (!frame)
                frame = requestAnimationFrame(pass);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [options]);
    useEffect(() => {
        let frame = 0;
        let point = null;
        const locate = (x, y) => {
            const hit = document.elementFromPoint(x, y);
            const current = targetRef.current;
            if (hit && current && buttonRef.current?.contains(hit))
                return measure(current.heading);
            const root = sectionScope(document, options);
            const heading = eligibleHeading(hit, root, options) ??
                eligibleHeading(document.elementFromPoint(x + GUTTER, y), root, options);
            return heading ? measure(heading) : null;
        };
        const probe = () => {
            frame = 0;
            const next = point ? locate(point.x, point.y) : null;
            const previous = targetRef.current;
            if (sameTarget(previous, next))
                return;
            if (previous?.heading !== next?.heading)
                setStatus("idle");
            targetRef.current = next;
            setTarget(next);
        };
        const schedule = () => {
            if (!frame)
                frame = requestAnimationFrame(probe);
        };
        const onMove = (event) => {
            // Touch has no hover; a tap-revealed icon would fight the tap's own target.
            if (event.pointerType === "touch")
                return;
            point = { x: event.clientX, y: event.clientY };
            schedule();
        };
        const onLeave = () => {
            point = null;
            schedule();
        };
        document.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
        // Capture, because a scroll inside a panel does not bubble; the heading moves under a still pointer.
        document.addEventListener("scroll", schedule, { capture: true, passive: true });
        window.addEventListener("resize", schedule);
        return () => {
            document.removeEventListener("pointermove", onMove);
            document.documentElement.removeEventListener("pointerleave", onLeave);
            document.removeEventListener("scroll", schedule, { capture: true });
            window.removeEventListener("resize", schedule);
            cancelAnimationFrame(frame);
        };
    }, [options]);
    useEffect(() => {
        if (status === "idle")
            return;
        const timer = window.setTimeout(() => setStatus("idle"), FEEDBACK_MS);
        return () => window.clearTimeout(timer);
    }, [status]);
    const onClick = useCallback((event) => {
        if (!target)
            return;
        // A modified click is the reader asking for a new tab or window; leave it to the browser.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        event.preventDefault();
        // Read the id now: a generated id follows its heading's text, which may have changed since
        // the icon was placed.
        const id = target.heading.id;
        if (!id)
            return;
        const href = sectionHref(window.location, id);
        // Replace rather than push: copying a link should not add a Back step.
        window.history.replaceState(routerVisibleState(window.history.state), "", href);
        // The reader is already at this section; a heading remounting here must not scroll to it.
        handledRef.current = navigationKey();
        copyText(href).then(() => setStatus("copied"), () => setStatus("failed"));
    }, [target]);
    const message = status === "copied" ? labels.copied : status === "failed" ? labels.failed : "";
    const label = target ? labels.label.replaceAll("{title}", target.title) : "";
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: STYLES }), _jsx("span", { className: classNames.status, role: "status", "aria-live": "polite", children: message }), target
                ? createPortal(_jsx("a", { ref: buttonRef, className: classNames.button, href: `#${encodeURIComponent(target.heading.id || target.id)}`, "aria-label": label, title: message || label, "data-status": status, style: {
                        top: target.top,
                        left: target.left,
                        width: target.size,
                        height: target.size,
                        color: target.color,
                    }, onClick: onClick, children: status === "copied" ? (_jsx("svg", { className: classNames.icon, viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M5 12.5l4.5 4.5L19 7.5" }) })) : (_jsxs("svg", { className: classNames.icon, viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("path", { d: "M9.5 14.5l5-5" }), _jsx("path", { d: "M11 6.5l1.6-1.6a4 4 0 0 1 5.7 5.7L16.7 12.2" }), _jsx("path", { d: "M13 17.5l-1.6 1.6a4 4 0 0 1-5.7-5.7l1.6-1.6" })] })) }), document.body)
                : null] }));
}
/**
 * The history state to replace with. Next.js's App Router patches `replaceState` and forwards a
 * state carrying its `__NA` marker untouched, without updating its own idea of the URL — so the
 * next router refresh would quietly drop the fragment. Without the marker, Next copies its
 * internal entries back itself and adopts the new URL. Any other router's state passes through.
 */
function routerVisibleState(state) {
    if (!state || typeof state !== "object" || !("__NA" in state))
        return state;
    const { __NA: _marker, ...rest } = state;
    return rest;
}
/**
 * One value per navigation. The Navigation API keys an entry and keeps the key across
 * `replaceState`; without it, the URL is the closest stand-in.
 */
function navigationKey() {
    const navigation = window
        .navigation;
    return navigation?.currentEntry?.key ?? window.location.href;
}
function copyText(text) {
    // The Clipboard API exists only in a secure context; the address bar already holds the link.
    if (!navigator.clipboard)
        return Promise.reject(new Error("Clipboard unavailable"));
    return navigator.clipboard.writeText(text);
}
/** Where the icon goes: vertically centred on the heading's first line, just left of its text. */
function measure(heading) {
    if (!heading.isConnected || !heading.id)
        return null;
    const style = getComputedStyle(heading);
    const fontSize = parseFloat(style.fontSize) || 16;
    const size = Math.round(Math.min(20, Math.max(14, fontSize * 0.7)));
    const line = firstLine(heading, style, fontSize);
    return {
        heading,
        id: heading.id,
        title: headingText(heading),
        top: Math.round(line.top + (line.height - size) / 2),
        left: Math.round(Math.max(4, line.left - GAP - size)),
        size,
        color: style.color,
    };
}
function firstLine(heading, style, fontSize) {
    const range = document.createRange();
    range.selectNodeContents(heading);
    // jsdom has no Range layout; real browsers always do.
    const first = typeof range.getClientRects === "function" ? range.getClientRects()[0] : undefined;
    if (first && first.height > 0)
        return { top: first.top, left: first.left, height: first.height };
    const box = heading.getBoundingClientRect();
    const px = (value) => parseFloat(value) || 0;
    return {
        top: box.top + px(style.borderTopWidth) + px(style.paddingTop),
        left: box.left + px(style.borderLeftWidth) + px(style.paddingLeft),
        height: px(style.lineHeight) || fontSize * 1.2,
    };
}
function sameTarget(a, b) {
    if (a === null || b === null)
        return a === b;
    return (a.heading === b.heading &&
        a.id === b.id &&
        a.title === b.title &&
        a.top === b.top &&
        a.left === b.left &&
        a.size === b.size &&
        a.color === b.color);
}
//# sourceMappingURL=react.js.map