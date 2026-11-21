import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parseProject } from "./xcode-project.mjs";

const appType = "com.apple.product-type.application";
const identityFields = [["CFBundleShortVersionString", "MARKETING_VERSION"], ["CFBundleIdentifier", "PRODUCT_BUNDLE_IDENTIFIER"]];
const identityKeys = identityFields.map(([key]) => key);
const identityOverride = (key) => identityKeys.some((identityKey) => key.startsWith("INFOPLIST_KEY_" + identityKey));
const versionPattern = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,2}$/;
const booleanSetting = /^(?:YES|NO)$/;
const literalSettings = new Map([
  ["MARKETING_VERSION", versionPattern], ["PRODUCT_BUNDLE_IDENTIFIER", /^[A-Za-z0-9.-]+$/],
  ["INFOPLIST_FILE", /^[A-Za-z0-9_./ -]+\.plist$/i], ["SKIP_INSTALL", booleanSetting],
  ...["INFOPLIST_PREPROCESS", "INFOPLIST_EXPAND_BUILD_SETTINGS", "GENERATE_INFOPLIST_FILE", "DONT_GENERATE_INFOPLIST_FILE"]
    .map((key) => [key, booleanSetting]),
]);
const derivedSettings = new Set(["CONFIGURATION", "TARGET_NAME", "PRODUCT_TYPE", "PLATFORM_NAME", "PROJECT_FILE_PATH",
  "PROJECT_DIR", "SOURCE_ROOT", "SRCROOT", "INFOPLIST_PATH", "PROCESSED_INFOPLIST_PATH"]);
const workspace = realpathSync(process.env.GITHUB_WORKSPACE);

function trackedFile(path) {
  const within = relative(workspace, path);
  if (!within || within === ".." || within.startsWith("../") || isAbsolute(within) ||
      realpathSync(path) !== path || !statSync(path).isFile()) throw new Error("Expected a regular file inside the checkout");
  const entry = execFileSync("git", ["--literal-pathspecs", "-C", workspace, "ls-files", "--stage", "-z", "--", within],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!/^100(?:644|755) [a-f0-9]+ 0\t[^\0]+\0$/.test(entry)) throw new Error("Expected a tracked regular file: " + within);
  return path;
}

function buildSettings(objects, owner, configuration) {
  const list = objects.get(owner.get("buildConfigurationList")?.literal);
  const references = list?.get("buildConfigurations");
  if (list?.get("isa")?.literal !== "XCConfigurationList" || !Array.isArray(references)) {
    throw new Error("Cannot read the archive build configuration list");
  }
  const configurations = references.map(({ literal }) => objects.get(literal));
  if (configurations.some((entry) => entry?.get("isa")?.literal !== "XCBuildConfiguration" ||
      !/^[^\\]+$/.test(entry.get("name")?.literal ?? ""))) {
    throw new Error("Expected direct literal names in the archive build configuration list");
  }
  const matches = configurations.filter((entry) => entry.get("name").literal === configuration);
  if (matches.length !== 1) {
    throw new Error("Expected exactly one direct archive build configuration named " + configuration);
  }
  const [selected] = matches;
  if ([...selected.keys()].some((key) => key.startsWith("baseConfigurationReference"))) {
    throw new Error("Cannot prove stable archive identity with an xcconfig on the archive project or app configuration");
  }
  const direct = selected.get("buildSettings");
  if (!(direct instanceof Map)) throw new Error("Missing direct archive build settings");
  for (const [key, value] of direct) {
    const name = key.split("[", 1)[0];
    if (identityOverride(name)) throw new Error("Cannot prove the archive identity with an Info.plist identity build setting override: " + key);
    const pattern = literalSettings.get(name);
    if (/\$/.test(name) || derivedSettings.has(name) ||
        (pattern && (key !== name || typeof value?.literal !== "string" || !pattern.test(value.literal)))) {
      throw new Error("Cannot prove stable archive identity with " + key + "; use direct literal identity settings");
    }
  }
  return direct;
}

function archiveProject(project, configuration) {
  const file = trackedFile(resolve(project, "project.pbxproj"));
  const root = parseProject(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(file)));
  const objects = root.get("objects");
  const owner = objects.get(root.get("rootObject")?.literal);
  const targets = owner?.get("targets");
  if (owner?.get("isa")?.literal !== "PBXProject" || !Array.isArray(targets) || owner.has("projectReferences")) {
    throw new Error("Expected one Xcode project without subproject references for archive identity");
  }
  const targetObjects = targets.map(({ literal }) => objects.get(literal));
  if (targetObjects.some((entry) => !(entry instanceof Map) || !/^PBX\w+Target$/.test(entry.get("isa")?.literal ?? "") ||
      (entry.get("isa").literal === "PBXNativeTarget" && !/^[A-Za-z0-9.-]+$/.test(entry.get("productType")?.literal ?? "")))) {
    throw new Error("Expected direct target types in the archive project");
  }
  const apps = targetObjects.filter((target) =>
    target?.get("isa")?.literal === "PBXNativeTarget" && target.get("productType")?.literal === appType);
  if (apps.length !== 1) throw new Error("Expected one native application target in the archive project");
  const [app] = apps;
  const projectSettings = buildSettings(objects, owner, configuration);
  const targetSettings = buildSettings(objects, app, configuration);
  return { target: app.get("name")?.literal, direct: (key) => (targetSettings.get(key) ?? projectSettings.get(key))?.literal };
}

