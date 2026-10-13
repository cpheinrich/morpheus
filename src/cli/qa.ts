import { BatchClaimedError, claimNextBatch, listPending, releaseBatchClaim, resolveBatch, showBatch } from "../qa/store.js";
import { startQaCommentServer } from "../qa/serve.js";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { QA_GUIDE } from "../qa/guide.js";
import { isResponderActive, loadResponderConfig, recoverStoppedResponder, requestResponderStop, responderStatus, runQaResponder } from "../qa/responder.js";
import { loadIosPreviewConfig } from "../qa/preview/config.js";
import { parsePreviewArgs, previewContext, runPreview } from "../qa/preview/ios.js";
import { loadWebPreviewConfig, parseWebPreviewArgs, runWebPreview, webContext } from "../qa/preview/web.js";

/**
 * `morpheus qa comments …` — agent-facing side of the QA comment loop.
 *
 * Writers (local overlay) drop batches under `local/qa-comments/pending/`.
 * Agents list, read, act, then resolve. See docs/runbooks/qa-comments.md.
 */

const USAGE = `Usage
  morpheus qa comments pending [--root <project>]
  morpheus qa comments claim --agent <identity> [--root <project>]
  morpheus qa comments show <batchId> [--root <project>]
  morpheus qa comments resolve <batchId> [batchId...] [--agent <identity>] [--root <project>]
  morpheus qa comments release <batchId> --agent <identity> [--root <project>] [--force]
  morpheus qa comments responder start|status|stop [--root <project>]
  morpheus qa comments responder recover --confirm-no-agent-process [--root <project>]
  morpheus qa comments serve --preview <url> [--port 3456] [--root <project>] [--stream-url <url>]
  --project <name> is the global flag (the parser consumes it before this command) and labels batches.
`;


function takeRootFlag(argv: string[], fallback: string): { root: string; rest: string[] } {
  const rest: string[] = [];
  let root = fallback;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") {
      const value = argv[++i];
      if (!value) throw new Error("--root requires a path");
      root = value;
    } else {
      rest.push(argv[i]!);
    }
  }
  return { root, rest };
}

function takeAgentFlag(argv: string[]): { agent: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let agent: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--agent") {
      agent = argv[++i];
      if (!agent?.trim()) throw new Error("--agent requires an identity");
    } else {
      rest.push(argv[i]!);
    }
  }
  return { agent, rest };
}

function parseServeArgs(argv: string[]): {
  preview?: string;
  port: number;
  root?: string;
  streamUrl?: string;
  project?: string;
} {
  let preview: string | undefined;
  let port = 3456;
  let root: string | undefined;
  let streamUrl: string | undefined;
  let project: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--preview") preview = argv[++i];
    else if (a === "--port") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        throw new Error(`Invalid --port (got ${argv[i]})`);
      }
      port = n;
    } else if (a === "--root") root = argv[++i];
    else if (a === "--stream-url") streamUrl = argv[++i];
    else if (a === "--project") project = argv[++i];
    else if (a.startsWith("-")) {
      throw new Error(`Unknown serve option "${a}"\n\n${USAGE}`);
    } else if (!preview) {
      preview = a;
    } else {
      throw new Error(`Unexpected argument "${a}"\n\n${USAGE}`);
    }
  }
  return { preview, port, root, streamUrl, project };
}

