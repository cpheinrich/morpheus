# The inbox cycle

**Read this when** writing, replying to, or archiving `hq/team/<handle>.md`. Run `morpheus inbox validate` before finishing.

`hq/team/<handle>.md` is how a human and their agents exchange state. These are the only
files a human is expected to edit.

**One inbox per person, not per session.** A person's file collects items from every agent
working for them, each heading tagged with the agent that raised it (`` `claude` ``,
`` `codex` ``). Two agents share a working copy so writes serialise; two *people* never touch
the same file, so git never merges a status.

1. I write it at the end of a working session: **a prose summary of what got done first**, then
   numbered items, each ending in a `~`. Summary-before-blockers is the order a human expects.
2. He replies inline after the `~`, leaving the marker in place.
3. On my next turn I: read the replies, act on them, promote anything durable to
   `.agent/decisions.md`, archive the whole exchange to
   `.agent/inbox-archive/YYYY-MM-DD-HHMM-<handle>.md` (date first, so the archive reads as one timeline), and write a fresh inbox.

A cycle goes out on its own `inbox-<YYYY-MM-DD>` branch — see the records-only exception in [`pm-workflow.md`](pm-workflow.md#what-a-pr-carries).

**Markers.** Three, and the distinction matters because Chris scans rather than reads:

**Every item is either closed or open. Never both, never neither.**

**The state lives in the heading**, not inline — `❗` and `✅` carry colour, so scanning does not
depend on the renderer's text colour. Items are `##` with no wrapping section header, because
many Markdown renderers dim each descending heading level.

| State | Shape |
|---|---|
| **Closed** | `## ✅ 2. Title · \`claude\`` → answer, **no reply slot** |
| **Open** | `## ❗ 1. Title · \`claude\`` → answer → **`~` on its own line** to reply into |

Two mistakes to avoid, both made in the first round:

1. **`❗` without a following `~`.** He has nowhere to answer. The `~` at the top of an item is
   his *previous* reply, not a fresh one.
2. **`✅` on an item that still asks a question.** If there is a question, it is open.

**An open item proposes options.** Where the item is a decision, give **three concrete options
and an `Other`**, one marked recommended and placed first, so replying is a selection rather than
a composition:

```markdown
## ❗ 3. Which way on the contact form? · `claude`

Delivery still calls Cloudflare's Email Sending API…

- **A — keep Cloudflare (recommended).** Works today, already in the stack, no new account.
- **B — move to Resend.** Removes the dependency; needs an account, a verified domain, a key.
- **C — drop the form.** Point people at the social links already on the page.
- **Other —** something else, or none of these is the right frame.

~
```

Chris's reply time is the bottleneck, not agent generation time, and an item demanding prose
spends the scarce resource to save the abundant one. The second reason matters more: **three real
options cannot be written without having done the analysis**, where a bare `~` lets an
under-examined question be handed over as though that were collaboration. Items get longer; that
is the trade.

**`Other` is structural, not decoration.** Options railroad — three plausible choices can hide
that the answer is a fourth thing, and a reader scanning quickly takes the least-bad rather than
noticing the frame is wrong. This is not hypothetical: a question went out as *"darwin and evo use
Vercel DNS — if so, cut over"* when they in fact use Cloudflare DNS pointed at Vercel. As three
Vercel-DNS-flavoured options, that false premise would have been *harder* to catch, since each
option would have quietly reasserted it.

So: **options only where the analysis is real.** Filler is worse than an honest open question. And
not every item is a decision — an FYI or a genuinely open-ended question takes a plain `~`.

`morpheus inbox validate` enforces both, plus dense numbering, the GitHub-handle rule, and a
summary before the first item. Run it before finishing; CI runs it too.

**Link roadmap items with relative markdown paths** — `[MO-011](product/roadmap/MO-011.md)`
from `hq/STATUS.md`. These resolve in Obsidian *and* render on GitHub, unlike `[[wikilinks]]`
which only work in Obsidian.

Keep **Needs you** as one list. Splitting "waiting on you" from "blocked" was a false
distinction — both mean the same thing to the person reading it.

Never let an inbox accumulate history. It is a snapshot; the archive is the record.
