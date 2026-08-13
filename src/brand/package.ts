import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkConceptReview } from "./concepts.js";
import { checkImagery, IMAGERY_FILE, readImagery } from "./imagery.js";
import { readVibes, VIBES_FILE } from "./vibes.js";

/** Returns a reason the file is not ready, or null when it is. */
export type Check = (dir: string) => Promise<string | null>;

export type PackageSource = "scaffold" | "input" | "exploration" | "final";

export interface PackageEntry {
  path: string;
  purpose: string;
  source: PackageSource;
  check?: Check;
}

export interface OptionalEntry {
  path: string;
  purpose: string;
  when: string;
}

/** "a", "a and b", "a, b and c" — a bare join reads poorly. */
export function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

const exists: Check = async () => null;

async function nonEmpty(dir: string, path: string, minimum = 80): Promise<string | null> {
  try {
    const text = await readFile(join(dir, path), "utf8");
    return text.trim().length >= minimum ? null : "too thin to apply";
  } catch {
    return "missing";
  }
}

const checkVibes: Check = async (dir) => {
  const status = await readVibes(dir);
  if (!status.exists) return "missing";
  return status.ready ? null : "still the template — add the actual brief";
};

const IMAGE = /\.(avif|gif|heic|jpe?g|png|svg|tiff?|webp)$/i;

async function moodboardImages(path: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) return moodboardImages(child);
      return entry.isFile() && IMAGE.test(entry.name) ? 1 : 0;
    }),
  );
  return nested.reduce((total, count) => total + count, 0);
}

const checkMoodboard: Check = async (dir) => {
  const count = await moodboardImages(join(dir, "moodboard"));
  return count ? null : "add at least one source image";
};

async function readJson(dir: string, rel: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, rel), "utf8"));
}

const isAnnotation = (key: string): boolean => key.startsWith("$") || key.startsWith("_");

function filled(group: unknown): boolean {
  if (typeof group !== "object" || group === null) return false;
  return Object.keys(group as Record<string, unknown>).some((key) => !isAnnotation(key));
}

const checkTokens: Check = async (dir) => {
  let doc: unknown;
  try {
    doc = await readJson(dir, "tokens.json");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return "unreadable or invalid JSON";
  }
  const tokens = doc as Record<string, unknown>;
  const empty = (["color", "font", "space"] as const).filter((group) => !filled(tokens[group]));
  return empty.length ? `no ${list(empty)} values` : null;
};

const VISUAL_MARKERS = ["No visual direction is decided yet", "One display face and one text face"];

const checkVisualSystem: Check = async (dir) => {
  const result = await nonEmpty(dir, "visual-system.md", 180);
  if (result) return result;
  const text = await readFile(join(dir, "visual-system.md"), "utf8");
  const markers = VISUAL_MARKERS.filter((marker) => text.includes(marker));
  return markers.length ? "still contains scaffold guidance" : null;
};

const checkMessaging: Check = async (dir) => {
  let doc: unknown;
  try {
    doc = await readJson(dir, "messaging.json");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return "unreadable or invalid JSON";
  }
  const record = doc as Record<string, unknown>;
  const empty = ["what", "mission", "primaryAudience"].filter(
    (key) => typeof record[key] !== "string" || record[key].trim().length < 5,
  );
  return empty.length ? `no usable ${list(empty)} value${empty.length === 1 ? "" : "s"}` : null;
};

const checkMoodboards: Check = async (dir) => {
  const result = await nonEmpty(dir, "moodboards.md", 160);
  if (result) return result;
  const text = await readFile(join(dir, "moodboards.md"), "utf8");
  if (!/##\s+Source/i.test(text) || !/##\s+What survived/i.test(text)) {
    return "needs Source and What survived sections";
  }
  return null;
};

const checkApplication: Check = async (dir) => {
  const result = await nonEmpty(dir, "application.md", 160);
  if (result) return result;
  const text = await readFile(join(dir, "application.md"), "utf8");
  if (!/##\s+Public web/i.test(text) || !/##\s+Product/i.test(text)) {
    return "needs Public web and Product surfaces sections";
  }
  const imagery = await readImagery(dir);
  if (!imagery) return `${IMAGERY_FILE} is not ready`;
  const unplaced = imagery.assets.filter((asset) => !text.includes(asset.id));
  return unplaced.length ? `does not map ${list(unplaced.map((asset) => asset.id))}` : null;
};

const DECISION_SECTIONS = ["## Settled", "## Rejected", "## Open", "## Completion"];

const checkDecisions: Check = async (dir) => {
  let text: string;
  try {
    text = await readFile(join(dir, "decisions.md"), "utf8");
  } catch {
    return "missing";
  }
  const absent = DECISION_SECTIONS.filter((heading) => !text.includes(heading)).map((heading) => heading.slice(3));
  return absent.length ? `no ${list(absent)} section` : null;
};

/**
 * The final package deliberately includes visual provenance and application,
 * because a selected direction loses meaning when a site consumes only its
 * tokens and copy. These entries are the enforceable handoff from concept
 * review to a real home page or app surface.
 */
