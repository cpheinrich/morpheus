import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * What a brand package must contain, and what it may grow.
 *
 * Declared once, in one place, because three consumers need the same list:
 * the design-session prompt tells an agent what to produce, `brand status`
 * reports what is missing, and the package README explains the contract to a
 * human. Written separately they would drift, and the drift would be silent —
 * a prompt asking for something nothing checks is indistinguishable from a
 * prompt asking for the right thing.
 *
 * **Required is deliberately small.** A required list long enough to be
 * thorough is a required list nobody completes, and a checklist that is never
 * green stops being read. Everything else is optional with a stated trigger,
 * so "not yet" is a legible state rather than an omission.
 */

/** Returns a reason the file is not yet finished, or null when it is. */
export type Check = (dir: string) => Promise<string | null>;

export interface PackageEntry {
  path: string;
  /** What it is for — rendered into the prompt and the README. */
  purpose: string;
  /**
   * Who is expected to produce it. The wizard's own outputs are required too,
   * but they are already satisfied by the time anyone reads this, so the
   * prompt only asks for the session's share.
   */
  source: "wizard" | "session";
  check?: Check;
}

export interface OptionalEntry {
  path: string;
  purpose: string;
  /** The circumstance that makes this worth adding. */
  when: string;
}

async function readJson(dir: string, rel: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, rel), "utf8"));
}

/** Keys that carry no value — the scaffold's own annotations. */
const isAnnotation = (k: string): boolean => k.startsWith("$") || k.startsWith("_");

function filled(group: unknown): boolean {
  if (typeof group !== "object" || group === null) return false;
  return Object.keys(group as Record<string, unknown>).some((k) => !isAnnotation(k));
}

/**
 * Existence is not completeness for `tokens.json`. The wizard writes an empty
 * scaffold, and an empty scaffold beside a real design is the failure this
 * whole check exists to catch — it looks finished in a file listing.
 */
