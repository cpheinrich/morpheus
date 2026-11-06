import { appendFile } from "node:fs/promises";
import { projectConfig, runCheck, type CheckReport } from "../complexity/check.js";
import { annotations, formatReport, stepSummary } from "../complexity/format.js";
import { formatStatus, installLizard, toolStatus } from "../complexity/install.js";

export async function install(check: boolean): Promise<number> {
  if (check) {
    const status = await toolStatus();
    console.log(formatStatus(status));
    if (status.state !== "ok") console.log("\nRun `morpheus complexity install`; it is idempotent and pinned.");
    return status.state === "ok" ? 0 : 1;
  }
  const result = await installLizard();
  if (!result.ok) {
    console.log(`Could not install the pinned Lizard analyzer: ${result.reason}`);
    return 1;
  }
  console.log(formatStatus(result.status));
  console.log(result.changed ? "Installed." : "Already installed; nothing changed.");
  return 0;
}

export interface CheckFlags {
  base?: string;
  all: boolean;
  json: boolean;
  ci: boolean;
}

/**
 * Exit 0 passes (advisory always passes), 1 is a blocking finding in enforce
 * mode, 2 means the check could not run — never a silent pass. In CI an
 * enforcing project is measured in full: a pin move, a removed exclude or a
 * mapping bug changes untouched code too.
 */
export async function check(root: string, flags: CheckFlags): Promise<number> {
  const all = flags.all || (flags.ci && (await enforcing(root)));
  const report = await runCheck({ root, all, untracked: !flags.ci, ...(flags.base ? { base: flags.base } : {}) });
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));
  if (flags.ci) await reportToGitHub(report);
  return report.exitCode;
}

async function enforcing(root: string): Promise<boolean> {
  const read = await projectConfig(root);
  return read.ok && read.config.mode === "enforce";
}

async function reportToGitHub(report: CheckReport): Promise<void> {
  for (const line of annotations(report)) console.log(line);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) await appendFile(summary, stepSummary(report));
}
