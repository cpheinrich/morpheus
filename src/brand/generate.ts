import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrandAnswers } from "./questions.js";
import { OPTIONAL, REQUIRED } from "./package.js";

/**
 * Turn wizard answers into the brand package.
 *
 * Every file written here contains the owner's actual answers. Nothing emits
 * a `TODO` — a section that cannot be filled from an answer is omitted, so an
 * empty heading never masquerades as a decision.
 */

const bullets = (xs: string[]): string => xs.map((x) => `- ${x}`).join("\n");

function strategy(a: BrandAnswers, name: string): string {
  const audiences = a.secondaryAudience
    ? `**Primary.** ${a.primaryAudience}\n\n**Secondary.** ${a.secondaryAudience}`
    : `**Primary.** ${a.primaryAudience}\n\nThere is deliberately no secondary audience. Work that\nserves someone else is out of scope until that changes.`;

  return `# ${name} — strategy

## What this is

${a.what}

## Mission

${a.mission}

## Audience

${audiences}

## How it should feel

${bullets(a.feels)}

Apply these as a test: if a design or a sentence does not read as ${a.feels
    .slice(0, 2)
    .join(" and ")}, it is wrong regardless of whether it is otherwise good.

## Boundaries — what this must never be

${bullets(a.never)}

These are not preferences. They are the failure modes this brand drifts toward, and any work
that trips one is wrong even if it satisfies everything above.
${
  a.references.length
    ? `\n## Reference points\n\n${bullets(a.references)}\n\nAim at these when a rule is ambiguous. They are direction, not templates to copy.\n`
    : ""
}`;
}

function voice(a: BrandAnswers, name: string): string {
  return `# ${name} — voice

## Principles

${bullets(a.feels.map((f) => `Write so it reads as **${f}**.`))}

## Never

${bullets(a.never.map((n) => `Never sound ${n}.`))}

## Patterns

- Lead with the useful thing. Context second, if at all.
- Prefer the shorter word and the shorter sentence.
- State uncertainty plainly rather than hedging around it.
- No exclamation marks, no rhetorical questions, no "we're excited to".

## Before publishing

Read it aloud. If a sentence would embarrass you said out loud to ${a.primaryAudience.toLowerCase()},
rewrite it.
`;
}

function visualSystem(a: BrandAnswers, name: string, prefix: string): string {
  const source = a.visualSource
    ? `The decided direction already exists at \`${a.visualSource}\`. **Derive tokens from there
rather than inventing them** — where this document and the live surface disagree, the live
surface wins until someone deliberately changes it.`
    : `No visual direction is decided yet. Fill this in before building UI, not after — retrofitting
a visual system onto shipped screens is how brands end up incoherent.`;

  return `# ${name} — visual system

## Source of truth

${source}

## Tokens

Primitives live in [\`tokens.json\`](./tokens.json) and are the only place a raw value belongs.
Style Dictionary generates \`--${prefix}-*\` CSS custom properties, JS constants, and a Swift
enum from them.

**Never hardcode a repeated visual value in a component.** Promote it to \`tokens.json\` and
reference the generated name.

## Colour

Defined in \`tokens.json\`. Semantic names (\`action.primary\`) map to primitives, and components
reference only semantic names — so a palette change is one file.

## Typography

Defined in \`tokens.json\`. One display face and one text face unless there is a reason.

## Layout

Spacing comes from the token scale. Do not introduce one-off margins.

## Logo usage

Assets in [\`assets/\`](./assets/). Preserve clearspace equal to the mark's cap height. Never
recolour, stretch, or add effects.

## The test

${a.feels.map((f) => `Does it read as **${f}**?`).join(" ")} If not, it is wrong.
`;
}

function messaging(a: BrandAnswers): string {
  return JSON.stringify(
    {
      mission: a.mission,
      what: a.what,
      primaryAudience: a.primaryAudience,
      ...(a.secondaryAudience ? { secondaryAudience: a.secondaryAudience } : {}),
      feels: a.feels,
      never: a.never,
    },
    null,
    2,
  );
}

function tokens(prefix: string): string {
  return JSON.stringify(
    {
      $schema: "https://tr.designtokens.org/format/",
      color: {
        _comment: `Primitives. Semantic names map onto these. Prefix: --${prefix}-`,
      },
      font: {},
      space: {},
      radius: {},
    },
    null,
    2,
  );
}

