import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doctor, EXPECTED } from "../src/doctor/index.js";
import { INSTRUCTION_ANCHORS, missingInstructions } from "../src/doctor/instructions.js";
import { agents, type Seed } from "../src/init/templates.js";
import { installContext } from "../src/session/install.js";
import { POLL_GUARD_SCRIPT } from "../src/wait-ci/hook.js";

const ROOT = join(import.meta.dirname, "..");
const SEED: Seed = { name: "Acme Health", prefix: "ACH", kind: "company", owner: "cpheinrich" };
const names = (text: string) => missingInstructions(text).map((a) => a.name);

describe("instruction anchors", () => {
  it("are all carried by the scaffold template — a drift check the template fails is a broken check", () => {
    expect(names(agents(SEED))).toEqual([]);
  });

  it("are all carried by Morpheus's own AGENTS.md", async () => {
    expect(names(await readFile(join(ROOT, "AGENTS.md"), "utf8"))).toEqual([]);
  });

  it("name exactly what a pre-wait-ci AGENTS.md is missing", () => {
    // Evo's shape: the rollout predated wait-ci, so the loop breaker never
    // learned the command, and nothing said so.
    const evo = [
      "**Break loops.** If the same command fails the same way twice, stop.",
      "## Local testing: focused first",
      "**Refresh again only when a gated command refuses**, and then re-read.",
    ].join("\n");
    expect(names(evo)).toEqual(["wait-ci", "wait-ci for workflow runs"]);
    expect(names("# agents\n")).toEqual(INSTRUCTION_ANCHORS.map((a) => a.name));
  });

  it("ignores emphasis, code spans and line wrapping, not the words", () => {
    const wrapped = [
      "**Break",
      "loops.** run `morpheus",
      "wait-ci <n>` once, or `morpheus wait-ci --run <id>`; focused tests first. Refresh again",
      "only when a gated command refuses.",
    ].join("\n");
    expect(names(wrapped)).toEqual([]);
    expect(names("Break loops. morpheus wait-ci --runner; focused first; refresh only on refusal")).toEqual(["wait-ci for workflow runs"]);
    expect(names("Break loops. morpheus wait-ci --workflow x; focused first; refresh whenever. Refusals happen")).toEqual(["refresh on refusal"]);
  });
});

describe("doctor reports instruction and poll-guard drift", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "doctor-instructions-"));
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "t", kind: "internal", prefix: "TS" }));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, ".agent/decisions.md"), "# d\n");
    await writeFile(join(root, ".agent/learned.md"), "# l\n");
    for (const d of EXPECTED.internal) await mkdir(join(root, d), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const instructionFindings = async () =>
    (await doctor({ root, offline: true })).filter((f) => f.check === "instructions").map((f) => f.message);

  it("names each missing rule and the unwired guard, then nothing once both are in place", async () => {
    await writeFile(join(root, "AGENTS.md"), "**Break loops.** Focused tests first. Refresh again only when a gated command refuses.\n");
    const before = await instructionFindings();
    expect(before).toEqual([
      `${POLL_GUARD_SCRIPT} is missing or not the generated Morpheus version, so the CI poll guard cannot run. Run \`morpheus context install\`.`,
      `AGENTS.md lacks the template's "wait-ci" guidance — add ${INSTRUCTION_ANCHORS[0]!.add}. Source: \`agents()\` in Morpheus's src/init/templates.ts.`,
      `AGENTS.md lacks the template's "wait-ci for workflow runs" guidance — add ${INSTRUCTION_ANCHORS[1]!.add}. Source: \`agents()\` in Morpheus's src/init/templates.ts.`,
    ]);

    await installContext(root, { write: true, handle: "nobody" });
    await writeFile(join(root, "AGENTS.md"), agents(SEED));
    expect(await instructionFindings()).toEqual([]);
  });

  it("reports a settings file wired for session start but not the poll guard", async () => {
    await writeFile(join(root, "AGENTS.md"), agents(SEED));
    await installContext(root, { write: true, handle: "nobody" });
    await writeFile(
      join(root, ".codex/hooks.json"),
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "sh .morpheus/session-start.sh" }] }] } }),
    );
    expect(await instructionFindings()).toEqual([
      ".codex/hooks.json has no CI poll guard — a Codex session can poll `gh run view` or `gh pr checks` indefinitely instead of one `morpheus wait-ci`. Run `morpheus context install`.",
    ]);
  });
});
