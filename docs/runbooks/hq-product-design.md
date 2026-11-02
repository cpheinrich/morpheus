# HQ product and design standard

Read this before changing an HQ page, its information architecture, or a component that renders
HQ content. This standard covers the authenticated operating surface at `/hq`; product interfaces
may use the same primitives, but have their own task-specific interaction requirements.

The governing idea is simple: **the first screen gives the decision or action; the rest of the
page earns its space.** Detail is valuable, but it must not compete with the reason someone opened
the page.

## The reading contract

Every page serves three depths without making three documents:

1. **Five seconds — orientation.** The title, one-sentence purpose, status/freshness and primary
   action or decision are visible without scrolling.
2. **Thirty seconds — executive understanding.** A compact summary states the takeaway, why it
   matters, material evidence, risks or caveats, and the next action or owner.
3. **Deliberate study — evidence.** Sections, exact data, methods, history and provenance remain
   available through a local outline and appendices.

Do not begin with repository paths, implementation notes, release history or tentative internal
context unless that is the page's purpose. Metadata supports the headline; it is not the headline.
Use direct, plain language and delete throat-clearing. A heading should name the question its
section answers or the conclusion it supports.

## Page types and required order

Choose one primary page type. A page that tries to be a dashboard, manual, research record and
archive at once should become a hub with linked documents.

### Operating hub or dashboard

1. Purpose and current period
2. Current goals, calls, risks and asks
3. Primary actions
4. Recent changes or active work
5. Search and the complete folder/index view

The directory mirror is useful, but it is not the executive layer. Archived and shipped work lives
behind filters or a secondary view rather than dominating current work.

### Decision, research or strategy record

1. Executive brief: decision/takeaway, confidence, evidence, caveats, next action
2. Recommendation or result
3. Evidence and alternatives
4. Implications and follow-up
5. Appendices: methods, formulas, exhaustive tables, commands, provenance and history

Put exact evidence in the appendices; do not delete it. Headline ratio metrics should also be
expressed in plain-language percentages with direction. A document over about 1,200 words or seven
second-level headings needs a local outline. Treat these as review triggers, not hard content limits.

### Procedure or work instruction

1. Audience and outcome
2. The job in one sentence
3. Prerequisites and stop conditions
4. Numbered procedure and acceptance check
5. Troubleshooting
6. Internal coordination, release notes and historical context in appendices

### Data exploration

1. Question and selected scope
2. Main takeaway and caveat
3. Small set of decision metrics
4. Visualization or comparison
5. Exact values and controls
6. Method and full data in appendices or downloads

## Navigation and progressive disclosure

- Give every `h2`–`h4` a stable shareable id. Same-page links stay in the page; they never open a
  new tab.
- Long pages get a generated local outline with the current section, plus copyable section links.
  On small screens it may collapse into an “On this page” control.
- Prefer bounded previous/next navigation or a curated related set. Never append every sibling in a
  large directory to every document.
- Use disclosure for optional explanation, raw evidence and secondary controls, not for the main
  finding or required action. A collapsed appendix remains addressable by a stable fragment.
- A summary is authored, not inferred from the first paragraph. If the source format has no summary
  field, the renderer may show no summary rather than confidently promoting incidental prose.

## Layout, type and brand

HQ uses the same brand primitives and semantic design tokens as the product. It may be denser and
quieter, but it does not invent a second palette, type system, shadow language or set of radii.
Generated bindings are the source; do not copy token values into page CSS.

- Keep prose to a readable measure (roughly 65–80 characters). Use the freed desktop width for a
  local outline, metadata or related actions—not an arbitrarily wider paragraph.
- Preserve one visible `h1` and a logical heading order. Avoid all-caps labels at body-copy size.
- Use spacing, border and surface tokens to establish hierarchy. Do not shrink important text or
  reduce contrast to make dense content fit.
- Meet WCAG 2.2 AA. Text links and metadata need tested contrast, keyboard focus must remain
  visible, and pointer targets must meet the 24 CSS-pixel minimum; use 44 pixels for standalone
  icon controls where the denser exception is not useful.
