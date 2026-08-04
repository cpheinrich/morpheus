import type { Beat } from "./assess.js";

/**
 * Rendering a beat.
 *
 * Two surfaces, one shape. The terminal version is what a human runs by hand;
 * the markdown version becomes the Actions job summary, which is where a
 * scheduled beat is read from. The beat writes nothing to the repo — a
 * scheduled job that commits would have to push to protected `main`, which
 * agents may not do — so the summary is the durable record.
 */

function bullet(label: string, rows: string[]): string[] {
  if (rows.length === 0) return [];
  return [`${label}`, ...rows.map((r) => `  ${r}`), ""];
}

export function formatBeat(beat: Beat): string {
  const lines: string[] = [];

  lines.push(
    `Heartbeat — ${beat.inFlight.length}/${beat.ceiling} in flight, ${beat.blocked.length} blocked`,
    "",
  );

  if (beat.pick) {
    lines.push(`\x1b[32mPick: ${beat.pick.id}\x1b[0m — ${beat.pick.title}`);
  } else {
    lines.push("\x1b[2mPick: nothing\x1b[0m");
  }
  lines.push(beat.reason, "");

  lines.push(
    ...bullet(
      "In flight:",
      beat.inFlight.map((c) => `${c.id.padEnd(8)} ${c.branch}`),
    ),
  );

  lines.push(
    ...bullet(
      "Blocked — waiting on a person, not an agent:",
      beat.blocked.map((b) => `${b.id.padEnd(8)} ${b.age}d — needs: ${b.needs}`),
    ),
  );

  lines.push(
    ...bullet(
      "Drift:",
      beat.drift.map((d) => `${d.id.padEnd(8)} ${d.why}`),
    ),
  );

  if (beat.meetings.sinceLastNote !== null) {
    const m = beat.meetings;
    lines.push(
      ...bullet("Meeting record:", [
        `last note ${m.sinceLastNote}d ago`,
        ...(m.unpromoted.length
          ? [`${m.unpromoted.length} note(s) filed no roadmap items — oldest ${m.unpromoted[0]!.age}d`]
          : []),
      ]),
    );
  }

  if (beat.ranked.length > 1) {
    lines.push(
      ...bullet(
        "Next up:",
        beat.ranked.slice(1, 4).map((c) => `${c.id.padEnd(8)} ${c.priority} ${c.title}`),
      ),
    );
  }

  return lines.join("\n").trimEnd();
}

function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/** The GitHub Actions job summary — the durable record of a scheduled beat. */
export function formatSummary(beat: Beat): string {
  const out: string[] = ["## Heartbeat", ""];

  out.push(
    beat.pick
      ? `**Pick: ${beat.pick.id}** — ${beat.pick.title}`
      : "**Pick: nothing.**",
    "",
    beat.reason,
    "",
    `In flight ${beat.inFlight.length}/${beat.ceiling} · blocked ${beat.blocked.length} · backlog ${beat.ranked.length}`,
    "",
  );

  if (beat.blocked.length) {
    out.push(
      "### Blocked — waiting on a person",
      "",
      table(
        ["ID", "Waiting", "Needs"],
        beat.blocked.map((b) => [b.id, `${b.age}d`, b.needs.replace(/\|/g, "\\|")]),
      ),
      "",
    );
  }

  if (beat.drift.length) {
    out.push(
      "### Drift",
      "",
      table(["ID", "Problem"], beat.drift.map((d) => [d.id, d.why])),
      "",
    );
  }

  if (beat.meetings.unpromoted.length) {
    out.push(
      "### Meeting notes that produced nothing",
      "",
      "Capture with no decay path is the failure this folder is most likely to have.",
      "",
      table(
        ["ID", "Title", "Age"],
        beat.meetings.unpromoted
          .slice(0, 8)
          .map((m) => [m.id, m.title.replace(/\|/g, "\\|"), `${m.age}d`]),
      ),
      "",
    );
  }

  if (beat.ranked.length) {
    out.push(
      "### Ranked backlog",
      "",
      table(
        ["ID", "Pri", "Title", "Why there"],
        beat.ranked.slice(0, 8).map((c) => [
          c.id,
          c.priority,
          c.title.replace(/\|/g, "\\|"),
          `${c.note}, ${c.age}d`,
        ]),
      ),
      "",
    );
  }

  return out.join("\n");
}
