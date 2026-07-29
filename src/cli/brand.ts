import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  ANSWERS_FILE,
  readAnswers,
  readAnswersDetailed,
  writeAnswers,
} from "../brand/answers.js";
import { checkDrift, generateBrand } from "../brand/generate.js";
import { BrandAnswers, QUESTIONS, type Question } from "../brand/questions.js";

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
 * Report which generated files no longer follow from `answers.md`.
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
  const { answers, issues, exists } = await readAnswersDetailed(opts.brandDir);
  if (!exists) {
    console.error(`No ${ANSWERS_FILE} in ${opts.brandDir} — run \`morpheus brand init\` first.`);
    return 1;
  }
  if (!answers) {
    console.error(`\x1b[33m${ANSWERS_FILE} is not complete:\x1b[0m`);
    for (const i of issues) console.error(`  ${i}`);
    return 1;
  }

  const { derived, seeded, missing } = await checkDrift(
    opts.brandDir,
    opts.name,
    opts.prefix,
    answers,
  );

  // Nothing generated is not the same as nothing stale. Zero files trivially
  // match the answers, and reporting that as a tick tells someone their brand
  // package is fine when it does not exist.
  if (missing.length) {
    console.error(
      `\n\x1b[33m${ANSWERS_FILE} is complete, but the package was never generated.\x1b[0m`,
    );
    for (const f of missing) console.error(`  ${f}`);
    console.error("\n\x1b[2mRun \x1b[0mmorpheus brand build\x1b[2m.\x1b[0m");
    return 1;
  }

  if (!derived.length && !seeded.length) {
    console.log(`\x1b[32m✓ Every generated file matches ${ANSWERS_FILE}.\x1b[0m`);
    return 0;
  }

  if (derived.length) {
    console.error("\n\x1b[31mStale — these are pure functions of the answers:\x1b[0m");
    for (const f of derived) console.error(`  ${f}`);
    console.error("\x1b[2m  `morpheus brand refresh` regenerates them.\x1b[0m");
  }
  if (seeded.length) {
    console.error(`\n\x1b[33mDisagrees with ${ANSWERS_FILE} — yours to reconcile:\x1b[0m`);
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

  // Write the editable file before asking anything, so quitting the wizard
  // leaves a usable artefact rather than nothing.
  const answersPath = await writeAnswers(opts.brandDir, opts.name, prior);

  console.log(`\n\x1b[1mBrand — ${opts.name}\x1b[0m`);
  console.log(
    "\x1b[2mEight questions. Answer in a sentence; nothing here writes a TODO, so a\n" +
      "question you skip becomes a section that is simply absent rather than\n" +
      "one that looks answered and is not.\x1b[0m",
  );
  console.log(
    `\n\x1b[1mYou do not have to do this sequentially.\x1b[0m\n` +
      `\x1b[2mThe answers refer to each other — what it must never be is written\n` +
      "against how it should feel — and a prompt makes you commit to each one\n" +
      "before you can see the next.\n\n" +
      `Quit any time (Ctrl-C) and edit this instead:\n\x1b[0m  ${answersPath}\n` +
      "\x1b[2mthen run \x1b[0mmorpheus brand build\x1b[2m. Same result, any order, revisable.\x1b[0m",
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

  const parsed = BrandAnswers.safeParse({ references: [], ...raw });
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

/**
 * Generate from the edited file, asking nothing.
 *
 * The other half of `init`: the wizard is one way to fill `answers.md`, and
 * this is the path for people who filled it in an editor. Both end in the same
 * place because there is only one place the answers live.
 */
export async function build(opts: {
  brandDir: string;
  name: string;
  prefix: string;
}): Promise<number> {
  const { answers, issues, exists } = await readAnswersDetailed(opts.brandDir);

  if (!exists) {
    console.error(
      `No ${ANSWERS_FILE} in ${opts.brandDir}.\n` +
        "Run `morpheus brand init` to write one — quit the wizard immediately if\n" +
        "you would rather fill it in an editor.",
    );
    return 1;
  }
  if (!answers) {
    console.error(`\n\x1b[33m${ANSWERS_FILE} is not ready yet:\x1b[0m`);
    for (const i of issues) console.error(`  ${i}`);
    console.error(
      "\n\x1b[2mEvery problem is listed above rather than one at a time, so you can\n" +
        "fix them in one pass.\x1b[0m",
    );
    return 1;
  }

  const { files, skipped, stale } = await generateBrand(
    opts.brandDir,
    opts.name,
    opts.prefix,
    answers,
    { refresh: true },
  );

  if (files.length) {
    console.log(`\n\x1b[32mWrote ${files.length} file(s)\x1b[0m`);
    for (const f of files) console.log(`  ${f}`);
  } else if (!stale.length) {
    console.log("\n\x1b[32m✓ Already current — nothing to write.\x1b[0m");
  }
  if (skipped.length) {
    console.log(`\n\x1b[2mLeft ${skipped.length} existing file(s) untouched.\x1b[0m`);
  }
  if (stale.length) {
    console.log(`\n\x1b[33m${stale.length} file(s) now disagree with your answers:\x1b[0m`);
    for (const f of stale) console.log(`  ${f}`);
    console.log(
      "\x1b[2m\nThese were generated once and are now yours. Morpheus will not revert\n" +
        "your writing — reconcile by hand, or delete one and re-run.\x1b[0m",
    );
  }
  console.log(
    "\n\x1b[2mNext: paste \x1b[0mhq/brand/explore-prompt.md\x1b[2m into a Claude or Codex\n" +
      "session. \x1b[0mmorpheus brand status\x1b[2m shows what the package still needs.\x1b[0m",
  );
  return 0;
}
