import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

it("refuses malformed reservations and escaping trusted hooks before archive or upload", async () => {
  const source = new URL("upload-testflight.sh", actionRoot).pathname;
  const env = {
    GITHUB_REF: "refs/heads/main", GITHUB_WORKSPACE: root, RUNNER_TEMP: root,
    PROJECT_PATH: "App.xcodeproj", SCHEME_NAME: "App", APPLE_TEAM_ID: "TEAM", IOS_BUNDLE_ID: "com.example.app",
    ASC_APP_ID: "123", TESTFLIGHT_BETA_GROUP_IDS: "12345678-1234-1234-1234-123456789abc",
    ASC_API_KEY_ID: "key", ASC_API_KEY_ISSUER_ID: "issuer", ASC_API_KEY_P8_BASE64: "secret",
    IOS_DISTRIBUTION_P12_BASE64: "secret", IOS_DISTRIBUTION_P12_PASSWORD: "secret", IOS_DISTRIBUTION_PROFILE_BASE64: "secret",
    OPENSSL_BINARY: "/usr/bin/true", GITHUB_ACTION_PATH: new URL(".", actionRoot).pathname,
  };
  for (const overrides of [
    { RESERVED_BUILD_NUMBER: "0" }, { RESERVED_BUILD_NUMBER: "42" },
    { BEFORE_UPLOAD_SCRIPT: "../escape" }, { AFTER_UPLOAD_SCRIPT: "/tmp/escape" },
    { DISTRIBUTION_ENABLED: "yes" },
  ]) {
    await expect(shell('bash "$SCRIPT"', { ...env, ...overrides, SCRIPT: source })).rejects.toMatchObject({code:1});
  }
});


it("checks the exported IPA identity before the upload boundary", async () => {
  const source = await readFile(new URL("upload-testflight.sh", actionRoot), "utf8");
  const check = source.slice(source.indexOf("# Bind the receipt's version/build"), source.indexOf("# The signed IPA has passed every check above."));
  const script = `set -euo pipefail
plutil() {
  case "$2" in
    CFBundleIdentifier) echo "$ACTUAL_BUNDLE" ;;
    CFBundleShortVersionString) echo "$ACTUAL_VERSION" ;;
    CFBundleVersion) echo "$ACTUAL_BUILD" ;;
  esac
}
` + check;
  const env = { EXPORTED_APPLICATION_PATH: "App.app", IOS_BUNDLE_ID: "com.example.app", MARKETING_VERSION: "1.2.3", BUILD_NUMBER: "42", ACTUAL_BUNDLE: "com.example.app", ACTUAL_VERSION: "1.2.3", ACTUAL_BUILD: "42" };
  await shell(script, env);
  for (const mismatch of [{ACTUAL_BUNDLE:"com.other.app"}, {ACTUAL_VERSION:"1.2.4"}, {ACTUAL_BUILD:"43"}]) {
    await expect(shell(script, {...env, ...mismatch})).rejects.toMatchObject({code:1});
  }
});


