import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BrandAnswers } from "./questions.js";

/**
 * Previously recorded answers, if the wizard has run before.
 *
 * `brand refresh` shows these as defaults so the owner edits rather than
 * reconstructs. The point is to remove the pressure to get every answer right
 * the first time — a brand that can be revised is one people will actually
 * write down.
 */
export async function readAnswers(brandDir: string): Promise<BrandAnswers | null> {
  try {
    const raw = JSON.parse(await readFile(join(brandDir, "answers.json"), "utf8"));
    const parsed = BrandAnswers.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
