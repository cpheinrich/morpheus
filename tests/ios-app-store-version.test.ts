import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const actionPath = fileURLToPath(new URL("../.github/actions/ios-app-store-version/", import.meta.url));
const executable = join(actionPath, "version.mjs");
const lookupArgs = ["--app-id", "1234567890", "--bundle-id", "com.example.ios"];
const listing = { trackId: 1234567890, bundleId: "com.example.ios", wrapperType: "software", kind: "software", version: "1.0" };
const response = (item: unknown) => ({ resultCount: 1, results: [item] });

function stubLookup(data: unknown, country = "us", status = 200) {
  const source = `
    import assert from 'node:assert/strict';
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), 'https://itunes.apple.com/lookup?id=1234567890&country=${country}&entity=software');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(${JSON.stringify(JSON.stringify(data))}, { status: ${status} });
    };`;
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

function plan(args: string[], data: unknown = response(listing), country = "us", status = 200) {
  return spawnSync(process.execPath, ["--import", stubLookup(data, country, status), executable, "plan", ...lookupArgs, ...args], { encoding: "utf8" });
}

function withProject(text: string, check: (path: string, root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "ios-version-"));
  try {
    const path = join(root, "Example Project.pbxproj");
    writeFileSync(path, text, { mode: 0o640 });
    check(path, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function apply(path: string, from = "1.0", to = "1.0.1") {
  return spawnSync(process.execPath, [executable, "apply", "--project-file", path, "--from-version", from, "--to-version", to], { encoding: "utf8" });
}

function configuration(settings: string, fields = "") {
  return `{ isa = XCBuildConfiguration; ${fields} buildSettings = { ${settings} }; name = Release; };`;
}

function project(...configs: string[]) {
  const ids = configs.map((_, index) => `F${String(index).padStart(23, "0")}`);
  return [
    "// !$*UTF8*$!", "{", "archiveVersion = 1;", "classes = {};", "objectVersion = 56;", "objects = {",
    'AAAAAAAAAAAAAAAAAAAAAAAA = { isa = PBXProject; attributes = { CURRENT_PROJECT_VERSION = 77; MARKETING_VERSION = "9.9"; NOTE = "}/**/;"; }; buildConfigurationList = BBBBBBBBBBBBBBBBBBBBBBBB; targets = (); };',
    ...configs.map((config, index) => `${ids[index]} /* Configuration */ = ${config}`),
    `BBBBBBBBBBBBBBBBBBBBBBBB = { isa = XCConfigurationList; buildConfigurations = (${ids.join(", ")},); defaultConfigurationName = Release; };`,
    "};", "rootObject = AAAAAAAAAAAAAAAAAAAAAAAA;", "}", "",
  ].join("\r\n");
}

describe("iOS App Store version CLI", () => {
  it.each([
    ["1.0", "1.0.0", undefined, "bump-required", "1.0.1"],
    ["2.1.2", "2.1.2", undefined, "bump-required", "2.1.3"],
    ["1.9.9", "1.9.9", "patch", "bump-required", "1.9.10"],
    ["1.9.9", "1.9.9", "minor", "bump-required", "1.10.0"],
    ["1.9.9", "1.9.9", "major", "bump-required", "2.0.0"],
    ["1.10", "1.9.9", undefined, "ahead", null],
    ["1.9.9", "1.10", "major", "behind", null],
  ])("compares %s to %s with component %s", (currentVersion, storeVersion, component, status, nextVersion) => {
    const args = ["--version", currentVersion, "--storefront", "GB"];
    if (component) args.push("--component", component);
    const result = plan(args, response({ ...listing, version: storeVersion }), "gb");
    expect(result).toMatchObject({ status: 0, stderr: "", stdout: `${JSON.stringify({ status, currentVersion, storeVersion, nextVersion })}\n` });
  });

  it.each(["1", "1.00", "01.0", "1.2.3.4", "1.0-beta", "1.0\n", "1.-1"])("rejects invalid Xcode version %j", (version) => {
    expect(plan(["--version", version])).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining("Xcode marketing version must be") });
  });

  it.each([
    [{ resultCount: 0, results: [] }, "No App Store listing"],
    [{ resultCount: 2, results: [listing] }, "malformed or ambiguous"],
    [response({ ...listing, trackId: 1234567891 }), "does not match"],
    [response({ ...listing, trackId: "1234567890" }), "does not match"],
    [response({ ...listing, bundleId: "com.other.ios" }), "does not match"],
    [response({ ...listing, kind: "mac-software" }), "not iOS software"],
    [response({ ...listing, wrapperType: "track" }), "not iOS software"],
    [response({ ...listing, version: null }), "App Store marketing version must be"],
    [response({ ...listing, version: "1.0.01" }), "App Store marketing version must be"],
  ])("does not propose a bump for invalid lookup %j", (data, error) => {
    expect(plan(["--version", "1.0"], data)).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining(error) });
  });

  it("fails a service error without a proposal", () => {
    expect(plan(["--version", "1.0"], {}, "us", 503)).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining("HTTP 503") });
  });

  it("requires exactly one marketing version source and a known bump level", () => {
    for (const args of [[], ["--version", "1.0", "--project-file", "not-read"]]) {
      expect(plan(args)).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining("exactly one") });
    }
    expect(plan(["--version", "1.0", "--component", "auto"])).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining("--component must be") });
  });

  it("reads and atomically rewrites all 12 settings of each kind, then guards stale writes", () => {
    const sourceProject = (version: string, build: (index: number) => number) => project(
      ...Array.from({ length: 16 }, (_, index) => configuration(index < 12
        ? `MARKETING_VERSION = ${index % 2 ? `"${version}"` : version}; CURRENT_PROJECT_VERSION = ${build(index)}; /* preserve */`
        : 'OTHER_LDFLAGS = ("$(inherited)", "-ObjC",);')),
    );
    withProject(sourceProject("1.0", (index) => index + 3), (path) => {
      const result = plan(["--project-file", path]);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ status: "bump-required", currentVersion: "1.0", storeVersion: "1.0", nextVersion: "1.0.1" });
      const source = statSync(path);
      expect(apply(path)).toMatchObject({ status: 0, stderr: "" });
      const installed = statSync(path);
      expect(installed.ino).not.toBe(source.ino);
      expect(installed.mode & 0o777).toBe(source.mode & 0o777);
      expect(readFileSync(path, "utf8")).toBe(sourceProject("1.0.1", () => 0));
      expect(apply(path)).toMatchObject({ status: 0, stderr: "" });
      expect(apply(path, "1.0", "1.0.2")).toMatchObject({ status: 1, stderr: expect.stringContaining("refusing to edit") });
      expect(statSync(path).ino).toBe(installed.ino);
      expect(readFileSync(path, "utf8")).toBe(sourceProject("1.0.1", () => 0));
    });
  });

  it.each([
    ["MARKETING_VERSION = 1.1;", "Mixed MARKETING_VERSION"],
    ['MARKETING_VERSION = "$(VERSION)";', "literal MARKETING_VERSION"],
    ['"MARKETING_VERSION[sdk=iphoneos*]" = 1.1;', "literal MARKETING_VERSION"],
    ['"MARKETING_\\U0056ERSION" = 1.1;', "Escaped assignment key"],
    ['CURRENT_PROJECT_VERSION = "$(BUILD_NUMBER)";', "literal CURRENT_PROJECT_VERSION"],
    ["CURRENT_PROJECT_VERSION /* note */ = 1.2;", "literal CURRENT_PROJECT_VERSION"],
    ["/* MARKETING_VERSION = 1.1;", "Unterminated string or comment"],
  ])("refuses an ambiguous project without modifying either setting: %s", (extra, error) => {
    const text = project(configuration("MARKETING_VERSION = 1.0; CURRENT_PROJECT_VERSION = 12;"), configuration(extra));
    withProject(text, (path) => {
      expect(apply(path)).toMatchObject({ status: 1, stderr: expect.stringContaining(error) });
      expect(readFileSync(path, "utf8")).toBe(text);
    });
  });

  it.each([
    "baseConfigurationReference = AAAAAAAAAAAAAAAAAAAAAAAB;",
    'baseConfigurationReferenceAnchor = AAAAAAAAAAAAAAAAAAAAAAAB; baseConfigurationReferenceRelativePath = "Release.xcconfig";',
  ])("refuses inherited Release settings even when Debug has an ahead literal: %s", (reference) => {
    const text = project(configuration("MARKETING_VERSION = 1.0.1; CURRENT_PROJECT_VERSION = 12;").replace("Release", "Debug"),
      configuration("", reference));
    withProject(text, (path) => {
      expect(plan(["--project-file", path])).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining("inherited xcconfig") });
      expect(apply(path, "1.0.1", "1.0.2")).toMatchObject({ status: 1, stderr: expect.stringContaining("inherited xcconfig") });
      expect(readFileSync(path, "utf8")).toBe(text);
    });
  });

  it("does not take the version from unscoped metadata or accept a repeated setting", () => {
    withProject(project(configuration("CURRENT_PROJECT_VERSION = 12;")), (path) => {
      expect(plan(["--project-file", path])).toMatchObject({ status: 1, stdout: "", stderr: expect.stringContaining("Missing MARKETING_VERSION") });
    });
    const repeated = project(configuration("MARKETING_VERSION = 1.0; CURRENT_PROJECT_VERSION = 12; MARKETING_VERSION = 1.1;"));
    withProject(repeated, (path) => {
      expect(apply(path)).toMatchObject({ status: 1, stderr: expect.stringContaining("Duplicate MARKETING_VERSION") });
      expect(readFileSync(path, "utf8")).toBe(repeated);
    });
  });

  it("refuses missing build settings, non-forward targets, and a partial pre-existing bump", () => {
    withProject(project(configuration("MARKETING_VERSION = 1.0;")), (path) => {
      expect(apply(path)).toMatchObject({ status: 1, stderr: expect.stringContaining("Missing CURRENT_PROJECT_VERSION") });
    });
    const partial = project(configuration("MARKETING_VERSION = 1.0.1; CURRENT_PROJECT_VERSION = 27;"));
    withProject(partial, (path) => {
      expect(apply(path, "1.0", "1.0.0")).toMatchObject({ status: 1, stderr: expect.stringContaining("must be greater") });
      expect(apply(path)).toMatchObject({ status: 1, stderr: expect.stringContaining("refusing to edit") });
      expect(readFileSync(path, "utf8")).toBe(partial);
    });
  });
});

