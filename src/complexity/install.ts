import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gitSubprocessEnv } from "../git-env.js";
import { CANARY_EXPECTED, LIZARD_PIN, pinKey, type LizardPin } from "./pin.js";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Every external program is started with an argument array; nothing reaches a shell. */
export function run(command: string, args: string[], opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = execFile(
      command,
      args,
      { cwd: opts.cwd, env: opts.env, timeout: 10 * 60_000, maxBuffer: 256 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const failed = error as (Error & { code?: number | string }) | null;
        const code = !failed ? 0 : typeof failed.code === "number" ? failed.code : 1;
        resolveRun({ code, stdout: String(stdout), stderr: String(stderr || failed?.message || "") });
      },
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

export const RUNNER_PATH = fileURLToPath(new URL("./lizard_runner.py", import.meta.url));

export interface Toolchain {
  dir: string;
  lizard: string;
  python: string;
}

export function toolchainFor(pin: LizardPin = LIZARD_PIN, env: NodeJS.ProcessEnv = process.env): Toolchain {
  const root = env["MORPHEUS_TOOLS_DIR"] || join(homedir(), ".morpheus", "tools");
  const dir = join(root, "lizard", pinKey(pin));
  return { dir, lizard: join(dir, "src"), python: join(dir, "venv", "bin", "python") };
}

export type ToolStatus =
  | { state: "ok"; toolchain: Toolchain; lizardVersion: string | null; python: string }
  | { state: "missing" | "broken"; toolchain: Toolchain; reason: string };

/**
 * Runs the canary through the installed runtime. `ready.json` only names what
 * was installed; this is the proof it still works.
 */
export async function toolStatus(pin: LizardPin = LIZARD_PIN, env: NodeJS.ProcessEnv = process.env): Promise<ToolStatus> {
  const toolchain = toolchainFor(pin, env);
  const stamp = await readFile(join(toolchain.dir, "ready.json"), "utf8").catch(() => null);
  if (stamp === null) return { state: "missing", toolchain, reason: `not installed for this pin (${toolchain.dir})` };
  const source = await sourceIdentity(toolchain.lizard, pin);
  if (source) return { state: "broken", toolchain, reason: source };
  const result = await run(toolchain.python, ["-I", "-B", RUNNER_PATH, "--lizard", toolchain.lizard, "--canary"]);
  if (result.code !== 0) return { state: "broken", toolchain, reason: `canary did not run: ${firstLine(result.stderr)}` };
  return canaryVerdict(toolchain, result.stdout);
}

/** The checkout must be the pinned commit, unmodified: the canary samples behaviour, this proves the source. */
async function sourceIdentity(src: string, pin: LizardPin): Promise<string | null> {
  const head = await run("git", ["-C", src, "rev-parse", "HEAD"], { env: gitSubprocessEnv() });
  if (head.code !== 0 || head.stdout.trim() !== pin.commit) return `Lizard source is ${head.stdout.trim() || "unreadable"}, not the pinned ${pin.commit}`;
  const dirty = await run("git", ["-C", src, "status", "--porcelain", "--untracked-files=all"], { env: gitSubprocessEnv() });
  if (dirty.code !== 0 || dirty.stdout.trim() !== "") return "Lizard source has local modifications";
  return null;
}

interface CanaryOutput {
  lizardVersion?: string | null;
  lizardFile?: string;
  python?: string;
  files?: { path: string; functions?: { name: string; start: number; end: number; ccn: number; cognitive: number }[] }[];
}

function canaryVerdict(toolchain: Toolchain, stdout: string): ToolStatus {
  let parsed: CanaryOutput;
  try {
    parsed = JSON.parse(stdout) as CanaryOutput;
  } catch {
    return { state: "broken", toolchain, reason: "canary printed no JSON" };
  }
  if (!sameDir(parsed.lizardFile, toolchain.lizard)) {
    return { state: "broken", toolchain, reason: `Lizard loaded from ${parsed.lizardFile ?? "an unknown path"}, not the pinned checkout` };
  }
  const mismatch = CANARY_EXPECTED.map((want) => canaryMismatch(parsed, want)).find(Boolean);
  if (mismatch) return { state: "broken", toolchain, reason: mismatch };
  return { state: "ok", toolchain, lizardVersion: parsed.lizardVersion ?? null, python: parsed.python ?? "unknown" };
}

function sameDir(file: string | undefined, dir: string): boolean {
  if (!file) return false;
  try {
    return dirname(file) === realpathSync(dir);
  } catch {
    return false;
  }
}

/** One canary row's verdict: null when it measured as recorded, else the reason. */
export function canaryMismatch(parsed: CanaryOutput, want: (typeof CANARY_EXPECTED)[number]): string | null {
  const row = parsed.files?.find((f) => f.path === want.path)?.functions?.find((f) => f.name === want.name);
  const span = (start: number, end: number) => (want.lines ? `, lines ${start}-${end}` : "");
  const boundsMatch = !want.lines || (row?.start === want.lines[0] && row.end === want.lines[1]);
  if (row && row.ccn === want.ccn && row.cognitive === want.cognitive && boundsMatch) return null;
  const got = row ? `CCN ${row.ccn}, cognitive ${row.cognitive}${span(row.start, row.end)}` : "no such function";
  const expected = `CCN ${want.ccn}, cognitive ${want.cognitive}${want.lines ? span(...want.lines) : ""}`;
  return `canary ${want.path} ${want.name} measured ${got}; the pinned build gives ${expected}`;
}

function firstLine(text: string): string {
  return text.trim().split("\n").filter(Boolean).pop() ?? "no output";
}

export type InstallResult = { ok: true; status: ToolStatus; changed: boolean } | { ok: false; reason: string };

/**
 * Installs the pinned analyzer: Lizard fetched by commit id, its two wheels
 * into a venv by hash. Built in a scratch directory and renamed into place,
 * so a failed install never leaves a stamp. Idempotent: a working install is
 * left alone.
 */
export async function installLizard(pin: LizardPin = LIZARD_PIN, env: NodeJS.ProcessEnv = process.env): Promise<InstallResult> {
  const current = await toolStatus(pin, env);
  if (current.state === "ok") return { ok: true, status: current, changed: false };
  const { dir } = current.toolchain;
  const scratch = `${dir}.tmp-${process.pid}`;
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  const failure = await buildInto(scratch, pin, env);
  if (failure) {
    await rm(scratch, { recursive: true, force: true });
    return { ok: false, reason: failure };
  }
  await rm(dir, { recursive: true, force: true });
  await rename(scratch, dir);
  const status = await toolStatus(pin, env);
  if (status.state !== "ok") return { ok: false, reason: status.reason };
  return { ok: true, status, changed: true };
}

/** Each step returns null on success or the reason it failed. */
async function buildInto(dir: string, pin: LizardPin, env: NodeJS.ProcessEnv): Promise<string | null> {
  const python = env["MORPHEUS_PYTHON"] || "python3";
  return (
    (await checkPython(python, pin)) ??
    (await fetchLizard(join(dir, "src"), pin)) ??
    (await buildVenv(dir, python, pin))
  );
}

export async function checkPython(python: string, pin: LizardPin): Promise<string | null> {
  const probe = await run(python, ["-I", "-c", "import sys; print('%d.%d' % sys.version_info[:2])"]);
  if (probe.code !== 0) return `${python} is not runnable: ${firstLine(probe.stderr)}`;
  const [major, minor] = probe.stdout.trim().split(".").map(Number);
  const [floorMajor, floorMinor] = pin.pythonFloor;
  if (major === undefined || minor === undefined || major < floorMajor || (major === floorMajor && minor < floorMinor)) {
    return `${python} is ${probe.stdout.trim()}; the pinned analyzer needs ${floorMajor}.${floorMinor} or newer`;
  }
  return null;
}

async function fetchLizard(src: string, pin: LizardPin): Promise<string | null> {
  const git = (args: string[]) => run("git", args, { env: gitSubprocessEnv() });
  const steps: string[][] = [
    ["init", "--quiet", src],
    ["-C", src, "fetch", "--quiet", "--depth", "1", "--no-tags", pin.repository, pin.commit],
    ["-C", src, "checkout", "--quiet", "--detach", "FETCH_HEAD"],
  ];
  for (const args of steps) {
    const result = await git(args);
    if (result.code !== 0) return `git ${args.slice(args[0] === "-C" ? 2 : 0, 3).join(" ")} failed: ${firstLine(result.stderr)}`;
  }
  const head = await git(["-C", src, "rev-parse", "HEAD"]);
  if (head.stdout.trim() !== pin.commit) return `fetched ${head.stdout.trim()}, not the pinned ${pin.commit}`;
  return null;
}

async function buildVenv(dir: string, python: string, pin: LizardPin): Promise<string | null> {
  const venv = await run(python, ["-I", "-m", "venv", join(dir, "venv")]);
  if (venv.code !== 0) return `python -m venv failed: ${firstLine(venv.stderr)}`;
  const requirements = join(dir, "requirements.txt");
  await writeFile(requirements, `${pin.requirements.join("\n")}\n`);
  const pip = await run(join(dir, "venv", "bin", "python"), [
    "-I", "-m", "pip", "install", "--isolated", "--disable-pip-version-check", "--no-input",
    "--require-hashes", "--no-deps", "--only-binary", ":all:", "-r", requirements,
  ]);
  if (pip.code !== 0) return `pip install failed: ${firstLine(pip.stderr)}`;
  await writeFile(join(dir, "ready.json"), `${JSON.stringify({ key: pinKey(pin), ...pin }, null, 2)}\n`);
  return null;
}

export function formatStatus(status: ToolStatus): string {
  if (status.state === "ok") {
    return `Lizard ${status.lizardVersion ?? "?"} at ${LIZARD_PIN.commit.slice(0, 12)} (Python ${status.python}): operational — canary measured as expected.`;
  }
  return `Lizard analyzer ${status.state}: ${status.reason}`;
}