/**
 * A prompt to paste into an interactive Claude or Codex session.
 *
 * The wizard's job ends at structured context. Visual direction comes from
 * iterating on real mockups with an agent — a deterministic questionnaire
 * cannot produce a look, only the constraints one has to satisfy.
 *
 * So this is written as a **brief that casts the agent as the designer** and
 * describes a session with an arc: diverge, react, narrow, converge, then
 * consolidate into the brand package. An earlier version asked for eight
 * mockups in one shot, which is the same mistake in a different place —
 * a single batch is not a design process, and nobody arrives at an identity
 * without reacting to something first.
 */
function explorePrompt(a: BrandAnswers, name: string, prefix: string): string {
  const refs = a.references.length
    ? `\n**Reference points** — direction, not templates to copy:\n${bullets(a.references)}\n`
    : "";
  const source = a.visualSource
    ? `\n**A visual direction already exists** at \`${a.visualSource}\`, and it is shipping. Treat it ` +
      `as the starting point rather than a blank page: explore *within* it, and say explicitly ` +
      `whenever a proposal departs from it and why.\n`
    : "";

  return `# ${name} — brand design session

Paste everything below into a fresh Claude Code or Codex session, in this repository.

---

You are acting as the **brand designer** for ${name}. This document is your brief, not your
output — the strategy below is settled, and your job is to take me from it to a first working
visual identity.

## The brief

**What it is:** ${a.what}

**Mission:** ${a.mission}

**Primary audience:** ${a.primaryAudience}${
    a.secondaryAudience ? `\n\n**Secondary audience:** ${a.secondaryAudience}` : ""
  }

**It must feel:**
${bullets(a.feels)}

**It must never feel or sound like:**
${bullets(a.never)}

Those boundaries are the hard constraint. A proposal that trips one is wrong even when it is
otherwise good.${refs}${source}

## How to run this session

**Show, do not describe.** Build actual HTML mockups I can open and look at. Never ask me to
imagine a direction or to choose between adjectives — I cannot react to a description, and my
reactions are the most useful signal you will get.

Work in rounds, and expect several:

1. **Diverge.** Start with a handful of genuinely different bets — different enough that rejecting
   one tells you something. Not one idea in several colourways.
2. **Ask what landed.** After each round, ask me what I responded to and what I did not, and push
   back if my reasoning contradicts the brief.
3. **Narrow.** Take what worked forward and go deeper — real screens, real copy from the brief,
   real states. Vague mockups hide the problems.
4. **Converge.** Keep going until one direction is clearly right rather than merely acceptable.

Tell me plainly when a direction I like violates a constraint I set. I wrote those boundaries when
I was thinking clearly about the whole product; I will be reacting to one screen.

**Give every direction a stable name in round one and keep it.** "Take the type from B and the
imagery from D" has to still resolve after the mockups are gone.

Put scratch mockups in \`local/brand/\`, which is gitignored. They are working material, not the
record.

## Keep the record as you go, not at the end

**Scrollback is not a design record.** This will span rounds, context compaction, probably more
than one day, and possibly a different agent. Write \`hq/brand/decisions.md\` after every round —
not once at the end — so a session that resumes tomorrow starts from what we learned rather than
from the brief again.

\`\`\`md
## Settled
- Ink on warm paper, not white. Reads calm; white read clinical. — 2026-07-29

## Rejected
- Direction B, too institutional. **Keep its type pairing** — that part worked.
- Direction D's photography. Nothing survives.

## Open
- Whether the accent appears anywhere outside interactive elements.
\`\`\`

The negative and compositional entries matter most. Without them a rejected direction comes back
in round four, the one good fragment inside a rejected direction is lost, and a fresh session
cannot tell an abandoned idea from an unexplored one.

Record which constraints hardened during review, and mark a preference provisional when it is
provisional — a guess written as settled is worse than an open question.

## Before you call it converged

A hero section flatters almost any direction. Convergence declared on one attractive marketing
mockup is the failure this step exists to prevent — the identity has to survive the screens that
are actually hard.

Render the leading direction on **at least**:

- **one expressive surface** — a landing or editorial page, the case that naturally flatters it
- **one dense functional surface** — real inputs, labels, an error state, a result. This is where a
  palette with no quiet neutral, or a display face that cannot set 13px, shows up.
- **both at mobile and desktop widths**

If it holds on both, it is a direction. If it only holds on the first, it is a poster.

Look at these too, and **say plainly which ones you did not check** rather than implying you did:
interactive states (hover, focus, disabled, error, success), inverse or dark usage if the direction
claims to support it, contrast at the smallest type size actually used, long and short copy in the
same slot, reduced-motion behaviour, imagery provenance and licensing, and differentiation from any
parent or sibling brand.

## How to finish

When we have converged, consolidate the result into the brand package. **These are the required
outputs, and they are the whole required list** — \`morpheus brand status\` checks exactly this:

${REQUIRED.filter((e) => e.source === "session")
  .map((e) => `- \`hq/brand/${e.path}\` — ${e.purpose}`)
  .join("\n")}

