import { execFile } from "node:child_process";
import { EXIT, parseDuration, waitCi } from "../wait-ci/index.js";
export const DEFAULT_TIMEOUT = "45m";
/** `gh` as a child process that never throws: a non-zero exit is data the loop decides about. */
export const ghRunner = (args) => new Promise((resolve) => {
    execFile("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr || (error && typeof error.code !== "number" ? error.message : "") });
    });
});
/** `morpheus wait-ci` — block once on a PR's checks and print the digest. */
export async function waitCiCommand(flags, gh = ghRunner) {
    if (flags.extra.length > 0) {
        console.error(`wait-ci takes one PR number or branch, got also: ${flags.extra.join(" ")}`);
        return EXIT.error;
    }
    const timeoutMs = parseDuration(flags.timeout ?? DEFAULT_TIMEOUT);
    if (timeoutMs === null) {
        console.error(`--timeout must be a positive duration such as 45m, 90s or 1h30m, got "${flags.timeout}".`);
        return EXIT.error;
    }
    const result = await waitCi({ gh, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() }, { target: flags.target, repo: flags.repo, timeoutMs, requiredOnly: flags.requiredOnly });
    (result.exitCode === EXIT.error ? console.error : console.log)(result.output);
    return result.exitCode;
}
//# sourceMappingURL=wait-ci.js.map