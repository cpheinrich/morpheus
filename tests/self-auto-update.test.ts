import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { add as registerProject } from "../src/cli/registry.js";
import { addProject } from "../src/registry/index.js";
import {
  AUTO_UPDATE_END,
  AUTO_UPDATE_START,
  autoUpdateStatus,
  disableAutoUpdate,
  enableAutoUpdate,
  ensureAutoUpdate,
  installProjectAutoUpdate,
  readAutoUpdateConfig,
} from "../src/self-auto-update.js";
import type { MorpheusInstallStatus } from "../src/self.js";

const run = promisify(execFile);
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function status(
  relation: MorpheusInstallStatus["relation"],
  fresh: boolean | null,
): MorpheusInstallStatus {
  return {
    source: "/installed/morpheus",
    kind: "package",
    relation,
    installedSha: SHA,
    remoteSha: relation === "offline" ? null : SHA,
    fresh,
  };
}

describe("Morpheus auto-update", () => {
  let base: string;
  let root: string;
  let configPath: string;
  let registryPath: string;
  let binaryPath: string;
  let callsPath: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "morpheus-auto-update-"));
    root = join(base, "project");
    configPath = join(base, "device", "auto-update.json");
    registryPath = join(base, "device", "registry.json");
    binaryPath = join(base, "morpheus");
    callsPath = join(base, "calls.log");
    await run("git", ["init", "-q", root]);
    await writeFile(join(root, "morpheus.json"), '{"name":"test","prefix":"TE"}\n');
    await addProject({ name: "test", prefix: "TE", path: root, kind: "personal" }, registryPath);
    await writeFile(
      binaryPath,
      `#!/bin/sh\nprintf '%s\\n' "$*" >> '${callsPath}'\nexit 9\n`,
    );
    await chmod(binaryPath, 0o755);
  });

  it("requires an explicit device choice", async () => {
    expect(await readAutoUpdateConfig(configPath)).toMatchObject({
      preference: "unconfigured",
    });

    await disableAutoUpdate(root, { configPath, registryPath });
    expect(await readAutoUpdateConfig(configPath)).toMatchObject({ preference: "disabled" });

    await enableAutoUpdate(root, {
      configPath,
      registryPath,
      binaryPath,
      status: async () => status("current", true),
    });
    expect(await readAutoUpdateConfig(configPath)).toMatchObject({ preference: "enabled" });
  });

  it("preserves an existing hook, is idempotent, and never fails a completed pull", async () => {
    const hook = join(root, ".git", "hooks", "post-merge");
    const existing = `#!/bin/sh\nprintf 'existing:%s\\n' "$*" >> '${callsPath}'\n`;
    await writeFile(hook, existing);
    await chmod(hook, 0o755);

    await enableAutoUpdate(root, {
      configPath,
      registryPath,
      binaryPath,
      status: async () => status("current", true),
    });
    await enableAutoUpdate(root, {
      configPath,
      registryPath,
      binaryPath,
      status: async () => status("current", true),
    });

    const installed = await readFile(hook, "utf8");
    expect(installed.startsWith(existing)).toBe(true);
    expect(installed.match(new RegExp(AUTO_UPDATE_START, "g"))).toHaveLength(1);
    expect(installed.match(new RegExp(AUTO_UPDATE_END, "g"))).toHaveLength(1);
    await expect(run(hook, ["1"], { cwd: root })).resolves.toMatchObject({ stderr: "" });
    expect((await readFile(callsPath, "utf8")).trim().split("\n")).toEqual([
      "existing:1",
      "self ensure",
    ]);

    await disableAutoUpdate(root, { configPath, registryPath });
    expect(await readFile(hook, "utf8")).toBe(existing);
    await expect(access(join(root, ".git", "hooks", "post-rewrite"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("leaves an incompatible existing hook untouched and reports the gap", async () => {
    const hook = join(root, ".git", "hooks", "post-merge");
    const existing = "this is not a shell hook\n";
    await writeFile(hook, existing);

    const repairs = await installProjectAutoUpdate(root, binaryPath);
    expect(repairs).toContainEqual(
      expect.objectContaining({ hook: "post-merge", outcome: "blocked" }),
    );
    expect(await readFile(hook, "utf8")).toBe(existing);
  });

  it("reports missing managed hooks across the registry", async () => {
    const result = await autoUpdateStatus(root, { configPath, registryPath });
    expect(result.hooks).toHaveLength(2);
    expect(result.hooks.every((hook) => hook.outcome === "absent")).toBe(true);
  });

  it("installs the hooks when a later project joins a consented registry", async () => {
    await enableAutoUpdate(root, {
      configPath,
      registryPath,
      binaryPath,
      status: async () => status("current", true),
    });
    const later = join(base, "later-project");
    await run("git", ["init", "-q", later]);
    await writeFile(
      join(later, "morpheus.json"),
      '{"name":"later","prefix":"LA","kind":"personal"}\n',
    );
    const previousRegistry = process.env["MORPHEUS_REGISTRY"];
    const previousConfig = process.env["MORPHEUS_AUTO_UPDATE_CONFIG"];
    const previousPath = process.env["PATH"];
    process.env["MORPHEUS_REGISTRY"] = registryPath;
    process.env["MORPHEUS_AUTO_UPDATE_CONFIG"] = configPath;
    process.env["PATH"] = `${base}:${previousPath ?? ""}`;
    try {
      expect(await registerProject(later)).toBe(0);
    } finally {
      if (previousRegistry === undefined) delete process.env["MORPHEUS_REGISTRY"];
      else process.env["MORPHEUS_REGISTRY"] = previousRegistry;
      if (previousConfig === undefined) delete process.env["MORPHEUS_AUTO_UPDATE_CONFIG"];
      else process.env["MORPHEUS_AUTO_UPDATE_CONFIG"] = previousConfig;
      if (previousPath === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previousPath;
    }

    for (const hook of ["post-merge", "post-rewrite"]) {
      expect(await readFile(join(later, ".git", "hooks", hook), "utf8")).toContain(
        AUTO_UPDATE_START,
      );
    }
  });

  it("updates only after consent and only when verifiably needed", async () => {
    let updates = 0;
    const update = async () => {
      updates += 1;
      return { commit: SHA, packageRoot: "/installed/morpheus" };
    };

    expect(
      await ensureAutoUpdate({
        configPath,
        status: async () => status("stale", false),
        update,
      }),
    ).toMatchObject({ outcome: "disabled" });

    await enableAutoUpdate(root, {
      configPath,
      registryPath,
      binaryPath,
      status: async () => status("current", true),
    });
    expect(
      await ensureAutoUpdate({
        configPath,
        status: async () => status("current", true),
        update,
      }),
    ).toMatchObject({ outcome: "current" });
    expect(
      await ensureAutoUpdate({
        configPath,
        status: async () => status("offline", null),
        update,
      }),
    ).toMatchObject({ outcome: "deferred" });
    expect(
      await ensureAutoUpdate({
        configPath,
        status: async () => status("stale", false),
        update,
      }),
    ).toMatchObject({ outcome: "updated", commit: SHA });
    expect(updates).toBe(1);
  });

  it("serialises concurrent stale updates", async () => {
    await enableAutoUpdate(root, {
      configPath,
      registryPath,
      binaryPath,
      status: async () => status("current", true),
    });
    await writeFile(join(base, "device", "auto-update.lock"), "another process\n");

    expect(
      await ensureAutoUpdate({
        configPath,
        status: async () => status("stale", false),
      }),
    ).toMatchObject({ outcome: "busy" });
  });
});
