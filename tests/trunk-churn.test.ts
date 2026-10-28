import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalPbxproj,
  canonicalXml,
  classifyChanges,
  describeChurn,
  parseLsTree,
  parseRawDiff,
  type RawChange,
  type TreeEntry,
  userStatePath,
} from "../src/session/trunk-churn.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/trunk-churn");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const PBXPROJ = fixture("project.pbxproj");

/** Xcode re-sorting a build-settings dictionary: the evo#654/#675 diff. */
const RESORTED = PBXPROJ.replaceAll(
  "\t\t\t\tEVO_TELEMETRY_DISTRIBUTION = NO;\n\t\t\t\tEVO_DISPLAY_NAME = Evo;\n",
  "\t\t\t\tEVO_DISPLAY_NAME = Evo;\n\t\t\t\tEVO_TELEMETRY_DISTRIBUTION = NO;\n",
);

describe("per-user IDE state by path", () => {
  it("matches Xcode user data, Finder metadata and JetBrains' per-user files, by whole segment", () => {
    for (const path of [
      "apps/ios/App.xcodeproj/xcuserdata/chris.xcuserdatad/xcschemes/xcschememanagement.plist",
      "apps/ios/App.xcodeproj/project.xcworkspace/xcuserdata/chris.xcuserdatad/UserInterfaceState.xcuserstate",
      "xcuserdata/x",
      ".DS_Store",
      "docs/.DS_Store",
      ".idea/workspace.xml",
      "server/.idea/workspace.xml",
      ".idea/shelf/Uncommitted.xml",
      ".idea/dictionaries/chris.xml",
    ]) expect(userStatePath(path), path).toBe(true);
  });
  it("leaves shared configuration and look-alikes alone", () => {
    for (const path of [
      ".vscode/settings.json",
      ".vscode/launch.json",
      ".idea/codeStyles/Project.xml",
      ".idea/runConfigurations/App.xml",
      "src/xcuserdata.ts",
      "notxcuserdata/a",
      "docs/DS_Store.md",
      "apps/ios/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme",
      "apps/ios/App.xcodeproj/project.pbxproj",
    ]) expect(userStatePath(path), path).toBe(false);
  });
});

describe("pbxproj structure", () => {
  it("parses the fixture and ignores dictionary key order, whitespace and comments", () => {
    const canonical = canonicalPbxproj(PBXPROJ);
    expect(canonical).not.toBeNull();
    expect(RESORTED).not.toBe(PBXPROJ);
    expect(canonicalPbxproj(RESORTED)).toBe(canonical);
    const recommented = PBXPROJ.replace("/* App.swift in Sources */", "/* App.swift */").replace("\t\t\tisa = XCBuildConfiguration;", "  isa=XCBuildConfiguration ;");
    expect(canonicalPbxproj(recommented)).toBe(canonical);
  });
  it("sees every real edit: a value, a moved key, array order, a new entry, quoting", () => {
    const canonical = canonicalPbxproj(PBXPROJ);
    const edits: Record<string, string> = {
      value: PBXPROJ.replace("EVO_APP_ENVIRONMENT = development;", "EVO_APP_ENVIRONMENT = staging;"),
      // The same line, moved from Debug to Release: still one line in, one out, but a different build.
      movedBetweenDictionaries: PBXPROJ.replace("\t\t\t\tDEVELOPMENT_TEAM = ABCDE12345;\n", "").replace("\t\t\t\tEVO_APP_ENVIRONMENT = production;\n", "\t\t\t\tDEVELOPMENT_TEAM = ABCDE12345;\n\t\t\t\tEVO_APP_ENVIRONMENT = production;\n"),
      // Build phases run in array order; reordering them is behaviour.
      buildPhaseOrder: PBXPROJ.replace("\t\t\t\tB2000021 /* Sources */,\n\t\t\t\tB2000022 /* Run Script */,\n", "\t\t\t\tB2000022 /* Run Script */,\n\t\t\t\tB2000021 /* Sources */,\n"),
      newFile: PBXPROJ.replace("/* End PBXFileReference section */", "\t\tB2000004 /* New.swift */ = {isa = PBXFileReference; path = New.swift; sourceTree = \"<group>\"; };\n/* End PBXFileReference section */"),
      quoting: PBXPROJ.replace("EVO_DISPLAY_NAME = Evo;", 'EVO_DISPLAY_NAME = "Evo";'),
      explicitFileType: PBXPROJ.replace("explicitFileType = wrapper.application;", "lastKnownFileType = wrapper.application;"),
    };
    for (const [name, edited] of Object.entries(edits)) {
      expect(edited, name).not.toBe(PBXPROJ);
      expect(canonicalPbxproj(edited), name).not.toBeNull();
      expect(canonicalPbxproj(edited), name).not.toBe(canonical);
    }
  });
  it("refuses what it does not fully understand", () => {
    for (const bad of [
      "generated v1\n",
      "",
      "{ a = 1; ",
      "{ a = 1; a = 2; }", // a key written twice has no single meaning
      "{ a = b c; }",
      "{ a = \"unterminated; }",
      "{ a = 1; } trailing",
      "{ a = 1; /* unterminated }",
      "{ a = (1, 2; }",
      "{ a = @x; }",
    ]) expect(canonicalPbxproj(bad), JSON.stringify(bad)).toBeNull();
    expect(canonicalPbxproj("{ a = (1, 2,); b = <0fA1 23>; c = \"x\\\"y\"; }")).toBe('{a=(1,2);b=<0fA123>;c="x\\"y";}');
  });
});

