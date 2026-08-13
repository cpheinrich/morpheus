import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EXPECTED } from "../doctor/index.js";
import { renderFirestoreRules, updateRoleHelpers } from "../hq/rules.js";
import * as t from "./templates.js";
import { INBOX_DIR, MEETING_NOTES_DIR } from "../paths.js";
import { ANALYTICS_SCHEMA_DIRECTORY, ANALYTICS_SCHEMA_PATH, findAnalyticsContracts, } from "../analytics/contract.js";
async function exists(p) {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
}
async function readOptional(path) {
    try {
        return { kind: "content", content: await readFile(path, "utf8") };
    }
    catch (error) {
        const code = error && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined;
        if (code === "ENOENT")
            return { kind: "absent" };
        return {
            kind: "unreadable",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}
function configuredFirestoreRules(content) {
    try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return { kind: "missing" };
        const firestore = parsed.firestore;
        if (!firestore || typeof firestore !== "object" || Array.isArray(firestore)) {
            return { kind: "missing" };
        }
        const path = firestore.rules;
        return typeof path === "string" && path.trim()
            ? { kind: "path", path }
            : { kind: "missing" };
    }
    catch (error) {
        return {
            kind: "invalid",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}
export const KIND_DIRS = EXPECTED;
export async function scaffold(root, seed) {
    const written = [];
    const skipped = [];
    const notes = [];
    const put = async (rel, content) => {
        const abs = join(root, rel);
        if (await exists(abs)) {
            skipped.push(rel);
            return;
        }
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, content, "utf8");
        written.push(rel);
    };
    const prepareRules = async (path) => {
        const existing = await readFile(join(root, path), "utf8").catch(() => null);
        if (existing === null) {
            await put(path, renderFirestoreRules());
            if (!written.includes(path)) {
                notes.push(`Could not read or create the rules file ${path}; left its CI check off. ` +
                    "Verify the file and permissions before enabling hq-rules-path.");
                return undefined;
            }
            const configWarning = written.includes("firebase.json")
                ? " This run also created firebase.json, so the next Firebase deploy will use this file."
                : "";
            notes.push(`Created the deployed rules file ${path} with deny-by-default starter policy.` +
                configWarning +
                " Review its match blocks before the next Firebase deploy.");
            return path;
        }
        const update = updateRoleHelpers(existing);
        if (!update) {
            skipped.push(`${path} (rules file has no complete generated role marker block)`);
            notes.push(`Kept the deployed rules file ${path} and did not enable its generated CI check because ` +
                "it has no " +
                "complete generated role marker block. Review `morpheus hq rules --print`, add the " +
                "block inside the database match scope, then enable hq-rules-path.");
            return undefined;
        }
        skipped.push(path);
        if (update.changed) {
            notes.push(`${path} has stale generated role helpers. Run ` +
                `\`morpheus hq rules --rules-path ${path}\` before the first PR.`);
        }
        return path;
    };
    // --- the manifest and the instructions -----------------------------------
    await put("morpheus.json", t.manifest(seed));
    await put("AGENTS.md", t.agents(seed));
    // A README for humans, and for agents that read one before anything else.
    // Absent until MO-054, which is why cpheinrich.com had none at all — the
    // scaffold decided what a project starts as, and it did not start with one.
    await put("README.md", t.readme(seed));
    // CLAUDE.md is a symlink, not a copy. Two files would drift, and the drift
    // would be invisible until an agent acted on the stale one.
    const claude = join(root, "CLAUDE.md");
    if (await exists(claude)) {
        skipped.push("CLAUDE.md");
    }
    else {
        await symlink("AGENTS.md", claude);
        written.push("CLAUDE.md -> AGENTS.md");
    }
    // Claude Code's session hook. Informational, not blocking — the refusal
    // lives in the `morpheus` CLI, which every provider goes through and which
    // needs no per-project wiring. Codex reads AGENTS.md instead, which is why
    // the instruction is in both and the enforcement is in neither.
    await put(".claude/settings.json", t.claudeSettings());
    // The generated exploration prompt is the session-specific handoff. This
    // small skill is the durable discovery point for any agent that returns once
    // the first review is complete, and makes visual-first review the default
    // rather than a convention people need to rediscover from another project.
    if (seed.kind !== "internal") {
        await put(".claude/skills/brand-review/SKILL.md", t.brandReviewSkill());
    }
    // --- agent memory ---------------------------------------------------------
    await put(".agent/README.md", t.agentReadme());
    await put(".agent/decisions.md", t.decisions(seed));
    await put(".agent/learned.md", t.learned());
    // --- shared product contracts --------------------------------------------
    //
    // Product event meaning is shared across deployed surfaces, even when the
    // transports differ. Keep that contract outside apps/ so web, mobile and
    // backend clients cannot silently invent incompatible names and properties.
    if (seed.kind !== "internal") {
        const schemaDir = join(root, ANALYTICS_SCHEMA_DIRECTORY);
        let discovery = null;
        try {
            discovery = await findAnalyticsContracts(schemaDir);
        }
        catch (error) {
            if (error.code === "ENOENT") {
                discovery = { contracts: [], unreadable: [] };
            }
            else {
                skipped.push(`${ANALYTICS_SCHEMA_DIRECTORY}/ (could not inspect)`);
                notes.push(`Could not inspect ${ANALYTICS_SCHEMA_DIRECTORY}/, so no analytics contract was written. ` +
                    "Fix the directory or its permissions before re-running init.");
            }
        }
        if (discovery?.unreadable.length) {
            skipped.push(...discovery.unreadable.map((name) => `${ANALYTICS_SCHEMA_DIRECTORY}/${name} (unreadable)`));
            notes.push(`Could not inspect ${discovery.unreadable.join(", ")} in ${ANALYTICS_SCHEMA_DIRECTORY}/, ` +
                "so no analytics contract was written. Fix or remove the unreadable files before re-running init.");
        }
        else if (discovery !== null && discovery.contracts.length > 0) {
            for (const name of discovery.contracts) {
                skipped.push(`${ANALYTICS_SCHEMA_DIRECTORY}/${name}`);
            }
            notes.push(`Kept the existing analytics contract${discovery.contracts.length === 1 ? "" : "s"}: ` +
                discovery.contracts.map((name) => `${ANALYTICS_SCHEMA_DIRECTORY}/${name}`).join(", ") +
                ".");
        }
        else if (discovery !== null) {
            await put(ANALYTICS_SCHEMA_PATH, t.analyticsSchema());
            if (written.includes(ANALYTICS_SCHEMA_PATH)) {
                notes.push(`Created ${ANALYTICS_SCHEMA_PATH} as the provider-neutral product event contract. ` +
                    "Populate ProjectAnalyticsEvents before treating analytics setup as complete. This " +
                    "scaffold is not an importable runtime package until the project adds package metadata.");
            }
        }
        if (discovery !== null) {
            await put("packages/shared/README.md", t.sharedReadme());
            await put("packages/shared/schema/README.md", t.sharedSchemaReadme());
        }
        // Marketing starts with durable briefs, not a provider account or a one-off prompt. These
        // files are intentionally independent: an established project may already have one real
        // strategy while still needing the other two, and init must preserve every existing record.
        await put("hq/marketing/analytics.md", t.marketingAnalytics(seed));
        await put("hq/marketing/launch-plan.md", t.marketingLaunchPlan(seed));
        await put("hq/marketing/seo/strategy.md", t.marketingSeoStrategy(seed));
    }
    // Git does not track empty directories, so each carries a README explaining
    // itself. Without one the directory silently does not exist on clone — which
    // is exactly how Evo shipped without a worklog.
    await put(".agent/worklog/README.md", t.worklogReadme());
    await put(".agent/inbox-archive/README.md", t.inboxArchiveReadme());
    // --- hq -------------------------------------------------------------------
    const dirs = KIND_DIRS[seed.kind];
    if (dirs.some((d) => d.startsWith("hq/")))
        await put("hq/README.md", t.hqReadme(seed));
    for (const kind of ["roadmap", "goals", "requests"]) {
        if (!dirs.includes(`hq/product/${kind}`) && kind !== "requests")
            continue;
        if (kind === "requests" && !dirs.includes("hq/product/roadmap"))
            continue;
        await put(`hq/product/${kind}/README.md`, t.productReadme(kind, seed));
    }
    // The inbox is written for **every** kind, not only those whose directory
    // list includes `hq/team`. `manifest()` declares `context.handle`, which
    // puts `hq/team/<owner>.md` into the session-freshness required set — so a
    // kind that skipped the file would scaffold a project whose gate can never
    // open: the record reads ABSENT, therefore unresolvable, therefore
    // `refresh_required` forever, with no offline escape and no `requiredInputs`
    // override that reaches it. A declared record that is never created is the
    // worst shape this protocol has.
    await put(`${INBOX_DIR}/${seed.owner}.md`, t.inbox(seed));
    if (dirs.includes(INBOX_DIR)) {
        // Meeting notes get their directory up front rather than on first use.
        // The folder carries a redaction gate — `redacted: true` is a claim, and
        // `team validate` refuses a note without it — and a gate nobody meets
        // until they have hand-created the directory is a gate that gets
        // discovered *after* the first transcript is already committed. Migrated
        // repos ended up with this and scaffolded ones without, which is the wrong
        // way round.
        await put(`${MEETING_NOTES_DIR}/README.md`, t.meetingNotesReadme());
    }
    // The company layout declares this as the deployed data gate, and every
    // documented `hq rules` command names it. Scaffold the deny-by-default
    // starter so the first CI check is meaningful and its remedy is executable.
    let rulesPath;
    if (seed.kind === "company") {
        const canonicalRules = "infra/firebase/firestore.rules";
        const firebaseConfig = await readOptional(join(root, "firebase.json"));
        const configured = firebaseConfig.kind === "content"
            ? configuredFirestoreRules(firebaseConfig.content)
            : null;
        if (configured?.kind === "path") {
            rulesPath = await prepareRules(configured.path);
        }
        else if (firebaseConfig.kind === "unreadable") {
            const reason = `firebase.json could not be read: ${firebaseConfig.message}`;
            skipped.push(`${canonicalRules} (${reason})`);
            notes.push(`${reason}. Left the Firestore gate alone and did not guess a rules path; fix or ` +
                "confirm the configuration.");
        }
        else if (firebaseConfig.kind === "content") {
            const reason = configured?.kind === "invalid"
                ? `firebase.json could not be parsed: ${configured.message}`
                : "firebase.json does not name one string Firestore rules path";
            skipped.push(`${canonicalRules} (${reason})`);
            notes.push(`${reason}. Kept the configuration and did not guess a path; fix or confirm it.`);
        }
        else if (await exists(join(root, "firestore.rules"))) {
            skipped.push(`${canonicalRules} (root firestore.rules already exists)`);
            notes.push("Kept the existing root firestore.rules and did not create a second rules file. " +
                "Set hq-rules-path to the file Firebase actually deploys.");
        }
        else {
            await put("firebase.json", t.firebaseConfig(canonicalRules));
            rulesPath = await prepareRules(canonicalRules);
        }
    }
    // Remaining expected directories get a placeholder so they survive a clone.
    for (const dir of dirs) {
        if (dir.startsWith(".agent/") || dir.startsWith("hq/product/") || dir === INBOX_DIR)
            continue;
        // `hq/brand/README.md` belongs to the brand workflow, which never
        // overwrites a person's current exploration input — so a placeholder here
        // would permanently block the real one. A `.gitkeep` holds the directory
        // without claiming the name.
        if (dir === "hq/brand") {
            await put("hq/brand/.gitkeep", "");
            continue;
        }
        // A written README where we have something to say, and nothing at all where
        // we do not. The old placeholder wrote "Nothing here yet." into every
        // directory — a file that looks documented and says less than the folder
        // name already did, and which can then go stale on top of that.
        const readme = `${dir}/README.md`;
        const write = t.dirReadmes[dir];
        if (write && !(await exists(join(root, readme))))
            await put(readme, write(seed));
    }
    // Parents of expected directories, and `hq/team`, which the loop skips
    // because the person's inbox file is written there instead. `qa/acceptance`
    // being expected means `qa/` exists, and a directory that exists and feeds a
    // verifier deserves to say so.
    const parents = new Set(dirs.map((d) => d.split("/").slice(0, -1).join("/")).filter(Boolean));
    for (const dir of [...parents, INBOX_DIR]) {
        const write = t.dirReadmes[dir];
        if (!write)
            continue;
        if (!dirs.some((d) => d === dir || d.startsWith(`${dir}/`)))
            continue;
        const readme = `${dir}/README.md`;
        if (!(await exists(join(root, readme))))
            await put(readme, write(seed));
    }
    // --- ci -------------------------------------------------------------------
    //
    // Only wire the Node job into a project that is one. `node-ci` runs
    // `pnpm install --frozen-lockfile`, so adding it to a static site or a Python
    // repo puts CI in the red on the first push — and a scaffold whose CI fails
    // immediately teaches people to ignore failing CI.
    const isNode = (await exists(join(root, "pnpm-lock.yaml"))) ||
        (await exists(join(root, "pnpm-workspace.yaml")));
    const ciPath = ".github/workflows/ci.yml";
    const existingCi = await readOptional(join(root, ciPath));
    await put(ciPath, t.ci({ node: isNode, ...(rulesPath ? { rulesPath } : {}) }));
    const wiredRulesPath = existingCi.kind === "content"
        ? /\bhq-rules-path:\s*["']?([^\s"']+)/.exec(existingCi.content)?.[1]
        : undefined;
    if (rulesPath && existingCi.kind === "unreadable") {
        notes.push(`Could not read the existing ${ciPath}: ${existingCi.message}. It was left unchanged; ` +
            `after fixing access, wire hq-rules-path to ${rulesPath}.`);
    }
    else if (rulesPath && existingCi.kind === "content" && wiredRulesPath !== rulesPath) {
        notes.push(`The deployed gate is ${rulesPath}, but the existing ${ciPath} does not check that path. ` +
            "Add this to its pm job to verify the deployed gate:\n" +
            "    with:\n" +
            `      hq-rules-path: ${rulesPath}`);
    }
    if (!isNode) {
        notes.push("No pnpm lockfile here, so CI wires only the convention checks. Add the\n" +
            "node-ci job to .github/workflows/ci.yml once this is a pnpm project.");
    }
    // --- gitignore ------------------------------------------------------------
    const ignorePath = join(root, ".gitignore");
    const existing = await readFile(ignorePath, "utf8").catch(() => "");
    if (existing.includes("# Morpheus")) {
        skipped.push(".gitignore");
    }
    else {
        await writeFile(ignorePath, existing.trimEnd() + "\n" + t.gitignore(), "utf8");
        written.push(existing ? ".gitignore (appended)" : ".gitignore");
    }
    // Generate the index tables rather than leaving bare markers. The generator
    // emits a header row even for an empty artifact, so a scaffolded README with
    // only `<!-- morpheus:begin -->` is already stale — and `pm index --check`
    // fails on a project nobody has touched yet. Third version of the same rule:
    // a scaffold whose CI is red on the first push teaches people to ignore CI.
    if (dirs.includes("hq/product/roadmap")) {
        const { parseArtifact } = await import("../pm/parse.js");
        const gen = await import("../pm/index-gen.js");
        const productDir = join(root, "hq/product");
        const renderers = {
            roadmap: gen.renderRoadmap,
            goals: gen.renderGoals,
            requests: gen.renderRequests,
        };
        for (const kind of ["roadmap", "goals", "requests"]) {
            // `internal` projects have a roadmap and nothing else.
            if (!(await exists(join(productDir, kind))))
                continue;
            const { items } = await parseArtifact(productDir, kind);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rendered = renderers[kind](items);
            await gen.writeIndex(join(productDir, kind), rendered);
        }
    }
    if (seed.kind !== "internal") {
        notes.push("hq/brand/ is empty until you run `morpheus brand init` — the visual-first workflow owns that directory.");
    }
    return { written, skipped, notes };
}
//# sourceMappingURL=index.js.map