export async function dispatchQaComments(
  root: string,
  command: string | undefined,
  rest: string[],
  projectFlag?: string,
): Promise<number> {
  if (command === "pending" || command === undefined) {
    let projectRoot = root;
    try {
      const taken = takeRootFlag(rest, root);
      projectRoot = taken.root;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    const listings = await listPending(projectRoot);
    for (const item of listings) {
      console.log(
        `${item.id}\t${item.commentCount}\t${item.project}\t${item.createdAt}\t${item.path}`,
      );
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
    } catch (err) {
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

  if (command === "claim") {
    try {
      const taken = takeRootFlag(rest, root);
      const { agent, rest: args } = takeAgentFlag(taken.rest);
      if (!agent || args.length) throw new Error(`claim requires --agent <identity> and no batch id.\n\n${USAGE}`);
      const claim = await claimNextBatch(taken.root, agent);
      if (claim) console.log(`${claim.id}\t${claim.agent}\t${claim.claimedAt}`);
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (command === "release") {
    try {
      const taken = takeRootFlag(rest, root);
      const { agent, rest: args } = takeAgentFlag(taken.rest);
      const force = args.includes("--force");
      const ids = args.filter((arg) => arg !== "--force");
      if ((!agent && !force) || ids.length !== 1 || ids[0]?.startsWith("-")) {
        throw new Error(`release requires one batch id and --agent <identity> (or --force).\n\n${USAGE}`);
      }
      const released = await releaseBatchClaim(taken.root, ids[0]!, agent ?? "", force);
      if (!released) throw new Error(`No claim for QA batch "${ids[0]}".`);
      console.log(`Released ${ids[0]}`);
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (command === "resolve") {
    let projectRoot = root;
    let args = rest;
    let resolvedBy = "agent";
    try {
      const taken = takeRootFlag(rest, root);
      projectRoot = taken.root;
      const agentTaken = takeAgentFlag(taken.rest);
      args = agentTaken.rest;
      resolvedBy = agentTaken.agent ?? "agent";
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    if (args.length === 0) {
      console.error(`Which batch?\n\n${USAGE}`);
      return 1;
    }
    let failed = 0;
    for (const id of args) {
      let resolved;
      try {
        resolved = await resolveBatch(projectRoot, id, resolvedBy);
      } catch (error) {
        if (!(error instanceof BatchClaimedError)) throw error;
        console.error(error.message);
        failed += 1;
        continue;
      }
      if (!resolved) {
        console.error(`No QA comment batch "${id}" under local/qa-comments/.`);
        failed += 1;
        continue;
      }
      console.log(`Resolved ${resolved.id}`);
    }
    return failed === 0 ? 0 : 1;
  }

  if (command === "responder") {
    try {
      const taken = takeRootFlag(rest, root);
      const action = taken.rest[0] ?? "status";
      const confirmed = action === "recover" && taken.rest[1] === "--confirm-no-agent-process";
      if (taken.rest.length > (confirmed ? 2 : 1) || !["start", "status", "stop", "recover"].includes(action)) {
        throw new Error(`Unknown responder action.\n\n${USAGE}`);
      }
      if (action === "status") {
        const marker = await responderStatus(taken.root);
        if (!marker) console.log("No QA responder running.");
        else if (await isResponderActive(taken.root)) console.log(JSON.stringify(marker, null, 2));
        else console.log(`Stale QA responder marker (pid ${marker.pid}). Verify no agent process is editing, then run responder recover --confirm-no-agent-process.`);
      } else if (action === "stop") {
        console.log(await requestResponderStop(taken.root) ? "QA responder will stop after the current batch." : "No QA responder running.");
      } else if (action === "recover") {
        console.log(await recoverStoppedResponder(taken.root, confirmed) ? "Removed stale QA responder ownership marker." : "No QA responder marker found.");
      } else {
        const config = await loadResponderConfig(taken.root);
        const controller = new AbortController();
        const onSignal = () => controller.abort();
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
        try { await runQaResponder(taken.root, config, controller.signal); }
        finally {
          process.off("SIGINT", onSignal);
          process.off("SIGTERM", onSignal);
        }
      }
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (command === "serve") {
    let opts;
    try {
      opts = parseServeArgs(rest);
    } catch (err) {
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
          if (info.streamUrl) console.log(`Stream proxied from: ${info.streamUrl}`);
          else {
            console.log(
              "No MJPEG stream — pass --stream-url or start serve-sim first.",
            );
          }
          console.log("Open the overlay URL in a browser. Ctrl+C stops the server.");
        },
      });
      await new Promise<void>((resolve) => {
        const stop = () => {
          void server.close().finally(resolve);
        };
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
      });
      return 0;
    } catch (err) {
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
  morpheus qa preview web [start|status|stop|help] [--path </page>] [--port <n>] [--ttl-minutes <1-1440>]
                          [--ssh-host <user@host>] [--root <project>]
  The project's morpheus.json declares qa.ios (the app, its build, its launch modes; "ios help"
  lists them) and qa.web (the dev server url, the command that starts it, the first page).
  Every agent opens the QA overlay URL that start prints. Instructions: morpheus qa guide`;

function projectRootFrom(cwd: string, rest: string[]): { root: string; rest: string[] } {
  const taken = takeRootFlag(rest, "");
  if (taken.root) return { root: resolvePath(taken.root), rest: taken.rest };
  try {
    return { root: execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), rest: taken.rest };
  } catch {
    return { root: cwd, rest: taken.rest };
  }
}

export async function dispatchQaPreview(cwd: string, platform: string | undefined, rest: string[]): Promise<number> {
  if (platform === "web") return dispatchWebPreview(cwd, rest);
  if (platform !== "ios") {
    console.error(platform === undefined || platform === "--help" || platform === "-h" ? PREVIEW_USAGE : `Unknown preview platform "${platform}". Use ios or web.\n\n${PREVIEW_USAGE}`);
    return platform === "--help" || platform === "-h" ? 0 : 1;
  }
  let root: string;
  let args: string[];
  try { ({ root, rest: args } = projectRootFrom(cwd, rest)); }
  catch (error) { console.error((error as Error).message); return 1; }
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
  } catch (error) {
    console.error(`Preview: ${(error as Error).message}`);
    return 1;
  }
}

async function dispatchWebPreview(cwd: string, rest: string[]): Promise<number> {
  let root: string;
  let args: string[];
  try { ({ root, rest: args } = projectRootFrom(cwd, rest)); }
  catch (error) { console.error((error as Error).message); return 1; }
  const loaded = await loadWebPreviewConfig(root);
  if (!loaded.ok) { console.error(`${loaded.issues.join("\n")}\n\n${PREVIEW_USAGE}`); return 1; }
  const { config } = loaded;
  if (args[0] === "help") {
    console.log(PREVIEW_USAGE);
    console.log(`\nThis project's dev server: ${config.url}${config.command ? ` (started with: ${config.command.join(" ")} in ${config.cwd})` : " (must already be running)"}; first page ${config.path}.`);
    return 0;
  }
  try {
    const manifest = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as { name?: string };
    await runWebPreview(webContext(root, config), parseWebPreviewArgs(args), manifest.name ?? "project");
    return 0;
  } catch (error) {
    console.error(`Web preview: ${(error as Error).message}`);
    return 1;
  }
}

export function dispatchQaGuide(): number {
  console.log(QA_GUIDE);
  return 0;
}