it("admits only main or exact CD control tags before any signing or Apple work", async () => {
  const bin = join(root, "bin"), project = join(root, "App.xcodeproj"), reached = join(root, "reached");
  await mkdir(bin); await mkdir(project);
  await writeFile(join(project, "project.pbxproj"), "fixture");
  const hook = join(root, "hook.sh");
  await writeFile(hook, "#!/bin/bash\nexit 0\n"); await chmod(hook, 0o755);
  const xcode = join(bin, "xcodebuild");
  await writeFile(xcode, '#!/bin/bash\nprintf "%s" "$1" > "$REACHED"\nexit 73\n'); await chmod(xcode, 0o755);
  const control = 'a'.repeat(40);
  const base = {
    PATH: `${bin}:${process.env.PATH}`, REACHED: reached, SCRIPT: new URL("upload-testflight.sh", actionRoot).pathname,
    GITHUB_REF: "refs/heads/main", GITHUB_WORKSPACE: root, RUNNER_TEMP: root,
    PROJECT_PATH: project, SCHEME_NAME: "App", APPLE_TEAM_ID: "TEAM", IOS_BUNDLE_ID: "com.example.app",
    ASC_APP_ID: "123", TESTFLIGHT_BETA_GROUP_IDS: "12345678-1234-1234-1234-123456789abc",
    ASC_API_KEY_ID: "key", ASC_API_KEY_ISSUER_ID: "issuer", ASC_API_KEY_P8_BASE64: "unused",
    IOS_DISTRIBUTION_P12_BASE64: "unused", IOS_DISTRIBUTION_P12_PASSWORD: "unused", IOS_DISTRIBUTION_PROFILE_BASE64: "unused",
    OPENSSL_BINARY: "/usr/bin/true", ASC_CLI: "/usr/bin/true",
    // Explicitly clear ambient CD variables for the legacy path.
    MORPHEUS_CD_CONTROL_SHA: "", MORPHEUS_CD_SOURCE_SHA: "", MORPHEUS_CD_INTENT_ID: "", MORPHEUS_CD_ATTEMPT_ID: "", MORPHEUS_CD_DISPATCH_EFFECT_ID: "",
    RESERVED_BUILD_NUMBER: "", BEFORE_UPLOAD_SCRIPT: "", AFTER_UPLOAD_SCRIPT: "", BUILD_NUMBER: "", DISTRIBUTION_ENABLED: "true",
  };
  const cd = { ...base, GITHUB_REF: `refs/tags/morpheus-cd-control-${control}`, GITHUB_SHA: control,
    MORPHEUS_CD_CONTROL_SHA: control, MORPHEUS_CD_SOURCE_SHA: 'b'.repeat(40), MORPHEUS_CD_INTENT_ID: 'intent-1',
    MORPHEUS_CD_ATTEMPT_ID: 'attempt-1', MORPHEUS_CD_DISPATCH_EFFECT_ID: 'dispatch-1', RESERVED_BUILD_NUMBER: "42",
    BEFORE_UPLOAD_SCRIPT: "hook.sh", AFTER_UPLOAD_SCRIPT: "hook.sh", DISTRIBUTION_ENABLED: "false" };
  for (const env of [base, cd]) {
    await expect(shell('bash "$SCRIPT"', env)).rejects.toMatchObject({code:73});
    expect(await readFile(reached, 'utf8')).toBe('-resolvePackageDependencies');
    await rm(reached);
  }
  const rejected: NodeJS.ProcessEnv[] = [
    {...base, GITHUB_REF: "refs/heads/feature"}, {...base, GITHUB_REF: "refs/tags/v1.2.3"},
    {...base, GITHUB_REF: cd.GITHUB_REF}, {...cd, GITHUB_REF: `refs/tags/morpheus-cd-control-${'c'.repeat(40)}`},
    {...cd, GITHUB_REF: `${cd.GITHUB_REF}-suffix`}, {...cd, GITHUB_SHA: 'c'.repeat(40)},
    {...cd, MORPHEUS_CD_CONTROL_SHA: 'A'.repeat(40)}, {...cd, MORPHEUS_CD_CONTROL_SHA: 'a'.repeat(39)},
    {...cd, MORPHEUS_CD_SOURCE_SHA: 'b'.repeat(39)}, {...cd, RESERVED_BUILD_NUMBER: '0'},
    {...cd, BEFORE_UPLOAD_SCRIPT: ''}, {...cd, AFTER_UPLOAD_SCRIPT: ''}, {...cd, DISTRIBUTION_ENABLED: 'true'},
    ...['MORPHEUS_CD_INTENT_ID', 'MORPHEUS_CD_ATTEMPT_ID', 'MORPHEUS_CD_DISPATCH_EFFECT_ID'].map(key => ({...cd, [key]: ''})),
    {...cd, MORPHEUS_CD_ATTEMPT_ID: 'unsafe\nidentity'},
  ];
  for (const env of rejected) {
    await expect(shell('bash "$SCRIPT"', env)).rejects.toMatchObject({code:1});
    await expect(readFile(reached)).rejects.toMatchObject({code:'ENOENT'});
  }
});