- At 390 CSS pixels, the primary action, summary and current status remain usable without horizontal
  page scrolling. Test zoom/reflow as well as a device preset.

## Shared component boundary

Reusable structure belongs in `morpheus-kit`; project meaning remains in the project.

| Shared component or contract | It owns | The project still owns |
|---|---|---|
| `HqShell` | landmarks, skip link, responsive chrome, active navigation, search slot | company navigation, authorization, route catalogue |
| `ExecutiveBrief` | hierarchy and slots for takeaway, status, evidence, risk, action | the claims and evidence |
| `InPageNav` | heading discovery, active section, share links, mobile disclosure | authored section order |
| `Breadcrumbs` / `RelatedPages` | semantics, truncation, bounded layout | labels and chosen relationships |
| `DataTable` | caption/region, sorting/filtering state, column help, density, overflow, keyboard and mobile modes | columns, values, formatting, default priorities |
| `ChartFrame` | title, question, legend/tooltip tokens, accessible summary, exact-data fallback, reduced motion | data transforms and the right chart type |
| `MetricCard` / `StatusBadge` | semantic roles and token use | metric definitions and status truth |

Extract a primitive after a second real consumer or when an existing shared responsibility is
already clear. Do not force bespoke explanatory diagrams into a chart library; standardize their
frame, labels, fallback and tokens while keeping their domain geometry local.

## Tables

A table exists for comparison, not to prove all fields fit on one screen.

- Start with the columns needed for the page's question. Put secondary columns behind a column
  chooser, detail row or download. Split unrelated comparisons.
- Give every table a visible caption or equivalent labelled region. The scroll region is focusable,
  has a visible focus treatment and makes horizontal overflow apparent.
- Sorting uses native buttons in scoped column headers, announces the current sort, and preserves
  the raw numeric/date value independently of display formatting.
- Filtering is a visibly button-shaped control with active-filter count, clear/reset and result
  count. Page CSS must not style component descendants generically (for example, `.table button`).
- Column-help controls have readable names and a reliable target, but do not compress the column
  label below its usable minimum. Put verbose definitions in a popover/drawer or glossary.
- Keep the primary identifier and header context visible where practical. On narrow screens choose
  deliberately among prioritized columns, stacked records and horizontal comparison; clipping the
  second column is not a mobile strategy.
- Empty, loading, filtered-empty, missing-value and error states are designed and tested states.

The GOV.UK and U.S. Web Design System table guidance are useful baselines: captions explain the
comparison, large datasets should be reduced or split where possible, scrollable regions need
keyboard access, and stacked tables are an intentional responsive alternative.

## Charts

Use a chart only when shape, change or comparison is faster to understand visually. Use Recharts
for conventional interactive charts when it fits; a brand-consistent custom SVG is valid for
domain-specific explanatory graphics.

Every chart states the question or takeaway, units, scope and caveat. Color is never the only
series distinction. Tooltips, axes and legends use shared tokens. Provide an accessible summary and
the exact values in a table or download; a screen-reader label containing only the aggregate total
is not equivalent. Respect reduced motion and never invent determinate progress.

## Review and acceptance

Rendered HQ content is interface behavior even when only Markdown changed. Require visual evidence
when a change alters the first-screen hierarchy, heading structure, tables/charts, navigation,
component styling, or a document above the long-page triggers. Ordinary typo fixes do not need it.

For material HQ work, inspect the final build at desktop (about 1440px), compact desktop/tablet
(about 1024px) and mobile (390px), including keyboard traversal and at least the normal, empty and
long-content states that changed. A screenshot of an isolated component is not proof that page CSS,
the shell and the component work together.

Acceptance asks observable questions:

- Can a first-time reader state the decision/action after the first screen?
- Can they reach any material section with a stable URL?
- Can a keyboard user operate controls and horizontally scroll exact data?
- Does mobile preserve the question, primary identity and action?
- Does the page reuse the shared owner instead of forking its behavior?
- Are detail and provenance still available without dominating the default path?

