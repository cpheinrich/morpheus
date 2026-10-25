import { execFileSync } from "node:child_process";
import { gitSubprocessEnv } from "../../src/git-env.js";
import { MAX_ATTACHMENT_BYTES, repositoryRoot, ROOT, sha256 } from "./export.js";
import { MAX_MARKDOWN_BYTES, MAX_RECORD_BYTES, renderMarkdown, verifyRecord } from "./markdown.js";

type Entry = { mode: string; oid: string };
const MAX_TREE_BYTES = 32 * 1024 * 1024;
const MAX_ADDITIONS = 1000;
const MAX_READ_BYTES = 128 * 1024 * 1024;

/** A bounded comparison of exact committed objects; it never reads checkout files. */
export async function validateHistory(repo: string, base: string, head: string) {
  const root = await repositoryRoot(repo);
  const git = (...args: string[]) => execFileSync("git", ["--no-replace-objects", ...args], {
    cwd: root, env: gitSubprocessEnv(), maxBuffer: MAX_TREE_BYTES, stdio: "pipe",
  });
  for (const commit of [base, head]) {
    if (!/^[a-f0-9]{40}$/.test(commit) ||
        git("rev-parse", "--verify", `${commit}^{commit}`).toString().trim() !== commit) {
      throw new Error("base and head must be exact verified commit IDs");
    }
  }
  // Comparing trees directly includes base-only records even when branches diverge.
  const tree = (commit: string) => {
    const entries = new Map<string, Entry>();
    for (const row of git("ls-tree", "-r", "-z", "--full-tree", commit).toString("utf8").split("\0")) {
      if (!row) continue;
      const match = /^(\d{6}) (?:blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(row);
      if (!match) throw new Error("unsupported committed tree entry");
      const mode = match[1]!, oid = match[2]!, path = match[3]!;
      const lower = path.toLowerCase();
      if (lower === ".agent" || lower === ROOT || lower.startsWith(`${ROOT}/`)) {
        if (!path.startsWith(`${ROOT}/`) || !path.startsWith(".agent/") ||
            path.slice(0, ROOT.length) !== ROOT || mode !== "100644") throw new Error("unsafe closeout path or mode");
        entries.set(path, { mode, oid });
      }
    }
    return entries;
  };
  const before = tree(base), after = tree(head);
  for (const [path, entry] of before) {
    const current = after.get(path);
    if (!current || current.mode !== entry.mode || current.oid !== entry.oid) throw new Error("existing closeout history changed");
  }
  const added = [...after.keys()].filter(path => !before.has(path));
  if (added.length > MAX_ADDITIONS) throw new Error("too many closeout additions");
  let readBytes = 0;
  const cache = new Map<string, Buffer>();
  const read = (path: string, limit: number) => {
    const entry = after.get(path);
    if (!entry) throw new Error("referenced closeout object missing");
    const previous = cache.get(path);
    if (previous) {
      if (previous.length > limit) throw new Error("object exceeded byte limit");
      return previous;
    }
    const size = Number(git("cat-file", "-s", entry.oid).toString().trim());
    if (!Number.isSafeInteger(size) || size < 0 || size > limit || readBytes + size > MAX_READ_BYTES) throw new Error("object exceeded byte limit");
    const bytes = git("cat-file", "blob", entry.oid);
    if (bytes.length !== size) throw new Error("object size mismatch");
    readBytes += size; cache.set(path, bytes);
    return bytes;
  };
  const record = (path: string) => {
    const bytes = read(path, MAX_RECORD_BYTES);
    const verified = verifyRecord(bytes, path);
    for (const item of verified.record.attachments) {
      if (item.verification !== "verified-bytes") continue;
      const blob = read(item.path, MAX_ATTACHMENT_BYTES);
      if (blob.length !== item.byteSize || sha256(blob) !== item.sha256) throw new Error("attachment bytes mismatch");
    }
    return bytes;
  };
  for (const path of added) {
    const blob = new RegExp(`^\\.agent/paperclip-closeouts/blobs/([a-f0-9]{64})\\.bin$`).exec(path);
    if (blob) {
      if (sha256(read(path, MAX_ATTACHMENT_BYTES)) !== blob[1]) throw new Error("blob digest mismatch");
    } else if (path.endsWith(".json")) record(path);
    else if (path.endsWith(".md")) {
      const jsonPath = path.slice(0, -3) + ".json";
      if (!read(path, MAX_MARKDOWN_BYTES).equals(renderMarkdown(record(jsonPath), jsonPath))) throw new Error("Markdown does not match canonical snapshot");
    } else throw new Error("unexpected closeout path");
  }
  return { base, head, preserved: before.size, added: added.length };
}
