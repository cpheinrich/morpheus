import type { Routed } from "./sweep.js";

/**
 * The run digest: one comment on the repository's log issue per run.
 *
 * The per-pull-request comments carry the reasoning; this is the index over
 * them, and the place a pattern shows up — the same pull request skipped for
 * the same reason run after run is a finding about the process, not the PR.
 */

export interface Outcome {
  number: number;
  /** What was finally done, after the plan was checked. */
  verdict: string;
  /** Set when the plan differed from what the session asked for. */
  overridden?: string | undefined;
  /** Operations that were carried out, in order. */
  did: string[];
  /** Set when carrying the plan out failed part-way. */
  error?: string | undefined;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function renderDigest(opts: { repo: string; runUrl: string; at: Date; routed: Routed[]; outcomes: Outcome[] }): string {
  const outcomes = new Map(opts.outcomes.map(o => [o.number, o]));
  const rows = opts.routed.map(r => {
    const outcome = outcomes.get(r.number);
    const result = outcome
      ? [outcome.verdict, outcome.overridden ? `(overridden: ${outcome.overridden})` : "", outcome.error ? `**failed: ${outcome.error}**` : ""].filter(Boolean).join(" ")
      // A session that was routed and has no outcome did not report. Say so; an empty cell
      // would read as "nothing to do".
      : r.route === "skip" ? "—" : "**no result reported**";
    return `| #${r.number} | ${cell(r.title).slice(0, 60)} | ${r.route}: ${r.reason} | ${cell(r.detail)} | ${cell(result)} |`;
  });
  const acted = opts.outcomes.filter(o => o.did.length).length;
  return [
    `### Run ${opts.at.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    opts.routed.length
      ? `${opts.routed.length} open pull request(s); acted on ${acted}. [Run log](${opts.runUrl}).`
      : `No open pull requests. [Run log](${opts.runUrl}).`,
    ...(rows.length ? [["| PR | Title | Route | Why | Result |", "|---|---|---|---|---|", ...rows].join("\n")] : []),
  ].join("\n\n");
}
