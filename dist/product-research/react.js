"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useFragmentView } from "../ops-desk/react.js";
import { verifiedResearchLibraryBlob } from "../research-library/client.js";
import { formatResearchLibraryBytes } from "../research-library/index.js";
import { APP_RESEARCH_POINT_CANVAS, } from "./index.js";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export function ProductResearchViewer({ study, readAsset }) {
    const { app } = study;
    const screens = useMemo(() => new Map(app.screens.map((screen) => [screen.id, screen])), [app.screens]);
    const entry = { screen: app.entryScreenId, control: null };
    const { view, navigate } = useFragmentView({
        initial: entry,
        historyKey: `appResearch:${study.studyId}`,
        read: (hash) => readView(hash, screens, app.entryScreenId),
        write: (next) => next.screen === app.entryScreenId && !next.control ? "" :
            "#" + new URLSearchParams({ screen: next.screen, ...(next.control ? { control: next.control } : {}) }).toString(),
    });
    const screen = screens.get(view.screen) ?? screens.get(app.entryScreenId);
    const reader = useRef(readAsset);
    reader.current = readAsset;
    const read = useMemo(() => (path) => reader.current(path), []);
    return (_jsxs("div", { className: "app-research", children: [_jsxs("header", { className: "app-research-header", children: [_jsx("h2", { className: "app-research-title", children: app.name }), _jsxs("p", { className: "app-research-meta", children: ["Version ", app.version, " \u00B7 ", _jsx("span", { className: "app-research-badge", children: app.status }), " \u00B7 ", study.device.model, study.device.osVersion ? ` (iOS ${study.device.osVersion})` : "", " \u00B7 captured ", day(study.capturedAt)] }), app.summary ? _jsx("p", { className: "app-research-summary", children: app.summary }) : null] }), _jsxs("div", { className: "app-research-layout", children: [_jsx(ScreenList, { screens: app.screens, selected: screen.id, onSelect: (id) => navigate({ screen: id, control: null }) }), _jsx(ScreenDetail, { study: study, screen: screen, screens: screens, control: view.control, read: read, navigate: navigate }, screen.id)] }), _jsx(StudyNotes, { study: study, read: read })] }));
}
function readView(hash, screens, entry) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const screen = screens.get(params.get("screen") ?? "");
    if (!screen)
        return { screen: entry, control: null };
    const control = params.get("control");
    return { screen: screen.id, control: screen.elements.some((element) => element.id === control) ? control : null };
}
function ScreenList({ screens, selected, onSelect }) {
    const [query, setQuery] = useState("");
    const inputId = useId();
    const needle = query.trim().toLowerCase();
    const matches = needle ? screens.filter((screen) => [screen.title, screen.state, screen.description, ...screen.elements.map((element) => element.label)]
        .some((value) => value.toLowerCase().includes(needle))) : screens;
    return (_jsxs("nav", { className: "app-research-screens", "aria-label": "Screens", children: [_jsx("label", { className: "app-research-search-label", htmlFor: inputId, children: "Search screens" }), _jsx("input", { id: inputId, className: "app-research-search", type: "search", value: query, onChange: (event) => setQuery(event.target.value) }), _jsxs("p", { className: "app-research-count", "aria-live": "polite", children: [matches.length, " of ", screens.length, " screens"] }), _jsx("ul", { className: "app-research-screen-list", children: matches.map((screen) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "app-research-screen-button", "aria-current": screen.id === selected ? "true" : undefined, onClick: () => onSelect(screen.id), children: [_jsx("span", { className: "app-research-screen-name", children: screen.title }), _jsxs("span", { className: "app-research-screen-state", children: [screen.state, screen.screenshots.length ? "" : " · text only"] })] }) }, screen.id))) })] }));
}
function ScreenDetail({ study, screen, screens, control, read, navigate }) {
    const [pane, setPane] = useState("wireframe");
    const shot = screen.screenshots[0] ?? null;
    const selected = screen.elements.find((element) => element.id === control) ?? null;
    const select = (id) => navigate({ screen: screen.id, control: id });
    const outgoing = study.app.transitions.filter((transition) => transition.from === screen.id);
    const screenshot = useVerifiedAsset(study, read, shot?.path ?? null, toObjectUrl, revokeObjectUrl);
    return (_jsxs("section", { className: "app-research-detail", "aria-label": `Screen: ${screen.title}`, children: [_jsx("h3", { className: "app-research-screen-title", children: screen.title }), _jsx("p", { className: "app-research-meta", children: screen.state }), screen.description ? _jsx("p", { children: screen.description }) : null, _jsx("div", { className: "app-research-pane-switch", role: "group", "aria-label": "View", children: ["wireframe", "capture"].map((option) => (_jsx("button", { type: "button", "aria-pressed": pane === option, onClick: () => setPane(option), children: option === "wireframe" ? "Wireframe" : "Screenshot" }, option))) }), _jsxs("div", { className: "app-research-figures", "data-pane": pane, children: [_jsxs("figure", { className: "app-research-wireframe", children: [_jsx("div", { className: "app-research-canvas", style: { aspectRatio: canvasRatio(shot) }, children: screen.elements.map((element) => {
                                    const box = geometry(element, screen);
                                    return box ? (_jsx("button", { type: "button", className: "app-research-region", style: box, "aria-pressed": element.id === control, "aria-label": `${element.label} (${element.role})`, onClick: () => select(element.id === control ? null : element.id), children: _jsx("span", { className: "app-research-region-label", children: element.label }) }, element.id)) : null;
                                }) }), _jsx("figcaption", { children: "Wireframe from recorded element bounds" })] }), _jsxs("figure", { className: "app-research-capture", children: [_jsx(Capture, { screen: screen, shot: shot, load: screenshot, selected: selected }), _jsx("figcaption", { children: shot ? `Captured ${day(shot.capturedAt)} · ${shot.width}×${shot.height}` : "No screenshot" })] })] }), _jsxs("section", { className: "app-research-controls", "aria-label": "Controls", children: [_jsx("h4", { children: "Controls" }), screen.elements.length ? (_jsx("ul", { children: screen.elements.map((element) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "app-research-control-button", "aria-pressed": element.id === control, onClick: () => select(element.id === control ? null : element.id), children: [element.label, " ", _jsxs("span", { className: "app-research-meta", children: [element.role, " \u00B7 ", element.status] })] }) }, element.id))) })) : _jsx("p", { className: "app-research-meta", children: "No controls were recorded on this screen." })] }), selected ? (_jsx(ControlDetail, { element: selected, transitions: study.app.transitions.filter((t) => t.elementId === selected.id), screens: screens, navigate: navigate })) : null, _jsxs("section", { className: "app-research-paths", "aria-label": "Paths from this screen", children: [_jsx("h4", { children: "Paths from this screen" }), outgoing.length ? _jsx(TransitionList, { transitions: outgoing, screens: screens, navigate: navigate }) :
                        _jsx("p", { className: "app-research-meta", children: "No recorded transitions leave this screen." })] }), shot?.accessibility ? _jsx(AccessibilityText, { study: study, read: read, path: shot.accessibility }) : null] }));
}
function Capture({ screen, shot, load, selected }) {
    if (!shot) {
        return _jsxs("p", { className: "app-research-empty", children: ["No screenshot for this state (", screen.state || "text only", "). The description and controls are the record."] });
    }
    if (load.state.status === "error") {
        return (_jsxs("div", { className: "app-research-error", role: "alert", children: [_jsxs("p", { children: ["Could not load the screenshot: ", load.state.message] }), _jsx("button", { type: "button", onClick: load.retry, children: "Retry" })] }));
    }
    if (load.state.status !== "ready")
        return _jsx("p", { className: "app-research-empty", "aria-live": "polite", children: "Loading screenshot\u2026" });
    const box = selected && (!selected.screenshotPath || selected.screenshotPath === shot.path) ? geometry(selected, screen) : null;
    return (_jsxs("div", { className: "app-research-canvas", style: { aspectRatio: canvasRatio(shot) }, children: [_jsx("img", { className: "app-research-image", src: load.state.value, alt: `${screen.title} screenshot`, width: shot.width, height: shot.height }), box ? _jsx("span", { className: "app-research-highlight", style: box, "aria-hidden": "true" }) : null] }));
}
function ControlDetail({ element, transitions, screens, navigate }) {
    const evidence = element.evidence === undefined ? [] : [element.evidence].flat();
    return (_jsxs("section", { className: "app-research-control", "aria-label": `Selected control: ${element.label}`, children: [_jsx("h4", { children: element.label }), _jsxs("dl", { className: "app-research-facts", children: [_jsx("dt", { children: "Role" }), _jsx("dd", { children: element.role }), _jsx("dt", { children: "Behavior" }), _jsx("dd", { children: element.behavior }), _jsx("dt", { children: "Status" }), _jsx("dd", { children: element.status })] }), evidence.length ? (_jsx("ul", { className: "app-research-evidence", "aria-label": "Evidence", children: evidence.map((note, index) => _jsx("li", { children: note }, index)) })) : null, transitions.length ? _jsx(TransitionList, { transitions: transitions, screens: screens, navigate: navigate }) :
                _jsx("p", { className: "app-research-meta", children: "No recorded destination." })] }));
}
function TransitionList({ transitions, screens, navigate }) {
    return (_jsx("ul", { className: "app-research-transitions", children: transitions.map((transition) => {
            const target = transition.to ? screens.get(transition.to) : undefined;
            return (_jsxs("li", { children: [_jsxs("span", { children: [transition.action, " \u2192 "] }), target ? (_jsx("button", { type: "button", className: "app-research-link", onClick: () => navigate({ screen: target.id, control: null }), children: target.title })) : _jsx("span", { children: transition.result }), _jsxs("span", { className: "app-research-meta", children: [" \u00B7 ", transition.status] }), transition.precondition ? _jsxs("p", { className: "app-research-meta", children: ["Precondition: ", transition.precondition] }) : null, transition.sideEffects ? _jsxs("p", { className: "app-research-meta", children: ["Side effects: ", [transition.sideEffects].flat().join("; ")] }) : null] }, transition.id));
        }) }));
}
function AccessibilityText({ study, read, path }) {
    const [open, setOpen] = useState(false);
    const load = useVerifiedAsset(study, read, open ? path : null, blobText);
    return (_jsxs("details", { className: "app-research-accessibility", onToggle: (event) => setOpen(event.currentTarget.open), children: [_jsx("summary", { children: "Accessibility snapshot" }), load.state.status === "ready" ? _jsx("pre", { children: load.state.value }) :
                load.state.status === "error" ? (_jsxs("div", { className: "app-research-error", role: "alert", children: [_jsxs("p", { children: ["Could not load the accessibility snapshot: ", load.state.message] }), _jsx("button", { type: "button", onClick: load.retry, children: "Retry" })] })) : _jsx("p", { className: "app-research-meta", children: "Loading\u2026" })] }));
}
function StudyNotes({ study, read }) {
    const [downloads, setDownloads] = useState({});
    const download = async (path) => {
        setDownloads((current) => ({ ...current, [path]: "Verifying…" }));
        try {
            const blob = await verifiedResearchLibraryBlob(study.assets[path], () => read(path));
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = path.split("/").pop();
            anchor.click();
            // The browser starts the download asynchronously from the click; release the blob after.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDownloads((current) => ({ ...current, [path]: "Verified" }));
        }
        catch (error) {
            setDownloads((current) => ({ ...current, [path]: `Failed: ${message(error)}` }));
        }
    };
    const gaps = study.app.gaps.map(describe).filter((gap) => Boolean(gap));
    return (_jsxs("footer", { className: "app-research-notes", children: [gaps.length ? (_jsxs("section", { "aria-label": "Known gaps", children: [_jsx("h4", { children: "Known gaps" }), _jsx("ul", { children: gaps.map((gap, index) => _jsx("li", { children: gap }, index)) })] })) : null, study.downloads.length ? (_jsxs("section", { "aria-label": "Downloads", children: [_jsx("h4", { children: "Downloads" }), _jsx("ul", { className: "app-research-downloads", children: study.downloads.map(({ label, path }) => (_jsxs("li", { children: [_jsx("button", { type: "button", onClick: () => void download(path), children: label }), _jsxs("span", { className: "app-research-meta", children: [" ", formatResearchLibraryBytes(study.assets[path].bytes)] }), downloads[path] ? _jsxs("span", { className: "app-research-meta", role: "status", children: [" \u00B7 ", downloads[path]] }) : null] }, path))) })] })) : null] }));
}
export function AppStoreSignals({ snapshot, appeekyUrl }) {
    const href = /^https:\/\//.test(appeekyUrl) ? appeekyUrl : null;
    const source = href ? _jsx("a", { href: href, target: "_blank", rel: "noopener noreferrer", children: "Open in Appeeky" }) : "Appeeky";
    // Staleness depends on the reader's clock; resolve it after hydration so server and client agree.
    const [now, setNow] = useState(null);
    useEffect(() => setNow(Date.now()), []);
    if (!snapshot) {
        return (_jsxs("section", { className: "app-research-signals", "aria-label": "App Store signals", children: [_jsx("h2", { children: "App Store signals" }), _jsxs("p", { className: "app-research-empty", children: ["No App Store snapshot has been fetched yet. Source: ", source, "."] })] }));
    }
    const stale = now !== null && now - Date.parse(snapshot.fetchedAt) > STALE_AFTER_MS;
    return (_jsxs("section", { className: "app-research-signals", "aria-label": "App Store signals", children: [_jsx("h2", { children: "App Store signals" }), _jsxs("p", { className: "app-research-meta", children: ["Source: ", source, " \u00B7 ", snapshot.country.toUpperCase(), " ", snapshot.device, " \u00B7 fetched ", day(snapshot.fetchedAt), stale ? _jsx("span", { className: "app-research-stale", children: " \u00B7 stale, older than 7 days" }) : null] }), _jsx(ListingFacts, { listing: snapshot.listing }), _jsx("div", { className: "app-research-keywords-scroll", role: "region", "aria-label": "Keyword rankings", tabIndex: 0, children: _jsxs("table", { className: "app-research-keywords", children: [_jsx("caption", { children: "Search terms" }), _jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Term" }), _jsx("th", { scope: "col", children: "Rank" }), _jsx("th", { scope: "col", children: "7-day change" }), _jsx("th", { scope: "col", children: "Volume" }), _jsx("th", { scope: "col", children: "Difficulty" })] }) }), _jsx("tbody", { children: snapshot.keywords.map((keyword) => _jsx(KeywordRow, { keyword: keyword }, keyword.term)) })] }) })] }));
}
function ListingFacts({ listing }) {
    const title = listing.appStoreUrl
        ? _jsx("a", { href: listing.appStoreUrl, target: "_blank", rel: "noopener noreferrer", children: listing.title ?? "App Store" })
        : listing.title;
    const version = listing.version && listing.releasedAt ? `${listing.version} (${day(listing.releasedAt)})` : listing.version;
    const ratings = listing.ratingCount === undefined ? "" : ` from ${listing.ratingCount.toLocaleString("en-US")} ratings`;
    const rating = listing.rating === undefined ? undefined : `${listing.rating.toFixed(1)} of 5${ratings}`;
    const price = listing.downloadPrice === undefined ? undefined
        : listing.downloadPrice === 0 ? "Free" : `${listing.downloadPrice} ${listing.currency ?? ""}`.trim();
    return (_jsxs("dl", { className: "app-research-facts", children: [fact("Title", title), fact("Category", listing.category), fact("Version", version), fact("Rating", rating), fact("Download price", price)] }));
}
function KeywordRow({ keyword }) {
    return (_jsxs("tr", { children: [_jsxs("th", { scope: "row", children: [keyword.term, keyword.branded ? _jsx("span", { className: "app-research-badge", children: " branded" }) : null] }), _jsx("td", { children: rankText(keyword) }), _jsx("td", { children: changeText(keyword.rankChange7d) }), _jsx("td", { children: keyword.volumeScore ?? "—" }), _jsx("td", { children: keyword.difficulty ?? "—" })] }));
}
/** Appeeky reports a positive change when the rank number fell, i.e. the app moved up. */
function changeText(change) {
    if (change === undefined)
        return "—";
    if (change === 0)
        return "no change";
    return change > 0 ? `up ${change}` : `down ${-change}`;
}
function rankText(keyword) {
    if (keyword.status === "missing")
        return "Not checked";
    return keyword.rank === null ? "Not in top results" : `#${keyword.rank}`;
}
function fact(label, value) {
    return value === undefined || value === null || value === "" ? null : _jsxs("div", { children: [_jsx("dt", { children: label }), _jsx("dd", { children: value })] }, label);
}
/**
 * Fetch, verify and convert one asset while `path` is set. The release hook runs when the path
 * changes, the component unmounts, or a superseded fetch settles late, so object URLs never leak.
 */
function useVerifiedAsset(study, read, path, convert, release) {
    const [state, setState] = useState({ status: "idle" });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!path) {
            setState({ status: "idle" });
            return;
        }
        let current = true;
        let held = null;
        setState({ status: "loading" });
        void (async () => {
            try {
                const blob = await verifiedResearchLibraryBlob(study.assets[path], () => read(path));
                if (!current)
                    return;
                const value = await convert(blob);
                if (!current)
                    return release?.(value);
                held = { value };
                setState({ status: "ready", value });
            }
            catch (error) {
                if (current)
                    setState({ status: "error", message: message(error) });
            }
        })();
        return () => {
            current = false;
            if (held)
                release?.(held.value);
        };
    }, [study, read, path, attempt, convert, release]);
    return { state, retry: () => setAttempt((count) => count + 1) };
}
const toObjectUrl = (blob) => URL.createObjectURL(blob);
const revokeObjectUrl = (url) => URL.revokeObjectURL(url);
const blobText = (blob) => blob.text();
/** Element bounds as percentages of the screenshot (or the point canvas when there is none). */
function geometry(element, screen) {
    const { bounds } = element;
    if (!bounds)
        return null;
    const shot = screen.screenshots.find((candidate) => candidate.path === element.screenshotPath) ?? screen.screenshots[0];
    const space = element.boundsSpace ?? "points";
    const canvas = space === "normalized" ? { width: 1, height: 1 } : space === "pixels" ? shot : APP_RESEARCH_POINT_CANVAS;
    if (!canvas)
        return null;
    const { width, height } = canvas;
    const percent = (value, total) => `${Math.min(100, Math.max(0, (value / total) * 100))}%`;
    return {
        left: percent(bounds.x, width), top: percent(bounds.y, height),
        width: percent(bounds.width, width), height: percent(bounds.height, height),
    };
}
function canvasRatio(shot) {
    return shot ? `${shot.width} / ${shot.height}` : `${APP_RESEARCH_POINT_CANVAS.width} / ${APP_RESEARCH_POINT_CANVAS.height}`;
}
function describe(gap) {
    if (typeof gap === "string")
        return gap;
    if (typeof gap !== "object" || gap === null)
        return null;
    const fields = gap;
    const text = [fields.title, fields.description, fields.summary].find((value) => typeof value === "string" && value.trim());
    return typeof text === "string" ? text : null;
}
function day(iso) {
    return iso.slice(0, 10);
}
function message(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=react.js.map