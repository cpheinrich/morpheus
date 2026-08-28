"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
const DEFAULT_CLASSES = Object.fromEntries([
    "trigger",
    "triggerIcon",
    "triggerLabel",
    "shortcut",
    "overlay",
    "panel",
    "header",
    "input",
    "closeButton",
    "content",
    "status",
    "results",
    "resultItem",
    "resultLink",
    "resultHeading",
    "resultTitle",
    "resultKind",
    "resultPath",
    "resultSnippet",
    "footer",
    "icon",
].map((key) => [key, `morpheus-hq-search__${key}`]));
const DEFAULT_COPY = {
    trigger: "Search HQ",
    dialogLabel: "Search HQ",
    inputLabel: "Search documents",
    placeholder: "Search documents, plans, notes…",
    shortcut: "⌘ K",
    close: "Esc",
    loading: "Loading the HQ index…",
    loadError: "Search could not load. Close this window and try again.",
    emptyPrompt: "Type to search the HQ.",
    noResults: (query) => `No results for “${query}”.`,
    markdownKind: "Document",
    pdfKind: "PDF",
    footer: "Searches Markdown and text-based PDFs. Images and scanned pages are matched by filename only.",
};
export function HqSearchDialog({ indexUrl, classes, copy }) {
    const classNames = { ...DEFAULT_CLASSES, ...classes };
    const labels = { ...DEFAULT_COPY, ...copy };
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [state, setState] = useState({ status: "idle", results: [] });
    const triggerRef = useRef(null);
    const inputRef = useRef(null);
    const indexRef = useRef(null);
    const moduleRef = useRef(null);
    const loadingRef = useRef(null);
    const queryRef = useRef("");
    const openSearch = useCallback(() => {
        setOpen(true);
        if (indexRef.current || loadingRef.current)
            return;
        setState({ status: "loading", results: [] });
        loadingRef.current = Promise.all([
            import("./index.js"),
            fetch(indexUrl, { credentials: "same-origin" }),
        ])
            .then(async ([searchModule, response]) => {
            if (!response.ok)
                throw new Error(`Search index returned ${response.status}`);
            const payload = (await response.json());
            const index = await searchModule.loadHqSearchIndex(payload);
            moduleRef.current = searchModule;
            indexRef.current = index;
            const currentQuery = queryRef.current;
            setState({
                status: "ready",
                results: currentQuery ? searchModule.searchHq(index, currentQuery) : [],
            });
        })
            .catch(() => setState({ status: "error", results: [] }))
            .finally(() => {
            loadingRef.current = null;
        });
    }, [indexUrl]);
    const closeSearch = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus();
    }, []);
    useEffect(() => {
        const onKeyDown = (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
                event.preventDefault();
                openSearch();
            }
            if (event.key === "Escape" && open)
                closeSearch();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [closeSearch, open, openSearch]);
    useEffect(() => {
        if (!open)
            return;
        inputRef.current?.focus();
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);
    function updateQuery(value) {
        queryRef.current = value;
        setQuery(value);
        startTransition(() => {
            setState((current) => ({
                status: current.status,
                results: indexRef.current && moduleRef.current && value.trim()
                    ? moduleRef.current.searchHq(indexRef.current, value)
                    : [],
            }));
        });
    }
    return (_jsxs(_Fragment, { children: [_jsxs("button", { ref: triggerRef, type: "button", onClick: openSearch, className: classNames.trigger, "aria-label": labels.trigger, "aria-expanded": open, "aria-haspopup": "dialog", children: [_jsx("span", { className: classNames.triggerIcon, children: _jsx(SearchIcon, { className: classNames.icon }) }), _jsx("span", { className: classNames.triggerLabel, children: labels.trigger }), _jsx("kbd", { className: classNames.shortcut, children: labels.shortcut })] }), open &&
                createPortal(_jsx("div", { className: classNames.overlay, role: "dialog", "aria-modal": "true", "aria-label": labels.dialogLabel, onMouseDown: (event) => {
                        if (event.target === event.currentTarget)
                            closeSearch();
                    }, children: _jsxs("div", { className: classNames.panel, children: [_jsxs("div", { className: classNames.header, children: [_jsx(SearchIcon, { className: classNames.icon }), _jsx("input", { ref: inputRef, value: query, onChange: (event) => updateQuery(event.target.value), placeholder: labels.placeholder, className: classNames.input, "aria-label": labels.inputLabel, autoComplete: "off" }), _jsx("button", { type: "button", onClick: closeSearch, className: classNames.closeButton, children: labels.close })] }), _jsxs("div", { className: classNames.content, "aria-live": "polite", children: [state.status === "loading" && _jsx("p", { className: classNames.status, children: labels.loading }), state.status === "error" && _jsx("p", { className: classNames.status, children: labels.loadError }), state.status === "ready" && !query.trim() && (_jsx("p", { className: classNames.status, children: labels.emptyPrompt })), state.status === "ready" && query.trim() && state.results.length === 0 && (_jsx("p", { className: classNames.status, children: labels.noResults(query.trim()) })), state.results.length > 0 && (_jsx("ol", { className: classNames.results, children: state.results.map((result) => (_jsx("li", { className: classNames.resultItem, children: _jsxs("a", { href: result.href, onClick: () => setOpen(false), className: classNames.resultLink, children: [_jsxs("div", { className: classNames.resultHeading, children: [_jsx("h2", { className: classNames.resultTitle, children: result.title }), _jsx("span", { className: classNames.resultKind, children: result.kind === "pdf" ? labels.pdfKind : labels.markdownKind })] }), _jsx("p", { className: classNames.resultPath, children: result.path }), _jsx("p", { className: classNames.resultSnippet, children: result.snippet })] }) }, result.id))) }))] }), _jsx("div", { className: classNames.footer, children: labels.footer })] }) }), document.body)] }));
}
function SearchIcon({ className }) {
    return (_jsxs("svg", { "aria-hidden": "true", viewBox: "0 0 20 20", className: className, strokeWidth: "1.6", children: [_jsx("circle", { cx: "8.5", cy: "8.5", r: "5.25" }), _jsx("path", { d: "m12.4 12.4 4 4" })] }));
}
//# sourceMappingURL=react.js.map