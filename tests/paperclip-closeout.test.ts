import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { canonical, exportCloseout, MAX_ATTACHMENT_BYTES, MAX_SNAPSHOT_BYTES, readFrozenFile, sha256, type Snapshot } from "../scripts/paperclip-closeout/export.js";
import { gitSubprocessEnv } from "../src/git-env.js";

// Temporary Git only: no network, native workers, credential store or live API.
const COMPANY = "10000000-0000-4000-8000-000000000001";
const ISSUE = "10000000-0000-4000-8000-000000000002";
const MESSAGE = "10000000-0000-4000-8000-000000000003";
const ATTACHMENT = "10000000-0000-4000-8000-000000000004";
const INTERACTION = "10000000-0000-4000-8000-000000000005";
const time = "2026-10-25T10:00:00Z";
const target = { baseUrl: "http://127.0.0.1:3100", companyId: COMPANY, issueId: ISSUE, threadId: ISSUE };
const roots: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: gitSubprocessEnv(), encoding: "utf8", stdio: "pipe" }).trim();
function snapshot(): Snapshot {
  return {
    version: 1, source: { ...target, contract: "operator-frozen-v1", complete: true, revision: "operator-capture-42", cursor: MESSAGE },
    issue: { title: "A bounded task", description: "Acceptance stays in Git.", status: "done", updatedAt: time },
    messages: [{ id: MESSAGE, author: { kind: "user", id: "operator" }, body: "Keep the first snapshot.", createdAt: time, updatedAt: time }],
    decisions: [{ id: "keep-history", summary: "Preserve prior closeouts", sourceMessageIds: [MESSAGE] }],
    acceptedAnswers: [{ interactionId: INTERACTION, kind: "ask_user_questions", acceptedAt: time, acceptedBy: { kind: "user", id: "operator" },
      sourceMessageIds: [MESSAGE], questions: [{ id: "q1", prompt: "Preserve history?" }], answers: [{ questionId: "q1", selectedOptionIds: ["yes"], otherText: null }] }],
    validationEvidence: [{ id: "test", description: "Independent check", outcome: "failed", reference: "qa/result.json" }],
    attachments: [{ id: ATTACHMENT, reference: `http://127.0.0.1:3100/api/attachments/${ATTACHMENT}/content`, localPath: "qa/file.txt" }],
  };
}
async function fixture() {
  const repo = await mkdtemp(join(tmpdir(), "paperclip-closeout-")); roots.push(repo);
  git(repo, "init", "--initial-branch", "test");
  await mkdir(join(repo, "qa"));
  await writeFile(join(repo, "qa/file.txt"), "hello\n");
  await writeFile(join(repo, "qa/source.json"), JSON.stringify(snapshot()));
  await writeFile(join(repo, "qa/roadmap.md"), "status: in-progress\n");
  return repo;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("bounded Paperclip closeout exporter", () => {
  it("preserves structured content and verified bytes with deterministic exclusive identity", async () => {
    const repo = await fixture();
    const original = await readFile(join(repo, "qa/source.json"), "utf8");
    const run = () => exportCloseout(repo, target, () => readFrozenFile(repo, "qa/source.json"));
    const first = await run();
    const bytes = await readFile(join(repo, first.path));
    const expectedHash = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
    expect(first.record.attachments).toEqual([{ id: ATTACHMENT, reference: snapshot().attachments[0]!.reference, verification: "verified-bytes",
      sha256: expectedHash, byteSize: 6, path: `.agent/paperclip-closeouts/blobs/${expectedHash}.bin` }]);
    const verified = first.record.attachments[0]!;
    if (verified.verification !== "verified-bytes") throw new Error("expected verified attachment");
    expect(await readFile(join(repo, verified.path), "utf8")).toBe("hello\n");
    expect(first.snapshotId).toBe(sha256(bytes));
    expect(first.path).toBe(`.agent/paperclip-closeouts/${COMPANY}/${ISSUE}/${first.snapshotId}.json`);
    expect(first.created).toBe(true);
    expect(first.record.decisions).toEqual(snapshot().decisions);
    expect(first.record.acceptedAnswers).toEqual(snapshot().acceptedAnswers);
    expect(first.record.validationEvidence).toEqual(snapshot().validationEvidence);
    expect(first.record.freeze.atomic).toBe(false);
    expect(first.record.freeze.inputSha256).toBe(sha256(canonical(snapshot())));
    expect(bytes.toString()).not.toContain("localPath");
    expect(bytes.toString()).not.toContain(repo);
    const again = await run();
    expect({ path: again.path, snapshotId: again.snapshotId, created: again.created }).toEqual({ path: first.path, snapshotId: first.snapshotId, created: false });
    expect(await readFile(join(repo, first.path))).toEqual(bytes);
    expect(await readdir(join(repo, `.agent/paperclip-closeouts/${COMPANY}/${ISSUE}`))).toEqual([`${first.snapshotId}.json`]);
    expect(await readFile(join(repo, "qa/source.json"), "utf8")).toBe(original);
    expect(await readFile(join(repo, "qa/roadmap.md"), "utf8")).toBe("status: in-progress\n");
  });
  it("preserves a prior closeout when the thread reopens or attachment bytes change", async () => {
    const repo = await fixture(); const input = snapshot();
    const first = await exportCloseout(repo, target, async () => structuredClone(input));
    const old = await readFile(join(repo, first.path));
    input.issue.status = "in_progress"; input.source.revision = "operator-capture-43";
    await writeFile(join(repo, "qa/file.txt"), "world\n");
    const reopened = await exportCloseout(repo, target, async () => structuredClone(input));
    expect(reopened.path).not.toBe(first.path);
    expect(reopened.record.issue.status).toBe("in_progress");
    const changed = reopened.record.attachments[0]!;
    if (changed.verification !== "verified-bytes") throw new Error("expected verified attachment");
    expect(changed.sha256).toBe("e258d248fda94c63753607f7c4494ee0fcbe92f1a76bfdac795c9d84101eb317");
    expect(await readFile(join(repo, first.path))).toEqual(old);
    expect((await readdir(join(repo, `.agent/paperclip-closeouts/${COMPANY}/${ISSUE}`))).sort()).toEqual([`${first.snapshotId}.json`, `${reopened.snapshotId}.json`].sort());
  });
  it("labels provider-only hashes unverified and rejects a false verified hash", async () => {
    const repo = await fixture(); const input = snapshot();
    delete input.attachments[0]!.localPath;
    input.attachments[0]!.declaredSha256 = "a".repeat(64);
    const result = await exportCloseout(repo, target, async () => input);
    expect(result.record.attachments).toEqual([{ id: ATTACHMENT, reference: input.attachments[0]!.reference, declaredSha256: "a".repeat(64), verification: "unverified" }]);
    input.attachments[0]!.localPath = "qa/file.txt";
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("attachment hash mismatch");
  });
  it("refuses source or byte churn before publishing a record", async () => {
    const repo = await fixture(); let reads = 0;
    await expect(exportCloseout(repo, target, async () => {
      const input = snapshot(); if (++reads === 2) input.messages[0]!.body = "changed"; return input;
    })).rejects.toThrow("source changed between reads");
    expect(await readdir(repo)).toEqual([".git", "qa"]);
    reads = 0;
    await expect(exportCloseout(repo, target, async () => {
      if (++reads === 2) await writeFile(join(repo, "qa/file.txt"), "other\n"); return snapshot();
    })).rejects.toThrow("attachment changed between reads");
    expect(await readdir(repo)).toEqual([".git", "qa"]);
  });
  it.each(["companyId", "issueId", "threadId", "baseUrl"] as const)("refuses foreign %s", async key => {
    const repo = await fixture(); const input = snapshot();
    input.source[key] = key === "baseUrl" ? "https://foreign.example" : "20000000-0000-4000-8000-000000000001";
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("source target mismatch");
    expect(await readdir(repo)).toEqual([".git", "qa"]);
  });
  it.each(["../outside", "/tmp/file", "qa/../file", "qa\\file", ".git/config", "C:/Users/private/file", "~/file"])("refuses attachment traversal %s", async path => {
    const repo = await fixture(); const input = snapshot(); input.attachments[0]!.localPath = path;
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("safe repository-relative");
  });
  it("refuses symlinked inputs, input ancestors and output directories", async () => {
    const repo = await fixture();
    await symlink("source.json", join(repo, "qa/link.json"));
    await expect(readFrozenFile(repo, "qa/link.json")).rejects.toMatchObject({ code: "ELOOP" });
    await symlink("qa", join(repo, "linked"));
    await expect(readFrozenFile(repo, "linked/source.json")).rejects.toThrow("symlink");
    await mkdir(join(repo, ".agent"));
    await symlink("../qa", join(repo, ".agent/paperclip-closeouts"));
    await expect(exportCloseout(repo, target, async () => snapshot())).rejects.toThrow("symlink");
    expect((await readdir(join(repo, "qa"))).sort()).toEqual(["file.txt", "link.json", "roadmap.md", "source.json"]);
  });
  it("refuses mutation of an existing immutable name and a symlink at its final path", async () => {
    const repo = await fixture();
    const result = await exportCloseout(repo, target, async () => snapshot());
    await writeFile(join(repo, result.path), "tampered");
    await expect(exportCloseout(repo, target, async () => snapshot())).rejects.toThrow("existing immutable export differs");
    await rm(join(repo, result.path));
    await symlink(join(repo, "qa/file.txt"), join(repo, result.path));
    await expect(exportCloseout(repo, target, async () => snapshot())).rejects.toMatchObject({ code: "ELOOP" });
    expect(await readFile(join(repo, "qa/file.txt"), "utf8")).toBe("hello\n");
  });
  it("enforces exact byte bounds and source references", async () => {
    const repo = await fixture(); const input = snapshot();
    await writeFile(join(repo, "qa/file.txt"), Buffer.alloc(MAX_ATTACHMENT_BYTES));
    const boundary = await exportCloseout(repo, target, async () => input);
    const verified = boundary.record.attachments[0]!;
    if (verified.verification !== "verified-bytes") throw new Error("expected verified attachment");
    expect(verified.byteSize).toBe(MAX_ATTACHMENT_BYTES);
    await writeFile(join(repo, "qa/file.txt"), Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("bounded regular file");
    input.decisions[0]!.sourceMessageIds = [INTERACTION];
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("unresolved source message");
  });
  it.each(["http://public.example", "https://user:secret@example.com", "https://example.com/?token=secret"])("refuses unsafe source %s", async baseUrl => {
    const repo = await fixture(); const input = snapshot(); input.source.baseUrl = baseUrl;
    await expect(exportCloseout(repo, { ...target, baseUrl }, async () => input)).rejects.toThrow("HTTPS or loopback");
  });
  it("refuses private absolute-path and signed references", async () => {
    const repo = await fixture(); const input = snapshot();
    input.validationEvidence[0]!.reference = "/Users/private/results.json";
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("safe repository-relative");
    input.validationEvidence[0]!.reference = "https://example.com/file?token=secret";
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("credential-free");
    input.validationEvidence[0]!.reference = "javascript:alert(1)";
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("safe repository-relative");
  });
  it("ignores object-key order while refusing duplicate identities and incomplete source contracts", async () => {
    const repo = await fixture(); const input = snapshot();
    const first = await exportCloseout(repo, target, async () => input);
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    const again = await exportCloseout(repo, target, async () => reordered);
    expect({ id: again.snapshotId, created: again.created }).toEqual({ id: first.snapshotId, created: false });
    input.messages.push(structuredClone(input.messages[0]!));
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("duplicate source identity");
    const incomplete = { ...snapshot(), source: { ...snapshot().source, complete: false } };
    await expect(exportCloseout(repo, target, async () => incomplete)).rejects.toThrow("expected true");
  });
  it("enforces total attachment and frozen-input byte limits at the boundary", async () => {
    const repo = await fixture(); const input = snapshot();
    await writeFile(join(repo, "qa/file.txt"), Buffer.alloc(MAX_ATTACHMENT_BYTES));
    input.attachments.push({ ...input.attachments[0]!, id: INTERACTION });
    const boundary = await exportCloseout(repo, target, async () => input);
    expect(boundary.record.attachments.map(row => row.verification === "verified-bytes" ? row.byteSize : -1)).toEqual([MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_BYTES]);
    await writeFile(join(repo, "qa/one.txt"), "1");
    input.attachments.push({ ...input.attachments[0]!, id: MESSAGE, localPath: "qa/one.txt" });
    await expect(exportCloseout(repo, target, async () => input)).rejects.toThrow("total byte limit");
    const raw = JSON.stringify(snapshot());
    await writeFile(join(repo, "qa/source.json"), raw.padEnd(MAX_SNAPSHOT_BYTES, " "));
    expect(await readFrozenFile(repo, "qa/source.json")).toEqual(snapshot());
    await writeFile(join(repo, "qa/source.json"), raw.padEnd(MAX_SNAPSHOT_BYTES + 1, " "));
    await expect(readFrozenFile(repo, "qa/source.json")).rejects.toThrow("bounded regular file");
  });
  it("runs the actual CLI and returns only the immutable artifact identity", async () => {
    const repo = await fixture();
    const cli = fileURLToPath(new URL("../scripts/paperclip-closeout/cli.ts", import.meta.url));
    const args = ["--import", "tsx", cli, "--repo", repo, "--snapshot", "qa/source.json", "--api", target.baseUrl,
      "--company", COMPANY, "--issue", ISSUE, "--thread", ISSUE];
    const first = spawnSync(process.execPath, args, { encoding: "utf8", env: gitSubprocessEnv() });
    expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: "" });
    const result = JSON.parse(first.stdout);
    expect(Object.keys(result)).toEqual(["path", "snapshotId", "created"]);
    expect(result.created).toBe(true);
    expect(result.snapshotId).toBe(sha256(await readFile(join(repo, result.path))));
    const again = spawnSync(process.execPath, args, { encoding: "utf8", env: gitSubprocessEnv() });
    expect(again.status).toBe(0);
    expect(JSON.parse(again.stdout)).toEqual({ ...result, created: false });
    args[args.indexOf("--company") + 1] = INTERACTION;
    const foreign = spawnSync(process.execPath, args, { encoding: "utf8", env: gitSubprocessEnv() });
    expect({ status: foreign.status, stdout: foreign.stdout, stderr: foreign.stderr }).toEqual({ status: 1, stdout: "",
      stderr: "Closeout refused. Check the frozen-input contract, exact target and local file safety; no task status was changed.\n" });
  });
});
