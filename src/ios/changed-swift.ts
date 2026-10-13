import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `morpheus ios changed-swift` — the Swift files a change touched.
 *
 * A thin way to reach `scripts/swift-changed-files.sh`, which is the same file
 * `ios-ci.yml` runs through its composite action. The point is not the
 * convenience: it is that a consumer wanting this check locally has one
 * implementation to call rather than a workflow step to imitate. The first
 * consumer that imitated it drifted inside a single commit, in two ways that
 * each made a local "clean" that CI contradicted (darwin-health/evo#281).
 *
 * Thin on purpose. Base-ref policy belongs to the caller: what CI compares
 * (a commit and its first parent) and what a developer compares (the merge base
 * with a trunk, plus work not committed yet) are different questions, and this
 * passes both through rather than choosing.
 */

export interface ChangedSwiftOptions {
  workingDirectory: string;
  base?: string;
  worktree?: boolean;
  /** NUL-delimited, for `xargs -0` and shell arrays; newlines are for reading. */
  nul?: boolean;
}

/**
 * Where the shared script is, whether Morpheus is installed as a package or
 * checked out. `dist/ios/changed-swift.js` and `src/ios/changed-swift.ts` are
 * both two levels below the root, so one relative path serves both.
 */
export function scriptPath(moduleUrl: string = import.meta.url): string {
  const candidate = resolve(dirname(fileURLToPath(moduleUrl)), "../../scripts/swift-changed-files.sh");
  if (existsSync(candidate)) return candidate;
  throw new Error(
    `swift-changed-files.sh is missing from this Morpheus installation (looked in ${candidate}). ` +
      "Reinstall morpheus-kit, or run the script from a checkout.",
  );
}

export function changedSwiftArguments(options: ChangedSwiftOptions): string[] {
  const argv = ["--working-directory", options.workingDirectory];
  if (options.base) argv.push("--base", options.base);
  if (options.worktree) argv.push("--worktree");
  return argv;
}

export function run(options: ChangedSwiftOptions, cwd: string = process.cwd()): number {
  // No `encoding`, so the bytes stay bytes. The script speaks NUL precisely
  // because a path is a byte string and not every one of them is valid UTF-8;
  // decoding here would replace such a path with U+FFFD and hand back a name
  // that does not exist — the same class of loss `-z` exists to prevent.
  const result = spawnSync("bash", [scriptPath(), ...changedSwiftArguments(options)], { cwd });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  if (result.stderr?.length) process.stderr.write(result.stderr);
  if (result.status !== 0) return result.status ?? 1;

  // Paths are repository-relative, whatever directory this was run from, so
  // the output is stable for a caller that may itself be anywhere in the tree.
  // A person reading it wants lines; the machine-readable NUL form is opt-in.
  const separator = Buffer.from([0]);
  const paths = splitBuffer(result.stdout, 0);
  process.stdout.write(
    paths.length === 0
      ? Buffer.alloc(0)
      : Buffer.concat(paths.flatMap((path) => [path, options.nul ? separator : Buffer.from("\n")])),
  );
  return 0;
}

/** Split on a byte without decoding, dropping the trailing empty segment. */
function splitBuffer(buffer: Buffer, byte: number): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== byte) continue;
    if (index > start) parts.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (buffer.length > start) parts.push(buffer.subarray(start));
  return parts;
}
