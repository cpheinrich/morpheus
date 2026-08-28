import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSTALL_RECEIPT,
  MORPHEUS_PACKAGE,
  MORPHEUS_REMOTE,
  installCurrentMorpheus,
  morpheusInstallStatus,
  updateMorpheus,
  type MorpheusCommandResult,
  type MorpheusCommandRunner,
} from "../src/self.js";

const CURRENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AHEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ok = (stdout = ""): MorpheusCommandResult => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = "failed"): MorpheusCommandResult => ({ code: 1, stdout: "", stderr });

async function receipt(root: string, commit = CURRENT): Promise<void> {
  await writeFile(
    join(root, INSTALL_RECEIPT),
    JSON.stringify({
      schema: 1,
      commit,
      remote: MORPHEUS_REMOTE,
      installedAt: "2026-08-28T12:00:00.000Z",
    }),
  );
}

describe("Morpheus installation freshness", () => {
  it("recognises a standalone package at current main", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-self-package-"));
    await receipt(root);
    const runner: MorpheusCommandRunner = async (command, args) =>
      command === "git" && args[0] === "ls-remote"
        ? ok(`${CURRENT}\trefs/heads/main\n`)
        : fail(`unexpected ${command} ${args.join(" ")}`);

    expect(await morpheusInstallStatus({ packageRoot: root, runner })).toMatchObject({
      kind: "package",
      relation: "current",
      installedSha: CURRENT,
      remoteSha: CURRENT,
      fresh: true,
    });
  });

  it("reports a copied package whose receipt is behind current main", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-self-stale-"));
    await receipt(root, AHEAD);
    const runner: MorpheusCommandRunner = async () =>
      ok(`${CURRENT}\trefs/heads/main\n`);

    expect(await morpheusInstallStatus({ packageRoot: root, runner })).toMatchObject({
      kind: "package",
      relation: "stale",
      fresh: false,
    });
  });

  it("does not mistake an ancestor repository for installed Morpheus source", async () => {
    const parent = await mkdtemp(join(tmpdir(), "morpheus-self-parent-"));
    const root = join(parent, "lib", MORPHEUS_PACKAGE);
    await mkdir(root, { recursive: true });
    const calls: string[] = [];
    const runner: MorpheusCommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") {
        return ok(`${parent}\n`);
      }
      return fail();
    };

    const status = await morpheusInstallStatus({ packageRoot: root, runner });
    expect(status).toMatchObject({ kind: "unknown", relation: "unknown", fresh: null });
    expect(calls).toEqual(["git rev-parse --show-toplevel"]);
  });

  it("names a dirty linked checkout instead of treating its HEAD as runnable proof", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-self-dirty-"));
    const runner: MorpheusCommandRunner = async (command, args) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return ok(`${root}\n`);
      if (args.join(" ") === "rev-parse HEAD") return ok(`${CURRENT}\n`);
      if (args.join(" ") === "status --porcelain") return ok(" M dist/cli/index.js\n");
      if (args[0] === "ls-remote") return ok(`${CURRENT}\trefs/heads/main\n`);
      return fail(`unexpected ${command} ${args.join(" ")}`);
    };

    expect(await morpheusInstallStatus({ packageRoot: root, runner })).toMatchObject({
      kind: "checkout",
      relation: "dirty",
      fresh: false,
    });
  });

  it("accepts a clean source checkout that contains current main", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-self-ahead-"));
    const runner: MorpheusCommandRunner = async (command, args) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return ok(`${root}\n`);
      if (args.join(" ") === "rev-parse HEAD") return ok(`${AHEAD}\n`);
      if (args.join(" ") === "status --porcelain") return ok();
      if (args[0] === "ls-remote") return ok(`${CURRENT}\trefs/heads/main\n`);
      if (args.join(" ") === `merge-base --is-ancestor ${CURRENT} ${AHEAD}`) return ok();
      return fail(`unexpected ${command} ${args.join(" ")}`);
    };

    expect(await morpheusInstallStatus({ packageRoot: root, runner })).toMatchObject({
      relation: "ahead",
      fresh: true,
    });
  });
});

function installerRunner(
  globalRoot: string,
  calls: string[],
  onClone?: (path: string) => Promise<void>,
): MorpheusCommandRunner {
  return async (command, args, cwd) => {
    calls.push([command, ...args].join(" "));
    if (command === "git" && args[0] === "clone") {
      const target = args.at(-1)!;
      await onClone?.(target);
      return ok();
    }
    if (command === "git" && args.join(" ") === "rev-parse --show-toplevel") return ok(`${cwd}\n`);
    if (command === "git" && args.join(" ") === "rev-parse HEAD") return ok(`${CURRENT}\n`);
    if (command === "git" && args.join(" ") === "status --porcelain") return ok();
    if (command === "git" && args[0] === "ls-remote") {
      return ok(`${CURRENT}\trefs/heads/main\n`);
    }
    if (command === "git" && args.join(" ") === "diff --exit-code -- dist") return ok();
    if (command === "pnpm") return ok();
    if (command === "npm" && args[0] === "pack") {
      return ok(JSON.stringify([{ filename: "morpheus-kit-0.1.0.tgz" }]));
    }
    if (command === "npm" && args.join(" ").startsWith("install --global ")) {
      await mkdir(join(globalRoot, MORPHEUS_PACKAGE), { recursive: true });
      return ok();
    }
    if (command === "npm" && args.join(" ") === "root --global") return ok(`${globalRoot}\n`);
    return fail(`unexpected ${command} ${args.join(" ")}`);
  };
}

describe("Morpheus standalone installation", () => {
  it("packs clean current main and records provenance in a real directory", async () => {
    const source = await mkdtemp(join(tmpdir(), "morpheus-self-source-"));
    const globalRoot = await mkdtemp(join(tmpdir(), "morpheus-self-global-"));
    const tempRoot = await mkdtemp(join(tmpdir(), "morpheus-self-temp-"));
    const calls: string[] = [];

    const result = await installCurrentMorpheus(source, {
      runner: installerRunner(globalRoot, calls),
      tempRoot,
      now: new Date("2026-08-28T12:00:00.000Z"),
    });

    expect(result).toEqual({ commit: CURRENT, packageRoot: join(globalRoot, MORPHEUS_PACKAGE) });
    expect(JSON.parse(await readFile(join(result.packageRoot, INSTALL_RECEIPT), "utf8"))).toEqual({
      schema: 1,
      commit: CURRENT,
      remote: MORPHEUS_REMOTE,
      installedAt: "2026-08-28T12:00:00.000Z",
    });
    expect(calls).toContain("pnpm install --frozen-lockfile");
    expect(calls).toContain("pnpm compile");
    expect(calls.some((call) => call.startsWith("npm install --global "))).toBe(true);
    expect(calls.some((call) => call.includes("npm link"))).toBe(false);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("updates through a disposable clone and removes it afterwards", async () => {
    const globalRoot = await mkdtemp(join(tmpdir(), "morpheus-self-update-global-"));
    const tempRoot = await mkdtemp(join(tmpdir(), "morpheus-self-update-temp-"));
    const calls: string[] = [];
    const runner = installerRunner(globalRoot, calls, async (path) => {
      await mkdir(dirname(path), { recursive: true });
      await mkdir(path, { recursive: true });
    });

    await updateMorpheus({ runner, tempRoot });

    expect(calls[0]).toContain(`git clone --depth 1 --branch main --single-branch ${MORPHEUS_REMOTE}`);
    expect(await readdir(tempRoot)).toEqual([]);
  });
});
