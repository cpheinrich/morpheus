import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assess } from "../heartbeat/assess.js";
import { readConfig } from "../heartbeat/config.js";
import { parseInbox } from "../inbox/parse.js";
import { listClaims } from "../pm/claim.js";
import { cleanSlug, isoDateInZone, slugForFilename } from "../pm/id.js";
import { parseArtifact } from "../pm/parse.js";
import { buildBrief, type OpenInboxItem } from "../voice/brief.js";
import { buildKnowledge } from "../voice/knowledge.js";
import { HANDOFF_DIR, readSince } from "../voice/since.js";

/**
 * `morpheus voice` — moving context into a voice conversation and back.
 *
 * A voice session starts cold every time: it cannot read the repo, run the CLI,
 * or see the board. Two commands, matching the two halves of what it needs.
 * `knowledge` is the standing explainer, uploaded once to the claude.ai project.
 * `brief` is today's state, regenerated and pasted each session.
 *
 * The return leg is a skill rather than a command, because ingesting a spec is
 * judgment — checking it against the codebase and finding where it is wrong —
 * and that is not something a deterministic command can do.
 */

/** Where the standing explainer is written. Not a handoff, so not beside them. */
export const KNOWLEDGE_PATH = "local/voice/knowledge.md";

interface Manifest {
  name?: string;
  displayName?: string;
  prefix?: string;
  kind?: string;
  description?: string;
}

async function readManifest(root: string): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

async function write(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

export async function knowledge(root: string, out?: string): Promise<number> {
  const m = await readManifest(root);
  if (!m.prefix) {
    console.error(
      'No "prefix" in morpheus.json. The explainer describes this project\'s id scheme,\n' +
        "so it cannot be written without one.",
    );
    return 1;
  }

  const path = join(root, out ?? KNOWLEDGE_PATH);
  await write(
    path,
    buildKnowledge({
      name: m.displayName ?? m.name ?? "This project",
      prefix: m.prefix,
      ...(m.kind ? { kind: m.kind } : {}),
      ...(m.description ? { description: m.description } : {}),
    }),
  );

  console.log(`Wrote ${path}`);
  console.log(
    "\nUpload it once as project knowledge in a claude.ai project, then start voice\n" +
      "sessions inside that project. Regenerate when a convention changes — it is not\n" +
      "per-session, and re-uploading it every time defeats the split.",
  );
  return 0;
}

/**
 * Every open `❗` item across the project's inboxes.
 *
 * Read from the raw parse rather than `inbox validate`, because a live inbox is
 * routinely invalid mid-cycle — Chris replies inline and consumes a `~` slot —
 * and refusing to brief on a mid-cycle inbox would make this unusable in the
 * exact state it is normally in.
 */
async function openInboxItems(root: string): Promise<OpenInboxItem[]> {
  const dir = join(root, "hq/inbox");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md") && f !== "README.md");
  } catch {
    return [];
  }

  const items: OpenInboxItem[] = [];
  for (const file of files) {
    try {
      const parsed = parseInbox(file, await readFile(join(dir, file), "utf8"));
      for (const item of parsed.items) {
        if (item.state === "open") items.push({ n: item.n, title: item.title });
      }
    } catch {
      // One unreadable inbox must not lose the others.
    }
  }
  return items;
}

export interface BriefOptions {
  root: string;
  productDir: string;
  topic?: string;
  slug?: string;
  notes?: string;
  /** Inline the standing explainer, for a chat with no project knowledge. */
  full?: boolean;
}

export async function brief(opts: BriefOptions): Promise<number> {
  const { root, productDir } = opts;
  const m = await readManifest(root);
  const name = m.displayName ?? m.name ?? "This project";

  const config = await readConfig(root);
  const [{ items }, { items: goals }] = await Promise.all([
    parseArtifact(productDir, "roadmap"),
    parseArtifact(productDir, "goals"),
  ]);

  // Unlike the heartbeat, an unreachable origin is not fatal here: this brief
  // starts a conversation rather than dispatching work, and the cost of an
  // understated in-flight list is that Chris mentions it himself.
  const claims = await listClaims(root).catch(() => []);

  const now = new Date();
  // The same fixed zone the ids use. `toISOString()` would give UTC, which
  // after 5pm Pacific is already tomorrow — dating a handoff a day ahead of the
  // item created alongside it.
  const today = isoDateInZone(now);

  const body = buildBrief({
    name,
    ...(opts.topic ? { topic: opts.topic } : {}),
    beat: assess({ items, goals, claims, config, now }),
    openInbox: await openInboxItems(root),
    since: await readSince(root),
    ...(opts.notes ? { notes: opts.notes } : {}),
    today,
    ...(opts.full ? { selfContained: true } : {}),
  });

  const contents =
    opts.full && m.prefix
      ? `${buildKnowledge({
          name,
          prefix: m.prefix,
          ...(m.kind ? { kind: m.kind } : {}),
          ...(m.description ? { description: m.description } : {}),
        })}\n\n---\n\n${body}`
      : body;

  const slug = opts.slug
    ? cleanSlug(opts.slug)
    : opts.topic
      ? slugForFilename(opts.topic)
      : "voice-session";
  const path = join(root, HANDOFF_DIR, `${today}-${slug || "voice-session"}.md`);

  await write(path, contents);
  console.log(`Wrote ${path}`);
  console.log(`\nCopy it in:  pbcopy < ${path}`);
  return 0;
}
