import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { normalizeUpstream } from "../web/server.js";
import {
  DEFAULT_TTL_MINUTES, defaultRun, launchPlist, requireFreePort, tunnelCommand, withPreviewCancellation, type Run,
} from "./ios.js";

/**
 * `morpheus qa preview web` — comment QA on a local website (MO-26-10-06-18.13.32).
 *
 * The project declares its dev server in `morpheus.json` `qa.web`. `start` attaches to the dev
 * server if it is already answering, or starts the declared command under a launchd supervisor,
 * then puts the comment overlay (a proxy that injects the toolbar) in front of it. `stop` ends the
 * overlay and only a dev server this preview started.
 */

export interface WebPreviewConfig {
  /** The dev server's origin, e.g. http://localhost:5173 — local only. */
  url: string;
  /**
   * Starts the dev server when it is not already running; omitted, the preview only attaches. With a
   * `{port}` placeholder the preview takes the site's own address: the dev server runs on a spare
   * port and the overlay listens on `url`'s port, so sign-in allowlists, cookies and redirects see
   * exactly the address they were configured for (MO-26-10-06-22.17.47).
   */
  command?: string[];
  /** Working directory for the command, relative to the project root. */
  cwd: string;
  /** The page to open first, e.g. /hq. */
  path: string;
  namespace: string;
}

export type WebConfigResult = { ok: true; config: WebPreviewConfig } | { ok: false; issues: string[] };

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function parseWebPreviewConfig(raw: unknown, projectName = "Project"): WebConfigResult {
  const web = record(record(raw)?.web);
  if (!web) return { ok: false, issues: ["morpheus.json has no qa.web block; add one naming the dev server (url) and how to start it (command)."] };
  const issues: string[] = [];
  const url = typeof web.url === "string" ? web.url : "";
  try { normalizeUpstream(url); } catch (error) { issues.push(`qa.web.url: ${(error as Error).message}`); }
  let command: string[] | undefined;
  if (web.command !== undefined) {
    if (!Array.isArray(web.command) || web.command.length === 0 || !web.command.every((c) => typeof c === "string" && c)) issues.push("qa.web.command must be a non-empty array of strings.");
    else command = web.command as string[];
  }
  const cwd = web.cwd === undefined ? "." : web.cwd;
  if (typeof cwd !== "string" || !cwd || cwd.startsWith("/") || cwd.split("/").includes("..")) issues.push("qa.web.cwd must be a path inside the project.");
  const path = web.path === undefined ? "/" : web.path;
  if (typeof path !== "string" || !path.startsWith("/")) issues.push("qa.web.path must start with /.");
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const namespace = typeof web.namespace === "string" ? web.namespace : `morpheus.qa.${slug}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(namespace) || namespace.includes("..")) issues.push("qa.web.namespace may hold letters, digits, single dots and dashes only.");
  if (issues.length) return { ok: false, issues };
  return { ok: true, config: { url: new URL(url).origin, ...(command ? { command } : {}), cwd: cwd as string, path: path as string, namespace } };
}

export async function loadWebPreviewConfig(root: string): Promise<WebConfigResult> {
  let manifest: unknown;
  try { manifest = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")); }
  catch (error) { return { ok: false, issues: [`Could not read ${join(root, "morpheus.json")}: ${(error as Error).message}`] }; }
  const m = record(manifest);
  return parseWebPreviewConfig(m?.qa, typeof m?.name === "string" && m.name ? m.name : "Project");
}

export interface WebPreviewOptions {
  command: "start" | "status" | "stop";
  port?: number;
  ttlMinutes?: number;
  path?: string;
  sshHost?: string;
}

export function parseWebPreviewArgs(argv: string[]): WebPreviewOptions {
  const args = [...argv];
  const options: WebPreviewOptions = { command: "start" };
  if (args[0] && !args[0].startsWith("-")) options.command = args.shift() as WebPreviewOptions["command"];
  if (!["start", "status", "stop"].includes(options.command)) throw new Error("Unknown command. Use start, status, stop or help.");
  while (args.length) {
    const flag = args.shift()!;
    const value = () => { const v = args.shift(); if (!v || v.startsWith("-")) throw new Error(`Missing value for ${flag}`); return v; };
    if (flag === "--port") {
      const v = value();
      if (!/^\d+$/.test(v) || Number(v) < 1024 || Number(v) > 65535) throw new Error("Port must be an integer from 1024 to 65535.");
      options.port = Number(v);
    } else if (flag === "--ttl-minutes") {
      const v = value();
      if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 1440) throw new Error("TTL must be 1–1440 minutes.");
      options.ttlMinutes = Number(v);
    } else if (flag === "--path") {
      const v = value();
      if (!v.startsWith("/")) throw new Error("--path must start with /.");
      options.path = v;
    } else if (flag === "--ssh-host") {
      const v = value();
      if (!/^[\w.@-]+$/.test(v)) throw new Error("SSH host must be a hostname or user@hostname (or an SSH config alias).");
      options.sshHost = v;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

export function webKey(root: string, config: Pick<WebPreviewConfig, "cwd">): string {
  return createHash("sha256").update(`web:${resolve(root, config.cwd)}`).digest("hex").slice(0, 12);
}

/** 4300–4555, spread per checkout, clear of the iOS preview's 3200–3711. */
export function defaultWebPort(key: string): number {
  return 4300 + (Number.parseInt(key.slice(0, 4), 16) % 256);
}

/** The page to open: the dev server's own hostname, so its cookies (a signed-in session) apply. */
export function overlayUrl(upstream: string, port: number, path: string): string {
  const host = new URL(upstream).hostname;
  return `http://${host === "[::1]" ? "localhost" : host}:${port}${path}`;
}

