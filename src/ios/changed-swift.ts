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
  const result = spawnSync("bash", [scriptPath(), ...changedSwiftArguments(options)], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) return result.status ?? 1;

  // The script speaks NUL because that is what survives every filename. A
  // person reading the output wants lines, so that is the default here and the
  // machine-readable form is opt-in.
  const paths = result.stdout.split("\0").filter((path) => path.length > 0);
  process.stdout.write(options.nul ? paths.map((path) => `${path}\0`).join("") : paths.map((path) => `${path}\n`).join(""));
  return 0;
}
