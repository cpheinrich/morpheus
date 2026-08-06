import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EXPECTED } from "../doctor/index.js";
import * as t from "./templates.js";
import type { Seed } from "./templates.js";
import { INBOX_DIR, MEETING_NOTES_DIR } from "../paths.js";

/**
 * Scaffold a Morpheus project.
 *
 * **Never overwrites.** Anything already present is skipped and reported,
 * which is what makes this safe to run on an established repository — so
 * "initialise a new project" and "bring an old one up to the standard" are the
 * same command rather than two that drift.
 *
 * Deliberately scoped to the repository. Provisioning GCP, DNS and Vercel is
 * not here: those live in someone else's console, they need credentials this
 * command should not hold, and `morpheus init status` already tracks them.
 * Drawing the seam there means `init` cannot be blocked on a token.
 */

export interface InitResult {
  written: string[];
  skipped: string[];
  /** Directories created that git will not track until something lands in them. */
  notes: string[];
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const KIND_DIRS = EXPECTED;

export async function scaffold(root: string, seed: Seed): Promise<InitResult> {
  const written: string[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];

  const put = async (rel: string, content: string): Promise<void> => {
    const abs = join(root, rel);
    if (await exists(abs)) {
      skipped.push(rel);
      return;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    written.push(rel);
  };

  // --- the manifest and the instructions -----------------------------------
  await put("morpheus.json", t.manifest(seed));
  await put("AGENTS.md", t.agents(seed));

  // A README for humans, and for agents that read one before anything else.
  // Absent until MO-054, which is why cpheinrich.com had none at all — the
  // scaffold decided what a project starts as, and it did not start with one.
  await put("README.md", t.readme(seed));

  // CLAUDE.md is a symlink, not a copy. Two files would drift, and the drift
  // would be invisible until an agent acted on the stale one.
  const claude = join(root, "CLAUDE.md");
  if (await exists(claude)) {
    skipped.push("CLAUDE.md");
  } else {
    await symlink("AGENTS.md", claude);
    written.push("CLAUDE.md -> AGENTS.md");
  }

  // Claude Code's session hook. Informational, not blocking — the refusal
  // lives in the `morpheus` CLI, which every provider goes through and which
  // needs no per-project wiring. Codex reads AGENTS.md instead, which is why
  // the instruction is in both and the enforcement is in neither.
  await put(".claude/settings.json", t.claudeSettings());

  // --- agent memory ---------------------------------------------------------
  await put(".agent/README.md", t.agentReadme());
  await put(".agent/decisions.md", t.decisions(seed));
  await put(".agent/learned.md", t.learned());

  // Git does not track empty directories, so each carries a README explaining
  // itself. Without one the directory silently does not exist on clone — which
  // is exactly how Evo shipped without a worklog.
  await put(".agent/worklog/README.md", t.worklogReadme());
  await put(".agent/inbox-archive/README.md", t.inboxArchiveReadme());

  // --- hq -------------------------------------------------------------------
  const dirs = KIND_DIRS[seed.kind];
  if (dirs.some((d) => d.startsWith("hq/"))) await put("hq/README.md", t.hqReadme(seed));

  for (const kind of ["roadmap", "goals", "requests"] as const) {
    if (!dirs.includes(`hq/product/${kind}`) && kind !== "requests") continue;
    if (kind === "requests" && !dirs.includes("hq/product/roadmap")) continue;
    await put(`hq/product/${kind}/README.md`, t.productReadme(kind, seed));
  }

  if (dirs.includes(INBOX_DIR)) {
    await put(`${INBOX_DIR}/${seed.owner}.md`, t.inbox(seed));

    // Meeting notes get their directory up front rather than on first use.
    // The folder carries a redaction gate — `redacted: true` is a claim, and
    // `team validate` refuses a note without it — and a gate nobody meets
    // until they have hand-created the directory is a gate that gets
    // discovered *after* the first transcript is already committed. Migrated
    // repos ended up with this and scaffolded ones without, which is the wrong
    // way round.
    await put(`${MEETING_NOTES_DIR}/README.md`, t.meetingNotesReadme());
  }

  // Remaining expected directories get a placeholder so they survive a clone.
  for (const dir of dirs) {
    if (dir.startsWith(".agent/") || dir.startsWith("hq/product/") || dir === INBOX_DIR) continue;

    // `hq/brand/README.md` belongs to the brand wizard, which never overwrites
    // an existing file — so a placeholder here would permanently block the
    // real one. A `.gitkeep` holds the directory without claiming the name.
    if (dir === "hq/brand") {
      await put("hq/brand/.gitkeep", "");
      continue;
    }
    // A written README where we have something to say, and nothing at all where
    // we do not. The old placeholder wrote "Nothing here yet." into every
    // directory — a file that looks documented and says less than the folder
    // name already did, and which can then go stale on top of that.
    const readme = `${dir}/README.md`;
    const write = t.dirReadmes[dir];
    if (write && !(await exists(join(root, readme)))) await put(readme, write(seed));
  }

  // Parents of expected directories, and `hq/team`, which the loop skips
  // because the person's inbox file is written there instead. `qa/acceptance`
  // being expected means `qa/` exists, and a directory that exists and feeds a
  // verifier deserves to say so.
  const parents = new Set(dirs.map((d) => d.split("/").slice(0, -1).join("/")).filter(Boolean));
  for (const dir of [...parents, INBOX_DIR]) {
    const write = t.dirReadmes[dir];
    if (!write) continue;
    if (!dirs.some((d) => d === dir || d.startsWith(`${dir}/`))) continue;
    const readme = `${dir}/README.md`;
    if (!(await exists(join(root, readme)))) await put(readme, write(seed));
  }

  // --- ci -------------------------------------------------------------------
  //
  // Only wire the Node job into a project that is one. `node-ci` runs
  // `pnpm install --frozen-lockfile`, so adding it to a static site or a Python
  // repo puts CI in the red on the first push — and a scaffold whose CI fails
  // immediately teaches people to ignore failing CI.
  const isNode =
    (await exists(join(root, "pnpm-lock.yaml"))) ||
    (await exists(join(root, "pnpm-workspace.yaml")));
  await put(".github/workflows/ci.yml", t.ci({ node: isNode }));
  if (!isNode) {
    notes.push(
      "No pnpm lockfile here, so CI wires only the convention checks. Add the\n" +
        "node-ci job to .github/workflows/ci.yml once this is a pnpm project.",
    );
  }

  // --- gitignore ------------------------------------------------------------
  const ignorePath = join(root, ".gitignore");
  const existing = await readFile(ignorePath, "utf8").catch(() => "");
  if (existing.includes("# Morpheus")) {
    skipped.push(".gitignore");
  } else {
    await writeFile(ignorePath, existing.trimEnd() + "\n" + t.gitignore(), "utf8");
    written.push(existing ? ".gitignore (appended)" : ".gitignore");
  }

  // Generate the index tables rather than leaving bare markers. The generator
  // emits a header row even for an empty artifact, so a scaffolded README with
  // only `<!-- morpheus:begin -->` is already stale — and `pm index --check`
  // fails on a project nobody has touched yet. Third version of the same rule:
  // a scaffold whose CI is red on the first push teaches people to ignore CI.
  if (dirs.includes("hq/product/roadmap")) {
    const { parseArtifact } = await import("../pm/parse.js");
    const gen = await import("../pm/index-gen.js");
    const productDir = join(root, "hq/product");
    const renderers = {
      roadmap: gen.renderRoadmap,
      goals: gen.renderGoals,
      requests: gen.renderRequests,
    } as const;

    for (const kind of ["roadmap", "goals", "requests"] as const) {
      // `internal` projects have a roadmap and nothing else.
      if (!(await exists(join(productDir, kind)))) continue;
      const { items } = await parseArtifact(productDir, kind);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rendered = (renderers[kind] as (i: any) => string)(items);
      await gen.writeIndex(join(productDir, kind), rendered);
    }
  }

  if (seed.kind !== "internal") {
    notes.push(
      "hq/brand/ is empty until you run `morpheus brand init` — the wizard owns that directory.",
    );
  }

  return { written, skipped, notes };
}
