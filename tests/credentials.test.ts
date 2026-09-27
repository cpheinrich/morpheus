import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { configure, credentials, locate, POINTER, repositoryId, scaffoldConfig } from "../src/credentials/index.js";
import { companionFiles, credentialsInstructions } from "../src/credentials/templates.js";
import { run } from "../src/cli/run.js";

const dirs: string[] = [];
const repository = "https://github.com/example/.credentials-demo.git";
function command(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "morpheus-credentials-"))); dirs.push(base);
  const root = join(base, "project"); mkdirSync(root);
  command(root, "init", "-b", "main"); command(root, "config", "user.email", "test@example.com"); command(root, "config", "user.name", "Test");
  writeFileSync(join(root, ".gitignore"), "/local/\n");
  configure(root, repository);
  command(root, "add", "."); command(root, "commit", "-m", "fixture");
  return { base, root, path: join(root, "local/.credentials-project") };
}
function store(path: string, origin = repository) {
  mkdirSync(path, { recursive: true }); command(path, "init", "-b", "main");
  command(path, "config", "user.email", "test@example.com"); command(path, "config", "user.name", "Test");
  command(path, "remote", "add", "origin", origin);
  for (const [name, content] of Object.entries(companionFiles())) {
    const file = join(path, name); mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content, { mode: name.startsWith("bin/") ? 0o700 : 0o600 });
  }
  command(path, "add", "."); command(path, "commit", "-m", "companion");
}
function fakeGh(base: string, body = "echo true") {
  const bin = join(base, "fake-bin"); mkdirSync(bin);
  writeFileSync(join(bin, "gh"), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("credentials companions", () => {
  it("scaffolds the organization from the project origin instead of assuming the author's account", () => {
    const { root } = fixture(); command(root, "remote", "add", "origin", "git@github.com:darwin-health/evo.git");
    expect(scaffoldConfig(root, "contributor")).toEqual({ repository: "https://github.com/darwin-health/.credentials-evo.git", path: "local/.credentials-evo", command: "bin/credentials" });
  });
  it("creates a private remote and pushes only an empty starter on explicit create", () => {
    const { root, base, path } = fixture(); const bare = join(base, "remote.git");
    fakeGh(base, `case "$1 $2" in "repo create") git init --bare --initial-branch=main '${bare}' >/dev/null;; *) echo true;; esac`);
    vi.stubEnv("GIT_CONFIG_COUNT", "3");
    vi.stubEnv("GIT_CONFIG_KEY_0", `url.${bare}.insteadOf`); vi.stubEnv("GIT_CONFIG_VALUE_0", repository);
    vi.stubEnv("GIT_CONFIG_KEY_1", "user.name"); vi.stubEnv("GIT_CONFIG_VALUE_1", "Test");
    vi.stubEnv("GIT_CONFIG_KEY_2", "user.email"); vi.stubEnv("GIT_CONFIG_VALUE_2", "test@example.com");
    expect(credentials(["setup", "--create"], root)).toBe(0);
    expect(command(bare, "show", "main:secrets/credentials.env")).toBe("# Low-risk local credentials only. Bash KEY='value' assignments; no placeholders.");
    expect(command(path, "status", "--porcelain")).toBe("");
    expect(credentials(["sync"], root)).toBe(0);
    expect(command(path, "symbolic-ref", "refs/remotes/origin/HEAD")).toBe("refs/remotes/origin/main");
    expect(credentials(["setup", "--create"], root)).toBe(1);
  });
  it("normalizes GitHub SSH/HTTPS identities and rejects credential-bearing URLs", () => {
    expect(repositoryId(repository)).toBe("example/.credentials-demo");
    expect(repositoryId("git@github.com:Example/.credentials-demo.git")).toBe("example/.credentials-demo");
    expect(() => repositoryId("https://token@github.com/example/store.git")).toThrow();
  });
  it("writes a portable pointer and never overwrites an authored one", () => {
    const { root, path } = fixture();
    expect(locate(root).path).toBe(path);
    expect(JSON.parse(readFileSync(join(root, POINTER), "utf8"))).toEqual({ repository, path: "local/.credentials-project", command: "bin/credentials" });
    expect(() => configure(root, repository)).toThrow("already exists");
    expect(credentialsInstructions()).toContain("run `morpheus credentials setup` to clone");
  });
  it("resolves paths from primary checkout even in nested worktree directories", () => {
    const { root, base, path } = fixture();
    const worktree = join(base, "task"); command(root, "worktree", "add", "--detach", worktree);
    const nested = join(worktree, "nested"); mkdirSync(nested);
    expect(locate(nested).path).toBe(path);
    expect(locate(nested, { MORPHEUS_CREDENTIALS_REPO: "../shared" }).path).toBe(join(base, "shared"));
  });
  it("supports legacy overrides but does not silently replace an empty explicit override", () => {
    const { root, base } = fixture();
    const config = JSON.parse(readFileSync(join(root, POINTER), "utf8")); config.legacyEnvironment = ["LAKINA_CREDENTIALS_REPO", "LAKINA_CONFIG_REPO"];
    writeFileSync(join(root, POINTER), JSON.stringify(config));
    expect(locate(root, { LAKINA_CONFIG_REPO: "../legacy" }).path).toBe(join(base, "legacy"));
    expect(locate(root, { MORPHEUS_CREDENTIALS_REPO: "../new", LAKINA_CONFIG_REPO: "../old" }).path).toBe(join(base, "new"));
    expect(() => locate(root, { MORPHEUS_CREDENTIALS_REPO: "", LAKINA_CONFIG_REPO: "../old" })).toThrow("empty");
  });
  it("refuses unignored, tracked, root and git-directory destinations", () => {
    const { root } = fixture();
    for (const path of ["public-store", ".", ".git/private"]) expect(() => locate(root, { MORPHEUS_CREDENTIALS_REPO: path })).toThrow();
    mkdirSync(join(root, "local/tracked"), { recursive: true }); writeFileSync(join(root, "local/tracked/file"), "not-secret");
    command(root, "add", "-f", "local/tracked/file");
    expect(() => locate(root, { MORPHEUS_CREDENTIALS_REPO: "local/tracked" })).toThrow("untracked");
  });
  it("accepts shared symlinks but checks their resolved destinations", () => {
    const { root, base, path } = fixture(); const shared = join(base, "shared"); store(shared);
    mkdirSync(join(root, "local")); symlinkSync(shared, path);
    expect(credentials(["status"], root)).toBe(0);
    rmSync(path); mkdirSync(join(root, "exposed")); symlinkSync(join(root, "exposed"), path);
    expect(() => locate(root)).toThrow("Git-ignored");
  });
  it("status reports missing without network access or clone", () => {
    const { root, path, base } = fixture(); fakeGh(base, "exit 99");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(credentials(["status"], root)).toBe(0); expect(existsSync(path)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("setup"));
  });
  it("clones a missing private store, preserves edits on repeat setup and does not install global launchers", () => {
    const { root, base, path } = fixture(); const source = join(base, "source"); store(source);
    fakeGh(base);
    vi.stubEnv("GIT_CONFIG_COUNT", "1"); vi.stubEnv("GIT_CONFIG_KEY_0", `url.${source}.insteadOf`); vi.stubEnv("GIT_CONFIG_VALUE_0", repository);
    expect(credentials(["setup"], root)).toBe(0);
    expect(command(path, "config", "remote.origin.url")).toBe(repository);
    writeFileSync(join(path, "notes.txt"), "keep edit");
    expect(credentials(["setup"], root)).toBe(0);
    expect(readFileSync(join(path, "notes.txt"), "utf8")).toBe("keep edit");
    expect(credentials(["doctor"], root)).toBe(0);
  });
  it("refuses denied access and public repositories without leaking gh diagnostics or cloning", () => {
    const { root, base, path } = fixture(); fakeGh(base, "echo private-diagnostic >&2; exit 1");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(credentials(["setup"], root)).toBe(1); expect(existsSync(path)).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-diagnostic");
    writeFileSync(join(base, "fake-bin/gh"), "#!/bin/sh\necho false\n");
    expect(credentials(["setup"], root)).toBe(1); expect(existsSync(path)).toBe(false);
  });
  it("only migrates declared remotes after GitHub proves repository identity", () => {
    const { root, base, path } = fixture(); const old = "https://github.com/example/.config-demo.git"; store(path, old);
    const config = JSON.parse(readFileSync(join(root, POINTER), "utf8")); config.legacyRepositories = [old]; writeFileSync(join(root, POINTER), JSON.stringify(config));
    fakeGh(base, 'case "$*" in *private*) echo true;; *) echo 123;; esac');
    expect(credentials(["status"], root)).toBe(1);
    expect(credentials(["setup"], root)).toBe(0);
    expect(command(path, "config", "remote.origin.url")).toBe(repository);
  });
  it("rejects a falsely declared rename and preserves the old origin", () => {
    const { root, base, path } = fixture(); const old = "https://github.com/example/.config-demo.git"; store(path, old);
    const config = JSON.parse(readFileSync(join(root, POINTER), "utf8")); config.legacyRepositories = [old]; writeFileSync(join(root, POINTER), JSON.stringify(config));
    fakeGh(base, 'case "$*" in *private*) echo true;; *config-demo*) echo 123;; *) echo 456;; esac');
    expect(credentials(["setup"], root)).toBe(1);
    expect(command(path, "config", "remote.origin.url")).toBe(old);
  });
  it("sync fast-forwards a clean default clone and refuses dirty or task branches", () => {
    const { root, base, path } = fixture(); const source = join(base, "source"); store(source); fakeGh(base);
    vi.stubEnv("GIT_CONFIG_COUNT", "1"); vi.stubEnv("GIT_CONFIG_KEY_0", `url.${source}.insteadOf`); vi.stubEnv("GIT_CONFIG_VALUE_0", repository);
    expect(credentials(["setup"], root)).toBe(0);
    writeFileSync(join(source, "README.md"), "new documentation"); command(source, "add", "README.md"); command(source, "commit", "-m", "update");
    expect(credentials(["sync"], root)).toBe(0); expect(command(path, "rev-parse", "HEAD")).toBe(command(source, "rev-parse", "HEAD"));
    writeFileSync(join(path, "notes"), "keep"); expect(credentials(["sync"], root)).toBe(1);
    rmSync(join(path, "notes")); command(path, "checkout", "-b", "task"); expect(credentials(["sync"], root)).toBe(1);
  });
  it("forwards child flags and exit status through the exact local wrapper", async () => {
    const { root, path } = fixture(); store(path);
    const output = join(root, "child.json");
    vi.spyOn(process, "cwd").mockReturnValue(root);
    expect(await run(["credentials", "run", "--", process.execPath, "-e", `require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2))); process.exit(7)`, output, "--help", "--project", "example"])).toBe(7);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(["--help", "--project", "example"]);
  });
  it("generated wrapper hides values, injects them and fails doctor on loose modes", () => {
    const { path } = fixture(); store(path);
    writeFileSync(join(path, "secrets/credentials.env"), "SYNTHETIC_KEY='synthetic-private-value'\n");
    const wrapper = join(path, "bin/credentials");
    expect(spawnSync(wrapper, ["list"], { encoding: "utf8" }).stdout).toBe("SYNTHETIC_KEY=<hidden>\n");
    const result = spawnSync(wrapper, ["run", "--", process.execPath, "-e", "process.exit(process.env.SYNTHETIC_KEY === 'synthetic-private-value' ? 0 : 9)"], { encoding: "utf8" });
    expect([result.status, result.stdout, result.stderr]).toEqual([0, "", ""]);
    chmodSync(join(path, "secrets/credentials.env"), 0o644);
    expect(spawnSync(wrapper, ["doctor"]).status).toBe(1);
  });
});
