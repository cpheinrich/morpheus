import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrandAnswers } from "./questions.js";

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
 * exploration with an agent that can generate and iterate on mockups — a
 * deterministic questionnaire cannot produce a look, only the constraints one
 * has to satisfy. This file is the handoff between the two.
 */
function explorePrompt(a: BrandAnswers, name: string, prefix: string): string {
  const refs = a.references.length
    ? `\n**Reference points** (direction, not templates to copy):\n${bullets(a.references)}\n`
    : "";
  const source = a.visualSource
    ? `\n**A visual direction already exists** at \`${a.visualSource}\`. Treat it as canonical — ` +
      `explore *within* it rather than replacing it, and say explicitly where a proposal departs.\n`
    : "";

  return `# ${name} — brand exploration prompt

Paste this into a fresh Claude Code or Codex session, in this repository.

---

I am designing the visual identity for **${name}**. Below is the decided strategy — it is settled,
so treat it as constraint rather than suggestion.

**What it is:** ${a.what}

**Mission:** ${a.mission}

**Primary audience:** ${a.primaryAudience}${
    a.secondaryAudience ? `\n\n**Secondary audience:** ${a.secondaryAudience}` : ""
  }

**It must feel:**
${bullets(a.feels)}

**It must never feel or sound like:**
${bullets(a.never)}

These boundaries are the hard part. A proposal that trips one is wrong even if it is otherwise
good.${refs}${source}

## What I want from you

Produce **8 distinct visual directions** as self-contained HTML mockups I can open side by side.
Distinct means genuinely different bets — not one idea in eight colourways.

For each direction:

1. A name and one sentence on the bet it is making
2. A palette with hex values, and a note on what each colour is *for*
3. Type: a display face and a text face, with the reasoning
4. A representative screen — landing hero or the primary product surface
5. Which of the "must feel" adjectives it serves best, and which it serves least

Then tell me which two you would take forward and why, including what you would lose by dropping
the others.

Do not average them into a safe consensus. I would rather have two strong directions and six I
reject than eight that are all defensible.

## After I choose

Write the winning direction into \`hq/brand/tokens.json\` as primitives, using the \`--${prefix}-\`
prefix convention, and update \`hq/brand/visual-system.md\` to describe it.
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

## Not finished yet

This package is **starter context**, not a finished identity. A questionnaire can capture the
constraints a brand must satisfy; it cannot produce a look.

Next: paste [\`explore-prompt.md\`](./explore-prompt.md) into a Claude Code or Codex session and
work through visual directions interactively. Come back and run \`morpheus brand refresh\` when
the answers themselves need revising.

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

export interface GenerateResult {
  files: string[];
  /** Files left untouched because they already existed. */
  skipped: string[];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the brand package.
 *
 * **Never overwrites an existing file.** Anything already present is skipped
 * and reported, so running this on an established project cannot destroy work.
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
): Promise<GenerateResult> {
  await mkdir(join(brandDir, "assets"), { recursive: true });

  const planned: Array<[string, string]> = [
    ["README.md", readme(answers, name)],
    ["strategy.md", strategy(answers, name)],
    ["voice.md", voice(answers, name)],
    ["visual-system.md", visualSystem(answers, name, prefix)],
    ["messaging.json", messaging(answers)],
    ["explore-prompt.md", explorePrompt(answers, name, prefix)],
    [
      "assets/README.md",
      "# Assets\n\nlogo.svg, logo-reverse.svg, icon.png, og-image.png.\n\nSmall, versioned, and needed at build time, so they live in git. Large media belongs on the\nCDN, not here.\n",
    ],
  ];

  // Scaffold tokens only for a project with no visual system yet. When
  // `visualSource` is set, the existing tokens are canonical.
  if (!answers.visualSource) planned.push(["tokens.json", tokens(prefix)]);

  // The answers themselves, so `brand refresh` can show what was said last
  // time rather than making the owner reconstruct it.
  await writeFile(
    join(brandDir, "answers.json"),
    JSON.stringify(answers, null, 2) + "\n",
    "utf8",
  );

  const written: string[] = [];
  const skipped: string[] = [];

  for (const [rel, content] of planned) {
    const abs = join(brandDir, rel);
    if (await fileExists(abs)) {
      skipped.push(abs);
      continue;
    }
    await writeFile(abs, content.endsWith("\n") ? content : content + "\n", "utf8");
    written.push(abs);
  }

  return { files: written, skipped };
}