Two things that check catches, so aim past them rather than at them:

- \`tokens.json\` must carry real values under \`color\`, \`font\` and \`space\` — an empty scaffold
  beside a finished design is worse than no file, because it looks done in a listing. Use the
  \`--${prefix}-\` prefix convention.
- \`visual-system.md\` must have its own sentences. The generated placeholders are detected by
  name; replace them rather than writing around them.

**Do not produce anything beyond that list in this session.** The package has a deliberate set of
optional parts — motion, imagery, components, accessibility pairs, reverse logo, social card —
each added when a specific trigger arrives, and they are listed with their triggers in
\`hq/brand/README.md\`. A first package that is complete beats a broad one that is thin, and
guessing at a motion system before anything animates produces rules nobody follows.

Finally, write a \`## Completion\` section into \`decisions.md\` — last, once the rest is done:

- canonical files written or changed
- which surfaces you rendered and reviewed
- decisions still open
- temporary assets that need replacing — stock imagery, a typeface used without a licence
- where the result departs from the brief above, and why I accepted it
- checks you ran, **and checks you did not run**

That last line is the one that makes this honest. "First working version" should be a claim with
evidence and named gaps behind it, not the note a conversation happened to end on.

**First working version, not final.** Say what is still unresolved rather than papering over it.
Running \`morpheus brand refresh\` revises the strategy answers later, and this session can be
repeated against them.
`;
}

function readme(a: BrandAnswers, name: string): string {
  return `# ${name} brand

${a.what}

## Read in this order

1. [\`strategy.md\`](./strategy.md) — what this is, who for, and what it must never be
2. [\`voice.md\`](./voice.md) — how it writes
3. [\`visual-system.md\`](./visual-system.md) — how it looks, and where tokens come from
4. [\`tokens.json\`](./tokens.json) — the canonical values

## What a complete package contains

**Required.** \`morpheus brand status\` checks these, and nothing else counts as the minimum:

${REQUIRED.map((e) => `- \`${e.path}\` — ${e.purpose}`).join("\n")}

Required is deliberately short. A checklist long enough to be thorough is one nobody finishes, and
a list that is never green stops being read.

**Optional, added when the trigger arrives.** None of these is overdue until its condition is
true — that is the point of writing the condition down rather than the deadline:

| File | What | Add it when |
|---|---|---|
${OPTIONAL.map((o) => `| \`${o.path}\` | ${o.purpose} | ${o.when} |`).join("\n")}

## Not finished yet

A questionnaire can capture the constraints a brand must satisfy; it cannot produce a look.

Next: paste [\`explore-prompt.md\`](./explore-prompt.md) into a Claude Code or Codex session. It
casts the agent as the designer and works through directions interactively, then writes the
required files above. Run \`morpheus brand refresh\` when the answers themselves need revising.

## Implementation contract

- \`tokens.json\` is canonical. Change a visual value there first, never in a component.
- \`messaging.json\` is imported by the web app. Taglines and mission are **not** copied into
  page copy — they are imported, so they cannot drift.
- Consult this directory before every frontend change and again at review.
- Accessibility, truthful claims, and legibility outrank visual consistency.

## The review test

Does this read as ${a.feels.join(", ")}? And does it avoid being ${a.never.join(", ")}?
`;
}

/**
 * Who owns a file once it exists.
 *
 * The original rule — never overwrite anything — was right about not
 * destroying work and wrong about treating every file the same. `refresh`
 * rewrote `answers.json` and skipped the rest, so a changed mission could sit
 * in `answers.json` while the old one stayed in `messaging.json`, which the
 * web app imports. The refresh reported success and shipped the stale value.
 *
 * - `derived` — a pure function of the answers. Nothing hand-written survives
 *   in it legitimately, so refresh regenerates it without asking.
 * - `seeded` — generated once as a starting point, then human-owned. Refresh
 *   reports that it disagrees with the answers; it does not resolve it.
 * - `authored` — the design session's output. Refresh never touches it.
 */
