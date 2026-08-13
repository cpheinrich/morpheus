import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkConceptReview, CONCEPT_REVIEW_CONCEPT_ATTRIBUTE, CONCEPT_REVIEW_FILE, CONCEPT_REVIEW_VIEW_ATTRIBUTE, conceptReviewMeta, } from "./concepts.js";
import { REQUIRED } from "./package.js";
import { readVibes, renderVibes, VIBES_FILE } from "./vibes.js";
export const MOODBOARD_DIR = "moodboard";
export const RESEARCH_DIR = "research";
export const EXPLORE_PROMPT_FILE = "explore-prompt.md";
export const FINALIZE_PROMPT_FILE = "finalize-prompt.md";
const normalise = (text) => (text.endsWith("\n") ? text : `${text}\n`);
function moodboardReadme() {
    return [
        "# Moodboard input",
        "",
        "This local visual-inspiration folder is created with every user-facing Morpheus project. Put reference photographs, scans, screenshots, and source imagery for this brand exploration here. They are input, not the final visual system. Keep filenames readable enough for a reviewer to refer to in conversation.",
        "",
        "Everything in this folder except this README is intentionally ignored by Git, so pasted or downloaded inspiration never inflates repository history. If a reference needs to survive beyond the local session, record its URL, licence or provenance, and what survived from it in `../moodboards.md` once a direction is selected. The final package should point to approved delivery assets in `../imagery.json`, not make an application depend on this raw folder.",
    ].join("\n");
}
function researchReadme() {
    return [
        "# Brand concept review",
        "",
        "`brand.html` is the durable comparison surface for the exploration, not a one-off screenshot. It keeps each concept's design system, app-home mock, public marketing mock, typography study, and substantial Compare All view in one place while the underlying copy and test content stay fixed.",
        "",
        "The generated HTML declares its contract with:",
        "",
        "```html",
        conceptReviewMeta(),
        "```",
        "",
        `Mark each stable package with \`${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="stable-name"\`, and mark the five rendered panels with \`${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="system"\`, \`home\`, \`marketing\`, \`type\`, and \`compare\`. Those portable markers let Morpheus validate the durable review without constraining its layout or JavaScript.`,
        "",
        "Keep the page and its working assets available through selection and finalization. Its role is to make decisions traceable; the canonical selected brand is written back to the parent directory only after a person chooses a direction or an intentional hybrid.",
    ].join("\n");
}
function assetsReadme() {
    return [
        "# Brand assets",
        "",
        "Small, build-time assets such as a logo, icon, and social card live here in Git. Large approved imagery belongs in the project's public-media store; catalogue its stable object key or URL, alt text, provenance, and intended surface in `../imagery.json`.",
        "",
        "Do not put raw moodboard material here. `../moodboard/` is discovery input; this folder holds the compact assets the final product actually imports.",
    ].join("\n");
}
function readme(name) {
    return [
        `# ${name} brand`,
        "",
        "This starter is created automatically by `morpheus init` for company and personal projects. `morpheus brand init` remains the safe, idempotent repair command for an older or partial project.",
        "",
        "## The workflow",
        "",
        "1. Write a loose brief in [`vibes.txt`](./vibes.txt) and add source material to [`moodboard/`](./moodboard).",
        "2. Run `morpheus brand explore`, then give [`explore-prompt.md`](./explore-prompt.md) to an agent. It creates [`research/brand.html`](./research/brand.html): five genuinely distinct, comparable directions in one review page.",
        "3. Iterate in that page. Keep [`decisions.md`](./decisions.md) current after each round.",
        "4. Once a direction is selected, run `morpheus brand finalize --selection \"Name\"` and use the resulting prompt to write the final records below. The concept page remains as research; it is not thrown away when the package becomes official.",
        "",
        "`answers.md` is legacy and is deliberately not created. A moodboard plus a free-form brief is better source material for visual exploration than a constrained questionnaire. Existing projects can run `morpheus brand migrate` to copy legacy context into `vibes.txt` without destroying their established records.",
        "",
        "## Canonical final package",
        "",
        "| File | Owns |",
        "| --- | --- |",
        "| [`strategy.md`](./strategy.md) | Positioning, mission, audience, and boundaries |",
        "| [`voice.md`](./voice.md) | Voice, vocabulary, and copy behavior |",
        "| [`messaging.json`](./messaging.json) | Reusable structured messaging imported by product surfaces |",
        "| [`tokens.json`](./tokens.json) | Brand primitives: colour, typography, space, radius |",
        "| [`visual-system.md`](./visual-system.md) | Layout, component, typography, and imagery rules |",
        "| [`moodboards.md`](./moodboards.md) | The one or two boards that informed the selected direction and what survived |",
        "| [`imagery.json`](./imagery.json) | Approved visual assets, provenance, alt text, and named placements |",
        "| [`application.md`](./application.md) | How every approved asset appears on public web and product surfaces |",
        "| [`assets/`](./assets) | Small versioned build-time files such as the logo |",
        "| [`decisions.md`](./decisions.md) | Settled, rejected, open, and completion evidence |",
        "",
        "The last three visual records are not optional decoration. A site that imports tokens and copy but does not use the chosen diagrams, photography, or art direction is an incomplete application of the brand. Read the full package before building a public page, and map every approved image to a real surface in `application.md`.",
    ].join("\n");
}
function explorePrompt(name, prefix, vibes) {
    const quotedBrief = vibes.trim() ? vibes.trim().replace(/\n/g, "\n> ") : "No brief has been written yet.";
    return [
        `# ${name} — brand concept exploration`,
        "",
        "Paste this document into a fresh Codex or Claude session in this repository.",
        "",
        "You are the brand designer. Your first output is not a prose recommendation: it is one richly comparable HTML review page that makes five distinct visual bets visible to the people deciding.",
        "",
        "## Inputs to read before designing",
        "",
        `1. [\`hq/brand/${VIBES_FILE}\`](./${VIBES_FILE}) — the current free-form brief.`,
        `2. Every file under [\`hq/brand/${MOODBOARD_DIR}/\`](./${MOODBOARD_DIR}) — the visual reference set.`,
        "3. Any existing [`hq/brand/decisions.md`](./decisions.md) and concept page — avoid reviving a rejected direction without a reason.",
        "",
        "The brief currently says:",
        "",
        `> ${quotedBrief}`,
        "",
        "If the brief is still template guidance or the moodboard folder is empty, say so before inventing meaning from nothing. Otherwise, inspect the actual material rather than treating filenames as visual evidence.",
        "",
        "## Produce one comparison surface",
        "",
        `Create or update [\`hq/brand/${CONCEPT_REVIEW_FILE}\`](./${CONCEPT_REVIEW_FILE}). It must be a standalone HTML page, readable locally with no build step, with the following exact metadata in its <head> (raise the number if later rounds add directions, never lower it below five):`,
        "",
        "```html",
        conceptReviewMeta(),
        "```",
        "",
        `Mark each stable package with \`${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="stable-name"\`, and mark the five rendered panels with \`${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="system"\`, \`home\`, \`marketing\`, \`type\`, and \`compare\`. Those portable markers let Morpheus validate the durable review without constraining its layout or JavaScript.`,
        "",
        "Create **five genuinely distinct initial brand packages**. Give each a stable name and keep it through the iteration. Five palette swaps are not five concepts: vary the compositional system, type voice, relationship to imagery, density, materiality, and emotional posture while staying faithful to the brief.",
        "",
        "The page needs concept tabs plus these five views, and the same product content must appear in each direction so the review is apples-to-apples:",
        "",
        "1. **Brand System** — palette, light/dark behavior where relevant, typography, wordmark/icon study, motif or art direction, core UI primitives, and imagery library.",
        "2. **Home** — a believable app or product-home screen, including both an expressive entry moment and enough dense UI to prove the system is usable.",
        "3. **Marketing** — a public landing-page mock using the same messaging hierarchy and CTA in every direction.",
        "4. **Typography** — controlled large and small specimens, including the actual product name, navigation/label scale, long text, and a control; vary type only when this is a type study.",
        "5. **Compare All** — a substantial side-by-side review board: art or hero treatment, palette, type, motif, at least one mobile/product snapshot, UI primitives, and the concept's distinction. A single color rectangle is not enough to make a real decision.",
        "",
        "Use the same representative copy, information hierarchy, screens, and CTA across all five. The visual system is the independent variable. Make the page responsive enough to inspect at desktop and mobile widths. Preserve reference provenance in captions or a compact source note; do not copy another brand's proprietary marks or imagery.",
        "",
        `Use the --${prefix}- token prefix when you show candidate CSS variables. If generated imagery or fonts are temporary, label that truthfully in the concept page.`,
        "",
        "## Iterate responsibly",
        "",
        "After every review round, update [`hq/brand/decisions.md`](./decisions.md) with these sections:",
        "",
        "```md",
        "## Settled",
        "- ...",
        "",
        "## Rejected",
        "- ...",
        "",
        "## Open",
        "- ...",
        "```",
        "",
        "Keep the HTML as the evidence for the decision. Do not flatten the winning direction into a token list yet: a person must choose it or name an intentional hybrid first.",
        "",
        "## When a direction wins",
        "",
        "Run `morpheus brand finalize --selection \"Chosen direction\"`. Its prompt writes the canonical package while retaining this page, the moodboard record, approved asset manifest, and exact home/product image placements. A finished brand is not a pretty hero plus neutral tokens.",
    ].join("\n");
}
function finalizePrompt(name, selection) {
    const finalFiles = REQUIRED.filter((entry) => entry.source === "final")
        .map((entry) => `- \`hq/brand/${entry.path}\` — ${entry.purpose}`)
        .join("\n");
    return [
        `# ${name} — finalize the selected brand`,
        "",
        `The selected direction is **${selection}**. Read the complete concept archive at \`hq/brand/${CONCEPT_REVIEW_FILE}\`, the original brief at \`hq/brand/${VIBES_FILE}\`, the moodboard folder, and every settled/rejected decision before writing the final package.`,
        "",
        "Do not reduce the selected direction to colors and a font. Preserve its approved imagery, visual hierarchy, and usage rules in the canonical records below. Keep the concept review HTML intact; it is evidence for why this direction was selected and a reference for future refinements.",
        "",
        "## Write the canonical package",
        "",
        finalFiles,
        "",
        "For `imagery.json`, catalogue every approved illustration, photograph, diagram, or texture with an id, title, kind, stable source (relative tracked asset or CDN key/URL), useful alt text, one or more named placements, and provenance/licensing. Include the one or two selected moodboards there too. Keep raw heavy source images out of Git when appropriate; their delivery location belongs in the manifest.",
        "",
        "For `moodboards.md`, explain which references survived and what they influenced. For `application.md`, map **every imagery asset id** to an actual public-web or product surface. The first home page must visibly use that mapping — do not build a neutral page that imports only tokens and messaging while leaving the selected imagery on disk.",
        "",
        "Use the selected typography at display and small UI sizes, document its fallback and licence status, and use the selected palette in light/dark contexts where the concept claims them.",
        "",
        "Finally, append a `## Completion` section to `decisions.md` that names the selected direction, the concepts retained or rejected, assets needing production replacement, surfaces reviewed, and checks run or not run. Then run `morpheus brand status`.",
    ].join("\n");
}
function plan(name, prefix, vibes) {
    return [
        { path: VIBES_FILE, content: renderVibes(name), ownership: "authored" },
        { path: `${MOODBOARD_DIR}/README.md`, content: moodboardReadme(), ownership: "derived" },
        { path: `${RESEARCH_DIR}/README.md`, content: researchReadme(), ownership: "derived" },
        { path: "README.md", content: readme(name), ownership: "derived" },
        { path: EXPLORE_PROMPT_FILE, content: explorePrompt(name, prefix, vibes), ownership: "derived" },
        { path: "assets/README.md", content: assetsReadme(), ownership: "derived" },
    ];
}
async function writePlan(brandDir, files, refresh) {
    const written = [];
    const skipped = [];
    for (const file of files) {
        const path = join(brandDir, file.path);
        let current = null;
        try {
            current = await readFile(path, "utf8");
        }
        catch {
            // A missing file is the normal initial state.
        }
        const next = normalise(file.content);
        if (current === next)
            continue;
        if (current !== null && (!refresh || file.ownership === "authored")) {
            skipped.push(path);
            continue;
        }
        await writeFile(path, next, "utf8");
        written.push(path);
    }
    return { files: written, skipped };
}
export async function initializeWorkflow(opts) {
    await mkdir(join(opts.brandDir, MOODBOARD_DIR), { recursive: true });
    await mkdir(join(opts.brandDir, RESEARCH_DIR), { recursive: true });
    await mkdir(join(opts.brandDir, "assets"), { recursive: true });
    const vibes = await readVibes(opts.brandDir);
    return writePlan(opts.brandDir, plan(opts.name, opts.prefix, vibes.text || renderVibes(opts.name)), Boolean(opts.refresh));
}
export async function writeFinalizePrompt(opts) {
    const error = await checkConceptReview(opts.brandDir);
    if (error)
        return { error: `Cannot finalize before ${CONCEPT_REVIEW_FILE} is ready — ${error}.` };
    const path = join(opts.brandDir, FINALIZE_PROMPT_FILE);
    await writeFile(path, normalise(finalizePrompt(opts.name, opts.selection)), "utf8");
    return { path };
}
export async function migrateLegacyAnswers(opts) {
    const target = join(opts.brandDir, VIBES_FILE);
    const existing = await readVibes(opts.brandDir);
    if (existing.exists && existing.ready) {
        return { error: `${VIBES_FILE} already has a real brief; it was left untouched.` };
    }
    let legacy;
    try {
        legacy = await readFile(join(opts.brandDir, "answers.md"), "utf8");
    }
    catch {
        return { error: "No legacy answers.md exists to migrate." };
    }
    await writeFile(target, normalise(`# ${opts.name} — migrated exploration brief\n\nThe previous answers file is preserved below as source material. Rewrite this in ordinary prose as the thinking sharpens; it is not a second canonical record.\n\n---\n\n${legacy}`), "utf8");
    return { path: target };
}
//# sourceMappingURL=workflow.js.map