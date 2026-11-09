import type { CheckReport } from "./check.js";
import type { Finding } from "./evaluate.js";

const ORDER = { error: 0, warning: 1, note: 2 } as const;
const MARK = { error: "✗", warning: "!", note: "·" } as const;

/** The human report: the verdict first, then what a reviewer must see, then each finding. */
export function formatReport(report: CheckReport): string {
  if (report.state === "not-run") {
    return `Complexity check did not run (${report.mode}${report.enrolled ? "" : ", not enrolled"}): ${report.reason}`;
  }
  const { config, evaluation } = report;
  const lines = [
    `Complexity: ${verdict(report)} — ${config.mode}${report.enrolled ? "" : " (not enrolled; defaults)"}, CCN limit ${config.ccn}, cognitive advisory ${config.cognitiveWarn}, Lizard ${report.lizardVersion ?? "?"}`,
    `Scope: ${report.scope === "all" ? "every in-scope file" : `changes since ${report.mergeBase?.slice(0, 12) ?? "?"}`} — ${evaluation.targeted} function(s) checked, ${evaluation.inTouchedFiles} in ${evaluation.measuredFiles} measured file(s)`,
  ];
  for (const line of report.delta) lines.push(`! ${line}`);
  if (config.exclude.length) lines.push(`Excluded by complexity.exclude: ${config.exclude.join(", ")}`);
  if (config.include.join() !== "**") lines.push(`Limited by complexity.include: ${config.include.join(", ")}`);
  for (const f of sorted(report.findings)) lines.push(`${MARK[f.severity]} ${f.message}`);
  return lines.join("\n");
}

function verdict(report: Extract<CheckReport, { state: "ran" }>): string {
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warned = report.delta.length > 0 || report.findings.some((f) => f.severity === "warning");
  if (errors) return `${errors} blocking finding(s)`;
  return warned ? "passes with warnings" : "passes";
}

function sorted(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** GitHub workflow commands. Values are escaped as the runner requires. */
export function annotations(report: CheckReport): string[] {
  if (report.state === "not-run") return [`::warning::${escape(`Complexity check did not run: ${report.reason}`)}`];
  const out = report.delta.length ? [`::warning title=Complexity policy changed::${escape(report.delta.join("\n"))}`] : [];
  for (const f of report.findings) {
    if (f.severity === "note") continue;
    const at = f.path ? ` file=${property(f.path)}${f.line ? `,line=${f.line}` : ""}` : "";
    out.push(`::${f.severity}${at}::${escape(f.message)}`);
  }
  return out;
}

const escape = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const property = (s: string) => escape(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

/** Markdown for the job summary: the policy delta leads, because it is what a reviewer must not miss. */
export function stepSummary(report: CheckReport): string {
  const body = formatReport(report).split("\n");
  return ["## Complexity", "", "```", ...body, "```", ""].join("\n");
}

/** One short block for the review packet: the real result, or why there is none. */
export function packetSummary(report: CheckReport): string {
  if (report.state === "not-run") return `Complexity: NOT RUN — ${report.reason}`;
  const blocking = report.findings.filter((f) => f.severity !== "note");
  const lines = formatReport(report).split("\n").slice(0, 2 + report.delta.length);
  for (const f of blocking.slice(0, 20)) lines.push(`${MARK[f.severity]} ${f.message}`);
  if (blocking.length > 20) lines.push(`… ${blocking.length - 20} more; run \`morpheus complexity check\``);
  return lines.join("\n");
}
