import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Where the shared script is, whether Morpheus is installed as a package or
 * checked out. `dist/ios/changed-swift.js` and `src/ios/changed-swift.ts` are
 * both two levels below the root, so one relative path serves both.
 */
export function scriptPath(moduleUrl = import.meta.url) {
    const candidate = resolve(dirname(fileURLToPath(moduleUrl)), "../../scripts/swift-changed-files.sh");
    if (existsSync(candidate))
        return candidate;
    throw new Error(`swift-changed-files.sh is missing from this Morpheus installation (looked in ${candidate}). ` +
        "Reinstall morpheus-kit, or run the script from a checkout.");
}
export function changedSwiftArguments(options) {
    const argv = ["--working-directory", options.workingDirectory];
    if (options.base)
        argv.push("--base", options.base);
    if (options.worktree)
        argv.push("--worktree");
    return argv;
}
export function run(options, cwd = process.cwd()) {
    const result = spawnSync("bash", [scriptPath(), ...changedSwiftArguments(options)], {
        cwd,
        encoding: "utf8",
    });
    if (result.error) {
        console.error(result.error.message);
        return 1;
    }
    if (result.stderr)
        process.stderr.write(result.stderr);
    if (result.status !== 0)
        return result.status ?? 1;
    // The script speaks NUL because that is what survives every filename. A
    // person reading the output wants lines, so that is the default here and the
    // machine-readable form is opt-in.
    const paths = result.stdout.split("\0").filter((path) => path.length > 0);
    process.stdout.write(options.nul ? paths.map((path) => `${path}\0`).join("") : paths.map((path) => `${path}\n`).join(""));
    return 0;
}
//# sourceMappingURL=changed-swift.js.map