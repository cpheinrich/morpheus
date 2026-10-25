import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { canonical, exportCloseout, sha256, type Snapshot } from "../scripts/paperclip-closeout/export.js";
import { displayText, renderCloseout, renderMarkdown, verifyRecord } from "../scripts/paperclip-closeout/markdown.js";
import { validateHistory } from "../scripts/paperclip-closeout/history.js";
import { gitSubprocessEnv } from "../src/git-env.js";

const roots: string[] = [];
const company = "10000000-0000-4000-8000-000000000001";
const issue = "10000000-0000-4000-8000-000000000002";
const message = "10000000-0000-4000-8000-000000000003";
const attachment = "10000000-0000-4000-8000-000000000004";
const interaction = "10000000-0000-4000-8000-000000000005";
const target = { baseUrl: "http://127.0.0.1:3100", companyId: company, issueId: issue, threadId: issue };
const time = "2026-10-25T10:00:00Z";
const git = (repo: string, ...args: string[]) => execFileSync("git", args, { cwd: repo, env: gitSubprocessEnv(), stdio: "pipe", encoding: "utf8" }).trim();
const input = (): Snapshot => ({
  version: 1, source: { ...target, contract: "operator-frozen-v1", complete: true, revision: "capture-42", cursor: null },
  issue: { title: "Closeout", description: "Preserve history", status: "done", updatedAt: time },
  messages: [{ id: message, author: { kind: "user", id: "operator" }, body: "Decision:\n<script>alert(1)</script>\n````````\n![payload](javascript:alert(1))", createdAt: time, updatedAt: time }],
  decisions: [{ id: "decision", summary: "Keep all versions", sourceMessageIds: [message] }],
  acceptedAnswers: [{ interactionId: interaction, kind: "questions", acceptedAt: time, acceptedBy: { kind: "user", id: "operator" },
    sourceMessageIds: [message], questions: { prompt: "<img onerror=alert(1)>", options: ["yes", "no"] }, answers: { selected: ["yes"], other: null } }],
  validationEvidence: ["passed", "failed", "not-run"].map(outcome => ({ id: outcome, description: "Captured outcome", outcome: outcome as "passed" | "failed" | "not-run", reference: "qa/result.json" })),
  attachments: [{ id: attachment, reference: "qa/file.bin", localPath: "qa/file.bin" },
    { id: interaction, reference: "https://example.com/remote.bin", declaredSha256: "a".repeat(64) }],
});
function commit(repo: string) {
  git(repo, "add", "-A"); git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture");
  return git(repo, "rev-parse", "HEAD");
}
async function fixture() {
  const repo = await mkdtemp(join(tmpdir(), "closeout-md-")); roots.push(repo);
  git(repo, "init", "--initial-branch=test");
  await mkdir(join(repo, "qa")); await writeFile(join(repo, "qa/file.bin"), Buffer.from([0, 255, 60, 62]));
  const base = commit(repo);
  const exported = await exportCloseout(repo, target, async () => input());
  const bytes = await readFile(join(repo, exported.path));
  return { repo, base, exported, bytes };
}
afterEach(async () => { for (const repo of roots.splice(0)) await rm(repo, { recursive: true, force: true }); });