/** True when the dev command can be told its port, so the overlay can take the site's own address. */
export function frontable(config: Pick<WebPreviewConfig, "command">): boolean {
  return Boolean(config.command?.some((a) => a.includes("{port}")));
}

/** The site's address when the overlay holds it (own-address mode), else undefined. */
export function frontedSite(state: Pick<WebPreviewState, "site" | "port">): string | undefined {
  return state.site !== undefined && sitePort(state.site) === state.port ? state.site : undefined;
}

export function sitePort(url: string): number {
  const u = new URL(url);
  return Number(u.port || (u.protocol === "https:" ? 443 : 80));
}

/** The first port after `from` that is free on loopback, for the relocated dev server. */
export async function spareDevPort(from: number, exclude: number, attempts = 50): Promise<number> {
  for (let port = from + 1; port <= Math.min(65535, from + attempts); port++) {
    if (port === exclude) continue;
    try { await requireFreePort(port); return port; } catch { /* taken */ }
  }
  throw new Error(`No free port after ${from} for the dev server.`);
}

export interface WebPreviewState {
  /** `upstream` is where the dev server answers; `site` is the address people open (its own, when fronted). */
  root: string; upstream: string; site?: string; port: number; path: string; expiresAt: number;
  /** True when this preview started the dev server and so owns stopping it. */
  spawned: boolean; command?: string[]; cwd: string; project: string;
}

interface WebContext { root: string; config: WebPreviewConfig; key: string; stateDir: string; stateFile: string; label: string; target: string; run: Run; log: (l: string) => void }

export function webContext(root: string, config: WebPreviewConfig, run: Run = defaultRun, log: (l: string) => void = console.log): WebContext {
  const key = webKey(root, config);
  const stateDir = join(homedir(), "Library", "Caches", config.namespace, `web-${key}`);
  const label = `${config.namespace}.web.${key}`;
  return { root, config, key, stateDir, stateFile: join(stateDir, "session.json"), label, target: `gui/${process.getuid?.()}/${label}`, run, log };
}

const readJSON = <T>(path: string): T | undefined => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined);

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "manual" });
    await response.body?.cancel().catch(() => undefined);
    return response.status > 0 && response.status < 500;
  } catch { return false; }
}

/** Healthy when our overlay answers on its port and names this dev server as its upstream. */
export async function webHealthy(state: WebPreviewState | undefined): Promise<boolean> {
  if (!state) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/__qa/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const body = (await response.json()) as { upstream?: string; kind?: string };
    return body.kind === "web" && body.upstream === state.upstream;
  } catch { return false; }
}

function job(ctx: WebContext): string {
  try { return ctx.run("launchctl", ["print", ctx.target]); } catch { return ""; }
}

async function stopWeb(ctx: WebContext): Promise<void> {
  const pid = job(ctx).match(/\bpid = (\d+)/)?.[1];
  if (job(ctx)) ctx.run("launchctl", ["bootout", ctx.target]);
  if (pid) {
    for (let attempt = 0; attempt < 150; attempt++) {
      try { process.kill(Number(pid), 0); } catch { break; }
      if (attempt === 149) throw new Error("Preview is still stopping; retry stop.");
      await sleep(200);
    }
  }
  rmSync(ctx.stateFile, { force: true });
}

function report(ctx: WebContext, state: WebPreviewState, options: Pick<WebPreviewOptions, "sshHost">): void {
  const url = overlayUrl(state.site ?? state.upstream, state.port, state.path);
  const fronted = frontedSite(state) !== undefined;
  ctx.log(`Host: ${hostname()}\nCheckout: ${ctx.root}\nDev server: ${state.upstream} (${state.spawned ? "started by this preview" : "already running; left as found on stop"})`);
  if (fronted) ctx.log(`The overlay holds the site's own address (${state.site}), so sign-in allowlists and cookies see the address they expect.`);
  else if (state.site !== undefined) {
    // Only for previews that know about own-address mode; an older state file has no `site`.
    const why = !state.spawned ? `the dev server already holds ${state.site}; stop it and run start again to let the preview take its address`
      : frontable(ctx.config) ? "--port was given, which keeps the overlay on a port of its own"
      : `add a {port} placeholder to qa.web.command (e.g. ["npx", "next", "dev", "--port", "{port}"]) to let the preview take ${state.site}`;
    ctx.log(`Note: the overlay is not on the site's own address, so an allowlist for that address (Firebase or Google sign-in) may refuse requests: ${why}.`);
  }
  ctx.log(`Preview expires: ${new Date(state.expiresAt).toISOString()}. Run start to renew, or stop when finished.`);
  ctx.log(`\nQA overlay: ${url}`);
  ctx.log("Open the overlay, not the dev server, in the agent's browser:");
  ctx.log(`  Claude:  the Browser pane (preview_start with this url)\n  Codex:   the in-app browser panel\n  Grok, or any agent without a browser panel:  open ${url}`);
  ctx.log("The site works as usual. Right-click anything (or turn on Comment and click) to pin a comment; Enter saves it, ⌘Enter sends the batch.");
  ctx.log(`Inbox: morpheus qa comments pending --root ${ctx.root}\nInstructions: morpheus qa guide`);
  ctx.log(`Log: ${join(ctx.stateDir, "preview.log")}`);
  if (options.sshHost) ctx.log(`\nOn the Mac displaying your browser, leave this running:\n${tunnelCommand(options.sshHost, state.port)}\nThen open the overlay URL above on that Mac.`);
}

