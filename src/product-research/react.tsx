"use client";

import { Component, lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useFragmentView } from "../ops-desk/react.js";
import { verifiedResearchLibraryBlob } from "../research-library/client.js";
import { formatResearchLibraryBytes } from "../research-library/index.js";
import {
  APP_RESEARCH_POINT_CANVAS,
  type AppeekyKeyword,
  type AppeekySnapshot,
  type AppResearchElement,
  type AppResearchScreen,
  type AppResearchScreenshot,
  type AppResearchStudy,
  type AppResearchTransition,
} from "./index.js";

/**
 * Browser views for a parsed study and App Store snapshot. Every asset is fetched through the
 * project's authenticated `readAsset`, only for the selected screen or an explicit download, and
 * rendered only after its byte count and SHA-256 match the study inventory. Nothing here renders
 * supplied HTML. Styling: import `morpheus-kit/product-research/styles.css` and override the
 * `--app-research-*` custom properties, or target the documented `app-research-*` classes.
 */

export type ReadAsset = (path: string) => Promise<Blob>;
export type ScreenMetrics = Readonly<Record<string, { eventCount: number; replayCount?: number }>>;
type View = { screen: string; control: string | null; capture?: string; restoring?: true };
type Load<T> = { status: "idle" | "loading" } | { status: "ready"; value: T } | { status: "error"; message: string };

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const NavigationGraph = lazy(() => import("./navigation-graph.js"));

class GraphBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed
      ? <p className="app-research-meta" role="status">The graph could not load. Use the screen list below.</p>
      : this.props.children;
  }
}

export function ProductResearchViewer({ study, readAsset, screenMetrics }: {
  study: AppResearchStudy; readAsset: ReadAsset; screenMetrics?: ScreenMetrics;
}) {
  const { app } = study;
  const [reveal, setReveal] = useState<{ id: string }>();
  const screens = useMemo(() => new Map(app.screens.map((screen) => [screen.id, screen])), [app.screens]);
  const entry: View = { screen: app.entryScreenId, control: null, restoring: true };
  const { view, navigate } = useFragmentView<View>({
    initial: entry,
    historyKey: `appResearch:${study.studyId}`,
    read: (hash) => readView(hash, screens, app.entryScreenId),
    write: (next) => next.screen === app.entryScreenId && !next.control && !next.capture ? "" :
      "#" + new URLSearchParams({
        screen: next.screen,
        ...(next.control ? { control: next.control } : {}),
        ...(next.capture ? { capture: next.capture } : {}),
      }).toString(),
  });
  const screen = screens.get(view.screen) ?? screens.get(app.entryScreenId)!;
  const reader = useRef(readAsset);
  reader.current = readAsset;
  const read = useMemo<ReadAsset>(() => (path) => reader.current(path), []);
  const selectScreen = (id: string) => navigate({ screen: id, control: null });

  return (
    <div className="app-research">
      <header className="app-research-header">
        <h2 className="app-research-title">{app.name}</h2>
        <p className="app-research-meta">
          Version {app.version} · <span className="app-research-badge">{app.status}</span> · {study.device.model}
          {study.device.osVersion ? ` (iOS ${study.device.osVersion})` : ""} · captured {day(study.capturedAt)}
        </p>
        {app.summary ? <p className="app-research-summary">{app.summary}</p> : null}
      </header>
      <section className="app-research-navigation" aria-label="Navigation graph">
        <div className="app-research-graph-heading">
          <h3 className="app-research-figure-title">Navigation graph</h3>
          <p className="app-research-meta">Hold Cmd (Mac) or Ctrl and scroll to zoom.</p>
        </div>
        <GraphBoundary key={study.studyId}>
          <Suspense fallback={<div className="app-research-graph">
            <p className="app-research-meta" role="status">Loading navigation graph…</p>
          </div>}>
            <NavigationGraph app={app} selected={screen.id} screenMetrics={screenMetrics}
              onSelect={(id) => { selectScreen(id); setReveal({ id }); }} />
          </Suspense>
        </GraphBoundary>
      </section>
      <div className="app-research-layout">
        <ScreenList screens={app.screens} selected={screen.id} reveal={reveal} onSelect={selectScreen} />
        <ScreenDetail
          key={screen.id}
          study={study}
          screen={screen}
          screens={screens}
          control={view.control}
          capture={view.capture}
          restoring={view.restoring}
          read={read}
          navigate={navigate}
        />
      </div>
      <StudyNotes study={study} read={read} />
    </div>
  );
}

