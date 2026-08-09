---
roadmap: MO-26-08-05-19.05.35
date: 2026-08-05
---

# SEO and ASO canonical tools become OpenSEO and Appeeky

## What changed

Six Semrush references in `architecture.md` became OpenSEO; ASO gained a canonical tool (Appeeky)
where it previously had only "ASC integration"; new **§6.2** documents the split and the
supersession.

## What was learned

**The spec had no ASO research tool at all.** §6's Bought table listed "SEO research" and nothing
for apps, while §5's storage table listed `hq/marketing/aso/` as a real folder. So ASO was a place
to put documents with no named source for them. Adding Appeeky to the table closed a gap that
predated this swap rather than just renaming a vendor.

**The real risk is substitution, not absence.** The first draft of this change was a pure
find-and-replace of `Semrush` → `OpenSEO`. That would have been wrong-shaped: with both an SEO and
an ASO tool now in the table, and both speaking in "keywords / rank / competitors / visibility",
the likely agent error stops being "cannot find a tool" and becomes "used the website tool to
answer an app question". App-store search volume and Google search volume look identical rendered
in a table and are not the same quantity. §6.2 exists for that, not for the vendor names.

**Old names were kept deliberately.** §6.2 says OpenSEO and Appeeky replace Semrush and AppTweak.
Deleting the old names would have been cleaner-looking and worse: `Semrush` and `AppTweak` appear
in planning documents in `~/cowork/zoe` and in Polycam project context, so a reader arrives
carrying the old name and needs a landing spot that contradicts it. This mirrors the existing
`pm migrate-ids` reasoning — structured references get repointed, prose mentions are left alone
because rewriting a historical record edits the past.

## Dead ends

**Considered adding `openseo` / `appeeky` to `secrets.manifest.json` with `consumers: ["agent"]`.**
Not applicable: both authenticate as remote MCP through claude.ai (§13.4 case one), so no key ever
lands in a repo or in Secret Manager. The manifest entry would have described a secret that does
not exist. Chris does hold an OpenSEO API key, but that is for the REST API / self-hosted Docker
path, which no project uses.

## Not done here

References outside this repo were left alone pending a decision from Chris — `~/cowork/zoe`
(two plan documents naming AppTweak as a future integration) and
`~/cowork/polycam-work/.claude/historical-chat-project-context.md`, which is a record of a past
conversation and should almost certainly *not* be rewritten.
