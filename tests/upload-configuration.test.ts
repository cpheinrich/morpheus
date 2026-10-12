import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { afterEach, beforeEach, expect, it } from "vitest";

const actionRoot = new URL("../.github/actions/ios-testflight-upload/", import.meta.url);
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "upload-configuration-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const shell = (script: string, env: NodeJS.ProcessEnv) => promisify(execFile)("bash", ["-c", script], { cwd: root, env: { ...process.env, ...env } });

async function validation(scheme: string, configuration?: string) {
  const action = load(await readFile(new URL("action.yml", actionRoot), "utf8")) as { inputs: Record<string, { default?: string }>; runs: { steps: Array<{ name?: string; run?: string; env?: Record<string, string> }> } };
  const step = action.runs.steps.find(step => step.name === "Validate release inputs and select Xcode")!;
  expect(step.env?.CONFIGURATION).toBe("${{ inputs.configuration }}");
  const project = join(root, "apps/ios/App.xcodeproj");
  await mkdir(project, { recursive: true });
  await writeFile(join(project, "project.pbxproj"), "fixture");
  await writeFile(join(root, "env"), "");
  const result = await shell(step.run!.slice(0, step.run!.indexOf("versioned_xcode_app=")), {
    XCODE_VERSION: "26.6", WORKING_DIRECTORY: "apps/ios", PROJECT: "App.xcodeproj", SCHEME: scheme,
    CONFIGURATION: configuration ?? action.inputs.configuration?.default,
    SOURCE_PACKAGES_DIRECTORY: "Packages", GITHUB_WORKSPACE: root, RUNNER_TEMP: root, GITHUB_ENV: join(root, "env"),
  }).catch(error => error);
  return { result, contents: await readFile(join(root, "env"), "utf8") };
}

it("defaults to Release and retains a spaced scheme in job environment paths", async () => {
  const { result, contents } = await validation("Evo Production");
  expect(result.code).toBeUndefined();
  expect(Object.fromEntries(contents.trimEnd().split("\n").map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }))).toEqual({
    PROJECT_PATH: join(root, "apps/ios/App.xcodeproj"), SCHEME_NAME: "Evo Production", BUILD_CONFIGURATION: "Release",
    SOURCE_PACKAGES_PATH: join(root, "Packages"), DERIVED_DATA_PATH: join(root, "Evo Production-DerivedData-archive"), ARCHIVE_PATH: join(root, "Evo Production.xcarchive"),
  });
});

it("retains configuration spaces and treats shell-looking names as literal data", async () => {
  const { result, contents } = await validation("Evo $(touch forbidden)", "Production Internal");
  expect(result.code).toBeUndefined();
  expect(contents).toContain("SCHEME_NAME=Evo $(touch forbidden)\n");
  expect(contents).toContain("BUILD_CONFIGURATION=Production Internal\n");
  await expect(readFile(join(root, "forbidden"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each(["", "   ", "\t", "App\nINJECTED=yes", "App\rINJECTED=yes"])("refuses blank or multiline names without writing job environment: %j", async value => {
  for (const [scheme, configuration] of [[value, "Release"], ["App", value]]) {
    const { result, contents } = await validation(scheme!, configuration!);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("scheme and configuration must be non-blank single-line names");
    expect(contents).toBe("");
  }
});

it.each([undefined, "Production", "Production Internal"])("uses %j consistently in real metadata and archive argument construction", async configuration => {
  const source = await readFile(new URL("upload-testflight.sh", actionRoot), "utf8");
  const init = source.slice(source.indexOf('SCHEME_NAME="'), source.indexOf("# A runner"));
  const query = source.slice(source.indexOf('if [[ -z "$MARKETING_VERSION"'), source.indexOf('RELEASE_TEMP_DIRECTORY="'));
  const archive = source.slice(source.indexOf("archive_arguments=("), source.indexOf('ARCHIVED_APPLICATIONS_PATH="'));
  const prefix = String.raw`set -euo pipefail
run_without_release_secrets() { "$@"; }
xcodebuild() {
  /usr/bin/python3 -c 'import json,os,sys; open(os.environ["ARGV_LOG"],"a").write(json.dumps(sys.argv[1:])+"\n")' "$@"
  printf 'MARKETING_VERSION = 1.2.3\n'
}
python3() { :; }
archive_build_settings=()
`;
  await shell(prefix + init + query + archive, {
    BUILD_CONFIGURATION: configuration, SCHEME_NAME: "Evo Production", MARKETING_VERSION: "", PROJECT_PATH: "App.xcodeproj",
    SOURCE_PACKAGES_PATH: "packages", ARCHIVE_PATH: "archive", DERIVED_DATA_PATH: "derived", APPLE_TEAM_ID: "TEAM", IOS_BUNDLE_ID: "com.example.app", BUILD_NUMBER: "42",
    RELEASE_BUILD_SETTINGS_PATH: join(root, "settings"), ENTITLEMENTS_TOOL: "unused", SIGNING_PROFILE_PLIST_PATH: "unused", EXPECTED_ENTITLEMENTS_PATH: "unused", ARGV_LOG: join(root, "argv"),
  });
  const calls = (await readFile(join(root, "argv"), "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  expect(calls.map(args => args[0])).toEqual(["-showBuildSettings", "-showBuildSettings", "archive"]);
  for (const args of calls) {
    expect(args[args.indexOf("-configuration") + 1]).toBe(configuration ?? "Release");
    expect(args[args.indexOf("-scheme") + 1]).toBe("Evo Production");
  }
});
