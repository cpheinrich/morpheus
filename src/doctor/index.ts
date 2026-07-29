import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseArtifact } from "../pm/parse.js";
import { parseInboxFile } from "../inbox/parse.js";
import { readRegistry } from "../registry/index.js";

/**
 * Report drift without fixing it.
 *
 * Deliberately the cheap half of `upgrade`: saying what is missing needs no
 * templating, no merge strategy, and no knowledge of how to fix anything — so
 * it stays useful while conventions are still moving, which is exactly when an
 * `upgrade` command would be a liability.
 *
 * **Never writes.** Anything it cannot fix, it names.
 */

export const Kind = z.enum(["company", "personal", "internal"]);
export type Kind = z.infer<typeof Kind>;

export const Manifest = z.object({
  name: z.string(),
  prefix: z.string().regex(/^[A-Z]{2,4}$/).optional(),
  kind: Kind.optional(),
  /**
   * Subtrees owned by a parent project rather than this one, e.g.
   * `{ "finance": "darwin" }`. Their directories are correctly absent, so
   * expecting them would report drift on a project that is right.
   */
  inherits: z.record(z.string(), z.string()).optional(),
});

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  check: string;
  message: string;
}

/** Directories each kind is expected to have. */
export const EXPECTED: Record<Kind, string[]> = {
  company: [
    "hq/product/roadmap",
    "hq/product/goals",
    "hq/inbox",
    "hq/brand",
    "hq/marketing",
    "hq/finance",
    "hq/ops",
    ".agent/worklog",
    ".agent/inbox-archive",
  ],
  personal: [
    "hq/product/roadmap",
    "hq/product/goals",
    "hq/inbox",
    "hq/brand",
    ".agent/worklog",
    ".agent/inbox-archive",
  ],
  internal: ["hq/product/roadmap", ".agent/worklog"],
};

/** Files every project should carry regardless of kind. */
const EXPECTED_FILES = [
  "morpheus.json",
  "AGENTS.md",
  ".agent/decisions.md",
  ".agent/learned.md",
];

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface DoctorOptions {
  root: string;
  /** Skip checks that need the network. */
  offline?: boolean;
}

export async function doctor(opts: DoctorOptions): Promise<Finding[]> {
  const { root } = opts;
  const findings: Finding[] = [];
  const add = (severity: Severity, check: string, message: string) =>
    findings.push({ severity, check, message });

  // --- manifest -----------------------------------------------------------
  let manifest: z.infer<typeof Manifest> | null = null;
  try {
    manifest = Manifest.parse(JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")));
  } catch (err) {
    add(
      "error",
      "manifest",
      `morpheus.json missing or invalid — ${err instanceof Error ? err.message.split("\n")[0] : err}`,
    );
    return findings; // Everything else keys off the manifest.
  }

  if (!manifest.prefix) {
    add(
      "error",
      "prefix",
      'No "prefix" — ids would collide with other projects. Add 2-4 uppercase letters.',
    );
  }

  const kind = manifest.kind;
  if (!kind) {
    add("warning", "kind", 'No "kind" — defaulting expectations to personal.');
  }

  // --- structure ----------------------------------------------------------
  const inherited = new Set(
    Object.keys(manifest.inherits ?? {}).map((k) => `hq/${k}`),
  );

  for (const dir of EXPECTED[kind ?? "personal"]) {
    if (inherited.has(dir)) continue; // owned by a parent project
    if (!(await exists(join(root, dir)))) {
      add("error", "structure", `Missing ${dir}/ — expected for kind "${kind ?? "personal"}".`);
    }
  }
  for (const file of EXPECTED_FILES) {
    if (!(await exists(join(root, file)))) {
      add("warning", "structure", `Missing ${file}.`);
    }
  }

  // --- registry -----------------------------------------------------------
  const reg = await readRegistry();
  const entry = reg.projects.find((p) => p.path === root);
  if (!entry) {
    add("warning", "registry", "Not registered on this machine — run `morpheus registry add`.");
  } else if (manifest.prefix && entry.prefix !== manifest.prefix) {
    add(
      "error",
      "registry",
      `Registry says prefix ${entry.prefix} but morpheus.json says ${manifest.prefix}. The manifest wins.`,
    );
  }

  // --- content ------------------------------------------------------------
  const productDir = join(root, "hq/product");
  if (await exists(productDir)) {
    for (const artifact of ["roadmap", "goals", "requests"] as const) {
      const { items, issues } = await parseArtifact(productDir, artifact);
      for (const i of issues) add("error", `pm:${artifact}`, i.message);

      if (manifest.prefix) {
        for (const item of items) {
          const id = (item.data as { id: string }).id;
          if (!id.startsWith(`${manifest.prefix}-`)) {
            add("error", `pm:${artifact}`, `${id} does not use this project's prefix.`);
          }
        }
      }
    }
  }

  const inboxDir = join(root, "hq/inbox");
  if (await exists(inboxDir)) {
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(inboxDir)).filter(
      (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
    );
    if (files.length === 0) {
      add("warning", "inbox", "hq/inbox/ has no inbox files — nobody would receive status.");
    }
    for (const f of files) {
      const { issues } = await parseInboxFile(join(inboxDir, f));
      for (const i of issues) add("error", "inbox", `${f}: ${i.message}`);
    }
  }

  return findings;
}

export function formatFindings(findings: Finding[], label?: string): string {
  const head = label ? `${label}\n` : "";
  if (findings.length === 0) return `${head}✓ No drift.`;

  const lines = findings.map(
    (f) => `${f.severity === "error" ? "✗" : "!"} [${f.check}] ${f.message}`,
  );
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return `${head}${lines.join("\n")}\n  ${errors} error(s), ${warnings} warning(s)`;
}
