import { posix } from "node:path";
import { z } from "zod";
import { canonical, exclusive, FrozenSnapshot, MAX_ATTACHMENT_BYTES, MAX_SNAPSHOT_BYTES, readBytes, repositoryRoot, ROOT, sha256, validate } from "./export.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reference = FrozenSnapshot.shape.attachments.element.omit({ localPath: true });
const StoredRecord = FrozenSnapshot.omit({ attachments: true }).extend({
  attachments: z.array(z.discriminatedUnion("verification", [
    reference.extend({ verification: z.literal("unverified") }).strict(),
    reference.extend({ verification: z.literal("verified-bytes"), sha256: hash,
      byteSize: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES), path: z.string() }).strict(),
  ])).max(100),
  freeze: z.object({
    method: z.literal("matching-complete-operator-read-sets-v1"), atomic: z.literal(false),
    inputSha256: hash,
    limitation: z.literal("Matching reads detect observed churn; operator completeness, upstream revision/cursor and absence of intervening changes are not independently proven."),
  }).strict(),
}).strict();
export type CloseoutRecord = z.infer<typeof StoredRecord>;
export const MAX_RECORD_BYTES = MAX_SNAPSHOT_BYTES + 128 * 1024;
export const MAX_MARKDOWN_BYTES = MAX_RECORD_BYTES * 2;

/** Verify canonical bytes and their exact content-addressed repository identity. */
export function verifyRecord(bytes: Buffer, path: string): { record: CloseoutRecord; snapshotId: string } {
  if (bytes.length > MAX_RECORD_BYTES) throw new Error("record exceeded byte limit");
  const record = StoredRecord.parse(JSON.parse(bytes.toString("utf8")));
  const { freeze: _freeze, attachments, ...content } = record;
  const normalized = validate({ ...content, attachments: attachments.map(({ id, reference, declaredSha256 }) =>
    ({ id, reference, ...(declaredSha256 ? { declaredSha256 } : {}) })) }, record.source);
  if (normalized.source.baseUrl !== record.source.baseUrl) throw new Error("source origin is not canonical");
  if (!bytes.equals(Buffer.from(`${canonical(record)}\n`))) throw new Error("record is not canonical");
  const snapshotId = sha256(bytes);
  if (path !== `${ROOT}/${record.source.companyId}/${record.source.issueId}/${snapshotId}.json`) {
    throw new Error("record path or source hash mismatch");
  }
  let total = 0;
  for (const item of attachments) {
    if (item.verification !== "verified-bytes") continue;
    if (item.path !== `${ROOT}/blobs/${item.sha256}.bin` ||
        (item.declaredSha256 && item.declaredSha256 !== item.sha256)) throw new Error("attachment identity mismatch");
    total += item.byteSize;
  }
  if (total > 32 * 1024 * 1024) throw new Error("attachments exceeded total byte limit");
  return { record, snapshotId };
}

// Every untrusted value is display text inside a fence longer than any run in
// that value. Raw HTML, links and code fences cannot escape into active Markdown.
export function displayText(value: string): string {
  let longest = 0;
  for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${value}\n${fence}\n`;
}
const jsonText = (value: unknown) => displayText(JSON.stringify(value, null, 2));

/** A deterministic view of the complete stored record, never a new source claim. */
export function renderMarkdown(bytes: Buffer, path: string): Buffer {
  const { record: r, snapshotId } = verifyRecord(bytes, path);
  const lines = [
    "# Paperclip conversation closeout", "", displayText(`${r.issue.title}\nStatus: ${r.issue.status}`),
    `Canonical snapshot: [${snapshotId}.json](./${snapshotId}.json)`, "",
    "Operator-frozen observations; upstream atomicity/completeness, acceptance authority and PM completion are not independently established.", "",
  ];
  if (r.issue.description !== null) lines.push("## Context", "", displayText(r.issue.description));
  lines.push("## Conversation", "");
  for (const [index, message] of r.messages.entries()) {
    lines.push(`### Message ${index + 1}`, "",
      displayText(`${message.author.kind}: ${message.author.id}\nCreated: ${message.createdAt} | Updated: ${message.updatedAt}`),
      displayText(message.body));
  }
  lines.push("## Decisions", "");
  for (const decision of r.decisions) lines.push(displayText(decision.summary));
  lines.push("## Accepted structured answers", "", "Acceptance below is the operator's recorded claim.", "");
  for (const [index, answer] of r.acceptedAnswers.entries()) {
    lines.push(`### Accepted answer ${index + 1}`, "",
      displayText(`${answer.kind}\nAccepted: ${answer.acceptedAt} | By ${answer.acceptedBy.kind}: ${answer.acceptedBy.id}`),
      "#### Questions", "", jsonText(answer.questions), "#### Answers", "", jsonText(answer.answers));
  }
  lines.push("## Validation evidence", "", "Outcomes are recorded claims; the renderer does not execute or evaluate them.", "");
  for (const evidence of r.validationEvidence) {
    lines.push(displayText(`${evidence.outcome}: ${evidence.description}\nReference: ${evidence.reference}`));
  }
  lines.push("## Attachments", "");
  for (const item of r.attachments) {
    lines.push(item.verification === "verified-bytes" ? "### Verified stored attachment" : "### Unverified attachment reference", "", displayText(item.reference));
    if (item.verification === "verified-bytes") {
      lines.push(`Verified stored bytes: [${item.sha256}.bin](${posix.relative(posix.dirname(path), item.path)}) (${item.byteSize} bytes)`, "");
    } else lines.push("Unverified reference; remote bytes and availability were not verified.", "");
  }
  lines.push("## Provenance and audit details", "",
    `SHA-256 of exact canonical JSON bytes: ${snapshotId}`, "",
    "These details retain the complete source bounds, freeze limitation, identities and cross-references behind the readable sections above.", "",
    jsonText({ version: r.version, source: r.source, freeze: r.freeze, issue: r.issue,
      messages: r.messages.map(({ body: _body, ...metadata }) => metadata),
      decisions: r.decisions.map(({ summary: _summary, ...metadata }) => metadata),
      acceptedAnswers: r.acceptedAnswers.map(({ questions: _questions, answers: _answers, ...metadata }) => metadata),
      validationEvidence: r.validationEvidence, attachments: r.attachments }));
  const result = Buffer.from(`${lines.join("\n")}\n`);
  if (result.length > MAX_MARKDOWN_BYTES) throw new Error("Markdown exceeded byte limit");
  return result;
}

export async function renderCloseout(repo: string, path: string) {
  const root = await repositoryRoot(repo);
  const bytes = await readBytes(root, path, MAX_RECORD_BYTES);
  const { record, snapshotId } = verifyRecord(bytes, path);
  for (const item of record.attachments) {
    if (item.verification !== "verified-bytes") continue;
    const blob = await readBytes(root, item.path, MAX_ATTACHMENT_BYTES);
    if (blob.length !== item.byteSize || sha256(blob) !== item.sha256) throw new Error("attachment bytes mismatch");
  }
  const markdown = renderMarkdown(bytes, path);
  if (!(await readBytes(root, path, MAX_RECORD_BYTES)).equals(bytes)) throw new Error("canonical record changed during render");
  const markdownPath = path.slice(0, -5) + ".md";
  const created = await exclusive(root, markdownPath, markdown);
  return { path: markdownPath, canonicalPath: path, snapshotId, created };
}
