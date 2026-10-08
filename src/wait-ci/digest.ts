import { type Check, checkKey, counts, failed, formatDuration, type Verdict } from "./checks.js";
import type { TrimmedLog } from "./logs.js";

/** What one failed check contributes beyond its line: its log, or why there is none. */
export interface FailureDetail {
  log?: TrimmedLog;
  logError?: string;
  labelRace?: boolean;
}

export interface DigestInput {
  repo: string;
  pr: number;
  headSha: string;
  verdict: Verdict;
  checks: Check[];
  elapsedMs: number;
  /** Deadline reached before every check finished. */
  timedOut: boolean;
  /** Keyed by {@link checkKey}. */
  details: Map<string, FailureDetail>;
  /** Earlier heads seen during the wait, oldest first. */
  movedFrom: string[];
  requiredOnly: boolean;
  truncated: boolean;
  /** Checks dropped by `--required-only`, so an empty required set is not mistaken for no CI. */
  ignored: number;
}

const short = (sha: string) => sha.slice(0, 7);

function label(check: Check): string {
  return check.workflow && !check.name.startsWith(check.workflow) ? `${check.name} (${check.workflow})` : check.name;
}

function tally(checks: Check[]): string {
  const c = counts(checks);
  const parts = [
    c.pass ? `${c.pass} passed` : "",
    c.skipped ? `${c.skipped} skipped` : "",
    c.fail ? `${c.fail} failed` : "",
    c.cancelled ? `${c.cancelled} cancelled` : "",
    c.pending ? `${c.pending} running` : "",
  ].filter(Boolean);
  return `${checks.length} check${checks.length === 1 ? "" : "s"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

/**
 * The whole output of a wait: one line when green, and otherwise only what an
 * agent acts on — which check, where, and the failing step's own words.
 */
export function renderDigest(input: DigestInput): string {
  const where = `${input.repo}#${input.pr} @ ${short(input.headSha)}`;
  const scope = input.requiredOnly ? "required " : "";
  const after = `after ${formatDuration(input.elapsedMs)}`;
  const failures = input.checks.filter(failed);
  const races = failures.filter((c) => input.details.get(checkKey(c))?.labelRace);
  const out: string[] = [];

  switch (input.verdict) {
    case "green":
      out.push(`✓ CI green — ${where} (${scope}${tally(input.checks)}) ${after}`);
      break;
    case "failed": {
      const raceOnly = races.length === failures.length;
      const still = input.timedOut ? "; stopped at the deadline with checks still running" : "";
      out.push(
        raceOnly
          ? `✗ CI blocked only by the agent-reviewed label race — ${where} (${scope}${tally(input.checks)}) ${after}${still}`
          : `✗ CI failed — ${where} (${scope}${tally(input.checks)}) ${after}${still}`,
      );
      break;
    }
    case "pending":
      out.push(`… CI still running at the deadline — ${where} (${scope}${tally(input.checks)}) ${after}`);
      break;
    case "no-checks":
      out.push(
        input.requiredOnly && input.ignored > 0
          ? `? No required checks on ${where} ${after} (${input.ignored} non-required ignored by --required-only)`
          : `? No checks reported on ${where} ${after} — workflows may not have triggered, or this repository has no CI for the PR`,
      );
      break;
  }

  if (input.movedFrom.length > 0) {
    out.push(`! head moved during the wait: ${[...input.movedFrom, input.headSha].map(short).join(" → ")}; results are for ${short(input.headSha)} only`);
  }
  if (input.truncated) out.push("! more than 100 checks: only the first page was read");

  for (const check of failures) {
    const detail = input.details.get(checkKey(check));
    const mark = check.outcome === "cancelled" ? "⊘" : "✗";
    const race = detail?.labelRace ? " — label race: agent-reviewed not applied yet; not a code failure" : "";
    out.push(`  ${mark} ${label(check)}${check.url ? ` — ${check.url}` : ""}${race}`);
    if (detail?.labelRace) continue;
    if (detail?.logError) out.push(`      (log unavailable: ${detail.logError})`);
    if (detail?.log) {
      if (detail.log.step) out.push(`      step: ${detail.log.step}`);
      const omittedAt = detail.log.omitted > 0 ? detail.log.omittedAfter : -1;
      detail.log.lines.forEach((line, i) => {
        if (i === omittedAt) out.push(`      │ … ${detail.log!.omitted} lines omitted …`);
        out.push(`      │ ${line}`.trimEnd());
      });
    }
  }

  if (input.timedOut) {
    for (const check of input.checks.filter((c) => c.outcome === "pending")) {
      out.push(`  … ${label(check)}${check.url ? ` — ${check.url}` : ""}`);
    }
  }

  if (input.verdict === "failed" && races.length > 0 && races.length === failures.length) {
    out.push("  Nothing to fix in code: apply agent-reviewed once the independent review is recorded, then re-check.");
  }
  return out.join("\n");
}
