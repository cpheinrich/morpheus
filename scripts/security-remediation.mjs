#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  findingKey,
  findingsFromOsvJson,
  isSecurityDependencyOnly,
  SECURITY_MARKER,
} from "../dist/security/policy.js";

const INCIDENT_LABELS = [
  ["security-incident", "b60205", "Security incident record"],
  ["dependency-malware", "8b0000", "Malicious dependency advisory"],
  ["automated", "1f883d", "Created by automation"],
  ["needs-exposure-review", "d4c5f9", "Human exposure assessment required"],
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function run(file, args, options = {}) {
  return execFileSync(file, args, {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function gh(args) {
  const output = run("gh", args);
  return output ? JSON.parse(output) : null;
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trim()}\n`);
  else process.stdout.write(`${markdown.trim()}\n`);
}

function loadConfig() {
  const path = process.env.SECURITY_CONFIG ?? ".github/morpheus-security.json";
  if (!existsSync(path)) return { version: 1, holds: [], incidentRepository: null };
  const config = JSON.parse(readFileSync(path, "utf8"));
  if (config?.version !== 1 || !Array.isArray(config.holds ?? [])) {
    throw new Error("Security config must have version 1 and an optional holds array");
  }
  return { holds: [], incidentRepository: null, ...config };
}

function dependabotFindings(repo) {
  const pages = gh(["api", "--paginate", "--slurp", `repos/${repo}/dependabot/alerts?state=open&per_page=100`]);
  return (pages ?? []).flatMap((page) => page).filter((alert) => !alert.security_advisory?.withdrawn_at).map((alert) => ({
    ecosystem: alert.dependency.package.ecosystem,
    dependency: alert.dependency.package.name,
    version: "unknown",
    advisory: alert.security_advisory.ghsa_id,
    aliases: (alert.security_advisory.identifiers ?? []).map((identifier) => identifier.value).sort(),
    fixedVersion: alert.security_vulnerability.first_patched_version?.identifier ?? null,
    sourcePath: alert.dependency.manifest_path,
    malicious: String(alert.security_advisory.ghsa_id).startsWith("MAL-"),
    withdrawn: false,
  }));
}

export function combineFindings(osv, github) {
  const combined = [...osv];
  for (const candidate of github) {
    const match = combined.find((finding) =>
      finding.ecosystem.toLowerCase() === candidate.ecosystem.toLowerCase() &&
      finding.dependency === candidate.dependency &&
      finding.aliases.some((alias) => candidate.aliases.includes(alias)));
    if (match) {
      match.aliases = [...new Set([...match.aliases, ...candidate.aliases])].sort();
      match.fixedVersion ??= candidate.fixedVersion;
    } else {
      combined.push(candidate);
    }
  }
  return combined.sort((a, b) =>
    Number(b.malicious) - Number(a.malicious) ||
    a.sourcePath.localeCompare(b.sourcePath) || a.dependency.localeCompare(b.dependency));
}

function openSecurityPulls(repo) {
  const pages = gh(["api", "--paginate", "--slurp", `repos/${repo}/pulls?state=open&per_page=100`]);
  return (pages ?? []).flatMap((page) => page).filter((pr) =>
    pr.user?.login === "morpheus-security[bot]" && String(pr.body ?? "").includes(SECURITY_MARKER));
}

function held(finding, config) {
  return config.holds.find((hold) => hold.dependency === finding.dependency &&
    (!hold.advisory || finding.aliases.includes(hold.advisory)));
}

function slug(value) {
  return value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45);
}

function ensureLabel(repo, name, color, description) {
  try {
    gh(["api", `repos/${repo}/labels/${encodeURIComponent(name)}`]);
  } catch {
    run("gh", ["api", "--method", "POST", `repos/${repo}/labels`, "-f", `name=${name}`, "-f", `color=${color}`, "-f", `description=${description}`]);
  }
}

function incidentRepository(repo, config) {
  const visibility = run("gh", ["api", `repos/${repo}`, "--jq", ".visibility"]);
  if (visibility === "public") {
    if (!config.incidentRepository) throw new Error("Public repositories require a private incidentRepository");
    return config.incidentRepository;
  }
  return config.incidentRepository ?? repo;
}

function upsertMalwareIncident(repo, finding, config) {
  const target = incidentRepository(repo, config);
  for (const label of INCIDENT_LABELS) ensureLabel(target, ...label);
  const marker = `<!-- morpheus-malware-incident:${findingKey(finding)} -->`;
  const pages = gh(["api", "--paginate", "--slurp", `repos/${target}/issues?state=all&labels=dependency-malware&per_page=100`]);
  const existing = (pages ?? []).flatMap((page) => page).find((issue) => String(issue.body ?? "").includes(marker));
  const body = `${marker}\n\nMorpheus Security detected malicious package advisory **${finding.advisory}** for ` +
    `\`${finding.dependency}@${finding.version}\` in \`${repo}\` (\`${finding.sourcePath}\`).\n\n` +
    `Automated remediation is being attempted separately. This incident remains open until a human records whether the affected package was installed or executed, what credentials were exposed, and what rotation or containment was completed.\n\n` +
    `Advisory: https://osv.dev/vulnerability/${finding.advisory}`;
  if (existing) {
    run("gh", ["api", "--method", "PATCH", `repos/${target}/issues/${existing.number}`, "-f", `body=${body}`]);
    return existing.html_url;
  }
  const created = gh(["api", "--method", "POST", `repos/${target}/issues`,
    "-f", `title=[Security incident] ${finding.advisory} in ${finding.dependency}`,
    "-f", `body=${body}`,
    ...INCIDENT_LABELS.flatMap(([name]) => ["-f", `labels[]=${name}`])]);
  return created.html_url;
}

function packageRoot(lockfile) {
  return dirname(resolve(lockfile));
}

function installedNpmVersion(lockfile, dependency) {
  const lock = JSON.parse(readFileSync(lockfile, "utf8"));
  const suffix = `/node_modules/${dependency}`;
  const matches = Object.entries(lock.packages ?? {}).filter(([path]) =>
    path === `node_modules/${dependency}` || path.endsWith(suffix));
  const versions = [...new Set(matches.map(([, entry]) => entry.version).filter(Boolean))];
  return versions.length === 1 ? versions[0] : null;
}

function updateNpm(finding) {
  const root = packageRoot(finding.sourcePath);
  const manifestPath = join(root, "package.json");
  if (!existsSync(manifestPath)) throw new Error(`No package.json beside ${finding.sourcePath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const groups = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  const direct = groups.find((group) => Object.hasOwn(manifest[group] ?? {}, finding.dependency));
  if (finding.malicious && !finding.fixedVersion) {
    if (!direct) throw new Error(`Malicious transitive ${finding.dependency} has no fixed version; incident opened but automatic removal is unsafe`);
    delete manifest[direct][finding.dependency];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root });
    return { strategy: "remove-malicious-direct", manifestPath: relative(process.cwd(), manifestPath) };
  }
  if (!finding.fixedVersion) throw new Error(`${finding.advisory} has no fixed version`);
  if (direct) {
    const current = manifest[direct][finding.dependency];
    const prefix = typeof current === "string" && /^[~^]/.test(current) ? current[0] : "";
    manifest[direct][finding.dependency] = `${prefix}${finding.fixedVersion}`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root });
    return { strategy: "direct", manifestPath: relative(process.cwd(), manifestPath) };
  }

  run("npm", ["update", finding.dependency, "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root });
  const updated = installedNpmVersion(finding.sourcePath, finding.dependency);
  if (updated && updated !== finding.version) return { strategy: "transitive-compatible", manifestPath: null };

  // The parent range cannot reach the fix. An exact npm override is smaller
  // than an unrelated parent major bump; CI still has final authority.
  const refreshed = JSON.parse(readFileSync(manifestPath, "utf8"));
  refreshed.overrides = { ...(refreshed.overrides ?? {}), [finding.dependency]: finding.fixedVersion };
  writeFileSync(manifestPath, `${JSON.stringify(refreshed, null, 2)}\n`);
  run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root });
  return { strategy: "transitive-override", manifestPath: relative(process.cwd(), manifestPath) };
}

function updateUv(finding) {
  if (!finding.fixedVersion) throw new Error(`${finding.advisory} has no fixed version`);
  const root = packageRoot(finding.sourcePath);
  run("uv", ["lock", "--upgrade-package", `${finding.dependency}>=${finding.fixedVersion}`], { cwd: root });
  return { strategy: "uv-lock", manifestPath: null };
}

function applyUpdate(finding) {
  const base = basename(finding.sourcePath);
  if (base === "package-lock.json") return updateNpm(finding);
  if (base === "uv.lock") return updateUv(finding);
  throw new Error(`No remediation adapter for ${base}; OSV detection still covers it`);
}

function assertOfficialNpmArtifacts(lockfile, beforeText) {
  const lock = JSON.parse(readFileSync(lockfile, "utf8"));
  const before = JSON.parse(beforeText);
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path.includes("node_modules/") || !entry.resolved) continue;
    const previous = before.packages?.[path];
    if (previous?.resolved === entry.resolved && previous?.integrity === entry.integrity) continue;
    if (!String(entry.resolved).startsWith("https://registry.npmjs.org/")) {
      throw new Error(`Refusing non-registry npm artifact at ${path}: ${entry.resolved}`);
    }
    if (!entry.integrity || !/^sha(?:256|384|512)-/.test(entry.integrity)) {
      throw new Error(`Refusing npm artifact without a recognized integrity hash: ${path}`);
    }
  }
}

function prepare() {
  const repo = required("GITHUB_REPOSITORY");
  const scanFile = required("SCAN_FILE");
  const planFile = required("PLAN_FILE");
  const config = loadConfig();
  const osv = findingsFromOsvJson(JSON.parse(readFileSync(scanFile, "utf8")));
  const findings = combineFindings(osv, dependabotFindings(repo));
  for (const finding of findings) {
    if (finding.version === "unknown" && basename(finding.sourcePath) === "package-lock.json") {
      finding.version = installedNpmVersion(finding.sourcePath, finding.dependency) ?? "unknown";
    }
  }
  const open = openSecurityPulls(repo);

  for (const finding of findings.filter((candidate) => candidate.malicious)) {
    finding.incidentUrl = upsertMalwareIncident(repo, finding, config);
  }

  const openLockfiles = new Set(open.map((pr) => /Lockfile: `([^`]+)`/.exec(pr.body ?? "")?.[1]).filter(Boolean));
  const candidates = findings.filter((finding) => !held(finding, config) &&
    !open.some((pr) => String(pr.body ?? "").includes(`Dependency: \`${finding.dependency}\``)) &&
    !openLockfiles.has(finding.sourcePath));
  const finding = candidates[0];
  if (!finding) {
    writeFileSync(planFile, JSON.stringify({ status: findings.length ? "waiting" : "clean", findings, open: open.map((pr) => pr.html_url) }, null, 2));
    output("changed", "false");
    summary(findings.length ? `## Security remediation\n\nNo new PR: ${open.length} bot PR(s) already cover the available lockfiles, or project holds apply.` : "## Security remediation\n\nOSV and GitHub advisory inputs are clean.");
    return;
  }

  const beforeLock = basename(finding.sourcePath) === "package-lock.json"
    ? readFileSync(finding.sourcePath, "utf8") : null;
  const update = applyUpdate(finding);
  const changedFiles = run("git", ["diff", "--name-only"]).split("\n").filter(Boolean);
  if (!isSecurityDependencyOnly(changedFiles)) throw new Error(`Updater changed a disallowed path: ${changedFiles.join(", ")}`);
  if (!changedFiles.includes(finding.sourcePath)) throw new Error(`Updater did not change ${finding.sourcePath}`);
  if (beforeLock) assertOfficialNpmArtifacts(finding.sourcePath, beforeLock);
  const plan = { status: "prepared", finding, update, changedFiles, beforeSha: run("git", ["rev-parse", "HEAD"]) };
  mkdirSync(dirname(planFile), { recursive: true });
  writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  output("changed", "true");
  output("dependency", slug(finding.dependency));
  output("advisory", slug(finding.advisory));
}

function ensureSecurityLabels(repo) {
  for (const label of [
    ["security", "b60205", "Security remediation"],
    ["dependencies", "0366d6", "Dependency changes"],
    ["automated-security", "1f883d", "Created by Morpheus Security"],
  ]) ensureLabel(repo, ...label);
}

function deliver() {
  const repo = required("GITHUB_REPOSITORY");
  const plan = JSON.parse(readFileSync(required("PLAN_FILE"), "utf8"));
  const after = findingsFromOsvJson(JSON.parse(readFileSync(required("AFTER_SCAN_FILE"), "utf8")));
  const finding = plan.finding;
  const remains = after.some((candidate) => candidate.dependency === finding.dependency &&
    candidate.aliases.some((alias) => finding.aliases.includes(alias)));
  if (remains) throw new Error(`${finding.advisory} remains after the candidate update`);

  const changedFiles = run("git", ["diff", "--name-only"]).split("\n").filter(Boolean);
  if (JSON.stringify(changedFiles.sort()) !== JSON.stringify([...plan.changedFiles].sort()) ||
      !isSecurityDependencyOnly(changedFiles)) {
    throw new Error("Candidate diff changed between preparation and delivery");
  }
  if (process.env.DRY_RUN === "true") {
    summary(`## Security remediation dry run\n\nValidated ${finding.dependency}: scoped diff, official artifacts, and clean candidate rescan.`);
    return;
  }
  const branch = `morpheus-security/${slug(finding.ecosystem)}-${slug(finding.dependency)}-${slug(finding.advisory)}`;
  run("git", ["config", "user.name", "morpheus-security[bot]"]);
  run("git", ["config", "user.email", "morpheus-security[bot]@users.noreply.github.com"]);
  run("git", ["switch", "-c", branch]);
  run("git", ["add", "--", ...changedFiles]);
  run("git", ["commit", "-m", `fix(deps): remediate ${finding.dependency} ${finding.advisory}`,
    "-m", "Co-authored-by: Codex <codex@cpheinrich.com>"]);
  run("git", ["push", "--set-upstream", "origin", branch]);
  ensureSecurityLabels(repo);
  const incident = finding.incidentUrl ? `\nRelated incident: ${finding.incidentUrl}` : "";
  const body = `${SECURITY_MARKER}\n\n## Summary\n\n` +
    `Dependency: \`${finding.dependency}\`\n\nLockfile: \`${finding.sourcePath}\`\n\n` +
    `- Remediate ${finding.advisory} (${finding.aliases.join(", ")}).\n` +
    `- Update \`${finding.version}\` to the smallest available fixed line, \`${finding.fixedVersion ?? "removed"}\`, using \`${plan.update.strategy}\`.\n` +
    `- OSV rescanned the candidate and no longer reports this package/advisory pair.\n` +
    `- Registry URLs and lockfile integrity hashes passed the deterministic supply-chain gate.${incident}\n\n` +
    `## Test plan\n\nRequired repository checks and deployment previews must pass before GitHub auto-merge.\n\n` +
    `## Open questions\n\nNone.\n`;
  const url = run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", branch,
    "--title", `fix(deps): remediate ${finding.dependency} security advisory`, "--body", body,
    "--label", "security", "--label", "dependencies", "--label", "automated-security"]);
  run("gh", ["pr", "merge", url, "--repo", repo, "--auto", "--squash", "--delete-branch"]);
  output("pull_request", url);
  summary(`## Security remediation\n\nOpened ${url} for ${finding.dependency} and enabled auto-merge behind repository checks.`);
}

function reconcile() {
  const repo = required("GITHUB_REPOSITORY");
  const open = openSecurityPulls(repo);
  for (const pr of open) {
    try {
      run("gh", ["pr", "merge", String(pr.number), "--repo", repo, "--auto", "--squash", "--delete-branch"]);
    } catch (error) {
      summary(`- ${pr.html_url}: auto-merge not advanced (${String(error.stderr ?? error.message).trim()})`);
    }
  }
  output("open_prs", String(open.length));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  if (command === "prepare") prepare();
  else if (command === "deliver") deliver();
  else if (command === "reconcile") reconcile();
  else throw new Error("Usage: security-remediation.mjs prepare|deliver|reconcile");
}