describe("Xcode XML structure", () => {
  it("treats Xcode's attribute-per-line scheme and the compact form as one document (kairos#71)", () => {
    const compact = canonicalXml(fixture("compact.xcscheme"));
    expect(compact).not.toBeNull();
    expect(canonicalXml(fixture("xcode.xcscheme"))).toBe(compact);
  });
  it("sees a changed value, a reordered element, an added element and real text", () => {
    const base = fixture("compact.xcscheme");
    const canonical = canonicalXml(base);
    const edits = [
      base.replace('<LaunchAction buildConfiguration="Debug"', '<LaunchAction buildConfiguration="Release"'),
      base.replace('<LaunchAction buildConfiguration="Debug" launchStyle="0"/>\n   <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>', '<ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>\n   <LaunchAction buildConfiguration="Debug" launchStyle="0"/>'),
      base.replace("</Scheme>", "   <AnalyzeAction buildConfiguration=\"Debug\"/>\n</Scheme>"),
      base.replace('launchStyle="0"/>', 'launchStyle="0">note</LaunchAction>'),
      base.replace('launchStyle="0"', 'launchStyle="0 "'),
    ];
    for (const edited of edits) {
      expect(edited).not.toBe(base);
      expect(canonicalXml(edited)).not.toBe(canonical);
    }
    // Attribute order is not meaning; element order is.
    expect(canonicalXml('<a x="1" y="2"/>')).toBe(canonicalXml("<a y = '2'\n   x = '1'>\n</a>"));
  });
  it("refuses DOCTYPE, CDATA, unbalanced or malformed markup", () => {
    for (const bad of ["<!DOCTYPE x><a/>", "<a><![CDATA[x]]></a>", "<a>", "<a></b>", "</a>", '<a x="1"y="2"/>', '<a x="1" x="2"/>', "<a x=1/>", "<?xml"]) {
      expect(canonicalXml(bad), bad).toBeNull();
    }
  });
});

