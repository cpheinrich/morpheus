import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readAnswers } from "../brand/answers.js";
import { generateBrand } from "../brand/generate.js";
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
  /** Prefill from previously recorded answers and allow overwriting. */
  refresh?: boolean;
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

  const parsed = BrandAnswers.safeParse({ references: [], ...raw });
  if (!parsed.success) {
    console.error("\nSome answers did not validate:");
    for (const i of parsed.error.issues) {
      console.error(`  ${i.path.join(".") || "(root)"}: ${i.message}`);
    }
    return 1;
  }

  const { files, skipped } = await generateBrand(
    opts.brandDir,
    opts.name,
    opts.prefix,
    parsed.data,
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
  if (parsed.data.visualSource) {
    console.log(
      `\n\x1b[2mNo tokens.json written: ${parsed.data.visualSource} already holds the\n` +
        "visual system, and a second token file would be a second source of truth.\x1b[0m",
    );
  }
  console.log("\n\x1b[2mRun \x1b[0mmorpheus brand refresh\x1b[2m to revise any of this.\x1b[0m");
  return 0;
}
