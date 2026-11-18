# Infrastructure desk display

`morpheus-kit/ops-desk` is the display contract shared by HQ infrastructure desks: Darwin's
Operations Desk and Lakina's Infra tab. Each project keeps its own sources, readers,
authorization, copy and pipeline topology; only the rules both must render identically live here.

```ts
import { formatStamp, displayedState, newestAttemptFirst, githubJobUrl } from "morpheus-kit/ops-desk";
import { useFragmentView } from "morpheus-kit/ops-desk/react";
```

- **Times.** `formatStamp` writes `Nov 12, 9:19pm PST` in the viewer's browser zone (pass a zone
  only in tests). Anything unparseable is `Unknown`. Relative ages and source cadences are the
  project's own copy.
- **States.** `displayedState(state, current)` keeps a dated terminal outcome (`succeeded`,
  `failed`, `cancelled`, `skipped`) when the source is stale, and turns a live state into
  `unknown` so a stale `running` never claims work is active. Desks use that result with the source
  evidence to label expired observations and missing jobs in Deployments.
  `newestAttemptFirst` orders attempts
  by start time, then run id — never by read order or status.
- **Links.** Run, attempt, job, commit and pull-request URLs are built only from a valid
  `owner/name` and positive safe-integer ids or a full 40-character SHA; anything else yields
  `null` (or no pull links at all). `exactJobUrl` accepts a reported URL only when it equals the
  one its identifiers produce. A stage without an observed job id gets no link.
- **Views.** `parseFragment`/`buildFragment` address a tab, mode and selected detail in the URL
  fragment, which never reaches the server. `useFragmentView` pushes one history entry per
  distinct fragment and restores on load, Back/Forward and in-page hash changes; `read` and
  `write` are the project's own mapping.

No dependency: `Intl.DateTimeFormat` and `URLSearchParams` are built in.

Layout, rows, wording and the browser checks a desk must pass are in the
[Infra dashboard design runbook](../../docs/runbooks/infra-dashboard-design.md).

**Factory Work.** `factoryWorkMetadata` projects an explicitly supplied title (80 characters)
and summary (320), with optional same-repository PR numbers. `factoryWorkPresentation` adds a
readable fallback for older rows and builds exact PR and source-commit links. The caller supplies
the authorized repository, and displays the opaque task ID only in selected details. These
helpers never derive display text from prompts or worker logs.
