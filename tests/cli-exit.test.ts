import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The compiled entry point is what agents pipe; src/cli/index.ts decides how it exits.
const cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
// A handle nothing will clear: an ordinary command must still exit despite it.
const linger = "data:text/javascript,setInterval(()=>{},1000)";
const ROWS = 1200;
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cli-exit-"));
  const dir = join(root, "hq/product/roadmap");
  await mkdir(dir, { recursive: true });
  // Synthetic items, each ~500 bytes of JSON, so output is several pipe buffers long.
  // `status` is the only difference between the valid and invalid sets.
  await Promise.all(Array.from({ length: ROWS }, (_, i) => {
    const second = String(i % 60).padStart(2, "0"), minute = String(Math.floor(i / 60) % 60).padStart(2, "0");
    const id = `XX-26-01-01-${String(Math.floor(i / 3600)).padStart(2, "0")}.${minute}.${second}`;
    const title = i === ROWS - 1 ? "TAIL-SENTINEL" : `Synthetic row ${i} ${"padding ".repeat(30)}`;
    const item = (status: string) => `---\nid: ${id}\ntitle: "${title}"\nstatus: ${status}\npriority: P2\n` +
      `tags: [synthetic]\nowner: agent\nprs: []\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n\n${title}\n`;
    return Promise.all([
      writeFile(join(dir, `${id}-row.md`), item("backlog")),
      mkdir(join(root, "bad/roadmap"), { recursive: true }).then(() => writeFile(join(root, "bad/roadmap", `${id}-row.md`), item("unknown"))),
    ]);
  }));
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

interface Result { code: number | null; stdout: string; stderr: string }

/** Runs the CLI with both streams on real pipes that are not read for 300 ms — long
 *  enough for an exit that does not wait to happen — then reads everything. */
function piped(args: string[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", linger, cli, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [], err: Buffer[] = [];
    // Listen first: Node resumes an unlistened child stream at exit and discards it.
    child.stdout.on("data", (b: Buffer) => out.push(b)).pause();
    child.stderr.on("data", (b: Buffer) => err.push(b)).pause();
    setTimeout(() => { child.stdout.resume(); child.stderr.resume(); }, 300);
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("CLI did not exit within 15 s")); }, 15_000);
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() });
    });
  });
}

/** The same command with both streams on regular files, which Node writes synchronously. */
async function toFiles(args: string[]): Promise<Result> {
  const outPath = join(root, "out.txt"), errPath = join(root, "err.txt");
  const out = openSync(outPath, "w"), err = openSync(errPath, "w");
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: ["ignore", out, err] });
    child.on("error", reject); child.on("close", resolve);
  });
  closeSync(out); closeSync(err);
  return { code, stdout: await readFile(outPath, "utf8"), stderr: await readFile(errPath, "utf8") };
}

describe("CLI exit", () => {
  it("delivers stdout JSON larger than a pipe buffer completely", async () => {
    const args = ["pm", "tagged", "synthetic", "--json"];
    const [result, reference] = [await piped(args), await toFiles(args)];
    expect(result.code).toBe(0);
    expect(Buffer.byteLength(reference.stdout)).toBeGreaterThan(8 * 65_536);
    expect(Buffer.byteLength(result.stdout)).toBe(Buffer.byteLength(reference.stdout));
    const parsed = JSON.parse(result.stdout) as { items: { summary: string }[]; issues: unknown[] };
    expect(parsed.items).toHaveLength(ROWS);
    expect(parsed.issues).toEqual([]);
    expect(parsed.items.filter(item => item.summary.includes("TAIL-SENTINEL"))).toHaveLength(1);
  }, 30_000);

  it("delivers stderr larger than a pipe buffer completely and keeps the failure code", async () => {
    const args = ["pm", "tagged", "synthetic", "--dir", "bad"];
    const [result, reference] = [await piped(args), await toFiles(args)];
    expect(reference.code).toBe(1);
    expect(result.code).toBe(1);
    expect(Buffer.byteLength(reference.stderr)).toBeGreaterThan(3 * 65_536);
    expect(Buffer.byteLength(result.stderr)).toBe(Buffer.byteLength(reference.stderr));
    expect(result.stderr.trimEnd().split("\n")).toHaveLength(ROWS);
    expect(result.stdout).toBe(reference.stdout);
  }, 30_000);
});
