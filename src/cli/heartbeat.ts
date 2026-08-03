import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { assess, type Beat, type HeartbeatConfig } from "../heartbeat/assess.js";
import { hasDispatchCredential, readConfig } from "../heartbeat/config.js";
import { formatBeat, formatSummary } from "../heartbeat/format.js";
import { listClaims } from "../pm/claim.js";
import { parseArtifact, parseDir } from "../pm/parse.js";
import { MEETING_NOTES_DIR } from "../paths.js";
import { MeetingNote } from "../team/schema.js";

/**
 * One beat.
 *
 * Read, assess, propose, stop. It is a **dispatcher, not a doer** — doing the
 * work inside a beat puts an unattended agent on a timer, which is a much
 * larger decision than scheduling one, and one Chris has explicitly deferred.
 */

/** Dispatch was asked for and refused. Distinct from "nothing to do". */
export const EXIT_REFUSED = 2;

export interface HeartbeatOptions {
  productDir: string;
  cwd: string;
  ceiling?: number;
  json?: boolean;
  dispatch?: boolean;
}

/**
 * Append the beat to the Actions job summary, when running in Actions.
 *
 * Silent no-op elsewhere, which is what makes the same command usable by hand.
 * Failures are swallowed: a summary that could not be written must not fail a
 * beat that was otherwise fine.
 */
async function writeSummary(beat: Beat): Promise<void> {
  const path = process.env["GITHUB_STEP_SUMMARY"];
  if (!path) return;
  try {
    await appendFile(path, `${formatSummary(beat)}\n`, "utf8");
  } catch {
    /* a missing summary is not worth failing a beat over */
  }
}

export async function heartbeat(opts: HeartbeatOptions): Promise<number> {
  const { productDir, cwd } = opts;

  const fileConfig = await readConfig(cwd);
  const config: HeartbeatConfig = {
    ceiling: opts.ceiling ?? fileConfig.ceiling,
    dispatch: opts.dispatch ?? fileConfig.dispatch,
  };

  const [{ items }, { items: goals }] = await Promise.all([
    parseArtifact(productDir, "roadmap"),
    parseArtifact(productDir, "goals"),
  ]);

  // No claims is a real answer; unreachable origin is not. Reading them the
  // same way would let a network blip look like an empty queue and dispatch
  // straight through a ceiling that was actually full.
  let claims;
  try {
    claims = await listClaims(cwd);
  } catch {
    console.error(
      "Could not reach origin to read live claims. Refusing to beat: an unreadable\n" +
        "queue is not an empty one, and treating it as empty would ignore the ceiling.",
    );
    return 1;
  }

  // Absent is not empty: a project with no meeting-notes directory reports
  // `sinceLastNote: null` rather than a stale record it does not keep.
  const { items: notes } = await parseDir(join(cwd, MEETING_NOTES_DIR), MeetingNote);

  const beat = assess({ items, goals, claims, config, now: new Date(), notes });

  if (opts.json) {
    console.log(JSON.stringify(beat, null, 2));
  } else {
    console.log(formatBeat(beat));
  }
  await writeSummary(beat);

  if (!config.dispatch) return 0;

  // Dispatch is wired, tested, and empty on the far side. It must say so rather
  // than degrading quietly into propose-only — a configured intent that cannot
  // be honoured is not the same as one that was never expressed.
  if (!hasDispatchCredential()) {
    console.error(
      "\ndispatch is on, but no agent credential is present (ANTHROPIC_API_KEY or\n" +
        "CLAUDE_CODE_OAUTH_TOKEN). Refusing rather than silently proposing — the beat\n" +
        "above is still valid, nothing was started.",
    );
    return EXIT_REFUSED;
  }

  console.error(
    "\ndispatch is on and a credential is present, but no dispatcher is implemented yet.\n" +
      "Refusing rather than pretending. See MO-050 for the seam.",
  );
  return EXIT_REFUSED;
}
