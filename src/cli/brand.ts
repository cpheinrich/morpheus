import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readAnswers } from "../brand/answers.js";
import { BrandAnswers as BrandAnswersSchema } from "../brand/questions.js";
import { checkDrift } from "../brand/generate.js";
import { generateBrand } from "../brand/generate.js";
import { QUESTIONS, type Question } from "../brand/questions.js";

/** Render a previous answer for display as a default. */
function previous(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** Ask one question, looping for list answers until an empty line. */
async function ask(
  rl: ReturnType<typeof createInterface>,
  q: Question,
  prior?: unknown,
): Promise<string | string[] | undefined> {
  console.log(`\n\x1b[1m${q.prompt}\x1b[0m`);
  console.log(`\x1b[2m${q.why}\x1b[0m`);
  if (q.example) console.log(`\x1b[2me.g. ${q.example}\x1b[0m`);

  const before = previous(prior);
  if (before) {
    console.log(`\x1b[36m  last time: ${before}\x1b[0m`);
    console.log("\x1b[2m  enter to keep it, or type a new answer\x1b[0m");
  }

  if (q.list) {
    const items: string[] = [];
    for (;;) {
      const line = (await rl.question(`  ${items.length + 1}> `)).trim();
      if (!line) break;
      items.push(line);
    }
    if (items.length) return items;
    return Array.isArray(prior) ? (prior as string[]) : undefined;
  }

  const answer = (await rl.question("  > ")).trim();
  if (answer) return answer;
  return typeof prior === "string" ? prior : undefined;
}

export interface BrandInitOptions {
  brandDir: string;
  name: string;
  prefix: string;
  /** Prefill from previously recorded answers and regenerate derived files. */
  refresh?: boolean;
}

/**
 * Report which generated files no longer follow from `answers.json`.
 *
 * Writes nothing and asks nothing, so it is safe in CI. Exits non-zero on any
 * drift — a package whose prose disagrees with its own answers is wrong even
 * though every file is present.
 */
export async function check(opts: {
  brandDir: string;
  name: string;
  prefix: string;
}): Promise<number> {
  const prior = await readAnswers(opts.brandDir);
  if (!prior) {
    console.error(`No answers.json in ${opts.brandDir} — run \`morpheus brand init\` first.`);
    return 1;
  }
  const parsed = BrandAnswersSchema.safeParse(prior);
  if (!parsed.success) {
    console.error("answers.json does not validate:");
    for (const i of parsed.error.issues) {
      console.error(`  ${i.path.join(".") || "(root)"}: ${i.message}`);
    }
    return 1;
  }

  const { derived, seeded } = await checkDrift(
    opts.brandDir,
    opts.name,
    opts.prefix,
    parsed.data,
  );
  if (!derived.length && !seeded.length) {
    console.log("\x1b[32m✓ Every generated file matches answers.json.\x1b[0m");
    return 0;
  }

  if (derived.length) {
    console.error("\n\x1b[31mStale — these are pure functions of the answers:\x1b[0m");
    for (const f of derived) console.error(`  ${f}`);
    console.error("\x1b[2m  `morpheus brand refresh` regenerates them.\x1b[0m");
  }
  if (seeded.length) {
    console.error("\n\x1b[33mDisagrees with answers.json — yours to reconcile:\x1b[0m");
    for (const f of seeded) console.error(`  ${f}`);
    console.error(
      "\x1b[2m  These were generated once and are now yours. Morpheus will not\n" +
        "  revert your prose to resolve this.\x1b[0m",
    );
  }
  return 1;
}

/**
 * Walk the brand questions and write the package.
 *
 * Validation happens once at the end rather than per-question, so a wrong
 * answer late does not discard everything typed before it.
 */
export async function init(opts: BrandInitOptions): Promise<number> {
  const rl = createInterface({ input: stdin, output: stdout });
  const prior = opts.refresh ? await readAnswers(opts.brandDir) : null;

  console.log(`\n\x1b[1mBrand — ${opts.name}\x1b[0m`);
  console.log(
    "\x1b[2mEight questions. Answer in a sentence; nothing here writes a TODO, so a\n" +
      "question you skip becomes a section that is simply absent rather than\n" +
      "one that looks answered and is not.\x1b[0m",
  );
  console.log(
    "\x1b[2m\nThese answers are not final. Run \x1b[0m\x1b[1mmorpheus brand refresh\x1b[0m" +
      "\x1b[2m any time to\ngo through again with your previous answers prefilled — so aim for" +
      " true\nrather than perfect.\x1b[0m",
  );
  if (prior) {
    console.log("\x1b[36m\nPrevious answers loaded. Enter keeps each one.\x1b[0m");
  }

  const raw: Record<string, unknown> = {};
  try {
    for (const q of QUESTIONS) {
      const value = await ask(rl, q, prior?.[q.key]);
      if (value === undefined) {
        if (!q.optional) {
          console.log("\x1b[33m  (required — asking again)\x1b[0m");
          const retry = await ask(rl, q, prior?.[q.key]);
          if (retry === undefined) {
            console.error("\nAbandoned: a required question was left blank.");
            return 1;
          }
          raw[q.key] = retry;
          continue;
        }
        continue;
      }
      raw[q.key] = value;
    }
  } finally {
    rl.close();
  }

  const parsed = BrandAnswersSchema.safeParse({ references: [], ...raw });
  if (!parsed.success) {
    console.error("\nSome answers did not validate:");
    for (const i of parsed.error.issues) {
      console.error(`  ${i.path.join(".") || "(root)"}: ${i.message}`);
    }
    return 1;
  }

  const { files, skipped, stale } = await generateBrand(
    opts.brandDir,
    opts.name,
    opts.prefix,
    parsed.data,
    { refresh: opts.refresh },
  );

  if (files.length) {
    console.log(`\n\x1b[32mWrote ${files.length} file(s) to ${opts.brandDir}\x1b[0m`);
    for (const f of files) console.log(`  ${f}`);
  }
  if (skipped.length) {
    console.log(`\n\x1b[33mLeft ${skipped.length} existing file(s) untouched:\x1b[0m`);
    for (const f of skipped) console.log(`  ${f}`);
    console.log(
      "\x1b[2m\nNothing is overwritten. Delete a file and re-run if you want it\n" +
        "regenerated — your edits are never silently replaced.\x1b[0m",
    );
  }
  if (stale.length) {
    console.log(
      `\n\x1b[33m${stale.length} file(s) now disagree with your answers:\x1b[0m`,
    );
    for (const f of stale) console.log(`  ${f}`);
    console.log(
      "\x1b[2m\nThese were generated once and are now yours. Your answers changed but\n" +
        "your prose did not, and Morpheus will not revert your writing to close\n" +
        "the gap — reconcile them by hand, or delete a file and re-run to start\n" +
        "from the new answers.\x1b[0m",
    );
  }
  if (parsed.data.visualSource) {
    console.log(
      `\n\x1b[2mNo tokens.json written: ${parsed.data.visualSource} already holds the\n` +
        "visual system, and a second token file would be a second source of truth.\x1b[0m",
    );
  }
  console.log(
    "\n\x1b[1mThe strategy is captured. The design happens next.\x1b[0m\n" +
      "\x1b[2mA questionnaire can record the constraints an identity must satisfy; it\n" +
      "cannot produce a look. That comes from iterating on real mockups with an\n" +
      "agent, using these answers as the brief.\x1b[0m\n" +
      `\n  1. Open \x1b[1m${opts.brandDir}/explore-prompt.md\x1b[0m\n` +
      "  2. Paste it into a fresh Claude Code or Codex session in this repo\n" +
      "  3. It casts the agent as your brand designer and runs the session:\n" +
      "     diverge into distinct directions, react, narrow, converge\n" +
      "  4. At the end it writes the result back as tokens.json, visual-system.md\n" +
      "     and any assets — a first working brand package\n" +
      "\n\x1b[2mExpect several rounds. Run \x1b[0mmorpheus brand status\x1b[2m to see what the\n" +
      "package still needs, and \x1b[0mmorpheus brand refresh\x1b[2m to revise these answers.\x1b[0m",
  );
  return 0;
}
