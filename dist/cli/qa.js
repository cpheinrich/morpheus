import { listPending, resolveBatch, showBatch } from "../qa/store.js";
import { startQaCommentServer } from "../qa/serve.js";
import { execFileSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { QA_GUIDE } from "../qa/guide.js";
import { loadIosPreviewConfig } from "../qa/preview/config.js";
import { parsePreviewArgs, previewContext, runPreview } from "../qa/preview/ios.js";
/**
 * `morpheus qa comments …` — agent-facing side of the QA comment loop.
 *
 * Writers (local overlay) drop batches under `local/qa-comments/pending/`.
 * Agents list, read, act, then resolve. See docs/runbooks/qa-comments.md.
 */
const USAGE = `Usage
  morpheus qa comments pending [--root <project>]
  morpheus qa comments show <batchId> [--root <project>]
  morpheus qa comments resolve <batchId> [batchId...] [--root <project>]
  morpheus qa comments serve --preview <url> [--port 3456] [--root <project>] [--stream-url <url>]
  --project <name> is the global flag (the parser consumes it before this command) and labels batches.
`;
function takeRootFlag(argv, fallback) {
    const rest = [];
    let root = fallback;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--root") {
            const value = argv[++i];
            if (!value)
                throw new Error("--root requires a path");
            root = value;
        }
        else {
            rest.push(argv[i]);
        }
    }
    return { root, rest };
}
function parseServeArgs(argv) {
    let preview;
    let port = 3456;
    let root;
    let streamUrl;
    let project;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--preview")
            preview = argv[++i];
        else if (a === "--port") {
            const n = Number(argv[++i]);
            if (!Number.isInteger(n) || n < 0 || n > 65535) {
                throw new Error(`Invalid --port (got ${argv[i]})`);
            }
            port = n;
        }
        else if (a === "--root")
            root = argv[++i];
        else if (a === "--stream-url")
            streamUrl = argv[++i];
        else if (a === "--project")
            project = argv[++i];
        else if (a.startsWith("-")) {
            throw new Error(`Unknown serve option "${a}"\n\n${USAGE}`);
        }
        else if (!preview) {
            preview = a;
        }
        else {
            throw new Error(`Unexpected argument "${a}"\n\n${USAGE}`);
        }
    }
    return { preview, port, root, streamUrl, project };
}
export async function dispatchQaComments(root, command, rest, projectFlag) {
    if (command === "pending" || command === undefined) {
        let projectRoot = root;
        try {
            const taken = takeRootFlag(rest, root);
            projectRoot = taken.root;
        }
        catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            return 1;
        }
        const listings = await listPending(projectRoot);
        for (const item of listings) {
            console.log(`${item.id}\t${item.commentCount}\t${item.project}\t${item.createdAt}\t${item.path}`);
        }
        return 0;
    }
    if (command === "show") {
        let projectRoot = root;
        let args = rest;
        try {
            const taken = takeRootFlag(rest, root);
            projectRoot = taken.root;
            args = taken.rest;
        }
        catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            return 1;
        }
        const id = args[0];
        if (!id) {
            console.error(`Which batch?\n\n${USAGE}`);
            return 1;
        }
        const found = await showBatch(projectRoot, id);
        if (!found) {
            console.error(`No QA comment batch "${id}" under local/qa-comments/.`);
            return 1;
        }
        console.log(JSON.stringify(found.batch, null, 2));
        return 0;
    }
    if (command === "resolve") {
        let projectRoot = root;
        let args = rest;
        try {
            const taken = takeRootFlag(rest, root);
            projectRoot = taken.root;
            args = taken.rest;
        }
        catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            return 1;
        }
        if (args.length === 0) {
            console.error(`Which batch?\n\n${USAGE}`);
            return 1;
        }
        let failed = 0;
        for (const id of args) {
            const resolved = await resolveBatch(projectRoot, id);
            if (!resolved) {
                console.error(`No QA comment batch "${id}" under local/qa-comments/.`);
                failed += 1;
                continue;
            }
            console.log(`Resolved ${resolved.id}`);
        }
        return failed === 0 ? 0 : 1;
    }
    if (command === "serve") {
        let opts;
        try {
            opts = parseServeArgs(rest);
        }
        catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            return 1;
        }
        if (!opts.preview) {
            console.error(`--preview <url> is required.\n\n${USAGE}`);
            return 1;
        }
        const projectRoot = opts.root ?? root;
        try {
            const server = await startQaCommentServer({
                root: projectRoot,
                previewUrl: opts.preview,
                port: opts.port,
                ...(opts.streamUrl ? { streamUrl: opts.streamUrl } : {}),
                ...(opts.project ?? projectFlag ? { project: opts.project ?? projectFlag } : {}),
                onListen: (info) => {
                    console.log(`QA comments overlay: ${info.url}`);
                    console.log(`Preview upstream:    ${opts.preview}`);
                    console.log(`Batches write to:    ${projectRoot}/local/qa-comments/pending/`);
                    if (info.streamUrl)
                        console.log(`Stream proxied from: ${info.streamUrl}`);
                    else {
                        console.log("No MJPEG stream discovered — Comment mode overlays the iframe (frame.png may be omitted).");
                    }
                    console.log("Open the overlay URL in a browser. Ctrl+C stops the server.");
                },
            });
            await new Promise((resolve) => {
                const stop = () => {
                    void server.close().finally(resolve);
                };
                process.on("SIGINT", stop);
                process.on("SIGTERM", stop);
            });
            return 0;
        }
        catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            return 1;
        }
    }
    console.error(`Unknown qa comments command "${command}".\n\n${USAGE}`);
    return 1;
}
// ---------------------------------------------------------------------------------------------
// `morpheus qa preview ios …` and `morpheus qa guide` (MO-26-10-06-15.17.01)
const PREVIEW_USAGE = `Usage
  morpheus qa preview ios [start|status|stop|doctor|help] [--mode <name>] [--port <n>] [--ttl-minutes <1-1440>]
                          [--no-build] [--ssh-host <user@host>] [--root <project>]
  The project's morpheus.json declares qa.ios: the app, its build, and its launch modes;
  "morpheus qa preview ios help" lists them.
  Every agent opens the QA overlay URL that start prints. Instructions: morpheus qa guide`;
