import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkPr, formatFindings } from "../check/pr.js";

/**
 * Resolve PR context from the environment.
 *
 * In GitHub Actions everything is available from the event payload and env.
 * Locally we fall back to git so the same check can be run before pushing.
 */
function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function currentBranch(): string {
  return (
    process.env["GITHUB_HEAD_REF"] ||
    process.env["MORPHEUS_BRANCH"] ||
    gitOutput(["rev-parse", "--abbrev-ref", "HEAD"])
  );
}

function changedFiles(base: string): string[] {
  const out = gitOutput(["diff", "--name-only", `${base}...HEAD`]);
  return out ? out.split("\n").filter(Boolean) : [];
}

/**
 * What moved on the base branch since this one left it — the mirror of
 * `changedFiles`, with the three-dot the other way round.
 */
function trunkChanges(base: string): string[] {
  const out = gitOutput(["diff", "--name-only", `HEAD...${base}`]);
  return out ? out.split("\n").filter(Boolean) : [];
}

function prBody(): string {
  // Actions writes the event payload to disk; read the body from it.
  const eventPath = process.env["GITHUB_EVENT_PATH"];
  if (eventPath) {
    try {
      const payload = JSON.parse(readFileSync(eventPath, "utf8")) as {
        pull_request?: { body?: string | null };
      };
      return payload.pull_request?.body ?? "";
    } catch {
      /* fall through to the env override */
    }
  }
  return process.env["MORPHEUS_PR_BODY"] ?? "";
}

export async function pr(productDir: string, base: string): Promise<number> {
  const findings = await checkPr({
    body: prBody(),
    branch: currentBranch(),
    changedFiles: changedFiles(base),
    trunkChanges: trunkChanges(base),
    productDir,
  });

  console.log(formatFindings(findings));

  const errors = findings.filter((f) => f.level === "error").length;
  if (errors) {
    console.error(`\n${errors} blocking issue(s).`);
    return 1;
  }
  return 0;
}
