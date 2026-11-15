# Infra dashboard design

*Read when building or changing an HQ infrastructure dashboard ("desk"): its layout, rows,
drilldowns, status wording or browser checks.*

Darwin's Operations Desk set this behaviour and Lakina's Infra tab is the second desk to follow
it. The checklist below is the target: Lakina meets all of it, while Darwin's Overview deployment
and Factory rows and its fragment reader predate the exact-channel, full-row and old-fragment
rules, so copy those parts from the checklist rather than from Darwin's source. They read different sources under different authorization; what they share is how a
person scans, opens and trusts what the desk says. The display primitives (times, states, links,
fragment views) are in `morpheus-kit/ops-desk` ([`src/ops-desk/README.md`](../../src/ops-desk/README.md)).
This runbook covers the rest of the contract, which is layout and interaction. Every example here
is synthetic.

## Checklist

- [ ] Tabs are Overview → Devices → Work → Deployments. Add a fifth tab only for a verified feed
  the project actually has (Darwin's Factory).
- [ ] Overview is a health strip, then Devices on the left and Active work over Deployments on
  the right. It becomes one column at 760px and below.
- [ ] Every Overview row is a single `<button>` covering the full row width, with no nested links.
  It opens the exact device, work item or deployment channel, and focus moves to the target tab.
- [ ] A list row that also carries external links uses the linked-row overlay described below,
  never a link nested in a button.
- [ ] Every selection lives in the URL fragment, so Back/Forward, reload, a shared link and
  sign-in all restore it. Old fragments keep resolving.
- [ ] Statuses sit in one fixed-width column. Terminal outcomes stay dated when a source goes
  stale; live states become Unknown.
- [ ] The health strip counts confirmed failures only. Unknown is never a failure, and a
  no-change check is never a delivery.
- [ ] Each source reports itself as available, failed or absent, never as an empty list.
- [ ] The synthetic browser harness passes at 1440, 1024 and 390px, in light and dark, including
  the stale, empty and no-op states.

## Layout

```
┌ Header: project HQ eyebrow · title · "Last updated 2m ago" ────────────────────────┐
│ Source strip: "GitHub observations are current." / "... last read ...; unknown"   │
│ [Overview] [Devices] [Work] [Deployments]                                          │
├────────────────────────────────────────────────────────────────────────────────────┤
│ No confirmed failures · 2 devices · Unknown states are not counted as failures     │
├──────────────────────────────┬─────────────────────────────────────────────────────┤
│ Devices          View devices│ Active work                               View work │
│ build-host-1   ● Online·idle │ CI on main                ● Running                 │
│ cloud-cell-a   ● Running     │ Deployments                       Open deployments  │
│   gateway: Healthy · 9:02am  │ Release channel           ● Succeeded               │
└──────────────────────────────┴─────────────────────────────────────────────────────┘
```

- **Devices** are things that run work or hold a service: a registered runner, a VM, an
  attached phone. The detail view shows the device's own state (for a runner, its runner status)
  and the work attributed to it.
- **Work** is CI, checks, publishing jobs and scheduled tasks. Its views are Active, Recent and
  Scheduled Tasks, plus any project-specific views such as Capacity.
- **Deployments** are delivery channels such as a mobile beta channel or web production. Current
  shows the latest attempt per channel and its next scheduled run. History shows up to five
  recent attempts per channel, newest first by start time, and one attempt can be open at a time.

Branding is the project's own. The structure, the order and the vocabulary stay the same.

## Rows and interaction

**Overview row.** The whole row is one button, so the title, the status and the whitespace are
all part of its hit area. Hover and keyboard focus highlight the full width.

```tsx
<li><button type="button" className="row overview-row" aria-label="Open device details: build-host-1" onClick={open}>
  <span className="line"><strong>build-host-1</strong><span className="status" data-state="succeeded">Online · idle</span></span>
  <span className="muted">Self-hosted runner · macOS · ARM64</span>
</button></li>
```

**Linked row.** A row that opens a detail but also offers external links. The primary button
stretches an `::after` overlay across the row (`position: relative` on the row, `inset: 0` on the
overlay). The links sit above the overlay (`position: relative; z-index: 1`). A click on the
status or whitespace opens the detail, and the external link stays separately focusable. Show the
row's focus with `:has(.primary:focus-visible)`.

**Focus and history.** Opening a row moves focus to the target tab, as Darwin does. Each distinct
view pushes one history entry (`useFragmentView`).

**Fragments.** A fragment names a tab, a mode and one selected item, for example:

| Fragment | Opens |
|---|---|
| `#devices?detail=runner-21` | that device |
| `#work?view=recent&detail=ci:501:1` | one exact work attempt |
| `#work?view=scheduled-tasks&detail=schedule:nightly` | one scheduled task |
| `#deployments?detail=web-production` | one channel's Current view |
| `#deployments?view=history&detail=release:401:1` | one historical attempt |

When the layout changes, map the old sections onto the new ones rather than letting them fall back
to Overview. HQ sign-in must re-attach the fragment the browser kept across the redirect. A
selection that no longer exists says so ("no longer in the observed history") instead of showing
something else.

**External links** open in a new tab and are built only from validated identifiers: exact job,
run attempt and commit.

**Factory Work.** Where a verified, authorized source exists, list the human task title with its
repository and state. Show the full task ID only inside the selected detail. Use the task's
explicit dashboard summary and link its exact source commit and known same-repository PRs; use
the readable fallback and say when a summary is absent. Keep the brief and the worker's private
output behind the original Factory controller. A desk on a separate project uses a separately
enrolled read-only projection, never a controller login or direct database access.

## States and wording

- One status column per list, left-aligned at a fixed width (about 12–13rem on desktop and 8.5rem
  at 760px and below), so every dot starts at the same x.
- Times read `Nov 12, 9:19pm PST` in the viewer's zone, with relative ages beside them.
- A live state (`running`, `queued`) needs a current reading. When the reading is stale, show
  Unknown and keep the dated last report beside it.
- Separate a scheduled check that found nothing to ship from an actual delivery, using the job
  that performs the delivery (for example `Upload`), not the run's overall result.
- The health strip lists confirmed problems only, as jump links. With none, it says "No confirmed
  failures" and that unknown states are not counted.
- Attribute work to a device only by an identity the source verifies, such as the runner
  registration id a job reports. Never attribute by name.

## Cross-owner and private sources

A desk may show health for something another person owns, such as a personal cloud VM. When it
does:

- Publish a closed, metadata-only record: states and the times that date them. No addresses,
  project or account identifiers, logs or private values.
- The owner runs a read-only collector in their own project. No shared web or CI identity gets a
  right there. Lifecycle evidence comes from the provider, outside the VM, so that a stopped
  machine is still described.
- Validate the record at a separate ingest route with its own caller allowlist. Reject unknown
  keys, records from the future and replayed records, and store each one only if it is newer.
- Gate the record to the operators who may see it, in the server response. Other viewers do not
  receive the field at all.
- A stale, future, missing or contradictory record shows Unknown. Never infer "stopped" from
  silence, and never claim readiness from a connectivity check.

## Verification

Keep a synthetic harness that renders the real desk component and stylesheet with fixed-time
fixture data, and capture it in Chromium. It must fail on:

- script errors, horizontal overflow, a status column that is not one x per list, or a time not in
  the compact form;
- hover at a row's far right that does not highlight it;
- whitespace that is not part of the row's hit area, or a click there that does not open the exact
  item;
- a Tab-key path that cannot reach a row and open it with Enter;
- a linked row whose status click does not open the detail, or whose external link also opens it;
- Overview rows that open the wrong work item or deployment channel;
- deep links, including old fragments; reload; Back and Forward;
- an inexact or same-tab job link;
- stale or stopped evidence that is not shown as Unknown for what it cannot know.

Capture at 1440, 1024 and 390px in light and dark, and inspect the images. When the desk shows a
private or cross-owner source, also verify the deployed desk: an authorized operator, an ordinary
viewer and a direct client read of the private store each see exactly what they should.

## Adopting this in a project

1. Depend on `morpheus-kit/ops-desk` for times, states, links and fragment views.
2. Keep sources, authorization, copy and pipeline topology in the project, and decide which of the
   project's things are devices, work and deployment channels.
3. Build the four tabs and the two row patterns above in the project's own styles and branding.
4. Copy the harness checks into the project's browser QA, and link this runbook from the
   project's web documentation.
