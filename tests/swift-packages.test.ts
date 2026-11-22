import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import matter from "@11ty/gray-matter";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { scaffold } from "../src/init/index.js";
import { swiftPackagesPointerSkill } from "../src/init/templates.js";
import { projectSkillCatalog, syncProjectSkills } from "../src/project-skills.js";
import { SWIFT_PACKAGES_SKILL } from "../src/swift-packages/skill.js";

const REPO = join(import.meta.dirname, "..");
const NAME = "morpheus-swift-packages";
const PATHS = [`.agents/skills/${NAME}/SKILL.md`, `.claude/skills/${NAME}/SKILL.md`];
const flat = (text: string) => text.replace(/\s+/g, " ");

describe("the morpheus-swift-packages skill (distribution, not an agent behavior evaluation)", () => {
  it("ships exact canonical bytes through both providers and the CLI, with one routing description", async () => {
    for (const path of PATHS) expect(await readFile(join(REPO, path), "utf8")).toBe(SWIFT_PACKAGES_SKILL);
    const canonical = matter(SWIFT_PACKAGES_SKILL).data;
    expect(canonical.name).toBe(NAME);
    expect(matter(swiftPackagesPointerSkill()).data).toEqual(canonical);
    expect(projectSkillCatalog().find((skill) => skill.name === NAME)).toEqual({
      name: NAME,
      description: canonical.description,
      providers: ["agents", "claude"],
      projectKinds: ["company", "personal", "internal"],
      distribution: "pointer",
      guide: `morpheus skills guide ${NAME}`,
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await run(["skills", "guide", NAME])).toBe(0);
      expect(log.mock.calls).toEqual([[SWIFT_PACKAGES_SKILL.replace(/\n$/, "")]]);
      // An inherited property name is not a guide.
      log.mockClear();
      expect(await run(["skills", "guide", "constructor"])).toBe(1);
      expect(log).not.toHaveBeenCalled();
      expect(error.mock.calls).toEqual([
        [`Unknown project skill guide "constructor". Guides: visual-design, ${NAME}.`],
      ]);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("routes on the package files and the changes an agent would otherwise make locally", () => {
    const description = String(matter(SWIFT_PACKAGES_SKILL).data.description);
    for (const trigger of ["MorpheusScreenQA", "Package.swift", "Xcode package reference", "Package.resolved"]) {
      expect(description).toContain(trigger);
    }
  });

  it("orders the procedure: locate, check the newest release, decide where, then pin a tag", () => {
    const text = flat(SWIFT_PACKAGES_SKILL);
    const order = [
      "XCRemoteSwiftPackageReference",
      "`morpheus` pin in the committed `Package.resolved`",
      "at the pinned tag, not at `main`",
      "**Newest compatible release.** Before changing anything",
      "**The package already supports it.**",
      "change the app",
      "`gh api repos/cpheinrich/morpheus --jq .permissions.push` prints `true`",
      "claim a Morpheus roadmap item",
      "file a sanitized issue only when none exists",
      "Leave out private identifiers",
      "`morpheus pm block <ID> --needs",
      "Never copy, vendor, fork or locally patch package source",
      "Update the pin only after a tagged release",
      "Do not pin an untagged commit or a branch",
    ];
    let previous = -1;
    for (const phrase of order) {
      const at = text.indexOf(phrase);
      expect(at, phrase).toBeGreaterThan(previous);
      previous = at;
    }
  });

  it("states the upstream boundary in the installed pointer before the guide is read", () => {
    const pointer = flat(swiftPackagesPointerSkill());
    expect(pointer).toContain(`Run \`morpheus skills guide ${NAME}\``);
    for (const rule of [
      "check the newest compatible release",
      "Change the app only when the package already supports the behavior",
      "a sanitized Morpheus issue linked from the blocked app item",
      "Never copy, vendor or locally patch package source",
      "update the pin only to a tagged release",
    ]) {
      expect(pointer).toContain(rule);
    }
  });

  it.each(["company", "personal", "internal"] as const)(
    "installs the pointer and a one-line AGENTS.md route in a %s scaffold",
    async (kind) => {
      const root = await mkdtemp(join(tmpdir(), "swift-packages-scaffold-"));
      try {
        await scaffold(root, { name: "Acme", prefix: "AC", kind, owner: "example" });
        for (const path of PATHS) expect(await readFile(join(root, path), "utf8")).toBe(swiftPackagesPointerSkill());
        const agents = await readFile(join(root, "AGENTS.md"), "utf8");
        const gap = agents.slice(agents.indexOf("### Found a gap in Morpheus itself?"));
        expect(gap.slice(0, gap.indexOf("\n1. "))).toContain(
          `Shared Swift packages: use the \`${NAME}\` skill.`,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("adds a missing provider entrypoint without replacing a project's own copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "swift-packages-sync-"));
    try {
      const authored = `---\nname: ${NAME}\ndescription: Local package notes.\n---\nKeep these.\n`;
      await mkdir(dirname(join(root, PATHS[1]!)), { recursive: true });
      await writeFile(join(root, PATHS[1]!), authored);
      const result = await syncProjectSkills(root, "company", false);
      expect(result.issues).toEqual([]);
      expect(result.created.filter((path) => path.includes(NAME))).toEqual([PATHS[0]]);
      expect(result.present).toEqual([PATHS[1]]);
      expect(await readFile(join(root, PATHS[1]!), "utf8")).toBe(authored);
      expect(await readFile(join(root, PATHS[0]!), "utf8")).toBe(swiftPackagesPointerSkill());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/**
 * The root manifest is what every consuming app resolves. Its toolchain contract, opt-in product
 * and absence of dependencies reach those apps' builds and locks directly.
 */
describe("the root Package.swift", () => {
  const manifest = () => readFile(join(REPO, "Package.swift"), "utf8");

  it("declares the Swift 6.2 tools, Swift 5 mode and iOS 18 contract", async () => {
    const text = await manifest();
    expect(text.split("\n")[0]).toBe("// swift-tools-version: 6.2");
    expect(text).toContain("    platforms: [.iOS(.v18)],\n");
    expect(text).toContain("    swiftLanguageModes: [.v5]\n");
  });

  it("applies the same isolation and upcoming features to every target", async () => {
    const text = await manifest();
    const settings = text.match(/let swiftSettings: \[SwiftSetting\] = \[\n([\s\S]*?)\n\]/)?.[1];
    expect(settings?.split("\n").map((line) => line.trim())).toEqual([
      ".defaultIsolation(MainActor.self),",
      '.enableUpcomingFeature("MemberImportVisibility"),',
      '.enableUpcomingFeature("DisableOutwardActorInference"),',
      '.enableUpcomingFeature("GlobalActorIsolatedTypesUsability"),',
      '.enableUpcomingFeature("InferIsolatedConformances"),',
      '.enableUpcomingFeature("InferSendableFromCaptures"),',
      '.enableUpcomingFeature("NonisolatedNonsendingByDefault"),',
    ]);
    const targets = [...text.matchAll(/\.(target|testTarget)\(/g)].length;
    expect(targets).toBe(2);
    expect([...text.matchAll(/swiftSettings: swiftSettings/g)]).toHaveLength(targets);
  });

  it("publishes one opt-in product from its packages/swift paths with no package dependencies", async () => {
    const text = await manifest();
    expect([...text.matchAll(/\.library\(name: "([^"]+)"/g)].map((match) => match[1])).toEqual(["MorpheusScreenQA"]);
    expect(text).toContain('path: "packages/swift/ScreenQA/Sources/MorpheusScreenQA"');
    expect(text).toContain('path: "packages/swift/ScreenQA/Tests/MorpheusScreenQATests"');
    // Apple frameworks only: any package dependency would reach every consumer's Package.resolved.
    expect(text).not.toContain(".package(");
    expect([...text.matchAll(/dependencies: (.*)/g)].map((match) => match[1])).toEqual(['["MorpheusScreenQA"],']);
  });
});
