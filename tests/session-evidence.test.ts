import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_RUN_CHARS,
  READS_LOG,
  contentLines,
  creditRuns,
  mergeRanges,
  parseEvidence,
  readEvidence,
  runnerSession,
  sessionTag,
  subtractRanges,
  type ReadEntry,
} from "../src/session/evidence.js";
import { CLAUDE_TEXT_CAP_BYTES, OTHER_TEXT_CAP_BYTES, recordRead } from "../src/session/read-hook.js";
import { changedHunks, evidenceMode } from "../src/session/certify.js";
import { noteWrite, refresh } from "../src/session/context.js";
import { fingerprint } from "../src/session/inputs.js";
import { refresh as cliRefresh } from "../src/cli/context.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();

const lines = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}: a line long enough to count`);

describe("contentLines", () => {
  it("numbers lines the way an editor does", () => {
    expect(contentLines("")).toEqual([]);
    expect(contentLines("a\nb\n")).toEqual(["a", "b"]);
    expect(contentLines("a\nb")).toEqual(["a", "b"]);
    expect(contentLines("a\n\n")).toEqual(["a", ""]);
  });
});

describe("ranges", () => {
  it("joins adjacent ranges, not only overlapping ones", () => {
    expect(mergeRanges([{ from: 4, to: 6 }, { from: 1, to: 3 }])).toEqual([{ from: 1, to: 6 }]);
    expect(mergeRanges([{ from: 1, to: 3 }, { from: 5, to: 6 }])).toEqual([{ from: 1, to: 3 }, { from: 5, to: 6 }]);
  });

  it("subtracts coverage at its exact boundaries", () => {
    expect(subtractRanges([{ from: 1, to: 10 }], [{ from: 1, to: 10 }])).toEqual([]);
    expect(subtractRanges([{ from: 1, to: 10 }], [{ from: 1, to: 9 }])).toEqual([{ from: 10, to: 10 }]);
    expect(subtractRanges([{ from: 1, to: 10 }], [{ from: 2, to: 10 }])).toEqual([{ from: 1, to: 1 }]);
    expect(subtractRanges([{ from: 1, to: 10 }], [{ from: 3, to: 4 }, { from: 7, to: 8 }])).toEqual([
      { from: 1, to: 2 }, { from: 5, to: 6 }, { from: 9, to: 10 },
    ]);
    expect(subtractRanges([], [{ from: 1, to: 3 }])).toEqual([]);
  });
});

describe("creditRuns — what a shell result showed the model", () => {
  const record = ["# Title of the record", "", ...lines(5, "Entry"), "", "~"];

  it("credits a whole `cat`, blank lines included", () => {
    expect(creditRuns(record, [...record])).toEqual([{ from: 1, to: record.length }]);
  });

  it("credits nothing for output that was discarded (`>/dev/null` leaves stdout empty)", () => {
    expect(creditRuns(record, contentLines(""))).toEqual([]);
  });

  it("credits only the lines a truncating pipe let through", () => {
    // `| head -1`: the title alone carries 17 non-space characters.
    expect(creditRuns(record, record.slice(0, 1))).toEqual([{ from: 1, to: 1 }]);
    // `| tail -1`: a lone `~` says nothing about which record was on screen.
    expect(creditRuns(record, record.slice(-1))).toEqual([]);
  });

  it("credits nothing for numbered output (`cat -n`, `grep -n`)", () => {
    expect(creditRuns(record, record.map((l, i) => `${i + 1}\t${l}`))).toEqual([]);
    expect(creditRuns(record, record.map((l, i) => `${i + 1}:${l}`))).toEqual([]);
  });

  it(`needs a run of at least ${MIN_RUN_CHARS} non-space characters`, () => {
    const exact = ["abcdefgh", "ijklmnop", "unrelated text here"];
    const short = ["abcdefgh", "ijklmno", "unrelated text here"];
    expect(creditRuns(exact, exact.slice(0, 2))).toEqual([{ from: 1, to: 2 }]);
    expect(creditRuns(short, short.slice(0, 2))).toEqual([]);
  });

  it("credits a whole record smaller than the minimum when all of it is shown", () => {
    expect(creditRuns(["# Inbox", "~"], ["# Inbox", "~"])).toEqual([{ from: 1, to: 2 }]);
    expect(creditRuns(["# Inbox", "~"], ["# Inbox"])).toEqual([]);
  });

  it("extends a run back over the blank lines that precede it", () => {
    const shown = ["", ...record.slice(2, 5)];
    expect(creditRuns(record, shown)).toEqual([{ from: 2, to: 5 }]);
  });

  it("finds runs separated by other output", () => {
    const shown = ["header", ...record.slice(2, 4), "── separator ──", ...record.slice(5, 7)];
    expect(creditRuns(record, shown)).toEqual([{ from: 3, to: 4 }, { from: 6, to: 7 }]);
  });
});

describe("evidence log", () => {
  it("counts damaged lines instead of dropping them in silence", () => {
    const good: ReadEntry = { v: 1, kind: "read", at: "2026-10-28T00:00:00.000Z", session: "s", record: "a.md", fingerprint: "f", from: 1, to: 2, lines: 2, via: "Read" };
    const text = [JSON.stringify(good), "{not json", JSON.stringify({ ...good, to: 3 }), JSON.stringify({ ...good, from: 0 }), ""].join("\n");
    const { entries, malformed } = parseEvidence(text);
    expect(entries).toEqual([good]);
    expect(malformed).toBe(3);
  });

  it("identifies the provider session from the environment each provider exports", () => {
    expect(runnerSession({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "abc" })).toEqual({ provider: "claude", tag: sessionTag("abc") });
    expect(runnerSession({ CODEX_THREAD_ID: "t-1" })).toEqual({ provider: "codex", tag: sessionTag("t-1") });
    expect(runnerSession({ CLAUDE_CODE_SESSION_ID: "abc" })).toBeNull();
    expect(runnerSession({})).toBeNull();
  });
});

describe("changedHunks", () => {
  it("reports new-side ranges and removed lines from Git's own diff", async () => {
    const before = ["one", "two", "three", "four", "five"].join("\n") + "\n";
    const after = ["one", "TWO", "three", "five", "six", "seven"].join("\n") + "\n";
    expect(await changedHunks(before, after)).toEqual([
      { from: 2, to: 2, removed: ["two"] },
      { from: 4, to: 3, removed: ["four"] },
      { from: 5, to: 6, removed: [] },
    ]);
  });
});

const SESSION = "11111111-2222-3333-4444-555555555555";
const ENV = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: SESSION };
const DECISIONS = ["# Decisions", "", ...lines(40, "Decision"), ""].join("\n");
const LEARNED = ["# Learned", "", ...lines(12, "Lesson"), ""].join("\n");
const INSTRUCTIONS = ["# Agent instructions", "", ...lines(8, "Rule"), ""].join("\n");

let dir: string, remote: string, source: string, local: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "session-evidence-"));
  remote = join(dir, "remote.git"); source = join(dir, "author"); local = join(dir, "project");
  await git(dir, "init", "--bare", remote);
  await git(dir, "init", "-b", "main", source);
  await git(source, "config", "user.email", "test@example.com");
  await git(source, "config", "user.name", "Test");
  await mkdir(join(source, ".agent"));
  await writeFile(join(source, "morpheus.json"), JSON.stringify({ name: "test", context: { trunk: "origin/main" } }));
  await writeFile(join(source, ".gitignore"), "local/\n");
  await writeFile(join(source, "AGENTS.md"), INSTRUCTIONS);
  await symlink("AGENTS.md", join(source, "CLAUDE.md"));
  await writeFile(join(source, ".agent/decisions.md"), DECISIONS);
  await writeFile(join(source, ".agent/learned.md"), LEARNED);
  await git(source, "add", "."); await git(source, "commit", "-m", "initial");
  await git(source, "remote", "add", "origin", remote); await git(source, "push", "origin", "main");
  await git(dir, "clone", "--branch", "main", remote, local);
  local = await realpath(local);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/**
 * A Claude Code PostToolUse payload for a Read of `rel` lines `from`–`to`, in
 * the shape Claude Code 2.1.x actually sends: it numbers a trailing newline as
 * one more, empty line, so a Read reaching end-of-file (`to` omitted) returns
 * the text with its final newline and `totalLines` one above an editor's count.
 */
async function readPayload(root: string, rel: string, from?: number, to?: number, session = SESSION): Promise<string> {
  const path = join(root, rel);
  const claude = (await readFile(path, "utf8")).split("\n");
  const start = from ?? 1;
  const end = to ?? claude.length;
  return JSON.stringify({
    session_id: session, cwd: root, hook_event_name: "PostToolUse", tool_name: "Read",
    tool_input: { file_path: path, offset: start, limit: end - start + 1 },
    tool_response: { type: "text", file: { filePath: path, content: claude.slice(start - 1, end).join("\n"), numLines: end - start + 1, startLine: start, totalLines: claude.length } },
  });
}

/** A Claude Code PostToolUse payload for a Bash call whose stdout was `stdout`. */
function bashPayload(root: string, stdout: string, session = SESSION): string {
  return JSON.stringify({
    session_id: session, cwd: root, hook_event_name: "PostToolUse", tool_name: "Bash",
    tool_input: { command: "…" }, tool_response: { stdout, stderr: "", interrupted: false, isImage: false },
  });
}

async function readAll(root: string): Promise<void> {
  for (const rel of ["AGENTS.md", ".agent/decisions.md", ".agent/learned.md"]) await recordRead(await readPayload(root, rel));
}

const reads = async (root: string) => (await readEvidence(root)).entries.filter((e): e is ReadEntry => e.kind === "read");

describe("the read hook", () => {
  it("records a Read at the record's fingerprint, and marks the session live", async () => {
    await recordRead(await readPayload(local, ".agent/decisions.md"));
    const { entries } = await readEvidence(local);
    expect(entries[0]).toMatchObject({ kind: "live", session: sessionTag(SESSION), provider: "claude" });
    expect(entries.slice(1)).toEqual([
      expect.objectContaining({ record: ".agent/decisions.md", fingerprint: fingerprint(DECISIONS), from: 1, to: 42, lines: 42, via: "Read" }),
    ]);
  });

  it("credits a whole-file Read in Claude's end-of-file shape", async () => {
    const payload = JSON.parse(await readPayload(local, ".agent/decisions.md")) as { tool_response: { file: { content: string; numLines: number; totalLines: number } } };
    // The real shape: the text with its final newline, and one line more than an editor counts.
    expect(payload.tool_response.file.content).toBe(DECISIONS);
    expect(payload.tool_response.file.totalLines).toBe(43);
    await recordRead(JSON.stringify(payload));
    expect((await reads(local)).map((r) => [r.from, r.to, r.lines])).toEqual([[1, 42, 42]]);
  });

  it("credits a tail Read that reaches end-of-file — where new entries are appended", async () => {
    await recordRead(await readPayload(local, ".agent/decisions.md", 30));
    expect((await reads(local)).map((r) => [r.from, r.to])).toEqual([[30, 42]]);
  });

  it("refuses end-of-file content with anything but exactly the one trailing newline", async () => {
    const payload = JSON.parse(await readPayload(local, ".agent/decisions.md", 30)) as { tool_response: { file: { content: string } } };
    const exact = payload.tool_response.file.content;
    for (const content of [exact + "\n", exact.slice(0, -1) + " \n"]) {
      payload.tool_response.file.content = content;
      await recordRead(JSON.stringify(payload));
    }
    expect(await reads(local)).toEqual([]);
  });

  it("credits CLAUDE.md for a Read of AGENTS.md, which it links to", async () => {
    await recordRead(await readPayload(local, "AGENTS.md"));
    expect((await reads(local)).map((r) => r.record)).toEqual(["CLAUDE.md"]);
  });

  it("refuses a Read whose returned content is not what is on disk", async () => {
    const payload = JSON.parse(await readPayload(local, ".agent/decisions.md", 1, 5)) as { tool_response: { file: { content: string } } };
    payload.tool_response.file.content = "something else entirely";
    await recordRead(JSON.stringify(payload));
    expect(await reads(local)).toEqual([]);
    // Still live: the hook saw and understood a result.
    expect((await readEvidence(local)).entries.map((e) => e.kind)).toEqual(["live"]);
  });

  it("credits nothing but liveness for a `cat … >/dev/null`", async () => {
    await recordRead(bashPayload(local, ""));
    expect((await readEvidence(local)).entries.map((e) => e.kind)).toEqual(["live"]);
  });

  it("credits shell output up to the Claude cap and nothing past it", async () => {
    // ~30 KB: the size at which Claude Code keeps the text in stdout but shows
    // the model only a persisted preview.
    const big = Array.from({ length: 600 }, (_, i) => `Big ${String(i).padStart(3, "0")}: ${"x".repeat(40)}`);
    await writeFile(join(local, ".agent/learned.md"), big.join("\n") + "\n");
    const all = big.join("\n");
    expect(Buffer.byteLength(all)).toBeGreaterThan(CLAUDE_TEXT_CAP_BYTES);
    const fits = big.slice(0, Math.floor(CLAUDE_TEXT_CAP_BYTES / (big[0]!.length + 1)));
    // Padding the last shown line changes it, so the run ends one line earlier.
    const atCap = fits.join("\n").padEnd(CLAUDE_TEXT_CAP_BYTES, " ");
    expect(Buffer.byteLength(atCap)).toBe(CLAUDE_TEXT_CAP_BYTES);
    await recordRead(bashPayload(local, atCap));
    await recordRead(bashPayload(local, atCap + " "));
    await recordRead(bashPayload(local, all));
    const credited = (await reads(local)).filter((r) => r.record === ".agent/learned.md");
    expect(credited.map((c) => [c.from, c.to])).toEqual([[1, fits.length - 1]]);
  });

  it("credits the output Claude reports for a Bash that exited non-zero", async () => {
    await recordRead(JSON.stringify({
      session_id: SESSION, cwd: local, hook_event_name: "PostToolUseFailure", tool_name: "Bash",
      tool_input: { command: "morpheus context refresh" }, error: `Exit code 1\n${LEARNED}`,
    }));
    expect(await reads(local)).toEqual([expect.objectContaining({ record: ".agent/learned.md", from: 1, to: 14, via: "Bash" })]);
  });

  it("uses Codex's lower cap for a Codex payload", async () => {
    const codex = (output: string) => JSON.stringify({
      session_id: "thread", turn_id: "t", cwd: local, hook_event_name: "PostToolUse", tool_name: "shell",
      tool_input: {}, tool_response: output, model: "m", permission_mode: "default", tool_use_id: "u", transcript_path: null,
    });
    await recordRead(codex(LEARNED));
    await recordRead(codex(LEARNED.padEnd(OTHER_TEXT_CAP_BYTES + 1, " ")));
    const entries = (await readEvidence(local)).entries;
    expect(entries.filter((e) => e.kind === "live")).toEqual([expect.objectContaining({ provider: "codex", session: sessionTag("thread") })]);
    expect(entries.filter((e) => e.kind === "read")).toHaveLength(1);
  });

  it("writes nothing — not even liveness — for a result it cannot understand", async () => {
    await recordRead(JSON.stringify({ session_id: SESSION, cwd: local, hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: { exit: 0 } }));
    await expect(readFile(join(local, READS_LOG))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never writes into a checkout that does not ignore local/", async () => {
    await writeFile(join(local, ".gitignore"), "node_modules/\n");
    await recordRead(await readPayload(local, ".agent/decisions.md"));
    await expect(readFile(join(local, READS_LOG))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("evidence mode", () => {
  it("falls back to the assertion outside a provider session, and when no hook has run in this one", async () => {
    expect((await evidenceMode(local, {})).kind).toBe("unhooked");
    expect((await evidenceMode(local, ENV)).kind).toBe("unhooked");
    await recordRead(bashPayload(local, "", "another-session"));
    expect((await evidenceMode(local, ENV)).kind).toBe("unhooked");
    await recordRead(bashPayload(local, ""));
    expect((await evidenceMode(local, ENV)).kind).toBe("recorded");
    expect((await evidenceMode(local, { ...ENV, MORPHEUS_READ_EVIDENCE: "off" })).kind).toBe("override");
  });
});

describe("refresh with read evidence", () => {
  const T0 = new Date("2026-10-28T12:00:00.000Z");
  const T1 = new Date("2026-10-28T12:03:00.000Z");

  it("refuses a session whose hook is live but which read nothing — the `>/dev/null` ritual", async () => {
    await recordRead(bashPayload(local, ""));
    const result = await refresh(local, T0, { env: ENV });
    expect(result.lease).toBeNull();
    expect(result.written).toBe(false);
    expect(result.evidence.requirements.map((r) => [r.id, r.reason, r.missing])).toEqual([
      ["CLAUDE.md", "full", [{ from: 1, to: 10 }]],
      [".agent/decisions.md", "full", [{ from: 1, to: 42 }]],
      [".agent/learned.md", "full", [{ from: 1, to: 14 }]],
    ]);
  });

  it("certifies from whole-file Reads of every required record", async () => {
    await readAll(local);
    const result = await refresh(local, T0, { env: ENV });
    expect(result.evidence.mode.kind).toBe("recorded");
    expect(result.evidence.requirements.map((r) => [r.id, r.missing])).toEqual([
      ["CLAUDE.md", []], [".agent/decisions.md", []], [".agent/learned.md", []],
    ]);
    expect(result.lease?.status).toBe("fresh");
    expect(result.lease?.receipt.evidence).toBe("recorded");
  });

  it("certifies from accumulated partial Read ranges, and names the exact gap otherwise", async () => {
    await recordRead(await readPayload(local, "AGENTS.md"));
    await recordRead(await readPayload(local, ".agent/learned.md"));
    await recordRead(await readPayload(local, ".agent/decisions.md", 1, 20));
    await recordRead(await readPayload(local, ".agent/decisions.md", 22, 42));
    const gap = await refresh(local, T0, { env: ENV });
    expect(gap.evidence.requirements.filter((r) => r.missing.length).map((r) => [r.id, r.missing])).toEqual([
      [".agent/decisions.md", [{ from: 21, to: 21 }]],
    ]);

    await recordRead(await readPayload(local, ".agent/decisions.md", 21, 21));
    const done = await refresh(local, T0, { env: ENV });
    expect(done.lease?.status).toBe("fresh");
    expect(done.lease?.receipt.evidence).toBe("recorded");
  });

  it("extends an unchanged receipt without asking for any reading", async () => {
    await readAll(local);
    const first = await refresh(local, T0, { env: ENV });
    expect(first.extended).toBe(false);

    // Nothing new in the log, and nothing moved.
    const second = await refresh(local, T1, { env: ENV });
    expect(second.extended).toBe(true);
    expect(second.evidence.requirements).toEqual([]);
    expect(second.lease?.status).toBe("fresh");
    expect(second.lease?.receipt.id).toBe(first.lease?.receipt.id);
    expect(second.lease?.receipt.createdAt).toBe(T0.toISOString());
    expect(second.lease?.checkedAt).toBe(T1.toISOString());
  });

  it("refuses a changed record until the log covers the changed lines at the new content", async () => {
    await readAll(local);
    await refresh(local, T0, { env: ENV });

    const edited = DECISIONS.replace("Decision 10: a line long enough to count", "Decision 10: rewritten after the receipt");
    await writeFile(join(local, ".agent/decisions.md"), edited + "Decision 41: appended later\n");

    const refused = await refresh(local, T1, { env: ENV });
    expect(refused.lease).toBeNull();
    // Only the delta — not the whole 43-line record — and the evidence of the
    // full read at the *old* fingerprint does not count for it.
    expect(refused.evidence.requirements).toEqual([
      expect.objectContaining({ id: ".agent/decisions.md", reason: "changed", needed: [{ from: 12, to: 12 }, { from: 43, to: 43 }], missing: [{ from: 12, to: 12 }, { from: 43, to: 43 }] }),
    ]);

    // Read the two changed lines (with context, as refresh prints them).
    const now = contentLines(await readFile(join(local, ".agent/decisions.md"), "utf8"));
    await recordRead(bashPayload(local, now.slice(10, 13).join("\n")));
    await recordRead(bashPayload(local, now.slice(40, 43).join("\n")));
    const certified = await refresh(local, T1, { env: ENV });
    expect(certified.lease?.status).toBe("fresh");
    expect(certified.extended).toBe(false);
    expect(certified.lease?.receipt.inputs.find((i) => i.id === ".agent/decisions.md")?.fingerprint).toBe(fingerprint(edited + "Decision 41: appended later\n"));
  });

  it("never extends an asserted receipt once the hook is live", async () => {
    // Taken with no hook watching: an assertion.
    const asserted = await refresh(local, T0, { env: ENV });
    expect(asserted.lease?.receipt.evidence).toBe("asserted");

    await recordRead(bashPayload(local, ""));
    const next = await refresh(local, T1, { env: ENV });
    expect(next.extended).toBe(false);
    expect(next.lease).toBeNull();
    expect(next.evidence.requirements.every((r) => r.reason === "full")).toBe(true);
  });

  it("does not call a missing record unchanged because it was missing last time too", async () => {
    await rm(join(local, ".agent/learned.md"));
    await refresh(local, T0, { env: {} });
    const again = await refresh(local, T1, { env: {} });
    expect(again.extended).toBe(false);
    expect(again.lease?.status).toBe("refresh_required");
    expect(again.lease?.unresolvableInputs).toEqual([".agent/learned.md"]);
  });

  it("falls back to the assertion, visibly, where no hook is watching", async () => {
    const result = await refresh(local, T0, { env: {} });
    expect(result.lease?.status).toBe("fresh");
    expect(result.lease?.receipt.evidence).toBe("asserted");
    expect(result.evidence.mode).toEqual({ kind: "unhooked", reason: expect.stringContaining("not a Claude Code or Codex session") });
  });

  it("does not ask a session to read back its own write", async () => {
    await readAll(local);
    await refresh(local, T0, { env: ENV });
    const path = join(local, ".agent/learned.md");
    const before = await readFile(path, "utf8");
    await appendFile(path, "Lesson 13: written by this session\n");
    await noteWrite(local, [{ path, before }]);

    const after = await refresh(local, T1, { env: ENV });
    expect(after.extended).toBe(true);
    expect(after.evidence.requirements).toEqual([]);
  });

  it("counts reads made in another checkout of the same content", async () => {
    // `pm claim` prepares a task worktree at the same trunk; reading the
    // identical records again there is the waste this avoids.
    const task = join(dir, "task");
    await git(local, "worktree", "add", "--detach", task);
    await readAll(local);
    const result = await refresh(await realpath(task), T0, { env: ENV });
    expect(result.lease?.status).toBe("fresh");
    expect(result.lease?.receipt.evidence).toBe("recorded");
  });
});

describe("context refresh output", () => {
  it("prints the changed lines raw, so a second refresh can be certified by the first one's output", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, ENV);
    delete process.env["MORPHEUS_READ_EVIDENCE"];
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await readAll(local);
      expect(await cliRefresh(local, false)).toBe(0);
      await writeFile(join(local, ".agent/learned.md"), LEARNED.replace("Lesson 7: a line long enough to count", "~"));

      log.mockClear();
      expect(await cliRefresh(local, false)).toBe(1);
      const printed = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(printed).toContain(".agent/learned.md — changed since your last receipt; unread lines 9 of 14");
      // The recovery advice names the shell-output limit and the declared escape.
      expect(printed).toContain("shell output over 20 KB (8 KB in Codex) is not credited");
      expect(printed).toContain("`MORPHEUS_READ_EVIDENCE=off morpheus context refresh` certifies by assertion");
      // Context carries the one-character line past the minimum run.
      expect(printed).toContain(["Lesson 5: a line long enough to count", "Lesson 6: a line long enough to count", "~"].join("\n"));

      // What Claude reports for that exit-1 Bash call is what the hook sees.
      await recordRead(JSON.stringify({
        session_id: SESSION, cwd: local, hook_event_name: "PostToolUseFailure", tool_name: "Bash",
        tool_input: { command: "morpheus context refresh" }, error: `Exit code 1\n${printed}`,
      }));
      log.mockClear();
      expect(await cliRefresh(local, false)).toBe(0);
      expect(log.mock.calls.map((c) => String(c[0])).join("\n")).toContain("Read evidence covers: .agent/learned.md (changed lines)");

      log.mockClear();
      expect(await cliRefresh(local, false)).toBe(0);
      expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/Context unchanged since .* Receipt extended; nothing to re-read\./);
    } finally {
      process.env = saved;
    }
  });
});