function projectRootFrom(cwd, rest) {
    const taken = takeRootFlag(rest, "");
    if (taken.root)
        return { root: resolvePath(taken.root), rest: taken.rest };
    try {
        return { root: execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), rest: taken.rest };
    }
    catch {
        return { root: cwd, rest: taken.rest };
    }
}
export async function dispatchQaPreview(cwd, platform, rest) {
    if (platform !== "ios") {
        console.error(platform === undefined || platform === "--help" || platform === "-h" ? PREVIEW_USAGE : `Unknown preview platform "${platform}". Only ios is available.\n\n${PREVIEW_USAGE}`);
        return platform === "--help" || platform === "-h" ? 0 : 1;
    }
    let root;
    let args;
    try {
        ({ root, rest: args } = projectRootFrom(cwd, rest));
    }
    catch (error) {
        console.error(error.message);
        return 1;
    }
    const loaded = await loadIosPreviewConfig(root);
    if (!loaded.ok) {
        console.error(`${loaded.issues.join("\n")}\n\n${PREVIEW_USAGE}`);
        return 1;
    }
    const { config } = loaded;
    // `help` is a word, not a flag: the global parser consumes --help before this command runs.
    if (args[0] === "help") {
        console.log(PREVIEW_USAGE);
        console.log(`\nModes for this project (default ${config.defaultMode}):`);
        for (const mode of Object.values(config.modes)) {
            console.log(`  ${mode.name}${mode.flags.length ? ` (${mode.flags.join(", ")})` : ""}: ${mode.summary}`);
        }
        return 0;
    }
    try {
        const options = parsePreviewArgs(args, config.modes);
        await runPreview(previewContext(root, config), options);
        return 0;
    }
    catch (error) {
        console.error(`Preview: ${error.message}`);
        return 1;
    }
}
export function dispatchQaGuide() {
    console.log(QA_GUIDE);
    return 0;
}
//# sourceMappingURL=qa.js.map