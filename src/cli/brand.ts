import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { generateBrand } from "../brand/generate.js";
import { BrandAnswers, QUESTIONS, type Question } from "../brand/questions.js";

/** Ask one question, looping for list answers until an empty line. */
async function ask(
  rl: ReturnType<typeof createInterface>,
  q: Question,
): Promise<string | string[] | undefined> {
  console.log(`\n\x1b[1m${q.prompt}\x1b[0m`);
  console.log(`\x1b[2m${q.why}\x1b[0m`);
  if (q.example) console.log(`\x1b[2me.g. ${q.example}\x1b[0m`);

  if (q.list) {
    const items: string[] = [];
    for (;;) {
      const line = (await rl.question(`  ${items.length + 1}> `)).trim();
      if (!line) break;
      items.push(line);
    }
    return items.length ? items : undefined;
  }

  const answer = (await rl.question("  > ")).trim();
  return answer || undefined;
}

export interface BrandInitOptions {
  brandDir: string;
  name: string;
  prefix: string;
}

/**
 * Walk the brand questions and write the package.
 *
 * Validation happens once at the end rather than per-question, so a wrong
 * answer late does not discard everything typed before it.
 */
export async function init(opts: BrandInitOptions): Promise<number> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log(`\n\x1b[1mBrand — ${opts.name}\x1b[0m`);
  console.log(
    "\x1b[2mEight questions. Answer in a sentence; nothing here writes a TODO, so a\n" +
      "question you skip becomes a section that is simply absent rather than\n" +
      "one that looks answered and is not.\x1b[0m",
  );

  const raw: Record<string, unknown> = {};
  try {
    for (const q of QUESTIONS) {
      const value = await ask(rl, q);
      if (value === undefined) {
        if (!q.optional) {
          console.log("\x1b[33m  (required — asking again)\x1b[0m");
          const retry = await ask(rl, q);
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

  const { files } = await generateBrand(
    opts.brandDir,
    opts.name,
    opts.prefix,
    parsed.data,
  );

  console.log(`\n\x1b[32mWrote ${files.length} files to ${opts.brandDir}\x1b[0m`);
  for (const f of files) console.log(`  ${f}`);
  console.log(
    "\n\x1b[2mNext: fill tokens.json from the decided visual direction, and drop logo\n" +
      "and icon assets into assets/.\x1b[0m",
  );
  return 0;
}
