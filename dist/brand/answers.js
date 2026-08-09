import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAnswersMd, renderAnswersMd } from "./answers-md.js";
/**
 * Where the owner's answers live: `hq/brand/answers.md`.
 *
 * One file, editable directly or fillable by the wizard. Earlier versions kept
 * a JSON record beside the prose and that was a second source of truth by
 * another name — the thing this package spends most of its effort avoiding
 * everywhere else.
 */
export const ANSWERS_FILE = "answers.md";
/** Answers as recorded, or null when the file is absent or incomplete. */
export async function readAnswers(brandDir) {
    try {
        const raw = await readFile(join(brandDir, ANSWERS_FILE), "utf8");
        return parseAnswersMd(raw).answers;
    }
    catch {
        return null;
    }
}
/** Answers plus every reason they did not parse, for the commands that report. */
export async function readAnswersDetailed(brandDir) {
    let raw;
    try {
        raw = await readFile(join(brandDir, ANSWERS_FILE), "utf8");
    }
    catch {
        return { answers: null, issues: [], exists: false };
    }
    return { ...parseAnswersMd(raw), exists: true };
}
/**
 * Write the editable file, prefilled with whatever is known.
 *
 * Always overwrites. It is a rendering of the answers, and the answers are the
 * thing being changed — preserving a stale copy would defeat the point.
 */
export async function writeAnswers(brandDir, name, answers) {
    const path = join(brandDir, ANSWERS_FILE);
    await writeFile(path, renderAnswersMd(name, answers), "utf8");
    return path;
}
//# sourceMappingURL=answers.js.map