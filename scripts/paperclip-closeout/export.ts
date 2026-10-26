import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { gitSubprocessEnv } from "../../src/git-env.js";

const text = z.string().min(1).max(100_000).refine(value => value.trim().length !== 0, "expected nonblank text");
const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true });
const actor = z.object({ kind: z.enum(["user", "agent", "system"]), id: text }).strict();
const json = z.json();
const attachment = z.object({
  id: uuid, reference: text, declaredSha256: digest.optional(), localPath: text.optional(),
}).strict();

/** Normalized operator contract, deliberately distinct from Paperclip's API types. */
export const FrozenSnapshot = z.object({
  version: z.literal(1),
  source: z.object({
    baseUrl: z.string().url(), companyId: uuid, issueId: uuid, threadId: text,
    revision: text, cursor: text.nullable(),
    contract: z.literal("operator-frozen-v1"),
    complete: z.literal(true),
  }).strict(),
  issue: z.object({ title: text, description: z.string().max(1_000_000).nullable(), status: text, updatedAt: instant }).strict(),
  messages: z.array(z.object({ id: uuid, author: actor, body: z.string().max(1_000_000), createdAt: instant, updatedAt: instant }).strict()).max(2000),
  decisions: z.array(z.object({ id: text, summary: text, sourceMessageIds: z.array(uuid).min(1).max(100) }).strict()).max(500),
  acceptedAnswers: z.array(z.object({
    interactionId: uuid, kind: text, acceptedAt: instant, acceptedBy: actor,
    sourceMessageIds: z.array(uuid).max(100), questions: json, answers: json,
  }).strict()).max(500),
  validationEvidence: z.array(z.object({ id: text, description: text, outcome: z.enum(["passed", "failed", "not-run"]), reference: text }).strict()).max(500),
  attachments: z.array(attachment).max(100),
}).strict();
export type Snapshot = z.infer<typeof FrozenSnapshot>;
export type Target = { baseUrl: string; companyId: string; issueId: string; threadId: string };
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 32 * 1024 * 1024;
export const ROOT = ".agent/paperclip-closeouts";
export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

// Sorting object keys gives the frozen contract one byte representation. Arrays
// retain source order: reordering a conversation is itself a source change.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function origin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw new Error("source must use HTTPS or loopback HTTP without credentials, query or path");
  }
  return url.origin;
}
function parts(path: string): string[] {
  const result = path.split("/");
  if (path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path) || /^[a-z][a-z0-9+.-]*:/i.test(path) ||
      result[0] === "~" || result.some(p => !p || p === "." || p === "..") || result[0]?.toLowerCase() === ".git") {
    throw new Error("expected a safe repository-relative path");
  }
  return result;
}
function safeReference(reference: string): void {
  if (!reference.includes("://")) { parts(reference); return; }
  const url = new URL(reference);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw new Error("references must be credential-free HTTPS, loopback HTTP or repository-relative paths");
  }
}
async function directory(repo: string, components: string[], create = false): Promise<string> {
  let current = repo;
  for (const component of components) {
    current = join(current, component);
    if (create) {
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("repository path contains a symlink or non-directory");
  }
  return current;
}
export async function readBytes(repo: string, path: string, max: number): Promise<Buffer> {
  const components = parts(path);
  await directory(repo, components.slice(0, -1));
  const handle = await open(join(repo, ...components), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > max) throw new Error("input must be a bounded regular file");
    // A bounded read also protects against growth after the initial stat.
    const buffer = Buffer.alloc(max + 1);
    let size = 0;
    while (size < buffer.length) {
      const chunk = await handle.read(buffer, size, buffer.length - size, null);
      if (chunk.bytesRead === 0) break;
      size += chunk.bytesRead;
    }
    const after = await handle.stat();
    if (size > max || size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error("input changed during read or exceeded byte limit");
    }
    return buffer.subarray(0, size);
  } finally { await handle.close(); }
}
export async function repositoryRoot(repo: string): Promise<string> {
  const root = await realpath(repo);
  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, env: gitSubprocessEnv(), encoding: "utf8", stdio: "pipe" }).trim();
  if (await realpath(top) !== root) throw new Error("--repo must name the Git repository root");
  return root;
}
export function validate(value: unknown, target: Target): Snapshot {
  const snapshot = FrozenSnapshot.parse(value);
  uuid.parse(target.companyId); uuid.parse(target.issueId);
  if (origin(snapshot.source.baseUrl) !== origin(target.baseUrl) || snapshot.source.companyId !== target.companyId ||
      snapshot.source.issueId !== target.issueId || snapshot.source.threadId !== target.threadId) throw new Error("source target mismatch");
  snapshot.source.baseUrl = origin(snapshot.source.baseUrl);
  for (const rows of [snapshot.messages, snapshot.decisions, snapshot.validationEvidence, snapshot.attachments]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("duplicate source identity");
  }
  if (new Set(snapshot.acceptedAnswers.map(row => row.interactionId)).size !== snapshot.acceptedAnswers.length) throw new Error("duplicate interaction identity");
  const ids = new Set(snapshot.messages.map(row => row.id));
  for (const row of [...snapshot.decisions, ...snapshot.acceptedAnswers]) {
    if (row.sourceMessageIds.some(id => !ids.has(id))) throw new Error("unresolved source message reference");
  }
  for (const row of [...snapshot.attachments, ...snapshot.validationEvidence]) safeReference(row.reference);
  return snapshot;
}