function resolvedApp(project, args) {
  const json = execFileSync("xcodebuild", ["-showBuildSettings", "-json", "-project", project, ...args, "archive"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 });
  const apps = JSON.parse(json).filter(({ action, buildSettings: settings }) =>
    action === "archive" && settings?.PRODUCT_TYPE === appType && settings.PLATFORM_NAME === "iphoneos" && settings.SKIP_INSTALL === "NO");
  if (apps.length !== 1) throw new Error("Expected one installable iOS archive app; found " + apps.length);
  return apps[0];
}

function checkPlist(project, direct, settings) {
  if (![undefined, "", "NO"].includes(settings.INFOPLIST_PREPROCESS) || direct("INFOPLIST_PREPROCESS") === "YES") {
    throw new Error("Cannot prove the archive identity with Info.plist preprocessing");
  }
  if (Object.keys(settings).some(identityOverride)) {
    throw new Error("Cannot prove the archive identity with an Info.plist identity build setting override");
  }
  const file = direct("INFOPLIST_FILE");
  if (!file && !settings.INFOPLIST_FILE) {
    if (direct("GENERATE_INFOPLIST_FILE") !== "YES" || settings.GENERATE_INFOPLIST_FILE !== "YES" ||
        direct("DONT_GENERATE_INFOPLIST_FILE") === "YES" || ![undefined, "", "NO"].includes(settings.DONT_GENERATE_INFOPLIST_FILE)) {
      throw new Error("Archive app must generate its Info.plist or supply a checked-in INFOPLIST_FILE");
    }
    return;
  }
  let plist;
  try {
    const directory = dirname(project);
    if (!file || !settings.INFOPLIST_FILE || isAbsolute(file) || file.split("/").includes("..") ||
        realpathSync(settings.SRCROOT) !== directory || resolve(directory, file) !== realpathSync(resolve(directory, settings.INFOPLIST_FILE))) {
      throw new Error();
    }
    const source = trackedFile(resolve(directory, file));
    plist = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", "--", source],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new Error("Cannot read the archive app Info.plist as a literal checked-in plist inside the checkout");
  }
  if (Object.keys(plist ?? {}).some((key) => /[$][({]/.test(key) ||
      identityKeys.some((identityKey) => key !== identityKey && key.startsWith(identityKey)))) {
    throw new Error("Archive app Info.plist must declare its identity without overriding keys");
  }
  for (const [key, setting] of identityFields) {
    const value = plist?.[key];
    const expands = direct("INFOPLIST_EXPAND_BUILD_SETTINGS") !== "NO" && settings.INFOPLIST_EXPAND_BUILD_SETTINGS === "YES" &&
      ["$(" + setting + ")", "${" + setting + "}"].includes(value);
    if (value !== settings[setting] && !expands) {
      throw new Error(`Archive app Info.plist must set ${key} to the resolved ${setting} (${settings[setting]}) or expand ${setting} directly`);
    }
  }
}

try {
  const [projectPath, ...args] = process.argv.slice(2);
  const project = resolve(workspace, projectPath);
  const identity = archiveProject(project, process.env.CONFIGURATION);
  const { target, buildSettings: settings } = resolvedApp(project, args);
  if (!identity.target || identity.target !== target || realpathSync(settings.PROJECT_FILE_PATH) !== project ||
      settings.CONFIGURATION !== process.env.CONFIGURATION || !process.env.BUNDLE_ID ||
      settings.PRODUCT_BUNDLE_IDENTIFIER !== process.env.BUNDLE_ID) {
    throw new Error("Resolved archive project, target, configuration or app bundle ID does not match the version check inputs");
  }
  for (const [, key] of identityFields) {
    if (!identity.direct(key) || identity.direct(key) !== settings[key]) {
      throw new Error("Expected a direct literal " + key + " matching the resolved archive app");
    }
  }
  checkPlist(project, identity.direct, settings);
  appendFileSync(process.env.GITHUB_OUTPUT, "version=" + settings.MARKETING_VERSION + "\n");
} catch (error) {
  console.error(`iOS archive identity: ${error.message}`);
  process.exitCode = 1;
}
