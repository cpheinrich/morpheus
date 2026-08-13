import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
/**
 * The deliberately unstructured design brief that starts a brand exploration.
 *
 * A finished identity needs more than a questionnaire can capture: visual
 * material, compositional instincts, half-formed references and the things a
 * founder notices before they have vocabulary for them. `vibes.txt` keeps that
 * input in one editable place without pretending it is already the final
 * strategy or visual system.
 */
export const VIBES_FILE = "vibes.txt";
const TEMPLATE_MARKER = "[Replace this guidance with the actual brief.]";
export function renderVibes(name) {
    return `# ${name} — brand exploration brief

${TEMPLATE_MARKER}

Write freely. Include whatever will help a designer make useful visual bets:
the product and audience, the emotional territory, reference points, materials
or motifs, colors or typography you are drawn to, hard no's, and anything the
eventual brand needs to be broad enough to hold. This is a brief, not a
questionnaire; delete this guidance and use your own words.
`;
}
export function vibesReady(text) {
    if (text.includes(TEMPLATE_MARKER))
        return false;
    return text.trim().length >= 80;
}
export async function readVibes(brandDir) {
    try {
        const text = await readFile(join(brandDir, VIBES_FILE), "utf8");
        return { exists: true, ready: vibesReady(text), text };
    }
    catch {
        return { exists: false, ready: false, text: "" };
    }
}
export async function writeVibes(brandDir, name) {
    const path = join(brandDir, VIBES_FILE);
    await writeFile(path, renderVibes(name), "utf8");
    return path;
}
//# sourceMappingURL=vibes.js.map