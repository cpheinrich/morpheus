import { projectKind, tasksFor } from "./tasks.js";
import { readOnboarding, type TaskState, type TaskStatus } from "./state.js";

/**
 * Combine what can be seen with what was recorded.
 *
 * Detection wins wherever it has an answer. Where it does not — no `gh`, no
 * network, a task that lives entirely in someone else's console — the recorded
 * state stands.
 *
 * The one case worth being careful about is detection returning `null`. That
 * means *could not check*, and it must not collapse into "not done": a missing
 * tool would then render as an incomplete setup, which sends people to fix
 * something that was never broken.
 */

export interface StatusOptions {
  /** Skip detectors that need the network. */
  offline?: boolean;
}

export async function collectStatus(
  root: string,
  opts: StatusOptions = {},
): Promise<TaskStatus[]> {
  const recorded = await readOnboarding(root);
  const kind = await projectKind(root);

  return Promise.all(
    tasksFor(kind).map(async (task): Promise<TaskStatus> => {
      const saved = recorded.get(task.id);
      const fallback: TaskState = saved?.state ?? "todo";

      if (!task.detect || (task.network && opts.offline)) {
        return { task, state: fallback, detected: false, note: saved?.note };
      }

      let result: boolean | null;
      try {
        result = await task.detect(root);
      } catch {
        // A detector that throws is a detector that does not know.
        result = null;
      }

      if (result === null) {
        // Could not check. Keep whatever was recorded rather than inventing a
        // verdict, and say so.
        return {
          task,
          state: saved?.state ?? "unknown",
          detected: true,
          note: saved?.note,
        };
      }
      return { task, state: result ? "done" : "todo", detected: true, note: saved?.note };
    }),
  );
}

export interface Summary {
  requiredTotal: number;
  requiredDone: number;
  optionalDone: number;
  optionalTotal: number;
  unknown: number;
  complete: boolean;
}

export function summarise(statuses: TaskStatus[]): Summary {
  const required = statuses.filter((s) => !s.task.optional);
  const optional = statuses.filter((s) => s.task.optional);
  const requiredDone = required.filter((s) => s.state === "done").length;

  return {
    requiredTotal: required.length,
    requiredDone,
    optionalTotal: optional.length,
    optionalDone: optional.filter((s) => s.state === "done").length,
    unknown: statuses.filter((s) => s.state === "unknown").length,
    complete: requiredDone === required.length,
  };
}

const GLYPH: Record<TaskState, string> = {
  done: "\x1b[32m✓\x1b[0m",
  "in-progress": "\x1b[33m~\x1b[0m",
  todo: "\x1b[2m·\x1b[0m",
  unknown: "\x1b[36m?\x1b[0m",
};

export function formatStatus(statuses: TaskStatus[], name: string, path: string): string {
  const s = summarise(statuses);
  const lines = [`\n\x1b[1m${name} — setup\x1b[0m`];

  const bar = (done: number, total: number): string => {
    const filled = total === 0 ? 0 : Math.round((done / total) * 24);
    return `\x1b[32m${"█".repeat(filled)}\x1b[0m\x1b[2m${"░".repeat(24 - filled)}\x1b[0m`;
  };
  lines.push(
    `${bar(s.requiredDone, s.requiredTotal)}  ${s.requiredDone}/${s.requiredTotal} required`,
    "",
  );

  let group = "";
  for (const t of statuses) {
    if (t.task.group !== group) {
      group = t.task.group;
      lines.push(`\x1b[1m${group}\x1b[0m`);
    }
    const optional = t.task.optional ? " \x1b[2m(optional)\x1b[0m" : "";
    const dim = t.state === "done" ? "\x1b[2m" : "";
    lines.push(`  ${GLYPH[t.state]} ${dim}${t.task.title}\x1b[0m${optional}`);
    if (t.state === "unknown") {
      lines.push(`      \x1b[2mcould not check — ${t.task.how}\x1b[0m`);
    }
  }

  lines.push("");
  if (s.complete) {
    lines.push(`\x1b[32mEvery required step is done.\x1b[0m`);
  } else {
    const next = statuses.filter((t) => !t.task.optional && t.state !== "done").slice(0, 3);
    lines.push("\x1b[1mNot done yet\x1b[0m");
    for (const t of next) lines.push(`  ${t.task.title}\n      \x1b[2m${t.task.how}\x1b[0m`);
  }
  if (s.unknown) {
    lines.push(
      `\n\x1b[2m${s.unknown} step(s) could not be checked — usually a missing tool or no\n` +
        "network, not a missing step. Their recorded state was kept.\x1b[0m",
    );
  }
  lines.push(
    `\n\x1b[2mFull list, with notes and manual checkboxes: \x1b[0m${path}\n` +
      "\x1b[2mMark one done with \x1b[0mmorpheus init done <id>\x1b[2m, or edit the file.\x1b[0m",
  );

  return lines.join("\n") + "\n";
}