describe("Markdown closeouts", () => {
  it("renders exact deterministic bytes with every source field and safe attachment links", async () => {
    const { repo, exported, bytes } = await fixture();
    const rendered = await renderCloseout(repo, exported.path);
    const md = await readFile(join(repo, rendered.path));
    expect(md).toEqual(renderMarkdown(bytes, exported.path));
    expect(sha256(md)).toBe("ceb62b05fc176da486ae4b88a92ae537b6fd04e76cbeb4927daa1fa85d4515b0");
    expect(rendered).toEqual({ path: exported.path.replace(/\.json$/, ".md"), canonicalPath: exported.path, snapshotId: exported.snapshotId, created: true });
    const text = md.toString();
    expect(text.indexOf("## Conversation")).toBeLessThan(text.indexOf("## Decisions"));
    expect(text.indexOf("## Attachments")).toBeLessThan(text.indexOf("## Provenance and audit details"));
    expect(text.indexOf("Decision:")).toBeLessThan(text.indexOf('"source":'));
    expect(text).toContain(`[${exported.snapshotId}.json](./${exported.snapshotId}.json)`);
    for (const value of ["Keep all versions", "sourceMessageIds", "acceptedBy", '"selected":', '"not-run"', '"failed"', '"passed"', "atomic", "inputSha256", "Unverified reference"]) expect(text).toContain(value);
    const verified = exported.record.attachments[0]!;
    if (verified.verification !== "verified-bytes") throw new Error("fixture");
    expect(text).toContain(`[${verified.sha256}.bin](../../blobs/${verified.sha256}.bin)`);
    expect(text).not.toContain("localPath"); expect(text).not.toContain("\u0000");
    expect(await renderCloseout(repo, exported.path)).toEqual({ ...rendered, created: false });
    expect(await readFile(join(repo, rendered.path))).toEqual(md);
  });
  it("uses a longer fence for raw HTML and adversarial fence runs", () => {
    expect(displayText("<script>x</script>\n`````\n# injected")).toBe("``````text\n<script>x</script>\n`````\n# injected\n``````\n");
    const long = "`".repeat(100_000);
    expect(displayText(long)).toBe(`${"`".repeat(100_001)}text\n${long}\n${"`".repeat(100_001)}\n`);
  });
  it("creates a new paired view after reopening while preserving the previous bytes", async () => {
    const { repo, exported } = await fixture(); const old = await renderCloseout(repo, exported.path);
    const bytes = await readFile(join(repo, old.path)); const reopened = input(); reopened.issue.status = "in_progress";
    const next = await exportCloseout(repo, target, async () => reopened); const view = await renderCloseout(repo, next.path);
    expect(view.snapshotId).not.toBe(old.snapshotId);
    expect(await readFile(join(repo, old.path))).toEqual(bytes);
    expect((await readdir(join(repo, `.agent/paperclip-closeouts/${company}/${issue}`))).sort()).toEqual(
      [exported.path, old.path, next.path, view.path].map(path => path.split("/").at(-1)!).sort());
  });
  it("refuses overwritten Markdown, tampered JSON, and misbound source identities", async () => {
    const { repo, exported, bytes } = await fixture(); const view = await renderCloseout(repo, exported.path);
    await writeFile(join(repo, view.path), "tampered");
    await expect(renderCloseout(repo, exported.path)).rejects.toThrow("immutable");
    const changed = JSON.parse(bytes.toString()); changed.source.issueId = message;
    expect(() => verifyRecord(Buffer.from(canonical(changed) + "\n"), exported.path)).toThrow("path or source hash");
    await writeFile(join(repo, exported.path), bytes.toString().trim());
    await expect(renderCloseout(repo, exported.path)).rejects.toThrow("canonical");
  });
  it.each(["../outside.json", ".GIT/config", ".GiT/config", ".git/config", "/tmp/file", "qa/../file"])("refuses unsafe render input %s", async path => {
    const { repo } = await fixture(); await expect(renderCloseout(repo, path)).rejects.toThrow("safe repository-relative");
  });
  it("refuses symlinked canonical files, output files and verified blobs", async () => {
    const { repo, exported } = await fixture();
    const view = await renderCloseout(repo, exported.path);
    await rm(join(repo, view.path)); await symlink("../../../qa/file.bin", join(repo, view.path));
    await expect(renderCloseout(repo, exported.path)).rejects.toThrow();
    await rm(join(repo, view.path));
    const blob = exported.record.attachments[0]!;
    if (blob.verification !== "verified-bytes") throw new Error("fixture");
    await rm(join(repo, blob.path)); await symlink("../../../qa/file.bin", join(repo, blob.path));
    await expect(renderCloseout(repo, exported.path)).rejects.toThrow();
    await rm(join(repo, exported.path)); await symlink("../../../qa/file.bin", join(repo, exported.path));
    await expect(renderCloseout(repo, exported.path)).rejects.toThrow();
  });
  it("rejects canonical JSON with an unresolved reference or forged verified hash", async () => {
    const { bytes } = await fixture();
    const value = JSON.parse(bytes.toString()); value.decisions[0].sourceMessageIds = [interaction];
    const changed = Buffer.from(canonical(value) + "\n");
    expect(() => verifyRecord(changed, `.agent/paperclip-closeouts/${company}/${issue}/${sha256(changed)}.json`)).toThrow("unresolved");
    value.decisions[0].sourceMessageIds = [message]; value.attachments[0].declaredSha256 = "a".repeat(64);
    const forged = Buffer.from(canonical(value) + "\n");
    expect(() => verifyRecord(forged, `.agent/paperclip-closeouts/${company}/${issue}/${sha256(forged)}.json`)).toThrow("attachment identity");
  });
});

