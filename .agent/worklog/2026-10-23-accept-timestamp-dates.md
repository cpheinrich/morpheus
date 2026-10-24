---
agent: claude
date: 2026-10-23
roadmap: MO-26-10-23-18.34.31
outcome: review
---

# Accept full ISO timestamps in frontmatter date fields

#466: since #376 swapped the frontmatter parser to `@11ty/gray-matter` 3.0.0 (js-yaml 5.4.1),
`morpheus inbox validate` rejects Darwin's `hq/team/cpheinrich.md`
(`date: 2026-08-18T13:15:00.000Z`) and `hq/team/robbie-del.md` (`date: 2026-08-02T00:00:00.000Z`)
with "frontmatter date: Invalid ISO date". That fails the `pm` job on every Darwin PR.

## What the parser now returns

Probed directly: js-yaml 5 resolves **no** YAML timestamps. `2026-07-01`,
`2026-08-18T13:15:00.000Z`, `2026-08-03T09:30:00-07:00`, `2026-08-02 00:00:00` and `2026-8-1` all
come back as strings. Under js-yaml 3 every one of those was a `Date`.

## Every consumer checked

- `matter()` call sites: `src/pm/parse.ts`, `src/pm/block.ts`, `src/pm/cleanup.ts`,
  `src/inbox/parse.ts`, `src/team/validate.ts`, `src/review/local.ts`. All pass the data through a
  Zod schema. The only raw reads are `block.ts`'s `id` and `status`, which were strings before
  and still are. `src/pm/migrate-ids.ts` and `src/pm/frontmatter.ts` edit text and never parse.
- `instanceof Date`: only the two preprocessors in `src/pm/schema.ts`.
- Date fields: `RoadmapItem.created/updated`, `Request.created`, `JournalEntry.date`,
  `Inbox.date` and `MeetingNote.created` all use `isoDate`, so one fix covers them all.
  `MeetingNote.occurred` uses `isoDateTime`.
- Real data: a digit-normalised tally of `date:`, `created:`, `updated:` and `occurred:` values
  across morpheus, evo, darwin, lakinacapital, kairos, cpheinrich.com, heinrich.llc and
  heinrichbros.com. The only non-`YYYY-MM-DD` value in a date field is Darwin's two timestamps.
  Every `occurred` is a quoted offset timestamp, which `isoDateTime` already accepts.

## Change

`isoDate` also accepts a string that is a complete ISO timestamp
(`z.iso.datetime({ offset: true, local: true })`) and keeps its first ten characters, which
`z.iso.date()` then validates.

- **The whole value is gated, not a `YYYY-MM-DDT` prefix.** The issue suggested
  `/^\d{4}-\d{2}-\d{2}T/`. That accepts `2026-08-18Tnonsense` and `…000Zjunk` as dates, so a
  malformed value would pass silently.
- **The day as written, not the UTC day.** For `Z` timestamps, which are the only kind seen in
  the wild, the two agree. For an offset timestamp that crosses UTC midnight they differ by a day.
  The old Date path gave the UTC day. Keeping the written day matches `isoDateTime`'s wall-clock
  choice. No real file is affected either way.

## Left alone, deliberately

`isoDateTime` also lost some accidental acceptance: a date-only, local-time or space-separated
unquoted `occurred` used to become a Date and pass. None exists in any project. The schema's
documented intent is an offset timestamp, and `team validate` already refused an unquoted
non-UTC one through the id check. Widening it would be speculative. The same goes for YAML 1.1
spellings that `z.iso.datetime` rejects (space separator, lowercase `t`, `+07` offsets) in
`isoDate`: none are in use.

## Verification

- Focused: `pnpm exec vitest run tests/inbox.test.ts tests/pm.test.ts`, 78 passed.
- Mutation (outside the commit): (1) removing the new branch fails both acceptance tests;
  (2) the issue's prefix regex fails both rejection tests; (3) using the UTC day fails the
  offset-boundary assertion.
- `pnpm typecheck` reports only the pre-existing `tests/agentic-cto-skill.test.ts` import of the
  removed `gray-matter`. It is the same on unmodified main, and draft PR #461
  (MO-26-10-23-17.22.53) repairs it. `pnpm compile` refreshed `dist/pm/schema.*`.
- End to end, read-only, in `~/code/darwin` at `7b0c177`: main's build reproduces the two
  "Invalid ISO date" issues (exit 1). The fix's build passes all four `pm`-job steps:
  `pm validate`, `pm index --check`, `inbox validate --dir hq/team` and `team validate`
  (exit 0). The same validators pass in the other seven projects.

## Independent review

Independent review of the isoDate repair found no defects. The reviewer probed the new preprocessor with the real parser across valid, offset, leap-day and malformed timestamps, confirmed every frontmatter date field goes through isoDate and that no other consumer expects a Date, rebuilt dist and found it identical, showed both new tests fail without the fix, and confirmed the only failing CI step is the pre-existing gray-matter import that #461 repairs.

Reviewer a2cdce85584bc4c6f (fresh Claude subagent, no author history) reviewed 35318b15 at normal risk in 3.7 minutes of runner time, with no findings. Trunk (including #461) is merged in afterwards as an exact merge.

```morpheus-review
{
 "version": 2,
 "base": "0a4722e7c2f6aa259174e56af7b638dd953e7be5",
 "reviewed": "35318b1557f67c87590ed2d48eeb791d3641f50e",
 "covered": "35318b1557f67c87590ed2d48eeb791d3641f50e",
 "authorSession": "3bd6431e-a867-52fb-b7af-5e4cae915ee2",
 "reviewerSession": "a2cdce85584bc4c6f",
 "risk": "normal",
 "elapsedMinutes": 3.6803666666666666,
 "timing": {
  "source": "runner",
  "durationMs": 220822,
  "evidence": "Agent tool result usage.duration_ms for reviewer a2cdce85584bc4c6f (initial turn); the reviewer's own clock read 2026-10-24T01:44:56Z to 01:48:00Z."
 },
 "outcome": "complete",
 "summary": "Independent review of the isoDate repair found no defects. The reviewer probed the new preprocessor with the real parser across valid, offset, leap-day and malformed timestamps, confirmed every frontmatter date field goes through isoDate and that no other consumer expects a Date, rebuilt dist and found it identical, showed both new tests fail without the fix, and confirmed the only failing CI step is the pre-existing gray-matter import that #461 repairs.",
 "findings": []
}
```

