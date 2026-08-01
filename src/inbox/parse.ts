import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import type { ParseIssue } from "../pm/parse.js";
import { Inbox, InboxItem, MARK_STATE } from "./schema.js";

/**
 * Parse and check an inbox document.
 *
 * The invariant this exists to enforce: **every item is either open or done,
 * never both and never neither.** An open item must end in an empty reply slot,
 * because an answer with nowhere to reply is a dead end — a mistake made by
 * hand once already.
 */

export interface ParsedInbox {
  meta: Inbox;
  items: InboxItem[];
  /** Prose between the title and the first item. */
  summary: string;
  issues: ParseIssue[];
}

/** `## ❗ 4. gcloud auth login · `claude` · RM-004` */
const HEADING =
  /^##\s+(❗|✅)\s*(\d+)\.\s+(.+?)\s*$/;

function parseHeading(line: string): {
  mark: string;
  n: number;
  rest: string;
} | null {
  const m = HEADING.exec(line);
  if (!m) return null;
  return { mark: m[1]!, n: Number(m[2]), rest: m[3]! };
}

/** Pull `` `claude` `` and an optional RM link out of the heading tail. */
function splitTail(rest: string): {
  title: string;
  agent?: string;
  roadmap?: string;
} {
  const parts = rest.split("·").map((p) => p.trim());
  const title = parts[0] ?? rest;
  let agent: string | undefined;
  let roadmap: string | undefined;

  for (const p of parts.slice(1)) {
    const a = /^`(claude|codex|human)`$/.exec(p);
    if (a) agent = a[1];
    // Any project prefix, not just `RM-`. Ids were namespaced per project in
    // MO-002 and this pattern was never updated, so it had matched nothing for
    // as long as the current ids have existed — every roadmap link in every
    // inbox heading was silently dropped. Kept permissive enough to still read
    // the legacy `RM-` ids sitting in the archive.
    const r = /\b([A-Z]{2,4}-\d{3,})\b/.exec(p);
    if (r) roadmap = r[1];
  }
  return { title, ...(agent ? { agent } : {}), ...(roadmap ? { roadmap } : {}) };
}

export function parseInbox(path: string, raw: string): ParsedInbox {
  const issues: ParseIssue[] = [];

  let data: unknown;
  let content: string;
  try {
    const f = matter(raw);
    data = f.data;
    content = f.content;
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return {
      meta: {} as Inbox,
      items: [],
      summary: "",
      issues: [{ path, message: `invalid YAML frontmatter — ${detail}` }],
    };
  }

  const metaResult = Inbox.safeParse(data);
  if (!metaResult.success) {
    for (const i of metaResult.error.issues) {
      issues.push({ path, message: `frontmatter ${i.path.join(".") || "(root)"}: ${i.message}` });
    }
  }

  const lines = content.split("\n");
  const items: InboxItem[] = [];
  const summaryLines: string[] = [];

  let current: { n: number; state: string; title: string; agent?: string; roadmap?: string } | null =
    null;
  let bodyLines: string[] = [];
  let seenFirstItem = false;

  const flush = () => {
    if (!current) return;
    const hasReplySlot = bodyLines.some((l) => l.trim() === "~");
    const parsed = InboxItem.safeParse({
      n: current.n,
      state: MARK_STATE[current.state],
      title: current.title,
      agent: current.agent ?? "claude",
      ...(current.roadmap ? { roadmap: current.roadmap } : {}),
      hasReplySlot,
    });

    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        issues.push({ path, message: `item ${current!.n}: ${i.path.join(".")}: ${i.message}` });
      }
    } else {
      items.push(parsed.data);
      // The invariant: open needs a slot, done must not have a dangling one.
      if (parsed.data.state === "open" && !hasReplySlot) {
        issues.push({
          path,
          message: `item ${parsed.data.n} "${parsed.data.title}" is open (❗) but has no empty \`~\` reply slot`,
        });
      }
      if (parsed.data.state === "done" && hasReplySlot) {
        issues.push({
          path,
          message: `item ${parsed.data.n} "${parsed.data.title}" is done (✅) but still offers a reply slot`,
        });
      }
    }
    bodyLines = [];
  };

  for (const line of lines) {
    const h = parseHeading(line);
    if (h) {
      flush();
      seenFirstItem = true;
      current = { n: h.n, state: h.mark, ...splitTail(h.rest) };
      continue;
    }
    if (current) bodyLines.push(line);
    else if (!seenFirstItem) summaryLines.push(line);
  }
  flush();

  // Numbering should be dense and ascending, so "item 6" means the same to both of us.
  items.forEach((item, idx) => {
    if (item.n !== idx + 1) {
      issues.push({
        path,
        message: `item numbering is not sequential — expected ${idx + 1}, found ${item.n}`,
      });
    }
  });

  const summary = summaryLines.join("\n").trim();
  if (seenFirstItem && summary.length === 0) {
    issues.push({
      path,
      message: "no summary before the first item — an inbox leads with what got done",
    });
  }

  return {
    meta: metaResult.success ? metaResult.data : ({} as Inbox),
    items,
    summary,
    issues,
  };
}

export async function parseInboxFile(path: string): Promise<ParsedInbox> {
  return parseInbox(path, await readFile(path, "utf8"));
}
