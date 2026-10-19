import { execFileSync } from "node:child_process";
import { gitSubprocessEnv } from "../git-env.js";
import { configurationDigest, hash, type CdConfig, type SourceRevision, type TestEvidence } from "./schema.js";
import { invariant } from "./state.js";
import { pages, type GitHubApi } from "./store.js";

export function git(root: string, args: string[]): string { return execFileSync("git", args, { cwd: root, env: gitSubprocessEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }).trim(); }
export function inputDigest(root: string, revision: string, inputs: string[]): string {
  invariant(/^[a-f0-9]{40}$/.test(revision), "Input digest requires exact source SHA");
  const inventory = git(root, ["ls-tree", "-r", "-z", revision, "--", ...inputs]);
  invariant(inventory.length > 0, "Configured app input paths match no Git objects");
  return hash(inventory);
}
export function verifySource(root: string, config: CdConfig, sourceSha: string, expectedDigest: string): void {
  invariant(git(root, ["rev-parse", "HEAD"]) === sourceSha, "Source checkout differs from immutable selected SHA");
  git(root, ["merge-base", "--is-ancestor", sourceSha, `origin/${config.mainBranch}`]);
  invariant(inputDigest(root, sourceSha, config.inputs) === expectedDigest, "App inputs differ from selected source digest");
  invariant(git(root, ["status", "--porcelain", "--untracked-files=all", "--", ...config.inputs]) === "", "App inputs were modified or injected after source selection");
}
export function verifyValidator(root: string, evidence: TestEvidence): void {
  invariant(!evidence.validator.path.startsWith("/") && !evidence.validator.path.split("/").includes(".."), "Validator path must be repository relative");
  const revision = evidence.validator.revision === "source" ? evidence.sourceSha : evidence.controlSha;
  const bytes = execFileSync("git", ["show", `${revision}:${evidence.validator.path}`], { cwd: root, env: gitSubprocessEnv(), maxBuffer: 16 * 1024 * 1024 });
  invariant(hash(bytes.toString("utf8")) === evidence.validator.sha256, "Test validator hash differs from trusted revision");
}
/** Merge time is evidence only for the exact merge commit on the first-parent main chain. */
export async function loadSources(root: string, config: CdConfig, api: GitHubApi, now: string): Promise<SourceRevision[]> {
  git(root, ["fetch", "origin", config.mainBranch]);
  const chain = git(root, ["rev-list", "--first-parent", "--reverse", `origin/${config.mainBranch}`]).split("\n").filter(Boolean);
  const pulls = await pages<{ number: number; merged_at: string | null; merge_commit_sha: string | null; base: { ref: string } }>(api, `repos/${config.repository}/pulls?state=closed&base=${encodeURIComponent(config.mainBranch)}&sort=updated&direction=desc`);
  const merged = new Map(pulls.filter(pull => pull.merged_at && pull.merge_commit_sha && pull.base.ref === config.mainBranch).map(pull => [pull.merge_commit_sha!, pull]));
  return chain.flatMap((sourceSha, order) => {
    const inventory = git(root, ["ls-tree", "-r", "-z", sourceSha, "--", ...config.inputs]);
    if (!inventory) return [];
    const pull = merged.get(sourceSha);
    return [{ sha: sourceSha, inputDigest: hash(inventory), mainEnteredAt: pull?.merged_at ?? now, evidence: pull ? { kind: "merged-pr" as const, ref: `https://github.com/${config.repository}/pull/${pull.number}` } : { kind: "observed" as const, ref: `first-observed:${now}` }, order }];
  });
}
export function verifyConfiguration(config: CdConfig, expected: string): void { invariant(configurationDigest(config) === expected, "Configuration digest differs from immutable attempt"); }