const supervisorPath = () => fileURLToPath(new URL("./web-supervisor.js", import.meta.url));

export async function runWebPreview(ctx: WebContext, options: WebPreviewOptions, project: string): Promise<void> {
  const previous = readJSON<WebPreviewState>(ctx.stateFile);
  if (options.command === "status") {
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      ok = await webHealthy(previous);
      if (!ok && previous && attempt < 2) await sleep(1000);
    }
    if (!ok) throw new Error(`No healthy web preview for this checkout. Run start. Log: ${join(ctx.stateDir, "preview.log")}`);
    report(ctx, previous!, options);
    return;
  }
  mkdirSync(ctx.stateDir, { recursive: true, mode: 0o700 });
  const lock = join(ctx.stateDir, "start.lock");
  try { mkdirSync(lock); } catch { throw new Error(`Another preview start is running. If it was interrupted, remove ${lock} after confirming it has ended.`); }
  const stop = () => stopWeb(ctx);
  try {
    await withPreviewCancellation(async (check) => {
      if (options.command === "stop") { await stop(); ctx.log("Stopped this checkout's web preview: the overlay, and the dev server if this preview started it."); return; }
      await stop();
      check();
      const site = ctx.config.url;
      const running = await answers(site);
      if (!running && !ctx.config.command) throw new Error(`Nothing answers at ${site}. Start the dev server, or declare qa.web.command so the preview can.`);
      // Front the site at its own address when the preview starts the dev server and can choose its
      // port; otherwise sit beside it on a port of our own.
      // --port is an explicit request for a port of our own, so it turns own-address mode off.
      const askedSite = options.port === sitePort(site);
      const front = !running && frontable(ctx.config) && (options.port === undefined || askedSite);
      if (askedSite && !front) throw new Error(`--port ${options.port} is the site's own port, which ${running ? "its dev server already holds" : "the dev server will take"}; choose another port or omit --port.`);
      const port = front ? sitePort(site) : options.port ?? previous?.port ?? defaultWebPort(ctx.key);
      await requireFreePort(port);
      const devPort = front ? await spareDevPort(port, port) : sitePort(site);
      const siteUrl = new URL(site);
      const upstream = front ? `${siteUrl.protocol}//${siteUrl.hostname}:${devPort}` : site;
      if (!running) {
        // Fail now, with the reason, rather than after the readiness wait: a command not on PATH.
        const binary = ctx.config.command![0]!;
        if (!binary.includes("/")) {
          try { ctx.run("/usr/bin/which", [binary]); }
          catch { throw new Error(`qa.web.command starts with "${binary}", which is not on PATH.`); }
        }
      }
      const state: WebPreviewState = {
        root: ctx.root, upstream, site, port, path: options.path ?? ctx.config.path, cwd: ctx.config.cwd, project,
        expiresAt: Date.now() + (options.ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60000,
        spawned: !running,
        ...(ctx.config.command ? { command: ctx.config.command.map((a) => a.replaceAll("{port}", String(devPort))) } : {}),
      };
      const temporary = `${ctx.stateFile}.tmp`;
      writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
      renameSync(temporary, ctx.stateFile);
      const plist = join(ctx.stateDir, "preview.plist");
      writeFileSync(plist, launchPlist({
        label: ctx.label, args: [process.execPath, supervisorPath(), ctx.stateFile], cwd: ctx.root, log: join(ctx.stateDir, "preview.log"),
        env: { PATH: process.env.PATH ?? "", HOME: homedir() },
      }), { mode: 0o600 });
      try {
        ctx.run("launchctl", ["bootstrap", `gui/${process.getuid!()}`, plist]);
        if (state.spawned) ctx.log(`Starting the dev server (${state.command!.join(" ")}) — the first compile can take a minute…`);
        let ready = false;
        for (let attempt = 0; attempt < 360 && !ready; attempt++) {
          ready = (await webHealthy(state)) && (await answers(upstream));
          check();
          if (!ready) await sleep(500);
        }
        if (!ready) throw new Error(`The web preview did not become ready on port ${port}. Read ${join(ctx.stateDir, "preview.log")}.`);
        report(ctx, state, options);
      } catch (error) {
        await stop();
        throw error;
      }
    }, stop);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
