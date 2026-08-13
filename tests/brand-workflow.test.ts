import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkConceptReview,
  CONCEPT_REVIEW_CONCEPT_ATTRIBUTE,
  CONCEPT_REVIEW_VIEW_ATTRIBUTE,
  conceptReviewMeta,
} from "../src/brand/concepts.js";
import { migrateLegacyAnswers, writeFinalizePrompt, initializeWorkflow } from "../src/brand/workflow.js";
import { REQUIRED, packageStatus } from "../src/brand/package.js";

const BRIEF = `Kairos is a warm, thoughtful companion for people who are curious about astrology as a
tool for self-reflection. It should feel learned and grounded rather than dogmatic, use quiet
celestial diagrams and earthy material cues, and leave room for a broader wellness practice.`;

const review = (metadata = conceptReviewMeta()): string => `<!doctype html>
<html><head>${metadata}</head><body>
  <main ${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="orbit">One</main>
  <main ${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="almanac">Two</main>
  <main ${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="reverie">Three</main>
  <main ${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="theatre">Four</main>
  <main ${CONCEPT_REVIEW_CONCEPT_ATTRIBUTE}="alchemy">Five</main>
  <section ${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="system"></section>
  <section ${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="home"></section>
  <section ${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="marketing"></section>
  <section ${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="type"></section>
  <section ${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="graphics"></section>
  <section ${CONCEPT_REVIEW_VIEW_ATTRIBUTE}="compare"></section>
</body></html>`;

