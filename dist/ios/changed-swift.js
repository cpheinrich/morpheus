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
    // No `encoding`, so the bytes stay bytes. The script speaks NUL precisely
    // because a path is a byte string and not every one of them is valid UTF-8;
    // decoding here would replace such a path with U+FFFD and hand back a name
    // that does not exist — the same class of loss `-z` exists to prevent.
    const result = spawnSync("bash", [scriptPath(), ...changedSwiftArguments(options)], { cwd });
    if (result.error) {
        console.error(result.error.message);
        return 1;
    }
    if (result.stderr?.length)
        process.stderr.write(result.stderr);
    if (result.status !== 0)
        return result.status ?? 1;
    // Paths are repository-relative, whatever directory this was run from, so
    // the output is stable for a caller that may itself be anywhere in the tree.
    // A person reading it wants lines; the machine-readable NUL form is opt-in.
    const separator = Buffer.from([0]);
    const paths = splitBuffer(result.stdout, 0);
    process.stdout.write(paths.length === 0
        ? Buffer.alloc(0)
        : Buffer.concat(paths.flatMap((path) => [path, options.nul ? separator : Buffer.from("\n")])));
    return 0;
}
/** Split on a byte without decoding, dropping the trailing empty segment. */
function splitBuffer(buffer, byte) {
    const parts = [];
    let start = 0;
    for (let index = 0; index < buffer.length; index += 1) {
        if (buffer[index] !== byte)
            continue;
        if (index > start)
            parts.push(buffer.subarray(start, index));
        start = index + 1;
    }
    if (buffer.length > start)
        parts.push(buffer.subarray(start));
    return parts;
}
//# sourceMappingURL=changed-swift.js.map