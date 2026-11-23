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
available below it. Every recorded screen appears, including disconnected and text-only screens.
Only `observed` and `verified` transitions with two screen endpoints become arrows. Graph and list
use the same URL-addressable detail selection. Pass `screenMetrics` keyed by screen ID to show
optional `eventCount` and `replayCount` annotations; omitted screens have no counts. These are
consumer-provided aggregates, not a change to the study schema or an analytics fetch.