async function completeFinalPackage(dir: string): Promise<void> {
  await writeFile(join(dir, "brand-vibes.md"), `${BRIEF}\n`);
  await writeFile(join(dir, "moodboard", "archive-map.jpg"), "source-image");
  await writeFile(join(dir, "research", "brand.html"), review());
  await writeFile(join(dir, "strategy.md"), `# Strategy\n\n${BRIEF}\n\nThe audience is willing to pay for a calm, credible daily practice that helps them reflect without claiming certainty. The product must remain broad enough for future wellbeing features.`);
  await writeFile(join(dir, "voice.md"), `# Voice\n\nWrite as a knowledgeable, warm guide: specific, clear, and invitational. Never preach, predict certainty, or borrow a living sacred tradition as decoration. Prefer a short observation, a grounded question, and a practical next step. The voice is curious rather than clinical, quietly confident rather than performatively mystical.`);
  await writeFile(join(dir, "messaging.json"), JSON.stringify({
    what: "A daily self-reflection companion shaped by astrology.",
    mission: "Help people meet the right moment with more self-awareness.",
    primaryAudience: "Spiritually open adults seeking a calm daily reflective practice.",
  }, null, 2));
  await writeFile(join(dir, "tokens.json"), JSON.stringify({
    color: { paper: "#f5ede3", ink: "#252525", mineral: "#4c6671" },
    font: { display: "Caudex", body: "Inter" },
    space: { sm: "8px", md: "16px", lg: "32px" },
  }, null, 2));
  await writeFile(join(dir, "visual-system.md"), `# Visual system\n\nUse warm paper as the quiet field, thin mineral diagram lines as structure, and muted rust or violet only for hierarchy. The display face has learned editorial character while body text remains direct and highly legible. On dense screens, imagery sits behind content at low contrast; it never competes with action. Dark mode inverts the paper field while preserving the same measured hierarchy.`);
  await writeFile(join(dir, "moodboards.md"), `# Selected moodboards\n\n## Source\n\nThe archive-map.jpg reference and the source notes in the concept review supplied the warm paper, considered geometry, and quiet celestial materiality.\n\n## What survived\n\nThe selected direction kept diagrammatic structure, restrained pigment, and broad natural warmth. It rejected literal occult symbols, saturated celestial illustration, and decorative historical borrowing.`);
  await writeFile(join(dir, "imagery.json"), JSON.stringify({
    direction: "Modern Mystic",
    moodboards: [{ id: "archive-map", title: "Archive map", source: "moodboard/archive-map.jpg", takeaway: "Warm paper with measured celestial structure." }],
    assets: [{
      id: "orbital-overview",
      title: "Orbital overview",
      kind: "diagram",
      source: "media/brand/orbital-overview.webp",
      alt: "Fine mineral lines form a quiet orbital diagram on warm paper.",
      placements: ["home hero", "product today screen"],
      provenance: "Original commissioned brand illustration; replace temporary concept art before launch.",
    }],
  }, null, 2));
  await writeFile(join(dir, "application.md"), `# Application\n\n## Public web\n\nUse orbital-overview as the low-contrast hero structure behind the home-page introduction, with its thin lines held below headline contrast. Use the mapped asset again only in the marketing feature section, cropped for the composition rather than stretched.\n\n## Product\n\nUse orbital-overview on the Today screen at low opacity behind the personalized daily insight. Product controls and body copy remain on the quiet paper surface; the diagram is supporting context, not an illustration competing with functionality.`);
  await writeFile(join(dir, "assets", "logo.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  await writeFile(join(dir, "decisions.md"), `## Settled\n\n- Modern Mystic: learned typography, warm paper, quiet orbital geometry.\n\n## Rejected\n\n- Saturated celestial gradients and literal religious iconography.\n\n## Open\n\n- Final production illustration licensing and small-size type fallback.\n\n## Completion\n\n- Selected Modern Mystic; reviewed desktop and mobile concepts; production media replacement remains open.`);
}

describe("brand concept review workflow", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "morpheus-brand-workflow-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("starts with an optional Markdown scratchpad and moodboard input, never an answers questionnaire", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });

    const files = await Promise.all([
      readFile(join(dir, "brand-vibes.md"), "utf8"),
      readFile(join(dir, "moodboard", "README.md"), "utf8"),
      readFile(join(dir, "research", "assets", "README.md"), "utf8"),
      readFile(join(dir, "explore-prompt.md"), "utf8"),
    ]);
    expect(files[0]).toContain("brand vibes");
    expect(files[0]).toContain("What are some adjectives you would use to describe the brand?");
    expect(files[0]).toContain("Describe some initial thoughts on who the audience will be?");
    expect(files[0]).toContain("How should someone feel when they interact with the brand");
    expect(files[0]).toContain("Is there anything else you would like to share about the brand?");
    expect(files[1]).toContain("reference photographs");
    expect(files[2]).toContain("intentionally ignored by Git");
    expect(files[3]).toContain("five genuinely distinct initial brand packages");
    await expect(readFile(join(dir, "answers.md"), "utf8")).rejects.toThrow();

    const status = await packageStatus(dir);
    expect(status.required.find((entry) => entry.path === "brand-vibes.md")?.state).toBe("incomplete");
  });

  it("asks the agent for comparable systems, home, marketing, type, graphics, and a substantial comparison", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });
    const prompt = await readFile(join(dir, "explore-prompt.md"), "utf8");

    for (const view of ["Brand System", "Home", "Marketing", "Typography", "Graphics", "Compare All"]) {
      expect(prompt).toContain(view);
    }
    expect(prompt).toContain("same representative copy");
    expect(prompt).toContain("A single color rectangle is not enough");
    expect(prompt).toContain("morpheus-brand-review");
    expect(prompt).toContain("data-morpheus-concept");
    expect(prompt).toContain("data-morpheus-view");
  });

  it("renders empty scratchpad lines as valid blockquotes without trailing whitespace", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });
    await writeFile(join(dir, "brand-vibes.md"), "# Kairos — brand vibes\n\n## Notes\n\nQuiet geometry\n", "utf8");
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka", refresh: true });

    const prompt = await readFile(join(dir, "explore-prompt.md"), "utf8");
    expect(prompt.split("\n").some((line) => /[ \t]$/.test(line))).toBe(false);
    expect(prompt).toContain(">\n> ## Notes\n>");
  });

  it("does not permit finalization until a five-concept review declares every required view", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });
    await expect(writeFinalizePrompt({ brandDir: dir, name: "Kairos", selection: "Modern Mystic" }))
      .resolves.toMatchObject({ error: expect.stringContaining("research/brand.html") });

    await mkdir(join(dir, "research"), { recursive: true });
    await writeFile(join(dir, "research", "brand.html"), review(`<meta name="morpheus-brand-review" content="concepts=4; views=system,home,marketing,type,graphics,compare">`));
    expect(await checkConceptReview(dir)).toContain("at least five");

    await writeFile(
      join(dir, "research", "brand.html"),
      review(`<meta content="concepts=5; views=system,home,marketing,type,compare" name="morpheus-brand-review">`),
    );
    expect(await checkConceptReview(dir)).toBe("missing graphics view");

    await writeFile(
      join(dir, "research", "brand.html"),
      review(`<meta content="concepts=5; views=system,home,marketing,type,graphics,compare" name="morpheus-brand-review">`),
    );
    expect(await checkConceptReview(dir)).toBeNull();
    const result = await writeFinalizePrompt({ brandDir: dir, name: "Kairos", selection: "Modern Mystic" });
    expect(result.error).toBeUndefined();
    const prompt = await readFile(join(dir, "finalize-prompt.md"), "utf8");
    expect(prompt).toContain("imagery.json");
    expect(prompt).toContain("first home page must visibly use");
    expect(prompt).toContain("do not cite, link to, or name `brand-vibes.md`");
  });

  it("treats imagery, selected moodboards, and their surface mappings as final package requirements", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });
    await completeFinalPackage(dir);
    const complete = await packageStatus(dir);

    expect(complete.complete).toBe(true);
    expect(complete.required.every((entry) => entry.state === "ok")).toBe(true);
    expect(REQUIRED.find((entry) => entry.path === "imagery.json")?.source).toBe("final");

    const appPath = join(dir, "application.md");
    const application = await readFile(appPath, "utf8");
    await writeFile(appPath, application.replaceAll("orbital-overview", "the orbital asset"));
    const incomplete = await packageStatus(dir);
    expect(incomplete.required.find((entry) => entry.path === "application.md")?.detail).toContain("orbital-overview");
  });

  it("refreshes the handoff from an edited free-form brief without overwriting the brief", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });
    await writeFile(join(dir, "brand-vibes.md"), `${BRIEF}\n`);
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka", refresh: true });

    expect(await readFile(join(dir, "brand-vibes.md"), "utf8")).toBe(`${BRIEF}\n`);
    const prompt = await readFile(join(dir, "explore-prompt.md"), "utf8");
    expect(prompt.replace(/\s*>\s*/g, " ")).toContain("quiet celestial diagrams");
  });

  it("accepts one substantive scratchpad answer without requiring every prompt", async () => {
    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });
    await writeFile(
      join(dir, "brand-vibes.md"),
      "## What are some adjectives you would use to describe the brand?\n\nLearned, warm, restrained, and quietly celestial.\n",
    );

    const status = await packageStatus(dir);
    expect(status.required.find((entry) => entry.path === "brand-vibes.md")?.state).toBe("ok");
  });

  it("migrates legacy answers into the scratchpad without deleting the original", async () => {
    const legacy = "# Old answers\n\nA short legacy strategic record.\n";
    await writeFile(join(dir, "answers.md"), legacy);
    const migrated = await migrateLegacyAnswers({ brandDir: dir, name: "Kairos" });

    expect(migrated.error).toBeUndefined();
    expect(await readFile(join(dir, "answers.md"), "utf8")).toBe(legacy);
    expect(await readFile(join(dir, "brand-vibes.md"), "utf8")).toContain(legacy.trim());
  });

  it("copies a prior vibes.txt into the new scratchpad without deleting it", async () => {
    const legacy = `${BRIEF}\n`;
    await writeFile(join(dir, "vibes.txt"), legacy);

    await initializeWorkflow({ brandDir: dir, name: "Kairos", prefix: "ka" });

    expect(await readFile(join(dir, "vibes.txt"), "utf8")).toBe(legacy);
    expect(await readFile(join(dir, "brand-vibes.md"), "utf8")).toContain(BRIEF.trim());
    expect((await packageStatus(dir)).required.find((entry) => entry.path === "brand-vibes.md")?.state).toBe("ok");
  });
});
