import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { companionFiles } from "./templates.js";

export interface CredentialsConfig {
  repository: string;
  path: string;
  command?: string;
  legacyRepositories?: string[];
  legacyEnvironment?: string[];
}
export const POINTER = ".morpheus/credentials.json";
class CredentialsError extends Error {}
const fail = (message: string): never => { throw new CredentialsError(message); };

/** Never surface subprocess diagnostics: an authenticated remote can contain credentials. */
function capture(program: string, args: string[], cwd: string): string {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) fail(`${program} operation failed; check authentication, access and local checkout state.`);
  return result.stdout.trim();
}
export function repositoryId(url: string): string {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!match) fail("Use a credential-free GitHub HTTPS or SSH repository URL.");
  return match![1]!.toLowerCase();
}
function within(path: string, parent: string): boolean {
  const r = relative(parent, path);
  return r === "" || (!r.startsWith(`..${sep}`) && r !== ".." && !isAbsolute(r));
}
function canonical(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  try { lstatSync(path); fail("The credentials path contains a broken symlink."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return join(canonical(dirname(path)), basename(path));
}
export function projectRoots(cwd: string): { root: string; primary: string; common: string } {
  const root = realpathSync(capture("git", ["rev-parse", "--show-toplevel"], cwd));
  const common = realpathSync(capture("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], root));
  if (basename(common) !== ".git") fail("Credentials require a standard primary checkout; bare layouts are unsupported.");
  return { root, primary: dirname(common), common };
}
export function readConfig(root: string): CredentialsConfig {
  let value: CredentialsConfig;
  try { value = JSON.parse(readFileSync(join(root, POINTER), "utf8")); }
  catch { return fail(`Cannot read ${POINTER}; configure it with morpheus credentials init <repository-url>.`); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.repository !== "string" || typeof value.path !== "string" || !value.path.trim()) {
    fail("credentials.json requires repository and path strings.");
  }
  repositoryId(value.repository);
  if (isAbsolute(value.path) || value.path.startsWith("~")) fail("The committed credentials path must be relative; use MORPHEUS_CREDENTIALS_REPO for an absolute device override.");
  if (value.command !== undefined && (typeof value.command !== "string" || !/^bin\/[A-Za-z0-9_.-]+$/.test(value.command))) fail("The companion command must be a single executable under bin/.");
  for (const field of ["legacyRepositories", "legacyEnvironment"] as const) {
    const entries = value[field];
    if (entries !== undefined && (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string"))) fail(`Invalid ${field}.`);
  }
  for (const repo of value.legacyRepositories ?? []) repositoryId(repo);
  for (const key of value.legacyEnvironment ?? []) if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) fail("Invalid legacy environment name.");
  return value;
}
export function locate(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const roots = projectRoots(cwd);
  const config = readConfig(roots.root);
  const override = ["MORPHEUS_CREDENTIALS_REPO", ...(config.legacyEnvironment ?? [])].find((key) => env[key] !== undefined);
  const configured = override ? env[override]! : config.path;
  if (!configured.trim()) fail("The credentials path override must not be empty.");
  const path = resolve(roots.primary, configured.startsWith("~/") ? join(homedir(), configured.slice(2)) : configured);
  const actual = canonical(path);
  for (const checkout of new Set([roots.root, roots.primary])) {
    for (const candidate of new Set([path, actual])) {
      if (candidate === checkout || within(candidate, roots.common)) fail("Credentials cannot occupy the project root or its Git directory.");
      if (within(candidate, checkout)) {
        const rel = relative(checkout, candidate);
        const tracked = capture("git", ["ls-files", "--", rel], checkout);
        const ignored = spawnSync("git", ["check-ignore", "-q", "--no-index", "--", rel], { cwd: checkout });
        if (tracked || ignored.status !== 0) fail("The credentials path must be untracked and Git-ignored.");
      }
    }
  }
  return { ...roots, config, path };
}
function validateStore(path: string, config: CredentialsConfig, migrate = false): void {
  if (!existsSync(path)) fail("Credentials checkout missing. Run morpheus credentials setup.");
  if (realpathSync(capture("git", ["rev-parse", "--show-toplevel"], path)) !== realpathSync(path)) fail("Credentials must be a separate Git checkout.");
  const origin = capture("git", ["config", "--get", "remote.origin.url"], path);
  if (repositoryId(origin) === repositoryId(config.repository)) return;
  if (!migrate || !(config.legacyRepositories ?? []).some((url) => repositoryId(url) === repositoryId(origin))) fail("Credentials origin differs from credentials.json; run setup for a declared rename migration.");
  const id = (url: string) => capture("gh", ["api", `repos/${repositoryId(url)}`, "--jq", ".id"], path);
  if (id(origin) !== id(config.repository)) fail("Legacy and current remotes are not the same GitHub repository.");
  capture("git", ["remote", "set-url", "origin", config.repository], path);
}
function executable(path: string, config: CredentialsConfig): string {
  const file = realpathSync(join(path, config.command ?? "bin/credentials"));
  if (!within(file, realpathSync(path)) || !statSync(file).isFile() || !(statSync(file).mode & 0o111)) fail("The configured companion executable must live inside its checkout and be executable.");
  return file;
}
function secureDirectory(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail("Refusing to change permissions through a secrets symlink.");
  chmodSync(path, stat.isDirectory() ? 0o700 : 0o600);
  if (stat.isDirectory()) for (const name of readdirSync(path)) secureDirectory(join(path, name));
}
/** Prefer the project's actual GitHub organization; scaffold still works offline before git init. */
export function scaffoldConfig(root: string, owner: string): CredentialsConfig {
  let name = basename(root).replace(/[^A-Za-z0-9_.-]/g, "-");
  try {
    const id = repositoryId(capture("git", ["config", "--get", "remote.origin.url"], root));
    [owner, name] = id.split("/") as [string, string];
  } catch { /* No configured GitHub remote yet: the seed supplies the prospective owner. */ }
  return { repository: `https://github.com/${owner}/.credentials-${name}.git`, path: `local/.credentials-${name}`, command: "bin/credentials" };
}
export function configure(cwd: string, repository: string, options: { path?: string; command?: string } = {}): void {
  repositoryId(repository);
  const { root, primary } = projectRoots(cwd);
  const file = join(root, POINTER);
  if (existsSync(file)) fail("credentials.json already exists; edit the tracked pointer deliberately instead of replacing it.");
  const config: CredentialsConfig = { repository, path: options.path ?? `local/.credentials-${basename(primary)}`, command: options.command ?? "bin/credentials" };
  if (isAbsolute(config.path) || config.path.startsWith("~")) fail("Use a relative path in the committed pointer.");
  if (!/^bin\/[A-Za-z0-9_.-]+$/.test(config.command!)) fail("The companion command must be a single executable under bin/.");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
  const ignore = join(root, ".gitignore");
  const text = existsSync(ignore) ? readFileSync(ignore, "utf8") : "";
  if (!text.split(/\r?\n/).some((line) => line === "local/" || line === "/local/")) writeFileSync(ignore, text + "\n/local/\n");
}

export function credentials(argv: string[], cwd = process.cwd()): number {
  const previousMask = process.umask(0o077);
  try {
    const [action = "status", ...args] = argv;
    if (action === "init") {
      const repository = args.shift();
      if (!repository) fail("Usage: morpheus credentials init <repository-url> [--path <relative-path>] [--command bin/<wrapper>]");
      const options: { path?: string; command?: string } = {};
      while (args.length) {
        const option = args.shift(); const value = args.shift();
        if (!value || (option !== "--path" && option !== "--command")) fail("Invalid credentials init option.");
        options[option === "--path" ? "path" : "command"] = value;
      }
      configure(cwd, repository!, options);
      console.log("Credentials pointer written. Run morpheus credentials setup (or setup --create for a new private store).");
      return 0;
    }
    if (!["setup", "status", "sync", "list", "doctor", "run"].includes(action)) fail("Unknown credentials command. Use init, setup, status, sync, list, doctor or run.");
    const create = action === "setup" && args.length === 1 && args[0] === "--create";
    if (action !== "run" && args.length && !create) fail("Unexpected credentials arguments.");
    if (action === "run" && args[0] !== "--") fail("Use morpheus credentials run -- <trusted-command> [args...].");
    if (action === "run" && args.length < 2) fail("run requires a command after --.");
    const { config, path, root } = locate(cwd);
    if (action === "status" && !existsSync(path)) {
      console.log("Credentials checkout missing. Run morpheus credentials setup; access is separate from project access."); return 0;
    }
    if (action === "setup") {
      if (create) {
        if ((config.command ?? "bin/credentials") !== "bin/credentials") fail("New stores require bin/credentials.");
        if (existsSync(path)) fail("Refusing to create over an existing checkout; use setup without --create.");
        capture("gh", ["repo", "create", repositoryId(config.repository), "--private"], root);
      }
      if (capture("gh", ["api", `repos/${repositoryId(config.repository)}`, "--jq", ".private"], root) !== "true") fail("The credentials companion must be private.");
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        capture("git", ["clone", "--", config.repository, path], root);
      }
      validateStore(path, config, true);
      if (create) {
        if ((config.command ?? "bin/credentials") !== "bin/credentials") fail("New stores use bin/credentials; configure a custom wrapper only for an existing store.");
        for (const [name, content] of Object.entries(companionFiles())) {
          const file = join(path, name); mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, content, { flag: "wx", mode: name.startsWith("bin/") ? 0o700 : 0o600 });
        }
        capture("git", ["add", "--", "README.md", "AGENTS.md", "bin/credentials", "secrets/credentials.env"], path);
        capture("git", ["commit", "-m", "Initialize private credentials companion"], path);
        capture("git", ["push", "-u", "origin", "HEAD"], path);
        capture("git", ["remote", "set-head", "origin", "--auto"], path);
      }
      secureDirectory(join(path, "secrets"));
      if (existsSync(join(path, ".githooks"))) capture("git", ["config", "core.hooksPath", ".githooks"], path);
      executable(path, config);
      console.log("Credentials ready. Run morpheus credentials doctor. Existing edits were preserved; no global launcher was changed.");
      return 0;
    }
    validateStore(path, config);
    if (action === "status") { console.log(`Credentials companion: ${path}. Use morpheus credentials list | doctor | run -- <command>.`); return 0; }
    if (action === "sync") {
      if (capture("git", ["status", "--porcelain"], path)) fail("Credentials checkout has local edits; commit or resolve them separately before sync.");
      const branch = capture("git", ["symbolic-ref", "--short", "HEAD"], path);
      const defaultRef = capture("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], path);
      if (`refs/remotes/origin/${branch}` !== defaultRef) fail("Sync only updates the default branch; leave task branches alone.");
      capture("git", ["pull", "--ff-only", "--quiet", "origin", branch], path);
      console.log("Credentials checkout synchronized without displaying its diff."); return 0;
    }
    const wrapper = executable(path, config);
    const result = spawnSync(wrapper, [action, ...args], { cwd, stdio: "inherit" });
    if (result.error) fail("Could not start the credentials wrapper.");
    return result.status ?? 1;
  } catch (error) {
    // File/parser/system errors can quote contents. Only our own plain Error messages are safe.
    console.error(error instanceof CredentialsError ? error.message : "Credentials operation failed; check the pointer, permissions and tools.");
    return 1;
  } finally { process.umask(previousMask); }
}
