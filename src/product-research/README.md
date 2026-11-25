# Product research

Host app research studies and App Store signals for a project's `/hq`. Runbook:
[`docs/runbooks/product-research.md`](../../docs/runbooks/product-research.md).

| Subpath | Runs in | Owns |
|---|---|---|
| `morpheus-kit/product-research` | anywhere | Types, `parseAppResearchStudy`, `parseAppeekySnapshot` |
| `morpheus-kit/product-research/server` | Node | `validateStudyDirectory`, `fetchAppeekySnapshot` |
| `morpheus-kit/product-research/react` | browser (`"use client"`) | `ProductResearchViewer`, `AppStoreSignals` |
| `morpheus-kit/product-research/styles.css` | browser | Layout for the `app-research-*` classes |

The React entry never imports the server entry, so a client component cannot pull `node:fs` into
its bundle. Assets are read only through the consumer's `readAsset(path)` callback and rendered
only after the study's byte count and SHA-256 match; supplied HTML is never loaded.

The viewer opens with a read-only, directed navigation graph and keeps the searchable screen list
below it. Studies without authored `app.flows` show every recorded screen, including disconnected
and text-only screens, with arrows for `observed` and `verified` transitions only.

With authored flows, the picker shows top-level flows. Selecting one starts at its entry, alone.
Activating a node reveals its immediate outgoing destinations in that flow's declared `screenIds`
or the entry of a direct child flow. A child entry opens that flow at its root. The subflow menu
also opens alternate entry points for conditional or resumed states. Selecting a node opens its
URL-addressable screen details. Graph Back and Escape inside the graph retrace the preceding
graph and screen selection. Use `observed` or `verified` for observed transitions. The graph uses
dashed arrows for `source-documented` transitions in authored flows. Both modes support pan, fit,
the minimap, and Cmd / Ctrl + scroll zoom.

Pass `screenMetrics` keyed by screen ID to show optional `eventCount` and `replayCount` annotations;
omitted screens have no counts. These are consumer-provided aggregates, not an analytics fetch.
