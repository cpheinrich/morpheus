"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { HqSearchPayload, HqSearchResult } from "./index.js";

type SearchModule = typeof import("./index.js");

type SearchState =
  | { status: "idle" | "loading"; results: HqSearchResult[] }
  | { status: "ready"; results: HqSearchResult[] }
  | { status: "error"; results: HqSearchResult[] };

export type HqSearchClassNames = {
  trigger: string;
  triggerIcon: string;
  triggerLabel: string;
  shortcut: string;
  overlay: string;
  panel: string;
  header: string;
  input: string;
  closeButton: string;
  content: string;
  status: string;
  results: string;
  resultItem: string;
  resultLink: string;
  resultHeading: string;
  resultTitle: string;
  resultKind: string;
  resultPath: string;
  resultSnippet: string;
  footer: string;
  icon: string;
};

export type HqSearchCopy = {
  trigger: string;
  dialogLabel: string;
  inputLabel: string;
  placeholder: string;
  shortcut: string;
  close: string;
  loading: string;
  loadError: string;
  emptyPrompt: string;
  noResults: (query: string) => string;
  markdownKind: string;
  pdfKind: string;
  footer: string;
};

export type HqSearchDialogProps = {
  indexUrl: string;
  classes?: Partial<HqSearchClassNames>;
  copy?: Partial<HqSearchCopy>;
};

const DEFAULT_CLASSES: HqSearchClassNames = Object.fromEntries(
  [
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
  ].map((key) => [key, `morpheus-hq-search__${key}`]),
) as HqSearchClassNames;

const DEFAULT_COPY: HqSearchCopy = {
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

export function HqSearchDialog({ indexUrl, classes, copy }: HqSearchDialogProps) {
  const classNames = { ...DEFAULT_CLASSES, ...classes };
  const labels = { ...DEFAULT_COPY, ...copy };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle", results: [] });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<Awaited<ReturnType<SearchModule["loadHqSearchIndex"]>> | null>(null);
  const moduleRef = useRef<SearchModule | null>(null);
  const loadingRef = useRef<Promise<void> | null>(null);
  const queryRef = useRef("");

  const openSearch = useCallback(() => {
    setOpen(true);
    if (indexRef.current || loadingRef.current) return;

    setState({ status: "loading", results: [] });
    loadingRef.current = Promise.all([
      import("./index.js"),
      fetch(indexUrl, { credentials: "same-origin" }),
    ])
      .then(async ([searchModule, response]) => {
        if (!response.ok) throw new Error(`Search index returned ${response.status}`);
        const payload = (await response.json()) as HqSearchPayload;
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
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape" && open) closeSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSearch, open, openSearch]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function updateQuery(value: string) {
    queryRef.current = value;
    setQuery(value);
    startTransition(() => {
      setState((current) => ({
        status: current.status,
        results:
          indexRef.current && moduleRef.current && value.trim()
            ? moduleRef.current.searchHq(indexRef.current, value)
            : [],
      }));
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openSearch}
        className={classNames.trigger}
        aria-label={labels.trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={classNames.triggerIcon}>
          <SearchIcon className={classNames.icon} />
        </span>
        <span className={classNames.triggerLabel}>{labels.trigger}</span>
        <kbd className={classNames.shortcut}>{labels.shortcut}</kbd>
      </button>

      {open &&
        createPortal(
          <div
            className={classNames.overlay}
            role="dialog"
            aria-modal="true"
            aria-label={labels.dialogLabel}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeSearch();
            }}
          >
            <div className={classNames.panel}>
              <div className={classNames.header}>
                <SearchIcon className={classNames.icon} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  placeholder={labels.placeholder}
                  className={classNames.input}
                  aria-label={labels.inputLabel}
                  autoComplete="off"
                />
                <button type="button" onClick={closeSearch} className={classNames.closeButton}>
                  {labels.close}
                </button>
              </div>

              <div className={classNames.content} aria-live="polite">
                {state.status === "loading" && <p className={classNames.status}>{labels.loading}</p>}
                {state.status === "error" && <p className={classNames.status}>{labels.loadError}</p>}
                {state.status === "ready" && !query.trim() && (
                  <p className={classNames.status}>{labels.emptyPrompt}</p>
                )}
                {state.status === "ready" && query.trim() && state.results.length === 0 && (
                  <p className={classNames.status}>{labels.noResults(query.trim())}</p>
                )}
                {state.results.length > 0 && (
                  <ol className={classNames.results}>
                    {state.results.map((result) => (
                      <li key={result.id} className={classNames.resultItem}>
                        <a
                          href={result.href}
                          onClick={() => setOpen(false)}
                          className={classNames.resultLink}
                        >
                          <div className={classNames.resultHeading}>
                            <h2 className={classNames.resultTitle}>{result.title}</h2>
                            <span className={classNames.resultKind}>
                              {result.kind === "pdf" ? labels.pdfKind : labels.markdownKind}
                            </span>
                          </div>
                          <p className={classNames.resultPath}>{result.path}</p>
                          <p className={classNames.resultSnippet}>{result.snippet}</p>
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className={classNames.footer}>{labels.footer}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      strokeWidth="1.6"
    >
      <circle cx="8.5" cy="8.5" r="5.25" />
      <path d="m12.4 12.4 4 4" />
    </svg>
  );
}