function readView(hash: string, screens: Map<string, AppResearchScreen>, entry: string): View {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const screen = screens.get(params.get("screen") ?? "");
  if (!screen) return { screen: entry, control: null };
  const control = params.get("control");
  const capture = screen.screenshots.find((shot) => shot.path === params.get("capture"))?.path;
  return { screen: screen.id, control: screen.elements.some((element) => element.id === control) ? control : null, capture };
}

function ScreenList({ screens, selected, reveal, onSelect }: {
  screens: AppResearchScreen[]; selected: string; reveal?: { id: string }; onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState({ query: "", reveal });
  const query = search.reveal === reveal ? search.query : "";
  const inputId = useId();
  const revealedRow = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const row = revealedRow.current;
    const list = row?.closest("ul");
    if (!reveal || !row || !list) return;
    const bounds = list.getBoundingClientRect();
    const target = row.getBoundingClientRect();
    list.scrollTop += Math.min(0, target.top - bounds.top) + Math.max(0, target.bottom - bounds.bottom);
  }, [reveal]);
  const needle = query.trim().toLowerCase();
  const matches = needle ? screens.filter((screen) =>
    [screen.title, screen.state, screen.description, ...screen.elements.map((element) => element.label)]
      .some((value) => value.toLowerCase().includes(needle))) : screens;
  return (
    <nav className="app-research-screens" aria-label="Screens">
      <label className="app-research-search-label" htmlFor={inputId}>Search screens</label>
      <input id={inputId} className="app-research-search" type="search" value={query}
        onChange={(event) => setSearch({ query: event.target.value, reveal })} />
      <p className="app-research-count" aria-live="polite">{matches.length} of {screens.length} screens</p>
      <ul className="app-research-screen-list">
        {matches.map((screen) => (
          <li key={screen.id}>
            <button type="button" className="app-research-screen-button" aria-current={screen.id === selected ? "true" : undefined}
              ref={screen.id === reveal?.id ? revealedRow : undefined}
              onClick={() => onSelect(screen.id)}>
              <span className="app-research-screen-name">{screen.title}</span>
              <span className="app-research-screen-state">
                {screen.state}{screen.screenshots.length ? "" : " · text only"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ScreenDetail({ study, screen, screens, control, capture, restoring, read, navigate }: {
  study: AppResearchStudy; screen: AppResearchScreen; screens: Map<string, AppResearchScreen>;
  control: string | null; capture?: string; restoring?: true; read: ReadAsset; navigate: (view: View) => void;
}) {
  const [pane, setPane] = useState<"wireframe" | "capture">("wireframe");
  const selected = screen.elements.find((element) => element.id === control) ?? null;
  const capturePath = capture ?? selected?.screenshotPath;
  const shot = screen.screenshots.find(({ path }) => path === capturePath) ?? screen.screenshots[0] ?? null;
  const select = (id: string | null) => {
    const targetCapture = screen.elements.find((element) => element.id === id)?.screenshotPath;
    navigate({ screen: screen.id, control: id, capture: targetCapture ?? capture });
  };
  const outgoing = study.app.transitions.filter((transition) => transition.from === screen.id);

  return (
    <section className="app-research-detail" aria-label={`Screen: ${screen.title}`}>
      <h3 className="app-research-screen-title">{screen.title}</h3>
      <p className="app-research-meta">{screen.state}</p>
      {screen.description ? <p>{screen.description}</p> : null}
      <CaptureChoice shots={screen.screenshots} selected={shot?.path}
        onSelect={(path) => navigate({ screen: screen.id, control, capture: path })} />
      <div className="app-research-pane-switch" role="group" aria-label="View">
        {(["wireframe", "capture"] as const).map((option) => (
          <button key={option} type="button" aria-pressed={pane === option} onClick={() => setPane(option)}>
            {option === "wireframe" ? "Wireframe" : "Screenshot"}
          </button>
        ))}
      </div>
      <div className="app-research-figures" data-pane={pane}>
        <figure className="app-research-wireframe">
          <h4 className="app-research-figure-title">Wireframe</h4>
          <Wireframe screen={screen} shot={shot} control={control} select={select} />
          <figcaption>Wireframe from recorded element bounds</figcaption>
        </figure>
        <figure className="app-research-capture">
          <h4 className="app-research-figure-title">Screenshot</h4>
          <Capture key={shot?.path} screen={screen} shot={shot} study={study} read={read} selected={selected} restoring={restoring} />
          <figcaption>{shot ? `Captured ${day(shot.capturedAt)} · ${shot.width}×${shot.height}` : "No screenshot"}</figcaption>
        </figure>
      </div>
      <section className="app-research-controls" aria-label="Controls">
        <h4>Controls</h4>
        {screen.elements.length ? (
          <ul>
            {screen.elements.map((element, index) => (
              <li key={element.id}>
                <button type="button" className="app-research-control-button" aria-pressed={element.id === control}
                  onClick={() => select(element.id === control ? null : element.id)}>
                  <span className="app-research-control-number" aria-hidden="true">{index + 1}</span>
                  {element.label} <span className="app-research-meta">{element.role} · {element.status}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="app-research-meta">No controls were recorded on this screen.</p>}
      </section>
      {selected ? (
        <ControlDetail element={selected} transitions={study.app.transitions.filter((t) => t.elementId === selected.id)}
          screens={screens} navigate={navigate} />
      ) : null}
      <section className="app-research-paths" aria-label="Paths from this screen">
        <h4>Paths from this screen</h4>
        {outgoing.length ? <TransitionList transitions={outgoing} screens={screens} navigate={navigate} /> :
          <p className="app-research-meta">No recorded transitions leave this screen.</p>}
      </section>
      {shot?.accessibility ? <AccessibilityText key={shot.accessibility} study={study} read={read} path={shot.accessibility} /> : null}
    </section>
  );
}

function Wireframe({ screen, shot, control, select }: {
  screen: AppResearchScreen; shot: AppResearchScreenshot | null;
  control: string | null; select: (id: string | null) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const labels = root.querySelectorAll<HTMLElement>(".app-research-region-label");
    function fitLabels() {
      for (const label of labels) {
        const region = label.parentElement!;
        region.toggleAttribute("data-compact",
          label.scrollHeight > region.clientHeight || label.scrollWidth > region.clientWidth);
      }
    }
    fitLabels();
    if (typeof ResizeObserver === "undefined") return;
    // Measure the labels even in compact mode so they return when the layout widens.
    const observer = new ResizeObserver(fitLabels);
    observer.observe(root);
    for (const label of labels) observer.observe(label);
    return () => observer.disconnect();
  }, [screen, shot]);

  return (
    <div ref={canvas} className="app-research-canvas" style={{ aspectRatio: canvasRatio(shot) }}>
      {screen.elements.map((element, index) => {
        const box = geometry(element, screen);
        return box ? (
          <button key={element.id} type="button" className="app-research-region" style={box}
            aria-pressed={element.id === control} aria-label={`${element.label} (${element.role})`}
            title={element.label} onClick={() => select(element.id === control ? null : element.id)}>
            <span className="app-research-region-label">{element.label}</span>
            <span className="app-research-region-number" aria-hidden="true">{index + 1}</span>
          </button>
        ) : null;
      })}
    </div>
  );
}

function CaptureChoice({ shots, selected, onSelect }: {
  shots: AppResearchScreenshot[]; selected?: string; onSelect: (path: string) => void;
}) {
  if (shots.length < 2) return null;
  return (
    <label className="app-research-capture-choice">
      Captured screenshot
      <select value={selected} onChange={(event) => onSelect(event.target.value)}>
        {shots.map((shot, index) => (
          <option key={shot.path} value={shot.path}>{captureLabel(shot, index)}</option>
        ))}
      </select>
    </label>
  );
}

function captureLabel(shot: AppResearchScreenshot, index: number): string {
  const label = typeof shot.position === "string" && shot.position.trim();
  return label ? `${index + 1}. ${label}` : `Capture ${index + 1}`;
}

function Capture({ screen, shot, study, read, selected, restoring }: {
  screen: AppResearchScreen; shot: AppResearchScreenshot | null; study: AppResearchStudy;
  read: ReadAsset; selected: AppResearchElement | null; restoring?: true;
}) {
  const load = useVerifiedAsset(study, read, restoring ? null : shot?.path ?? null, toObjectUrl, revokeObjectUrl);
  if (!shot) {
    return <p className="app-research-empty">No screenshot for this state ({screen.state || "text only"}). The description and controls are the record.</p>;
  }
  if (load.state.status === "error") {
    return (
      <div className="app-research-error" role="alert">
        <p>Could not load the screenshot: {load.state.message}</p>
        <button type="button" onClick={load.retry}>Retry</button>
      </div>
    );
  }
  if (load.state.status !== "ready") return <p className="app-research-empty" aria-live="polite">Loading screenshot…</p>;
  const box = selected && (selected.screenshotPath ?? screen.screenshots[0]?.path) === shot.path ? geometry(selected, screen) : null;
  return (
    <div className="app-research-canvas" style={{ aspectRatio: canvasRatio(shot) }}>
      <img className="app-research-image" src={load.state.value} alt={`${screen.title} screenshot`} width={shot.width} height={shot.height} />
      {box ? <span className="app-research-highlight" style={box} aria-hidden="true" /> : null}
    </div>
  );
}

function ControlDetail({ element, transitions, screens, navigate }: {
  element: AppResearchElement; transitions: AppResearchTransition[];
  screens: Map<string, AppResearchScreen>; navigate: (view: View) => void;
}) {
  const evidence = element.evidence === undefined ? [] : [element.evidence].flat();
  return (
    <section className="app-research-control" aria-label={`Selected control: ${element.label}`}>
      <h4>{element.label}</h4>
      <dl className="app-research-facts">
        <dt>Role</dt><dd>{element.role}</dd>
        <dt>Behavior</dt><dd>{element.behavior}</dd>
        <dt>Status</dt><dd>{element.status}</dd>
      </dl>
      {evidence.length ? (
        <ul className="app-research-evidence" aria-label="Evidence">
          {evidence.map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      ) : null}
      {transitions.length ? <TransitionList transitions={transitions} screens={screens} navigate={navigate} /> :
        <p className="app-research-meta">No recorded destination.</p>}
    </section>
  );
}

function TransitionList({ transitions, screens, navigate }: {
  transitions: AppResearchTransition[]; screens: Map<string, AppResearchScreen>; navigate: (view: View) => void;
}) {
  return (
    <ul className="app-research-transitions">
      {transitions.map((transition) => {
        const target = transition.to ? screens.get(transition.to) : undefined;
        return (
          <li key={transition.id}>
            <span>{transition.action} → </span>
            {target ? (
              <button type="button" className="app-research-link" onClick={() => navigate({ screen: target.id, control: null })}>
                {target.title}
              </button>
            ) : <span>{transition.result}</span>}
            <span className="app-research-meta"> · {transition.status}</span>
            {transition.precondition ? <p className="app-research-meta">Precondition: {transition.precondition}</p> : null}
            {transition.sideEffects ? <p className="app-research-meta">Side effects: {[transition.sideEffects].flat().join("; ")}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function AccessibilityText({ study, read, path }: { study: AppResearchStudy; read: ReadAsset; path: string }) {
  const [open, setOpen] = useState(false);
  const load = useVerifiedAsset(study, read, open ? path : null, blobText);
  return (
    <details className="app-research-accessibility" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Accessibility snapshot</summary>
      {load.state.status === "ready" ? <pre>{load.state.value}</pre> :
        load.state.status === "error" ? (
          <div className="app-research-error" role="alert">
            <p>Could not load the accessibility snapshot: {load.state.message}</p>
            <button type="button" onClick={load.retry}>Retry</button>
          </div>
        ) : <p className="app-research-meta">Loading…</p>}
    </details>
  );
}

function StudyNotes({ study, read }: { study: AppResearchStudy; read: ReadAsset }) {
  const [downloads, setDownloads] = useState<Record<string, string>>({});
  const download = async (path: string) => {
    setDownloads((current) => ({ ...current, [path]: "Verifying…" }));
    try {
      const blob = await verifiedResearchLibraryBlob(study.assets[path]!, () => read(path));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = path.split("/").pop()!;
      anchor.click();
      // The browser starts the download asynchronously from the click; release the blob after.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloads((current) => ({ ...current, [path]: "Verified" }));
    } catch (error) {
      setDownloads((current) => ({ ...current, [path]: `Failed: ${message(error)}` }));
    }
  };
  const gaps = study.app.gaps.map(describe).filter((gap): gap is string => Boolean(gap));
  return (
    <footer className="app-research-notes">
      {gaps.length ? (
        <section aria-label="Known gaps"><h4>Known gaps</h4><ul>{gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></section>
      ) : null}
      {study.downloads.length ? (
        <section aria-label="Downloads">
          <h4>Downloads</h4>
          <ul className="app-research-downloads">
            {study.downloads.map(({ label, path }) => (
              <li key={path}>
                <button type="button" onClick={() => void download(path)}>{label}</button>
                <span className="app-research-meta"> {formatResearchLibraryBytes(study.assets[path]!.bytes)}</span>
                {downloads[path] ? <span className="app-research-meta" role="status"> · {downloads[path]}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </footer>
  );
}

export function AppStoreSignals({ snapshot, appeekyUrl }: { snapshot: AppeekySnapshot | null; appeekyUrl: string }) {
  const href = /^https:\/\//.test(appeekyUrl) ? appeekyUrl : null;
  const source = href ? <a href={href} target="_blank" rel="noopener noreferrer">Open in Appeeky</a> : "Appeeky";
  // Staleness depends on the reader's clock; resolve it after hydration so server and client agree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  if (!snapshot) {
    return (
      <section className="app-research-signals" aria-label="App Store signals">
        <h2>App Store signals</h2>
        <p className="app-research-empty">No App Store snapshot has been fetched yet. Source: {source}.</p>
      </section>
    );
  }
  const stale = now !== null && now - Date.parse(snapshot.fetchedAt) > STALE_AFTER_MS;
  return (
    <section className="app-research-signals" aria-label="App Store signals">
      <h2>App Store signals</h2>
      <p className="app-research-meta">
        Source: {source} · {snapshot.country.toUpperCase()} {snapshot.device} · fetched {day(snapshot.fetchedAt)}
        {stale ? <span className="app-research-stale"> · stale, older than 7 days</span> : null}
      </p>
      <ListingFacts listing={snapshot.listing} />
      <div className="app-research-keywords-scroll" role="region" aria-label="Keyword rankings" tabIndex={0}>
        <table className="app-research-keywords">
          <caption>Search terms</caption>
          <thead><tr><th scope="col">Term</th><th scope="col">Rank</th><th scope="col">7-day change</th><th scope="col">Volume</th><th scope="col">Difficulty</th></tr></thead>
          <tbody>{snapshot.keywords.map((keyword) => <KeywordRow key={keyword.term} keyword={keyword} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ListingFacts({ listing }: { listing: AppeekySnapshot["listing"] }) {
  const title = listing.appStoreUrl
    ? <a href={listing.appStoreUrl} target="_blank" rel="noopener noreferrer">{listing.title ?? "App Store"}</a>
    : listing.title;
  const version = listing.version && listing.releasedAt ? `${listing.version} (${day(listing.releasedAt)})` : listing.version;
  const ratings = listing.ratingCount === undefined ? "" : ` from ${listing.ratingCount.toLocaleString("en-US")} ratings`;
  const rating = listing.rating === undefined ? undefined : `${listing.rating.toFixed(1)} of 5${ratings}`;
  const price = listing.downloadPrice === undefined ? undefined
    : listing.downloadPrice === 0 ? "Free" : `${listing.downloadPrice} ${listing.currency ?? ""}`.trim();
  return (
    <dl className="app-research-facts">
      {fact("Title", title)}
      {fact("Category", listing.category)}
      {fact("Version", version)}
      {fact("Rating", rating)}
      {fact("Download price", price)}
    </dl>
  );
}

function KeywordRow({ keyword }: { keyword: AppeekyKeyword }) {
  return (
    <tr>
      <th scope="row">{keyword.term}{keyword.branded ? <span className="app-research-badge"> branded</span> : null}</th>
      <td>{rankText(keyword)}</td>
      <td>{changeText(keyword.rankChange7d)}</td>
      <td>{keyword.volumeScore ?? "—"}</td>
      <td>{keyword.difficulty ?? "—"}</td>
    </tr>
  );
}

/** Appeeky reports a positive change when the rank number fell, i.e. the app moved up. */
function changeText(change: number | undefined): string {
  if (change === undefined) return "—";
  if (change === 0) return "no change";
  return change > 0 ? `up ${change}` : `down ${-change}`;
}

function rankText(keyword: AppeekyKeyword): string {
  if (keyword.status === "missing") return "Not checked";
  return keyword.rank === null ? "Not in top results" : `#${keyword.rank}`;
}

function fact(label: string, value: ReactNode | undefined) {
  return value === undefined || value === null || value === "" ? null : <div key={label}><dt>{label}</dt><dd>{value}</dd></div>;
}

type AssetLoad<T> = { state: Load<T>; retry: () => void };

/**
 * Fetch, verify and convert one asset while `path` is set. The release hook runs when the path
 * changes, the component unmounts, or a superseded fetch settles late, so object URLs never leak.
 */
function useVerifiedAsset<T>(
  study: AppResearchStudy, read: ReadAsset, path: string | null,
  convert: (blob: Blob) => T | Promise<T>, release?: (value: T) => void,
): AssetLoad<T> {
  const [state, setState] = useState<Load<T>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) {
      setState({ status: "idle" });
      return;
    }
    let current = true;
    let held: { value: T } | null = null;
    setState({ status: "loading" });
    void (async () => {
      try {
        const blob = await verifiedResearchLibraryBlob(study.assets[path]!, () => read(path));
        if (!current) return;
        const value = await convert(blob);
        if (!current) return release?.(value);
        held = { value };
        setState({ status: "ready", value });
      } catch (error) {
        if (current) setState({ status: "error", message: message(error) });
      }
    })();
    return () => {
      current = false;
      if (held) release?.(held.value);
    };
  }, [study, read, path, attempt, convert, release]);
  return { state, retry: () => setAttempt((count) => count + 1) };
}

const toObjectUrl = (blob: Blob) => URL.createObjectURL(blob);
const revokeObjectUrl = (url: string) => URL.revokeObjectURL(url);
const blobText = (blob: Blob) => blob.text();

/** Element bounds as percentages of the screenshot (or the point canvas when there is none). */
function geometry(element: AppResearchElement, screen: AppResearchScreen) {
  const { bounds } = element;
  if (!bounds) return null;
  const shot = screen.screenshots.find((candidate) => candidate.path === element.screenshotPath) ?? screen.screenshots[0];
  const space = element.boundsSpace ?? "points";
  const canvas = space === "normalized" ? { width: 1, height: 1 } : space === "pixels" ? shot : APP_RESEARCH_POINT_CANVAS;
  if (!canvas) return null;
  const { width, height } = canvas;
  const percent = (value: number, total: number) => `${Math.min(100, Math.max(0, (value / total) * 100))}%`;
  return {
    left: percent(bounds.x, width), top: percent(bounds.y, height),
    width: percent(bounds.width, width), height: percent(bounds.height, height),
  };
}

function canvasRatio(shot: AppResearchScreenshot | null): string {
  return shot ? `${shot.width} / ${shot.height}` : `${APP_RESEARCH_POINT_CANVAS.width} / ${APP_RESEARCH_POINT_CANVAS.height}`;
}

function describe(gap: unknown): string | null {
  if (typeof gap === "string") return gap;
  if (typeof gap !== "object" || gap === null) return null;
  const fields = gap as Record<string, unknown>;
  const text = [fields.title, fields.description, fields.summary].find((value) => typeof value === "string" && value.trim());
  return typeof text === "string" ? text : null;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
