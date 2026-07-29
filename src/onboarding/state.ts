import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { groupsFor, type Kind, type Task } from "./tasks.js";

/**
 * The checklist as a file you can edit and be interrupted in the middle of.
 *
 * The pet peeve this exists to fix: a setup wizard is a transaction, so being
 * interrupted at step nine puts you back at step one. Here the state is a
 * markdown file, so closing the terminal costs nothing and the order is yours.
 *
 * Detected tasks are rewritten from reality on every run and their checkboxes
 * are not yours to set — ticking one by hand is undone next time, which is the
 * intended behaviour: the file must not be able to claim something Morpheus can
 * see is untrue. Manual tasks keep whatever you wrote, including notes.
 */

export const ONBOARDING_FILE = "hq/onboarding.md";

export type TaskState = "done" | "in-progress" | "todo" | "unknown";

export interface TaskStatus {
  task: Task;
  state: TaskState;
  /** Set by detection rather than by hand. */
  detected: boolean;
  /** Anything the owner wrote under the task. */
  note?: string;
}

const ANCHOR = (id: string): string => `<!-- morpheus:task ${id} -->`;
const ANCHOR_RE = /^<!--\s*morpheus:task\s+(\S+)\s*-->$/;
const BOX_RE = /^\s*-\s*\[([ xX~])\]/;

/**
 * Where the owner's writing starts.
 *
 * Without an explicit marker the parser cannot tell a note from the generated
 * "why" and "how" lines, and the first version duly read the description back
 * as if the owner had typed it. Invisible when the markdown renders.
 */
const NOTE_MARK = "<!-- morpheus:notes -->";

export interface Recorded {
  state: TaskState;
  note?: string;
}

/** Read the manual half: whatever the owner set by hand. */
export function parseOnboarding(text: string): Map<string, Recorded> {
  const found = new Map<string, Recorded>();
  let id: string | null = null;
  let box: TaskState | null = null;
  let note: string[] = [];
  let inNote = false;

  const flush = (): void => {
    if (id && box) {
      const body = note.join("\n").trim();
      found.set(id, body ? { state: box, note: body } : { state: box });
    }
    id = null;
    box = null;
    note = [];
    inNote = false;
  };

  for (const line of text.split("\n")) {
    const anchor = ANCHOR_RE.exec(line.trim());
    if (anchor) {
      flush();
      id = anchor[1]!;
      continue;
    }
    if (!id) continue;

    const checkbox = BOX_RE.exec(line);
    if (checkbox && !box) {
      const mark = checkbox[1]!;
      box = mark === " " ? "todo" : mark === "~" ? "in-progress" : "done";
      continue;
    }
    if (line.trim() === NOTE_MARK) {
      inNote = true;
      continue;
    }
    if (inNote && box && line.trim() && !line.startsWith("#")) {
      note.push(line.replace(/^\s{2,}/, "").trimEnd());
    }
  }
  flush();
  return found;
}

const MARK: Record<TaskState, string> = {
  done: "x",
  "in-progress": "~",
  todo: " ",
  unknown: " ",
};

function renderTask(s: TaskStatus): string {
  const lines = [ANCHOR(s.task.id)];
  const suffix = s.task.optional ? " *(optional)*" : "";
  const tag = s.detected
    ? s.state === "unknown"
      ? " — `could not check`"
      : " — `detected`"
    : "";
  lines.push(`- [${MARK[s.state]}] **${s.task.title}**${suffix}${tag}`);
  lines.push(`  ${s.task.why}`);
  lines.push(`  <br>*How:* ${s.task.how}`);
  // Always emitted, so there is an obvious place to write and the parser has
  // an unambiguous boundary. Invisible when rendered.
  lines.push(`  ${NOTE_MARK}`);
  if (s.note) lines.push(...s.note.split("\n").map((l) => `  ${l}`));
  return lines.join("\n");
}

export function renderOnboarding(name: string, statuses: TaskStatus[], kind: Kind): string {
  const required = statuses.filter((s) => !s.task.optional);
  const doneCount = required.filter((s) => s.state === "done").length;

  const head = `# ${name} — setup

**${doneCount} of ${required.length} required steps done.** Regenerate with \`morpheus init status\`.

Nothing here is sequential and nothing is lost if you stop halfway — that is the whole point. Do
them in any order, over as many days as it takes.

Steps marked \`detected\` are checked by reading the repository, so their boxes are rewritten every
run; ticking one by hand will be undone. Everything else is yours: set \`[x]\` when done or \`[~]\`
while in progress, and write notes underneath — an account id, who to ask, why it is blocked. Notes
are preserved.

Keep the \`<!-- morpheus:task ... -->\` comments; they are how the file is read, and they are
invisible when the markdown is rendered.

`;

  const sections = groupsFor(kind).map((g) => {
    const inGroup = statuses.filter((s) => s.task.group === g);
    if (!inGroup.length) return "";
    return `\n## ${g}\n\n${inGroup.map(renderTask).join("\n\n")}\n`;
  }).join("");

  return head + sections;
}

export async function readOnboarding(root: string): Promise<Map<string, Recorded>> {
  try {
    return parseOnboarding(await readFile(join(root, ONBOARDING_FILE), "utf8"));
  } catch {
    return new Map();
  }
}

export async function writeOnboarding(
  root: string,
  name: string,
  statuses: TaskStatus[],
  kind: Kind,
): Promise<string> {
  const path = join(root, ONBOARDING_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderOnboarding(name, statuses, kind), "utf8");
  return path;
}

/** Set a manual task's state, leaving detected ones alone. */
export function setState(
  statuses: TaskStatus[],
  id: string,
  state: TaskState,
): { ok: boolean; reason?: string } {
  const s = statuses.find((x) => x.task.id === id);
  if (!s) return { ok: false, reason: `No task "${id}". Run \`morpheus init status\` to list them.` };
  if (s.detected) {
    return {
      ok: false,
      reason: `"${id}" is detected from the repository, so marking it by hand would not survive. ${s.task.how}`,
    };
  }
  s.state = state;
  return { ok: true };
}