describe("committed closeout history guard", () => {
  it("accepts new valid JSON, Markdown and blobs and ignores dirty checkout bytes", async () => {
    const { repo, base, exported } = await fixture(); const view = await renderCloseout(repo, exported.path);
    const head = commit(repo); await writeFile(join(repo, view.path), "dirty");
    expect(await validateHistory(repo, base, head)).toEqual({ base, head, preserved: 0, added: 3 });
    expect(await validateHistory(repo, head, head)).toEqual({ base: head, head, preserved: 3, added: 0 });
  });
  it("lets existing JSON-only history gain its exact Markdown view", async () => {
    const { repo, base, exported } = await fixture(); const jsonHead = commit(repo);
    expect(await validateHistory(repo, base, jsonHead)).toEqual({ base, head: jsonHead, preserved: 0, added: 2 });
    await renderCloseout(repo, exported.path); const head = commit(repo);
    expect(await validateHistory(repo, jsonHead, head)).toEqual({ base: jsonHead, head, preserved: 2, added: 1 });
  });
  it.each(["json", "md", "blob"].flatMap(kind => ["edit", "delete", "rename"].map(action => ({ kind, action }))))("refuses $action of existing $kind history", async ({ kind, action }) => {
    const { repo, exported } = await fixture(); await renderCloseout(repo, exported.path); const base = commit(repo);
    const blob = exported.record.attachments[0]!;
    if (blob.verification !== "verified-bytes") throw new Error("fixture");
    const path = kind === "json" ? exported.path : kind === "md" ? exported.path.replace(/\.json$/, ".md") : blob.path;
    if (action === "edit") await writeFile(join(repo, path), "changed");
    else if (action === "delete") await rm(join(repo, path));
    else await rename(join(repo, path), join(repo, path + ".moved"));
    await expect(validateHistory(repo, base, commit(repo))).rejects.toThrow("existing closeout history changed");
  });
  it.each(["json", "markdown", "blob"])("refuses a new invalid %s", async kind => {
    const { repo, base, exported } = await fixture(); const view = await renderCloseout(repo, exported.path);
    const path = kind === "json" ? exported.path : kind === "markdown" ? view.path : exported.record.attachments[0]!.verification === "verified-bytes" ? exported.record.attachments[0]!.path : "";
    await writeFile(join(repo, path), kind === "json" ? canonical({ ...exported.record, issue: { ...exported.record.issue, title: "tampered" } }) + "\n" : "tampered");
    await expect(validateHistory(repo, base, commit(repo))).rejects.toThrow();
  });
  it("refuses Markdown with a missing canonical object", async () => {
    const { repo, base, exported } = await fixture(); await renderCloseout(repo, exported.path); await rm(join(repo, exported.path));
    await expect(validateHistory(repo, base, commit(repo))).rejects.toThrow("referenced closeout object missing");
  });
  it.each([".AGENT/paperclip-closeouts", ".agent/Paperclip-closeouts"])("refuses case alias %s in exact Git objects", async alias => {
    const { repo, base } = await fixture();
    const path = `${alias}/bad.txt`; const oid = git(repo, "hash-object", "-w", "qa/file.bin");
    git(repo, "add", "-A"); git(repo, "update-index", "--add", "--cacheinfo", `100644,${oid},${path}`);
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "alias");
    await expect(validateHistory(repo, base, git(repo, "rev-parse", "HEAD"))).rejects.toThrow("unsafe closeout path");
  });
  it("refuses committed symlink modes and arbitrary commit references", async () => {
    const { repo, base, exported } = await fixture();
    await rm(join(repo, exported.path)); await symlink("qa/file.bin", join(repo, exported.path));
    const head = commit(repo);
    await expect(validateHistory(repo, base, head)).rejects.toThrow("unsafe closeout path or mode");
    await expect(validateHistory(repo, "HEAD", head)).rejects.toThrow("exact verified");
    await expect(validateHistory(repo, "0".repeat(40), head)).rejects.toThrow();
  });
  it("refuses executable blob modes and a blob committed at an ancestor directory", async () => {
    const { repo, base, exported } = await fixture();
    git(repo, "add", "-A"); git(repo, "update-index", "--chmod=+x", exported.path);
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "mode");
    await expect(validateHistory(repo, base, git(repo, "rev-parse", "HEAD"))).rejects.toThrow("unsafe closeout path or mode");
    git(repo, "reset", "--hard", base);
    const oid = git(repo, "hash-object", "-w", "qa/file.bin");
    git(repo, "update-index", "--add", "--cacheinfo", `100644,${oid},.agent`);
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "ancestor");
    await expect(validateHistory(repo, base, git(repo, "rev-parse", "HEAD"))).rejects.toThrow("unsafe closeout path or mode");
  });
  it("runs the render and history CLI modes with exact committed identities", async () => {
    const { repo, base, exported } = await fixture();
    const cli = fileURLToPath(new URL("../scripts/paperclip-closeout/cli.ts", import.meta.url));
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", cli, "--repo", repo, ...args], { encoding: "utf8", env: gitSubprocessEnv() });
    const rendered = run("--render", "--snapshot", exported.path);
    expect({ status: rendered.status, error: rendered.stderr }).toEqual({ status: 0, error: "" });
    expect(JSON.parse(rendered.stdout).canonicalPath).toBe(exported.path);
    const head = commit(repo); const checked = run("--check-history", "--base", base, "--head", head);
    expect({ status: checked.status, result: JSON.parse(checked.stdout) }).toEqual({ status: 0, result: { base, head, preserved: 0, added: 3 } });
    for (const refused of [run("--check-history", "--base", base), run("--render", "--check-history")]) {
      expect({ status: refused.status, stdout: refused.stdout, stderr: refused.stderr }).toEqual({
        status: 1, stdout: "", stderr: "Closeout refused. Check the frozen-input contract, exact target and local file safety; no task status was changed.\n",
      });
    }
  });
});