describe("iOS App Store version composite action", () => {
  const action = load(readFileSync(join(actionPath, "action.yml"), "utf8")) as { runs: { steps: [{ run: string }, { run: string }] } };
  it.each([
    ["1.0.1", "ahead", "", 0],
    ["1.0", "bump-required", "1.0.1", 1],
    ["0.9", "behind", "", 1],
  ])("writes the %s plan before enforcing %s", (version, status, nextVersion, exitCode) => {
    withProject("", (output) => {
      const env = { ...process.env, GITHUB_ACTION_PATH: actionPath, GITHUB_OUTPUT: output,
        NODE_OPTIONS: `--import=${stubLookup(response(listing))}`, VERSION: version, PROJECT_FILE: "",
        APP_ID: "1234567890", BUNDLE_ID: "com.example.ios", STOREFRONT: "us", COMPONENT: "patch" };
      const planned = spawnSync("bash", ["-eo", "pipefail", "-c", action.runs.steps[0].run], { env, encoding: "utf8" });
      expect(planned).toMatchObject({ status: 0, stderr: "" });
      expect(readFileSync(output, "utf8")).toBe(`status=${status}\ncurrent-version=${version}\nstore-version=1.0\nnext-version=${nextVersion}\n`);
      const checked = spawnSync("bash", ["-eo", "pipefail", "-c", action.runs.steps[1].run], { env: { STATUS: status, NEXT_VERSION: nextVersion } });
      expect(checked.status).toBe(exitCode);
    });
  });
});