describe("classifying a rescue's changes", () => {
  const Z = "0".repeat(40);
  const blob = (n: number) => String(n).padStart(40, "0").replace(/^0/, "b");
  const texts = new Map<string, string>();
  const read = async (b: string) => texts.get(b) ?? null;
  const change = (over: Partial<RawChange>): RawChange => ({ path: "a.txt", status: "M", oldMode: "100644", newMode: "100644", oldBlob: blob(1), newBlob: blob(2), ...over });
  const classify = (changes: RawChange[], trunk: Record<string, TreeEntry> = {}) => classifyChanges(changes, new Map(Object.entries(trunk)), read);

  texts.set(blob(10), PBXPROJ);
  texts.set(blob(11), RESORTED);
  texts.set(blob(12), PBXPROJ.replace("EVO_APP_ENVIRONMENT = development;", "EVO_APP_ENVIRONMENT = staging;"));
  texts.set(blob(13), PBXPROJ.replace("EVO_APP_ENVIRONMENT = development;", "EVO_APP_ENVIRONMENT = staging;").replaceAll("\t", "  "));
  texts.set(blob(20), fixture("compact.xcscheme"));
  texts.set(blob(21), fixture("xcode.xcscheme"));
  texts.set(blob(30), "not a project\n");
  texts.set(blob(31), "still not a project\n");

  it("names each kind of churn", async () => {
    const result = await classify([
      change({ path: "App.xcodeproj/project.pbxproj", oldBlob: blob(10), newBlob: blob(11) }),
      change({ path: "App.xcodeproj/xcshareddata/xcschemes/App.xcscheme", oldBlob: blob(20), newBlob: blob(21) }),
      change({ path: "App.xcodeproj/xcuserdata/c.xcuserdatad/UserInterfaceState.xcuserstate" }),
      change({ path: "App.xcodeproj/xcuserdata/c.xcuserdatad/xcschemes/xcschememanagement.plist", status: "D", newMode: "000000", newBlob: Z, oldBlob: blob(5) }),
      change({ path: "README.md", newBlob: blob(7) }),
      change({ path: "docs/guide.md", newBlob: blob(8) }),
    ], {
      "README.md": { mode: "100644", blob: blob(7) },
      "docs/guide.md": { mode: "100644", blob: blob(1) },
      "App.xcodeproj/xcuserdata/c.xcuserdatad/xcschemes/xcschememanagement.plist": { mode: "100644", blob: blob(5) },
    });
    expect(result.real).toEqual(["docs/guide.md"]);
    expect(result.churn).toEqual([
      { path: "App.xcodeproj/project.pbxproj", kind: "format-only" },
      { path: "App.xcodeproj/xcshareddata/xcschemes/App.xcscheme", kind: "format-only" },
      { path: "App.xcodeproj/xcuserdata/c.xcuserdatad/UserInterfaceState.xcuserstate", kind: "user-state" },
      { path: "App.xcodeproj/xcuserdata/c.xcuserdatad/xcschemes/xcschememanagement.plist", kind: "user-state" },
      { path: "README.md", kind: "on-trunk" },
    ]);
    expect(describeChurn(result.churn)).toBe("2 formatting only, 2 IDE user state, 1 already on trunk: App.xcodeproj/project.pbxproj, App.xcodeproj/xcshareddata/xcschemes/App.xcscheme, App.xcodeproj/xcuserdata/c.xcuserdatad/UserInterfaceState.xcuserstate, … 2 more");
  });

  it("keeps a real pbxproj edit as real work, unless trunk already has the same structure", async () => {
    const edit = change({ path: "App.xcodeproj/project.pbxproj", oldBlob: blob(10), newBlob: blob(12) });
    expect(await classify([edit])).toEqual({ churn: [], real: ["App.xcodeproj/project.pbxproj"] });
    // Trunk landed the same edit in Xcode's own spelling while this checkout sat behind.
    expect((await classify([edit], { "App.xcodeproj/project.pbxproj": { mode: "100644", blob: blob(13) } })).churn).toEqual([{ path: "App.xcodeproj/project.pbxproj", kind: "on-trunk" }]);
    // Trunk has something else: still real.
    expect((await classify([edit], { "App.xcodeproj/project.pbxproj": { mode: "100644", blob: blob(10) } })).real).toHaveLength(1);
  });

  it("is on trunk only with the same bytes and mode, and a deletion only when trunk lacks the path", async () => {
    const same = { mode: "100644", blob: blob(2) };
    expect((await classify([change({})], { "a.txt": same })).churn[0]?.kind).toBe("on-trunk");
    expect((await classify([change({})], { "a.txt": { ...same, mode: "100755" } })).real).toEqual(["a.txt"]);
    expect((await classify([change({ status: "A", oldMode: "000000", oldBlob: Z })], { "a.txt": same })).churn[0]?.kind).toBe("on-trunk");
    const deleted = change({ status: "D", newMode: "000000", newBlob: Z });
    expect((await classify([deleted])).churn[0]?.kind).toBe("on-trunk");
    expect((await classify([deleted], { "a.txt": { mode: "100644", blob: blob(1) } })).real).toEqual(["a.txt"]);
    // A submodule's checkout is not moved by a reset, so a matching gitlink is not assumed safe.
    expect((await classify([change({ oldMode: "160000", newMode: "160000" })], { "a.txt": { mode: "160000", blob: blob(2) } })).real).toEqual(["a.txt"]);
  });

  it("never treats an added file as user state, and never format-checks across a mode change or unknown format", async () => {
    expect((await classify([change({ path: "x/xcuserdata/new.plist", status: "A", oldMode: "000000", oldBlob: Z })])).real).toHaveLength(1);
    expect((await classify([change({ path: "P.pbxproj", oldBlob: blob(10), newBlob: blob(11), newMode: "100755" })])).real).toHaveLength(1);
    expect((await classify([change({ path: "notes.md", oldBlob: blob(10), newBlob: blob(11) })])).real).toHaveLength(1);
    // Unparseable on either side, or unreadable: real.
    expect((await classify([change({ path: "P.pbxproj", oldBlob: blob(30), newBlob: blob(31) })])).real).toHaveLength(1);
    expect((await classify([change({ path: "P.pbxproj", oldBlob: blob(10), newBlob: blob(99) })])).real).toHaveLength(1);
    expect((await classify([change({ path: "P.pbxproj", oldBlob: blob(99), newBlob: blob(11) })])).real).toHaveLength(1);
  });
});

describe("Git output parsing", () => {
  it("reads raw diffs and recursive tree listings, including paths with spaces and tabs", () => {
    const a = "1".repeat(40), b = "2".repeat(40), z = "0".repeat(40);
    expect(parseRawDiff(`:100644 100644 ${a} ${b} M\0dir/a b.txt\0:100644 000000 ${a} ${z} D\0gone\0`)).toEqual([
      { oldMode: "100644", newMode: "100644", oldBlob: a, newBlob: b, status: "M", path: "dir/a b.txt" },
      { oldMode: "100644", newMode: "000000", oldBlob: a, newBlob: z, status: "D", path: "gone" },
    ]);
    expect(parseRawDiff("")).toEqual([]);
    expect(parseRawDiff("garbage\0path\0")).toEqual([]);
    expect(parseLsTree(`100644 blob ${a}\tdir/a\tb.txt\x00160000 commit ${b}\tsub\x00`)).toEqual(new Map([
      ["dir/a\tb.txt", { mode: "100644", blob: a }],
      ["sub", { mode: "160000", blob: b }],
    ]));
  });
});