const checkTokens: Check = async (dir) => {
  let doc: unknown;
  try {
    doc = await readJson(dir, "tokens.json");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return `unreadable — ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
  }

  const t = doc as Record<string, unknown>;
  const empty = (["color", "font", "space"] as const).filter((g) => !filled(t[g]));
  if (empty.length) {
    return `still the empty scaffold — no ${list(empty)} values`;
  }
  return null;
};

/**
 * Sentences the generator writes as placeholders. If one survives, that
 * section was never written — and naming which one is more useful than
 * saying the file is too short.
 */
const SCAFFOLD_MARKERS: Array<[marker: string, section: string]> = [
  ["No visual direction is decided yet", "source of truth"],
  ["One display face and one text face unless there is a reason", "typography"],
  ["Semantic names (`action.primary`) map to primitives", "colour"],
];

const checkVisualSystem: Check = async (dir) => {
  let text: string;
  try {
    text = await readFile(join(dir, "visual-system.md"), "utf8");
  } catch {
    return "missing";
  }
  const left = SCAFFOLD_MARKERS.filter(([m]) => text.includes(m)).map(([, s]) => s);
  if (left.length) return `${list(left)} still scaffold text`;
  return null;
};

/** "a", "a and b", "a, b and c" — a bare join reads as "a and b and c". */
function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

const exists: Check = async () => null; // presence is checked by the caller

/**
 * The minimum for a package someone else can apply without having been in the
 * room. Anything here that is missing means a person has to ask a question
 * that the package was supposed to answer.
 */
export const REQUIRED: PackageEntry[] = [
  {
    path: "README.md",
    purpose: "Reading order and the implementation contract",
    source: "wizard",
  },
  {
    path: "strategy.md",
    purpose: "What this is, who it serves, and what it must never become",
    source: "wizard",
  },
  {
    path: "voice.md",
    purpose: "How it writes",
    source: "wizard",
  },
  {
    path: "messaging.json",
    purpose: "Mission and positioning as data, imported by the app so copy cannot drift",
    source: "wizard",
  },
  {
    path: "tokens.json",
    purpose:
      "Every colour, type, spacing and radius value as DTCG primitives — the only place a raw value belongs",
    source: "session",
    check: checkTokens,
  },
  {
    path: "visual-system.md",
    purpose:
      "Colour, typography, layout and logo usage in prose, written so someone can apply it without having been in the session",
    source: "session",
    check: checkVisualSystem,
  },
  {
    path: "assets/logo.svg",
    purpose: "The primary mark, as vector",
    source: "session",
    check: exists,
  },
];

/**
 * Added when the need arrives, not up front. Each carries the trigger, so the
 * list reads as a set of decisions deferred rather than work outstanding.
 */
export const OPTIONAL: OptionalEntry[] = [
  {
    path: "assets/logo-reverse.svg",
    purpose: "The mark for dark or photographic backgrounds",
    when: "the logo first has to sit on something other than the page background",
  },
  {
    path: "assets/icon.png",
    purpose: "App icon and favicon source",
    when: "there is an app, or the site wants a favicon that is not the logo squashed",
  },
  {
    path: "assets/og-image.png",
    purpose: "Social preview card",
    when: "pages start being shared publicly",
  },
  {
    path: "components.md",
    purpose: "Recurring UI patterns and their rules",
    when: "the same pattern gets rebuilt a third time",
  },
  {
    path: "motion.md",
    purpose: "Duration, easing, and what may animate",
    when: "transitions start being invented per screen",
  },
  {
    path: "imagery.md",
    purpose: "Photography and illustration direction",
    when: "marketing needs pictures and they start looking like different companies",
  },
  {
    path: "accessibility.md",
    purpose: "Verified contrast pairs and the minimum sizes",
    when: "someone re-derives a contrast ratio that was already checked once",
  },
  {
    path: "naming.md",
    purpose: "How products and features get named",
    when: "there is more than one thing to name",
  },
  {
    path: "email.md",
    purpose: "Templates and tone for transactional and lifecycle mail",
    when: "the product starts sending mail",
  },
];

export type EntryState = "ok" | "missing" | "incomplete";

export interface EntryStatus {
  path: string;
  purpose: string;
  source: PackageEntry["source"];
  state: EntryState;
  /** Why it is not ok — absent when it is. */
  detail?: string;
}

export interface PackageStatus {
  required: EntryStatus[];
  optional: Array<OptionalEntry & { present: boolean }>;
  /** True when every required entry is satisfied. */
  complete: boolean;
}

async function present(dir: string, rel: string): Promise<boolean> {
  try {
    await readFile(join(dir, rel));
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
    required.push(
      detail ? { ...base, state: "incomplete", detail } : { ...base, state: "ok" },
    );
  }

  const optional = await Promise.all(
    OPTIONAL.map(async (o) => ({ ...o, present: await present(brandDir, o.path) })),
  );

  return { required, optional, complete: required.every((r) => r.state === "ok") };
}

export function formatStatus(s: PackageStatus, name: string): string {
  const mark = (state: EntryState): string =>
    state === "ok" ? "\x1b[32m✓\x1b[0m" : state === "missing" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m~\x1b[0m";

  const lines = [`\n\x1b[1m${name} — brand package\x1b[0m`, "", "\x1b[1mRequired\x1b[0m"];
  for (const r of s.required) {
    const why = r.detail ? ` \x1b[2m— ${r.detail}\x1b[0m` : "";
    lines.push(`  ${mark(r.state)} ${r.path}${why}`);
  }

  const outstanding = s.required.filter((r) => r.state !== "ok");
  lines.push("");
  if (s.complete) {
    lines.push("\x1b[32mThe required set is complete.\x1b[0m");
  } else {
    const session = outstanding.filter((r) => r.source === "session").length;
    lines.push(
      `\x1b[33m${outstanding.length} outstanding.\x1b[0m` +
        (session
          ? " \x1b[2mThese come from a design session — see explore-prompt.md.\x1b[0m"
          : ""),
    );
  }

  const have = s.optional.filter((o) => o.present);
  const not = s.optional.filter((o) => !o.present);
  lines.push("", "\x1b[1mOptional\x1b[0m");
  if (have.length) for (const o of have) lines.push(`  \x1b[32m✓\x1b[0m ${o.path}`);
  lines.push(
    `  \x1b[2m${not.length} not added yet — each has a trigger, and none is overdue\n` +
      "  until its trigger arrives. See hq/brand/README.md.\x1b[0m",
  );

  return lines.join("\n") + "\n";
}