export const REQUIRED: PackageEntry[] = [
  { path: "README.md", purpose: "Reading order and the workflow contract", source: "scaffold" },
  { path: VIBES_FILE, purpose: "The free-form discovery brief", source: "input", check: checkVibes },
  { path: "moodboard/", purpose: "Source visual material", source: "input", check: checkMoodboard },
  { path: "research/brand.html", purpose: "Five-concept comparison surface", source: "exploration", check: checkConceptReview },
  { path: "strategy.md", purpose: "Positioning, mission, audience, and boundaries", source: "final", check: (dir) => nonEmpty(dir, "strategy.md", 180) },
  { path: "voice.md", purpose: "Voice, vocabulary, and patterns", source: "final", check: (dir) => nonEmpty(dir, "voice.md", 150) },
  { path: "messaging.json", purpose: "Structured messaging imported by product surfaces", source: "final", check: checkMessaging },
  { path: "tokens.json", purpose: "Colour, typography, spacing, and radius primitives", source: "final", check: checkTokens },
  { path: "visual-system.md", purpose: "Visual principles, layout, type, and imagery rules", source: "final", check: checkVisualSystem },
  { path: "moodboards.md", purpose: "Selected moodboards and what survived", source: "final", check: checkMoodboards },
  { path: IMAGERY_FILE, purpose: "Approved visual assets and intended placements", source: "final", check: checkImagery },
  { path: "application.md", purpose: "Asset-to-surface plan for public web and product", source: "final", check: checkApplication },
  { path: "assets/logo.svg", purpose: "Primary logo as a small vector asset", source: "final", check: exists },
  { path: "decisions.md", purpose: "Settled, rejected, open, and completion evidence", source: "final", check: checkDecisions },
];

export const OPTIONAL: OptionalEntry[] = [
  { path: "assets/logo-reverse.svg", purpose: "Mark for dark or photographic backgrounds", when: "the logo first sits on a non-paper surface" },
  { path: "assets/icon.png", purpose: "App icon and favicon source", when: "an app or distinct favicon ships" },
  { path: "assets/og-image.png", purpose: "Social preview card", when: "pages start being shared publicly" },
  { path: "components.md", purpose: "Recurring UI patterns and rules", when: "the same pattern gets rebuilt a third time" },
  { path: "motion.md", purpose: "Duration, easing, and animation rules", when: "motion is no longer an isolated decision" },
  { path: "accessibility.md", purpose: "Verified contrast pairs and minimum sizes", when: "a contrast decision needs to be reused" },
  { path: "naming.md", purpose: "Product and feature naming rules", when: "there is more than one thing to name" },
  { path: "email.md", purpose: "Transactional and lifecycle mail voice", when: "the product starts sending mail" },
];

export type EntryState = "ok" | "missing" | "incomplete";

export interface EntryStatus {
  path: string;
  purpose: string;
  source: PackageSource;
  state: EntryState;
  detail?: string;
}

export interface PackageStatus {
  required: EntryStatus[];
  optional: Array<OptionalEntry & { present: boolean }>;
  complete: boolean;
}

async function present(dir: string, rel: string): Promise<boolean> {
  try {
    if (rel.endsWith("/")) {
      await readdir(join(dir, rel));
    } else {
      await readFile(join(dir, rel));
    }
    return true;
  } catch {
    return false;
  }
}

export async function packageStatus(brandDir: string): Promise<PackageStatus> {
  const required: EntryStatus[] = [];
  for (const entry of REQUIRED) {
    const base = { path: entry.path, purpose: entry.purpose, source: entry.source };
    if (!(await present(brandDir, entry.path))) {
      required.push({ ...base, state: "missing" });
      continue;
    }
    const detail = entry.check ? await entry.check(brandDir) : null;
    required.push(detail ? { ...base, state: "incomplete", detail } : { ...base, state: "ok" });
  }
  const optional = await Promise.all(OPTIONAL.map(async (entry) => ({ ...entry, present: await present(brandDir, entry.path) })));
  return { required, optional, complete: required.every((entry) => entry.state === "ok") };
}

export function formatStatus(status: PackageStatus, name: string): string {
  const marks: Record<EntryState, string> = { ok: "\x1b[32m✓\x1b[0m", missing: "\x1b[31m✗\x1b[0m", incomplete: "\x1b[33m~\x1b[0m" };
  const lines = [`\n\x1b[1m${name} — brand workflow\x1b[0m`];
  for (const source of ["scaffold", "input", "exploration", "final"] as const) {
    const entries = status.required.filter((entry) => entry.source === source);
    if (!entries.length) continue;
    const heading =
      source === "scaffold"
        ? "Workflow"
        : source === "input"
          ? "Exploration input"
          : source === "exploration"
            ? "Concept review"
            : "Final package";
    lines.push("", `\x1b[1m${heading}\x1b[0m`);
    for (const entry of entries) {
      lines.push(`  ${marks[entry.state]} ${entry.path}${entry.detail ? ` \x1b[2m— ${entry.detail}\x1b[0m` : ""}`);
    }
  }
  const outstanding = status.required.filter((entry) => entry.state !== "ok");
  lines.push("", status.complete ? "\x1b[32mThe brand workflow is complete.\x1b[0m" : `\x1b[33m${outstanding.length} required item(s) outstanding.\x1b[0m`);
  const have = status.optional.filter((entry) => entry.present);
  const missing = status.optional.filter((entry) => !entry.present);
  lines.push("", "\x1b[1mOptional\x1b[0m");
  if (have.length) for (const entry of have) lines.push(`  \x1b[32m✓\x1b[0m ${entry.path}`);
  lines.push(`  \x1b[2m${missing.length} not added yet — each has a trigger in hq/brand/README.md.\x1b[0m`);
  return `${lines.join("\n")}\n`;
}
