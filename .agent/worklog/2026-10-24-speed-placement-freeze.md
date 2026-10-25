# MO-26-10-24-23.34.43 — Populated modal freeze headroom

## Reproduction and scope

Issue #493 follows installed #489/f533aff, rather than treating earlier loading-state captures as proof for a populated modal. Real batch 20261025T062926Z-6x0eqt: c1/c2 JPEGs succeeded at 06:25:38/06:26:52 UTC; c3 at 06:29:07 failed `Viewport freeze exceeded 120 ms work limit`. All semantic HTML survived. Viewport977×840, page scroll 2772.8125, Juana Molina / query “Juana Molina official live” / 8 results/NPR Tiny Desk selected. Inner scrolls 236.25,60.625,0 respectively. Preserved original JSON and JPEGs under `/tmp/morpheus-capture-residual/`. The live website responder owns all site edits; no user-tab/queue/service operation was performed.

Verify graph: canonical Morpheus ready/full generation 2026-10-25T06:22:39Z. Searches for embedded freeze/capture functions returned no symbols; coverage for overlay source, browser context test and QA runbook plus tests/browser scope had no recorded issues/metadata match (best effort). Exact embedded-source reads are ground truth; this newer task worktree is outside canonical graph coverage. Primary untracked fund bookkeeping intake remains preserved. #492 separately records wait-ci's same-head duplicate-name false green with exact CI/metadata check URLs; not implemented here.

## Measured cause and chosen change

Isolated current populated guide profiling at the recorded viewport/scroll: 168 nodes, 170 style passes, 1,552,801-byte XML. One cold production-bound freeze 110ms; repeat fresh run 104.2ms then 91.3–91.8ms warm. Styles cost 67–70.5ms, media 13–25ms, XML 5–6ms. The original user c3 is the actual failure proof; local steady-state successes do not invalidate it.

In-memory comparison of a once-per-freeze ordinary property list lowered style copying to 27–30ms, total 64.6ms cold / 51–55ms warm. All baseline/bulk/property-list trial JPEGs were byte-identical (`ba61153d8ab87174…`). Repeated native length/index enumeration, including inherited custom properties, dominates; read ordinary property names once from the existing initial-style probe and still read each node's current resolved values at placement. No cross-pin cache, generic module or new dependency. Existing initial-style/color exceptions, scripts/media handling, and 120ms/4000node/2MiB/q0.5/1600edge/ 512KiB caps are unchanged.

## Tests and dead ends

- Bulk cssText assignment gave no improvement (cold 110ms / warm 92–98ms); rejected.
- First repeated-profile script hit its own pin marker on the second right-click; deleting only its own isolated pin between captures corrected the harness. No live pins were touched.
- A 640-token fixture passed the old implementation, so it was insufficient as a scaling regression. The 2048-token stress fixture deliberately exceeds the actual guide dictionary; populated/long-page structure, 8 results, two placements, live query/selection mutation and encoded green-selection pixels are functional. It failed before the optimization in BOTH engines with the production 120ms error, and passed afterwards (2 engine cases, 24.4s). It is not presented as an exact synthetic reproduction of the guide's CPU timing.

## Validation

- Full context browser suite:24 cases passed serially in Chromium/WebKit (1.7minutes), including existing SVG/pseudo/currentColor/form/scroll/media/storage/legacy/error cases and the new populated stress modal.
- Node24.22.1: `pnpm typecheck`; `pnpm exec eslint src/qa/web/overlay-client.ts`; `pnpm exec vitest run tests/qa-web.test.ts tests/qa-overlay-pins.test.ts tests/qa-web-readiness.test.ts` (56tests); `pnpm compile`; `pnpm morpheus pm index` all passed. Only capture/direct dependent units were run; full unit suite belongs to CI.
- Final source-candidate acceptance against the restored production guide:16/16 populated Juana Molina JPEGs succeeded across2 fresh contexts per Chromium/WebKit, with inner scroll0/236.25/60.625/0. No profiling changes inside freeze: only an outside call timer/byte measurement, unchanged production120ms guard. Freeze48.5–74.1ms, XML≤1,632,598bytes, JPEG≤72,617bytes, all977×840/q0.5, zero page errors. `/tmp/morpheus-493-real/results.json` and adjacent nativePNG/placementJPEGs retain the evidence. Inspected actual Chromium/WebKit pixels and stress-fixture selection pixels. Artist, query,8-result heading, inline external link and embedded/cross-origin placeholders remain visible. Placeholder label contrast is unchanged from the baseline; no native-perfect rendering claim.
- Source candidate uses fresh contexts/route override only. Own draft pins were deleted and contexts closed; no Send, user-tab operation, responder/preview restart or website edit. The parent stopped/rebuilt services after QA ended; final production capture availability was coordinated explicitly.

Fresh independent review remains pending. Original failure metadata and final successful JPEGs remain distinct evidence. During investigation the website owner applied the requested removal of “YouTube preview”; current guide header captures show Juana Molina rather than pretending the old wording still exists.
