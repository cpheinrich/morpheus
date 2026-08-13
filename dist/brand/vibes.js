import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
/**
 * The deliberately unstructured design brief that starts a brand exploration.
 *
 * A finished identity needs more than a questionnaire can capture: visual
 * material, compositional instincts, half-formed references and the things a
 * founder notices before they have vocabulary for them. `brand-vibes.md` keeps
 * that input in one editable place without pretending it is already the final
 * strategy or visual system.
 */
export const VIBES_FILE = "brand-vibes.md";
export const LEGACY_VIBES_FILE = "vibes.txt";
const OPTIONAL_RESPONSE = "<!-- optional response -->";
export function renderVibes(name) {
    return `# ${name} — brand vibes

> This optional scratchpad guides visual exploration. Answer any prompt in ordinary language and leave the rest blank. It is not a canonical brand record and should not be cited in the final package.

## What are some adjectives you would use to describe the brand?

${OPTIONAL_RESPONSE}

## Describe some initial thoughts on who the audience will be? (The final audience will be refined with quantitative market research)

${OPTIONAL_RESPONSE}

## How should someone feel when they interact with the brand through the website or other places?

${OPTIONAL_RESPONSE}

## Is there anything else you would like to share about the brand?

${OPTIONAL_RESPONSE}
`;
}
export function vibesReady(text) {
    const answers = text
        .replace(/^#\s+.*brand vibes.*$/gim, "")
        .replace(/^>.*$/gm, "")
        .replace(/^##\s+.*$/gm, "")
        .replaceAll(OPTIONAL_RESPONSE, "")
        .trim();
    return answers.length >= 20;
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