export async function readFrozenFile(repo: string, path: string): Promise<unknown> {
  return JSON.parse((await readBytes(await repositoryRoot(repo), path, MAX_SNAPSHOT_BYTES)).toString("utf8"));
}

/** No network access, Git commit, PM update or upstream mutation occurs here. */
export async function exportCloseout(repo: string, target: Target, readSource: () => Promise<unknown>) {
  const root = await repositoryRoot(repo);
  const first = validate(await readSource(), target);
  if (Buffer.byteLength(canonical(first)) > MAX_SNAPSHOT_BYTES) throw new Error("snapshot exceeded byte limit");
  let total = 0;
  const blobs: Array<{ path: string; bytes: Buffer }> = [];
  const attachments = [];
  for (const item of first.attachments) {
    const { localPath, ...reference } = item;
    if (!localPath) { attachments.push({ ...reference, verification: "unverified" as const }); continue; }
    const bytes = await readBytes(root, localPath, MAX_ATTACHMENT_BYTES);
    total += bytes.length;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("attachments exceeded total byte limit");
    const hash = sha256(bytes);
    if (item.declaredSha256 && item.declaredSha256 !== hash) throw new Error("attachment hash mismatch");
    const path = `${ROOT}/blobs/${hash}.bin`;
    blobs.push({ path, bytes });
    attachments.push({ ...reference, verification: "verified-bytes" as const, sha256: hash, byteSize: bytes.length, path });
  }
  const second = validate(await readSource(), target);
  if (canonical(first) !== canonical(second)) throw new Error("source changed between reads; no closeout written");
  // Bind the attachment bytes to the same stable read window as the source.
  for (const item of first.attachments) {
    if (!item.localPath) continue;
    const again = await readBytes(root, item.localPath, MAX_ATTACHMENT_BYTES);
    const stored = attachments.find(row => row.id === item.id)!;
    if (!("sha256" in stored) || sha256(again) !== stored.sha256) throw new Error("attachment changed between reads; no closeout written");
  }
  const { attachments: _inputs, ...content } = first;
  const record = {
    ...content, attachments,
    freeze: { method: "matching-complete-operator-read-sets-v1", atomic: false,
      inputSha256: sha256(canonical(first)),
      limitation: "Matching reads detect observed churn; operator completeness, upstream revision/cursor and absence of intervening changes are not independently proven." },
  };
  const bytes = Buffer.from(`${canonical(record)}\n`);
  const snapshotId = sha256(bytes);
  const path = `${ROOT}/${target.companyId}/${target.issueId}/${snapshotId}.json`;
  // Validate the entire output route before creating any blobs.
  await directory(root, parts(path).slice(0, -1), true);
  for (const blob of blobs) await exclusive(root, blob.path, blob.bytes);
  const created = await exclusive(root, path, bytes);
  return { path, snapshotId, created, record };
}

export async function exclusive(repo: string, path: string, bytes: Buffer): Promise<boolean> {
  const components = parts(path);
  const parent = await directory(repo, components.slice(0, -1), true);
  const temporary = join(parent, `.pending-${randomUUID()}`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.close();
    await directory(repo, components.slice(0, -1));
    // A hard link publishes complete bytes atomically and refuses existing names.
    try { await link(temporary, join(repo, ...components)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!(await readBytes(repo, path, bytes.length)).equals(bytes)) throw new Error("existing immutable export differs");
      return false;
    }
    return true;
  } finally { await handle.close(); await unlink(temporary); }
}
