# Host app research in `/hq`

Read when a project publishes a captured app study or App Store signals to its HQ. The project
captures and publishes; Morpheus supplies the contract, the validator, the Appeeky fetcher and the
viewer. Keep real studies and snapshots in the project's private storage, never in a public
repository.

## Study directory

```text
<study>/
  study.json          # schemaVersion 1
  screens/home.png    # every other file is listed in study.json "assets"
  screens/home.ax.json
  exports/flows.csv
```

`study.json` holds `studyId`, `capturedAt`, `device {model, osVersion?}`, `app {slug, name,
version, status, summary, entryScreenId, screens, transitions, gaps, replayChecks, metrics}`,
`assets {<relative path>: {bytes, sha256, contentType}}` and `downloads [{label, path}]`. Unknown
keys are kept as data. Element bounds default to the 393×852 iPhone point canvas; set
`boundsSpace` to `pixels` (relative to the screenshot, e.g. 1179×2556) or `normalized` (0–1). A
screen with `screenshots: null` or `[]` is a text-only or protected observation.

```sh
morpheus product-research validate <study-directory>
```

It fails on any schema error, duplicate id, unresolved screen/element/asset reference, unsafe
path, symlink, extra or missing file, byte-count or SHA-256 mismatch. Run it before every upload.

## Publication (project-owned)

Upload the validated directory to a content-addressed prefix, for example
`product-research/studies/<app-slug>/<studyId>/<path>`, create-only (`x-goog-if-generation-match:0`
or `gcloud storage cp --if-generation-match=0`), so a study is never rewritten in place. Read
access follows the project's `canAccessHq()` rule; browser writes stay denied. Re-run `validate`
on a fresh download to prove the remote copy.

## App Store signals

```sh
APPEEKY_API_KEY=… morpheus product-research aso --app <numeric-id> --country us --device iphone \
  --terms "term one,term two,term three" [--branded-terms "brand"] --out <path>
```

Three to five distinct terms. Before any paid call it reads `GET /v1/auth/usage` and stops
unless included general plan credits cover the worst case: listing (2), organic keywords (3) and a
per-term rank lookup (2 each) for terms the organic list lacks. The wallet is never relied on.
Requests use `platform=apple`. A term is `ranked`, `unranked` (verified outside the results) or
`missing` (lookup failed; not verified). The output file is replaced atomically only after a
complete, valid snapshot, so a failure keeps the previous one. Store the snapshot as one small
mutable document (for example `product-research/aso/<app-slug>.json`), separate from the immutable
study; the viewer shows its source, fetch date and a stale marker after seven days.

## Web surface

```tsx
// server component: read and parse
import { parseAppResearchStudy, parseAppeekySnapshot } from "morpheus-kit/product-research";
// client component
import { ProductResearchViewer, AppStoreSignals } from "morpheus-kit/product-research/react";
import "morpheus-kit/product-research/styles.css";

<ProductResearchViewer study={study} readAsset={(path) => getBlob(ref(storage, prefix + path))} />
<AppStoreSignals snapshot={snapshot} appeekyUrl="https://appeeky.com/…" />
```

`readAsset` receives only paths from the study inventory; the viewer fetches the selected screen's
screenshot, opens accessibility text on demand, and verifies size and SHA-256 before display or
download. Deep links use `#screen=<id>&control=<id>` with an optional `capture` path. A screen with multiple screenshots
offers a labeled capture selector. Brand the views by overriding the
`--app-research-accent`, `-border`, `-muted`, `-surface`, `-selected`, `-radius` and `-gap` custom
properties, or target the `app-research-*` classes.