## Migration plan

Do not bulk-rewrite the corpus before the primitives and pilots prove the rules.

### Phase 0 — inventory and baseline

Inventory routes by page type, traffic/operational importance, word and heading count, table/chart
count, existing summaries and mobile overflow. Capture representative desktop/mobile baselines and
record accessibility defects. Resolve duplicate HQ ownership and route naming before migrating the
same content twice.

### Phase 1 — foundation

Build the shared shell, heading/outline contract, executive brief, bounded related navigation,
accessible text tokens and visual-evidence trigger. Preserve source Markdown and current URLs.

### Phase 2 — three canaries

1. **Dense table:** Lakina EXP-031 proves `DataTable` integration, column help, filter affordance,
   desktop density and a real mobile mode.
2. **Long procedure:** Darwin nutrition collection proves executive ordering, procedure hierarchy,
   local outline and appendices without losing operational detail.
3. **Compact dashboard/record:** Darwin's Evo hub and algorithms notebook remain exemplars while a
   stale operating call and exact-data accessibility are corrected.

Do not migrate a second project to a primitive until the first canary has final-build screenshots,
keyboard checks and an independent review. The second project is the extraction proof.

### Phase 3 — data components and corpus migration

Extract `DataTable` and `ChartFrame`; migrate one conventional chart and one bespoke SVG frame.
Then migrate pages in impact order: current operational instructions and decisions, active research
and dashboards, long reference documents, then archives. Historical evidence may be reorganized
and cross-linked; preserve its meaning and stable inbound URLs.

### Phase 4 — guardrails and measurement

Add structural checks for missing authored summaries on long pages, broken internal fragments,
unbounded sibling lists, nested main landmarks, and component-local raw token values where a
generated binding exists. Prefer useful review warnings before hard gates.

Track:

- median time for a new reader to identify the page takeaway and next action;
- share of active long pages with an authored executive brief and local outline;
- share of data tables/charts using the shared primitives;
- critical keyboard, contrast and 390px defects;
- number of project-local implementations of each shared primitive.

## Audit evidence and precedents — 2026-10-29

The standard came from a rendered and source audit of Lakina, Darwin and Evo, not a blank-slate
redesign.

- Lakina's EXP-031 table reproduced the reported regression: project CSS removes the shared Filter
  button border, 14 narrow columns compete with help controls, and the 2,194px table provides weak
  mobile context. The same report is over 44,000px tall. Lakina already has useful takeaway cards,
  appendices and Recharts usage; the failure is inconsistent composition and ownership.
- Darwin's nutrition instruction is 2,739 words with 18 headings, no local outline and no authored
  same-page links. “The job in one sentence” follows version/process and tentative-provider text.
  Darwin's curated Evo hub and algorithms notebook demonstrate the desired alternative: purpose,
  current focus, evidence and action before the library.
- Darwin has 208 HQ Markdown documents; ten exceed 200 lines. Its generic renderer has no heading
  ids/TOC contract on main, recurring low-contrast metadata/link tokens, and unbounded sibling
  navigation. Its accessible search and native PDF dialog are strong shared precedents.
- Evo has 596 roadmap records but no current portfolio summary in its own `/hq`; a stale Q3 goal is
  the only goal. Evo and Darwin also expose competing surfaces for “Evo HQ.” Product colors largely
  align, while local shells, cards, type and tables drift. Evo's concise benchmark record already
  established the body-plus-appendices content precedent.
- Across the three projects, conventional chart frames, table behavior, breadcrumbs and mono labels
  are repeatedly hand-built. Project-specific data and explanatory SVGs should remain local; their
  interaction, accessibility and token contracts should not.

External baselines: [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[GOV.UK table guidance](https://design-system.service.gov.uk/components/table/), and
[U.S. Web Design System table guidance](https://designsystem.digital.gov/components/table/).
