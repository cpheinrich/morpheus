import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const MORPHEUS_REMOTE = "https://github.com/cpheinrich/morpheus.git";
export const INSTALL_RECEIPT = "morpheus-install.json";
export const MORPHEUS_PACKAGE = "morpheus-kit";
export const MORPHEUS_PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const runMorpheusCommand = async (command, args, cwd) => {
    try {
        const remoteRead = command === "git" && args[0] === "ls-remote";
        const { stdout, stderr } = await exec(command, args, {
            cwd,
            timeout: remoteRead ? 15_000 : 15 * 60_000,
            maxBuffer: 20 * 1024 * 1024,
        });
        return { code: 0, stdout, stderr };
    }
    catch (error) {
        const failed = error;
        return {
            code: typeof failed.code === "number" ? failed.code : 1,
            stdout: failed.stdout ?? "",
            stderr: failed.stderr ?? failed.message,
        };
    }
};
function parseReceipt(raw) {
    try {
        const value = JSON.parse(raw);
        if (value.schema !== 1 ||
            typeof value.commit !== "string" ||
            !/^[0-9a-f]{40}$/i.test(value.commit) ||
            typeof value.remote !== "string" ||
            typeof value.installedAt !== "string") {
            return null;
        }
        return value;
    }
    catch {
        return null;
    }
}
async function exactCheckout(source, runner) {
    const root = await runner("git", ["rev-parse", "--show-toplevel"], source);
    if (root.code !== 0)
        return null;
    const [reported, actual] = await Promise.all([
        realpath(root.stdout.trim()).catch(() => resolve(root.stdout.trim())),
        realpath(source).catch(() => resolve(source)),
    ]);
    // A standalone install under a directory that happens to be a Git checkout
    // is not source. This exact comparison is what keeps Homebrew's repository
    // from being mistaken for Morpheus.
    if (reported !== actual)
        return null;
    const [head, status] = await Promise.all([
        runner("git", ["rev-parse", "HEAD"], source),
        runner("git", ["status", "--porcelain"], source),
    ]);
    if (head.code !== 0 || status.code !== 0)
        return null;
    const sha = head.stdout.trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? { head: sha, dirty: Boolean(status.stdout.trim()) } : null;
}
let defaultStatus;
async function readMorpheusInstallStatus(opts) {
    const runner = opts.runner ?? runMorpheusCommand;
    const source = resolve(opts.packageRoot ?? MORPHEUS_PACKAGE_ROOT);
    const receipt = parseReceipt(await readFile(join(source, INSTALL_RECEIPT), "utf8").catch(() => ""));
    const checkout = receipt ? null : await exactCheckout(source, runner);
    const kind = receipt ? "package" : checkout ? "checkout" : "unknown";
    const installedSha = receipt?.commit ?? checkout?.head ?? null;
    if (opts.offline) {
        return {
            source,
            kind,
            relation: "offline",
            installedSha,
            remoteSha: null,
            fresh: null,
            detail: "remote check skipped by the explicit offline declaration",
        };
    }
    if (!installedSha) {
        return {
            source,
            kind,
            relation: "unknown",
            installedSha: null,
            remoteSha: null,
            fresh: null,
            detail: `standalone installation has no valid ${INSTALL_RECEIPT}`,
        };
    }
    const remote = await runner("git", ["ls-remote", "--exit-code", MORPHEUS_REMOTE, "refs/heads/main"], source);
    const remoteSha = remote.code === 0 ? remote.stdout.trim().split(/\s+/)[0] ?? "" : "";
    if (!/^[0-9a-f]{40}$/i.test(remoteSha)) {
        return {
            source,
            kind,
            relation: "unknown",
            installedSha,
            remoteSha: null,
            fresh: null,
            detail: "current Morpheus main could not be reached",
        };
    }
    if (checkout?.dirty) {
        return {
            source,
            kind,
            relation: "dirty",
            installedSha,
            remoteSha,
            fresh: false,
            detail: "the linked source checkout has local changes",
        };
    }
    if (installedSha === remoteSha) {
        return { source, kind, relation: "current", installedSha, remoteSha, fresh: true };
    }
    if (checkout) {
        const contains = await runner("git", ["merge-base", "--is-ancestor", remoteSha, installedSha], source);
        if (contains.code === 0) {
            return {
                source,
                kind,
                relation: "ahead",
                installedSha,
                remoteSha,
                fresh: true,
                detail: "the source checkout contains current main and has additional commits",
            };
        }
    }
    return {
        source,
        kind,
        relation: "stale",
        installedSha,
        remoteSha,
        fresh: false,
        detail: kind === "package"
            ? "the installed package does not match current main"
            : "the source checkout is behind or diverged from current main",
    };
}
export function morpheusInstallStatus(opts = {}) {
    const cache = !opts.runner && !opts.packageRoot && opts.offline !== true;
    if (!cache)
        return readMorpheusInstallStatus(opts);
    defaultStatus ??= readMorpheusInstallStatus(opts);
    return defaultStatus;
}
const short = (sha) => sha?.slice(0, 7) ?? "unknown";
export function formatMorpheusInstallStatus(status) {
    const yes = "\x1b[32m✓\x1b[0m";
    const no = "\x1b[31m✗\x1b[0m";
    const maybe = "\x1b[33m?\x1b[0m";
    if (status.relation === "current") {
        return `${yes} Morpheus ${short(status.installedSha)} matches current main (${status.kind})`;
    }
    if (status.relation === "ahead") {
        return `${yes} Morpheus source contains current main and is ahead (${short(status.installedSha)})`;
    }
    if (status.relation === "dirty") {
        return (`${no} Linked Morpheus source has local changes (${status.source})\n` +
            "  `morpheus self update` installs current main separately and does not touch them.");
    }
    if (status.relation === "stale") {
        return (`${no} Morpheus ${short(status.installedSha)} differs from current main ${short(status.remoteSha)}\n` +
            "  Run `morpheus self update`.");
    }
    if (status.relation === "offline") {
        return `${maybe} Morpheus freshness not checked — offline was declared.`;
    }
    return (`${maybe} Morpheus installation provenance could not be verified (${status.source})\n` +
        `  ${status.detail ?? `missing ${INSTALL_RECEIPT}`}. Run \`morpheus self update\`.`);
}
export class MorpheusInstallError extends Error {
}
function failure(command, result) {
    return new MorpheusInstallError(`${command} failed: ${(result.stderr || result.stdout || `exit ${result.code}`).trim()}`);
}
async function requireSuccess(runner, command, args, cwd) {
    const result = await runner(command, args, cwd);
    if (result.code !== 0)
        throw failure([command, ...args].join(" "), result);
    return result;
}
/** Install one clean, exact current-main checkout as a copied global package. */
export async function installCurrentMorpheus(sourceRoot, opts = {}) {
    const runner = opts.runner ?? runMorpheusCommand;
    const source = await realpath(resolve(sourceRoot)).catch(() => resolve(sourceRoot));
    const checkout = await exactCheckout(source, runner);
    if (!checkout) {
        throw new MorpheusInstallError(`${source} is not the root of a Morpheus Git checkout.`);
    }
    if (checkout.dirty) {
        throw new MorpheusInstallError("The source checkout has local changes; install from clean main.");
    }
    const remote = await requireSuccess(runner, "git", ["ls-remote", "--exit-code", MORPHEUS_REMOTE, "refs/heads/main"], source);
    const remoteSha = remote.stdout.trim().split(/\s+/)[0] ?? "";
    if (checkout.head !== remoteSha) {
        throw new MorpheusInstallError(`The source checkout is ${short(checkout.head)}, not current main ${short(remoteSha)}.`);
    }
    await requireSuccess(runner, "pnpm", ["install", "--frozen-lockfile"], source);
    await requireSuccess(runner, "pnpm", ["compile"], source);
    await requireSuccess(runner, "git", ["diff", "--exit-code", "--", "dist"], source);
    const packDir = await mkdtemp(join(opts.tempRoot ?? tmpdir(), "morpheus-pack-"));
    try {
        const packed = await requireSuccess(runner, "npm", ["pack", "--pack-destination", packDir, "--json", "--cache", join(packDir, "npm-cache")], source);
        let filename = "";
        try {
            const result = JSON.parse(packed.stdout);
            filename = result[0]?.filename ?? "";
        }
        catch {
            // The explicit error below names the useful failure without leaking npm's
            // entire output into every caller.
        }
        if (!filename)
            throw new MorpheusInstallError("npm pack did not report a package filename.");
        await requireSuccess(runner, "npm", ["install", "--global", join(packDir, filename), "--cache", join(packDir, "npm-cache")], source);
        const root = await requireSuccess(runner, "npm", ["root", "--global"], source);
        const installedRoot = join(root.stdout.trim(), MORPHEUS_PACKAGE);
        const stat = await lstat(installedRoot).catch(() => null);
        if (!stat?.isDirectory() || stat.isSymbolicLink()) {
            throw new MorpheusInstallError(`Global ${MORPHEUS_PACKAGE} is not a standalone directory at ${installedRoot}.`);
        }
        const receipt = {
            schema: 1,
            commit: checkout.head,
            remote: MORPHEUS_REMOTE,
            installedAt: (opts.now ?? new Date()).toISOString(),
        };
        await writeFile(join(installedRoot, INSTALL_RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`);
        defaultStatus = undefined;
        return { commit: checkout.head, packageRoot: installedRoot };
    }
    finally {
        await rm(packDir, { recursive: true, force: true });
    }
}
/** Clone current main into a disposable directory, install it, then remove it. */
export async function updateMorpheus(opts = {}) {
    const runner = opts.runner ?? runMorpheusCommand;
    const parent = await mkdtemp(join(opts.tempRoot ?? tmpdir(), "morpheus-update-"));
    const clone = join(parent, "morpheus");
    try {
        await requireSuccess(runner, "git", ["clone", "--depth", "1", "--branch", "main", "--single-branch", MORPHEUS_REMOTE, clone], parent);
        return await installCurrentMorpheus(clone, { ...opts, runner });
    }
    finally {
        await rm(parent, { recursive: true, force: true });
    }
}
//# sourceMappingURL=self.js.map