export type Ownership = "derived" | "seeded" | "authored";

interface Planned {
  path: string;
  content: string;
  ownership: Ownership;
}

export interface GenerateResult {
  files: string[];
  /** Files left untouched because they already existed. */
  skipped: string[];
  /**
   * `seeded` files whose content no longer follows from the answers. Named
   * rather than rewritten — the whole point of `seeded` is that a human may
   * have improved the prose, and silently reverting that is the same class of
   * bug as silently keeping a stale mission.
   */
  stale: string[];
}

async function readIfPresent(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

function plan(answers: BrandAnswers, name: string, prefix: string): Planned[] {
  const planned: Planned[] = [
    { path: "README.md", content: readme(answers, name), ownership: "derived" },
    { path: "messaging.json", content: messaging(answers), ownership: "derived" },
    {
      path: "explore-prompt.md",
      content: explorePrompt(answers, name, prefix),
      ownership: "derived",
    },
    { path: "strategy.md", content: strategy(answers, name), ownership: "seeded" },
    { path: "voice.md", content: voice(answers, name), ownership: "seeded" },
    {
      path: "visual-system.md",
      content: visualSystem(answers, name, prefix),
      ownership: "seeded",
    },
    {
      path: "assets/README.md",
      content:
        "# Assets\n\nlogo.svg, logo-reverse.svg, icon.png, og-image.png.\n\nSmall, versioned, and needed at build time, so they live in git. Large media belongs on the\nCDN, not here.\n",
      ownership: "derived",
    },
  ];

  // Scaffold tokens only for a project with no visual system yet. When
  // `visualSource` is set, the existing tokens are canonical.
  if (!answers.visualSource) {
    planned.push({ path: "tokens.json", content: tokens(prefix), ownership: "authored" });
  }
  return planned;
}

const normalise = (s: string): string => (s.endsWith("\n") ? s : s + "\n");

export interface GenerateOptions {
  /**
   * Regenerate `derived` files rather than skipping them. Off for `init`,
   * where nothing should exist yet and a surprise overwrite has no upside.
   */
  refresh?: boolean;
}

/**
 * Write the brand package.
 *
 * **Never overwrites an authored or seeded file.** On `init` nothing existing
 * is touched at all.
 *
 * That matters most for `tokens.json`. Writing an empty scaffold beside a real
 * token system creates a second canonical source — the worst failure this
 * command can cause, and the one least likely to be noticed, since both files
 * look plausible.
 */
export async function generateBrand(
  brandDir: string,
  name: string,
  prefix: string,
  answers: BrandAnswers,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  await mkdir(join(brandDir, "assets"), { recursive: true });

  // The answers themselves, so `brand refresh` can show what was said last
  // time rather than making the owner reconstruct it.
  await writeFile(
    join(brandDir, "answers.json"),
    JSON.stringify(answers, null, 2) + "\n",
    "utf8",
  );

  const written: string[] = [];
  const skipped: string[] = [];
  const stale: string[] = [];

  for (const { path: rel, content, ownership } of plan(answers, name, prefix)) {
    const abs = join(brandDir, rel);
    const existing = await readIfPresent(abs);
    const next = normalise(content);

    if (existing === null) {
      await writeFile(abs, next, "utf8");
      written.push(abs);
      continue;
    }
    if (existing === next) continue; // already current — not a skip worth reporting

    if (opts.refresh && ownership === "derived") {
      await writeFile(abs, next, "utf8");
      written.push(abs);
      continue;
    }
    if (opts.refresh && ownership === "seeded") {
      stale.push(abs);
      continue;
    }
    skipped.push(abs);
  }

  return { files: written, skipped, stale };
}

/**
 * Report which files disagree with `answers.json`, writing nothing.
 *
 * Reads the recorded answers rather than asking, so this is safe in CI and
 * safe to run on a package someone else refreshed.
 */
export async function checkDrift(
  brandDir: string,
  name: string,
  prefix: string,
  answers: BrandAnswers,
): Promise<{ derived: string[]; seeded: string[] }> {
  const derived: string[] = [];
  const seeded: string[] = [];

  for (const { path: rel, content, ownership } of plan(answers, name, prefix)) {
    if (ownership === "authored") continue;
    const abs = join(brandDir, rel);
    const existing = await readIfPresent(abs);
    if (existing === null || existing === normalise(content)) continue;
    (ownership === "derived" ? derived : seeded).push(abs);
  }
  return { derived, seeded };
}
