import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addProject,
  readRegistry,
  removeProject,
  RegistryError,
  suggestPrefix,
  takenPrefixes,
} from "../src/registry/index.js";

let reg: string;

beforeEach(async () => {
  reg = join(await mkdtemp(join(tmpdir(), "morpheus-reg-")), "registry.json");
});

describe("suggestPrefix", () => {
  it("takes the first two letters when free", () => {
    expect(suggestPrefix("evo", new Set())).toBe("EV");
  });

  it("falls back to three letters when two are taken", () => {
    expect(suggestPrefix("evo", new Set(["EV"]))).toBe("EVO");
  });

  it("uses word initials for a multi-word name", () => {
    expect(suggestPrefix("darwin health", new Set(["DA", "DAR"]))).toBe("DH");
  });

  it("keeps searching rather than returning a taken prefix", () => {
    const taken = new Set(["EV", "EVO", "E", "EVOA"]);
    expect(taken.has(suggestPrefix("evo", taken))).toBe(false);
  });

  it("ignores non-letters", () => {
    expect(suggestPrefix("heinrich.money", new Set())).toBe("HE");
  });
});

describe("registry", () => {
  it("returns an empty registry when the file does not exist", async () => {
    expect((await readRegistry(reg)).projects).toHaveLength(0);
  });

  it("adds and reads back a project", async () => {
    await addProject(
      { name: "evo", prefix: "EV", path: "/tmp/evo", kind: "company", org: "darwin-health" },
      reg,
    );
    const r = await readRegistry(reg);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0]!.prefix).toBe("EV");
    expect(r.projects[0]!.org).toBe("darwin-health");
  });

  it("rejects a prefix already used by a different project", async () => {
    await addProject({ name: "evo", prefix: "EV", path: "/tmp/evo", kind: "company" }, reg);
    await expect(
      addProject({ name: "evernote", prefix: "EV", path: "/tmp/en", kind: "personal" }, reg),
    ).rejects.toBeInstanceOf(RegistryError);
  });

  it("allows re-registering the same path with the same prefix", async () => {
    await addProject({ name: "evo", prefix: "EV", path: "/tmp/evo", kind: "company" }, reg);
    await addProject({ name: "evo", prefix: "EV", path: "/tmp/evo", kind: "company" }, reg);
    expect((await readRegistry(reg)).projects).toHaveLength(1);
  });

  it("rejects a malformed prefix", async () => {
    await expect(
      addProject({ name: "x", prefix: "toolong", path: "/tmp/x", kind: "personal" }, reg),
    ).rejects.toThrow();
    await expect(
      addProject({ name: "x", prefix: "ev", path: "/tmp/x", kind: "personal" }, reg),
    ).rejects.toThrow();
  });

  it("keeps projects sorted by name", async () => {
    await addProject({ name: "zeta", prefix: "ZE", path: "/tmp/z", kind: "personal" }, reg);
    await addProject({ name: "alpha", prefix: "AL", path: "/tmp/a", kind: "personal" }, reg);
    expect((await readRegistry(reg)).projects.map((p) => p.name)).toEqual(["alpha", "zeta"]);
  });

  it("removes a project and refuses an unknown one", async () => {
    await addProject({ name: "evo", prefix: "EV", path: "/tmp/evo", kind: "company" }, reg);
    await removeProject("evo", reg);
    expect((await readRegistry(reg)).projects).toHaveLength(0);
    await expect(removeProject("evo", reg)).rejects.toBeInstanceOf(RegistryError);
  });

  it("reports taken prefixes", async () => {
    await addProject({ name: "evo", prefix: "EV", path: "/tmp/evo", kind: "company" }, reg);
    expect(takenPrefixes(await readRegistry(reg))).toEqual(new Set(["EV"]));
  });
});
