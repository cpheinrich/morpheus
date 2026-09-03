#!/usr/bin/env node
import { resolve } from "node:path";
import { block, claim, claims, create, index, linkIssue, migrateIds, ship, unblock, validate, } from "./pm.js";
import { INBOX_DIR } from "../paths.js";
import { pr } from "./check.js";
import { validate as validateInbox } from "./inbox.js";
import { build as brandBuild, check as brandCheck, explore as brandExplore, finalize as brandFinalize, init as brandInit, migrate as brandMigrate, resolveBrandIdentity, } from "./brand.js";
import { status as brandStatus } from "./brand-status.js";
import { sync as accessSync } from "./access.js";
import { checkGoogleAuthConfiguration, configureGoogleAuth } from "./firebase.js";
import { printRules, rules as hqRules } from "./hq.js";
import * as registry from "./registry.js";
import { run as doctorRun } from "./doctor.js";
import { mark as initMark, status as initStatus } from "./onboarding.js";
import { init as initScaffold } from "./init.js";
import { webAddConsumerAuth, webInit, webStatus } from "./web.js";
import { build as tokensBuild } from "./tokens.js";
import { heartbeat } from "./heartbeat.js";
import { prompt as reviewPrompt, reviewDelivery, reviewNeeded } from "./review.js";
import { brief as voiceBrief, knowledge as voiceKnowledge } from "./voice.js";
import { validate as teamValidate } from "./team.js";
import { check as contextCheck, guard, brief as contextBrief, install as contextInstall, refresh as contextRefresh, status as contextStatus, } from "./context.js";
import { GATED, offlineDeclared } from "../session/gate.js";
import { noteWrite } from "../session/context.js";
import { install as codebaseMemoryInstall } from "./codebase-memory.js";
import { initResearchLibrary, runResearchLibrary } from "./research-library.js";
import { autoUpdate as selfAutoUpdate, check as selfCheck, ensure as selfEnsure, install as selfInstall, update as selfUpdate, } from "./self.js";
const HELP = `morpheus — an operating system for building and running companies

Usage
  morpheus pm validate [--dir <hq/product>]
  morpheus pm index    [--dir <hq/product>] [--check]
  morpheus pm new <roadmap|goals|requests> <title> [--priority P1] [--goal G-2026-Q3-01]
                            [--slug fix-photo-picker] [--issue 123]
                            — name the slug like a branch; derived otherwise
  morpheus pm claim <RM-014>
  morpheus pm claims
  morpheus pm link-issue <RM-014> <123>
  morpheus pm block <MO-051> --needs "<what would unblock this>" [--owner <handle>]
                            [--context "<where it stopped>"]
  morpheus pm unblock <MO-051>
  morpheus pm ship [<MO-020> ...]  [--check]
  morpheus pm migrate-ids   [--check] — integer roadmap ids to the dated scheme (MO-057)
  morpheus check pr    [--dir <hq/product>] [--base origin/main]
  morpheus review prompt    assemble the rung-2 reviewer prompt for this branch
  morpheus review needed    [--base <ref>] [--prior-review <file>]
                            is this change worth a review, or a re-review?
  morpheus review delivery  [--before-comment-id <id>] [--comment-id <id>]
                            [--body-file <file>] [--pr-body-file <file>]
                            confirm the review was posted; the PR body may
                            carry "review-waived: <reason>" when it was not
  morpheus inbox validate   [--dir <hq/team>]
  morpheus team validate    the roster and every meeting note
  morpheus brand init             [--dir <hq/brand>] [--name <Acme>] [--prefix <ac>]
                            — repair or retrofit the optional brand-vibes scratchpad and moodboard input
  morpheus brand explore          refresh the agent handoff for five concept packages
  morpheus brand finalize --selection "Name"
                            — write the finalization handoff after a concept wins
  morpheus brand migrate          copy legacy answers.md into brand-vibes.md, retaining the original
  morpheus brand build            legacy alias for brand explore
  morpheus brand status           [--dir <hq/brand>] [--name <Acme>]
  morpheus brand check            [--dir <hq/brand>] — required workflow and final package
  morpheus web init         [--project <gcp-project>] [--domain <public-origin>]
                            [--account <google-email>] [--organization <gcp-org-id>]
                            [--vercel-team <slug>] [--no-provision]
                            [--no-waitlist] [--no-hq] [--no-browser]
                            provision the cloud resources, then scaffold the site:
                            a Next.js app, waitlist email capture, and /hq behind
                            Google sign-in. Never overwrites an existing file.
  morpheus web add-consumer-auth  [--staging-project <id>] [--account <google-email>]
                            [--no-provision] [--check]
                            consumer accounts on the two-project stack contract:
                            auth plumbing, policy routes, starter pages, and the
                            three emulator-backed test suites. --check reports
                            drift against the current templates and writes nothing.
  morpheus web status       what the web surface has, and what it is missing
  morpheus access sync      [--project <firebase-project>] [--dry-run]
  morpheus firebase auth setup [--project <firebase-project>] [--domain <public-origin>]
                            [--support-email <email>] [--brand <name>] [--no-browser]
  morpheus firebase auth check [--project <firebase-project>] [--domain <public-origin>]
  morpheus hq rules         --rules-path <path> [--check]
                            — role helpers in the deployed rules file, from the vocabulary
  morpheus hq rules --print print the generated block, to paste into existing rules
  morpheus research-library init --project <firebase-project> --bucket <bucket>
                            configure the immutable private library without touching local books
  morpheus research-library push|pull|verify|bundle|verify-bundle [arguments]
                            publish, restore, and verify canonical Babel book directories
  morpheus registry list | add [--prefix XX] | remove <name>
  morpheus init             [--name <Acme>] [--prefix XX] [--kind company|personal|internal]
  morpheus init status      [--offline]
  morpheus init done | doing | todo <task-id>
  morpheus tokens build     [--source hq/brand/tokens.json] [--css <path>] [--ts <path>]
                            [--prefix brand] [--check]
  morpheus context refresh  take a receipt — run it after reading the canonical records
  morpheus context check    exit non-zero unless context is fresh; for hooks and scripts
  morpheus context status   what the current lease says, and how old it is
  morpheus context brief    session start: discards the last receipt, says what to read
  morpheus context install  [--check] [--handle <github-handle>]
                            wire .claude/settings.json, .codex/hooks.json and context.handle
                            — the repair path for a project scaffolded before they existed
                            Governed commands (pm claim|new|link-issue|block, access sync) refuse without
                            a fresh receipt. --offline, or MORPHEUS_OFFLINE=1, permits local
                            work on an unverified trunk and still refuses anything external.
  morpheus codebase-memory install [--check]
                            install the pinned official package when absent,
                            configure detected agent clients, enable auto-index
                            and auto-watch, and fully index this exact checkout
  morpheus self check       verify the installed CLI contains current Morpheus main
  morpheus self update      install current main from a disposable clean checkout
  morpheus self install     install this clean current-main checkout as a copied package
  morpheus self ensure      update if consented and stale; used by managed Git hooks
  morpheus self auto-update enable|disable|status
                            manage consented post-pull updates across the local registry
  morpheus doctor           [--all] [--offline]
                            --offline skips project-trunk and Morpheus-main network checks
  morpheus heartbeat        [--ceiling N] [--json] [--dispatch]
                            what should happen next, and whether anything should
  morpheus voice knowledge  the standing explainer, to upload once as project knowledge
  morpheus voice brief ["<topic>"] [--slug x] [--notes "..."] [--full]
                            today's state, to paste into a voice session

Options
  --dir <path>   Product directory (default: hq/product)
  --base <ref>   Base ref for the PR diff (default: origin/main)
  --name <str>   Display name for brand init
  --prefix <str> Two-letter token prefix for brand init
  --project <id> Firebase project id for access and Auth commands
  --domain <url> Public app origin/hostname for Firebase Google sign-in
  --support-email <email> OAuth support email; successful setup records it in morpheus.json
                            (defaults to the recorded value, then active gcloud account)
  --brand <name> OAuth brand name (defaults to the project display name)
  --account <email> Google account to provision as; passed to gcloud explicitly
  --organization <id> GCP organisation that should own a newly created project
  --vercel-team <slug> Vercel team slug, for the Workload Identity issuer
  --no-provision Scaffold only; create nothing in GCP, Firebase or Vercel
  --no-waitlist  Skip email capture
  --no-hq        Skip /hq and Google sign-in
  --no-browser   Do not open browser-backed login or Firebase-console recovery
  --check        Verify indexes are current without writing; exits non-zero if stale
  --offline      Declare the context-freshness offline exception (same as
                 MORPHEUS_OFFLINE=1), and skip the network checks in "init status",
                 "doctor" and "context refresh|check|status" that it would answer
  -h, --help     Show this message
`;
function parseArgs(argv) {
    const flags = {
        dir: "hq/product",
        base: "origin/main",
        check: false,
        dryRun: false,
        all: false,
        offline: false,
        full: false,
        json: false,
        dispatch: false,
        print: false,
        openBrowser: true,
        provision: true,
        waitlist: true,
        hq: true,
        positional: [],
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case "--dir":
                flags.dir = argv[++i] ?? flags.dir;
                break;
            case "--base":
                flags.base = argv[++i] ?? flags.base;
                break;
            case "--check":
                flags.check = true;
                break;
            case "--all":
                flags.all = true;
                break;
            case "--offline":
                flags.offline = true;
                break;
            case "--print":
                flags.print = true;
                break;
            case "--dry-run":
                flags.dryRun = true;
                break;
            case "--project":
                flags.project = argv[++i];
                break;
            case "--bucket":
                flags.bucket = argv[++i];
                break;
            case "--object-prefix":
                flags.objectPrefix = argv[++i];
                break;
            case "--catalog-dir":
                flags.catalogDir = argv[++i];
                break;
            case "--local-root":
                flags.localRoot = argv[++i];
                break;
            case "--gcloud":
                flags.gcloud = argv[++i];
                break;
            case "--domain":
                flags.domain = argv[++i];
                break;
            case "--support-email":
                flags.supportEmail = argv[++i];
                break;
            case "--brand":
                flags.brand = argv[++i];
                break;
            case "--no-browser":
                flags.openBrowser = false;
                break;
            case "--staging-project":
                flags.stagingProject = argv[++i];
                break;
            case "--account":
                flags.account = argv[++i];
                break;
            case "--organization":
                flags.organization = argv[++i];
                break;
            case "--vercel-team":
                flags.vercelTeam = argv[++i];
                break;
            case "--no-provision":
                flags.provision = false;
                break;
            case "--no-waitlist":
                flags.waitlist = false;
                break;
            case "--no-hq":
                flags.hq = false;
                break;
            case "--name":
                flags.name = argv[++i];
                break;
            case "--prefix":
                flags.prefix = argv[++i];
                break;
            case "--kind":
                flags.kind = argv[++i];
                break;
            case "--source":
                flags.source = argv[++i];
                break;
            case "--css":
                flags.css = argv[++i];
                break;
            case "--ts":
                flags.ts = argv[++i];
                break;
            case "--owner":
                flags.owner = argv[++i];
                break;
            case "--handle":
                flags.handle = argv[++i];
                break;
            case "--priority":
                flags.priority = argv[++i];
                break;
            case "--goal":
                flags.goal = argv[++i];
                break;
            case "--slug":
                flags.slug = argv[++i];
                break;
            case "--issue":
                flags.issue = argv[++i] ?? "";
                break;
            case "--needs":
                flags.needs = argv[++i];
                break;
            case "--context":
                flags.context = argv[++i];
                break;
            case "--ceiling": {
                const n = Number(argv[++i]);
                if (Number.isInteger(n) && n > 0)
                    flags.ceiling = n;
                break;
            }
            case "--json":
                flags.json = true;
                break;
            case "--notes":
                flags.notes = argv[++i];
                break;
            case "--prior-review":
                flags.priorReview = argv[++i];
                break;
            case "--before-comment-id":
                flags.beforeCommentId = argv[++i];
                break;
            case "--comment-id":
                flags.commentId = argv[++i];
                break;
            case "--body-file":
                flags.bodyFile = argv[++i];
                break;
            case "--pr-body-file":
                flags.prBodyFile = argv[++i];
                break;
            case "--selection":
                flags.selection = argv[++i];
                break;
            case "--rules-path":
                flags.rulesPath = argv[++i];
                break;
            case "--out":
                flags.out = argv[++i];
                break;
            case "--full":
                flags.full = true;
                break;
            case "--dispatch":
                flags.dispatch = true;
                break;
            default:
                flags.positional.push(arg);
        }
    }
    return flags;
}
async function main() {
    const argv = process.argv.slice(2);
    if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
        console.log(HELP);
        return 0;
    }
    const flags = parseArgs(argv);
    const [group, command, ...rest] = flags.positional;
    const dir = resolve(process.cwd(), flags.dir);
    if (group === "self") {
        if (command === "check" || command === undefined)
            return selfCheck(flags.offline);
        if (command === "update")
            return selfUpdate();
        if (command === "install")
            return selfInstall(process.cwd());
        if (command === "ensure")
            return selfEnsure();
        if (command === "auto-update")
            return selfAutoUpdate(rest[0], process.cwd());
        console.error(`Unknown self command "${command}".\n\n${HELP}`);
        return 1;
    }
    if (group === "doctor")
        return doctorRun(process.cwd(), flags.all, flags.offline);
    if (group === "codebase-memory") {
        if (command === "install" || command === undefined) {
            return codebaseMemoryInstall(process.cwd(), flags.check);
        }
        console.error(`Unknown codebase-memory command "${command}".\n\n${HELP}`);
        return 1;
    }
    if (group === "heartbeat") {
        return heartbeat({
            productDir: dir,
            cwd: process.cwd(),
            ...(flags.ceiling !== undefined ? { ceiling: flags.ceiling } : {}),
            json: flags.json,
            // Only override the manifest when the flag was actually passed, so
            // `dispatch: true` in morpheus.json is not silently turned off.
            ...(flags.dispatch ? { dispatch: true } : {}),
        });
    }
    if (group === "voice") {
        if (command === "knowledge")
            return voiceKnowledge(process.cwd(), flags.out);
        if (command === "brief") {
            // The topic is the rest of the positionals, so it can be typed without
            // quoting — `morpheus voice brief how should the heartbeat dispatch`.
            const topic = rest.join(" ").trim();
            return voiceBrief({
                root: process.cwd(),
                productDir: dir,
                ...(topic ? { topic } : {}),
                ...(flags.slug ? { slug: flags.slug } : {}),
                ...(flags.notes ? { notes: flags.notes } : {}),
                ...(flags.full ? { full: true } : {}),
            });
        }
        console.error(`Unknown voice command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "tokens") {
        if (command === "build" || command === undefined) {
            return tokensBuild({
                root: process.cwd(),
                source: flags.source,
                css: flags.css,
                ts: flags.ts,
                prefix: flags.prefix,
                check: flags.check,
            });
        }
        console.error(`Unknown tokens command "${command}".\n\n${HELP}`);
        return 1;
    }
    if (group === "research-library") {
        if (command === "init") {
            return initResearchLibrary({
                root: process.cwd(),
                project: flags.project,
                bucket: flags.bucket,
                objectPrefix: flags.objectPrefix,
                catalogDir: flags.catalogDir,
                localRoot: flags.localRoot,
            });
        }
        const commands = new Set(["bundle", "upload", "fetch", "push", "pull", "verify", "verify-bundle"]);
        if (command && commands.has(command)) {
            return runResearchLibrary(command, rest, {
                root: process.cwd(),
                gcloud: flags.gcloud,
            });
        }
        console.error(`Unknown research-library command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "init") {
        if (command === "status") {
            return initStatus(process.cwd(), flags.name, flags.offline);
        }
        if (command === undefined) {
            return initScaffold({
                root: process.cwd(),
                name: flags.name,
                prefix: flags.prefix,
                kind: flags.kind,
                owner: flags.owner,
            });
        }
        const states = { done: "done", doing: "in-progress", todo: "todo" };
        const state = states[command];
        if (state) {
            if (!rest[0]) {
                console.error(`Which task? \`morpheus init status\` lists them.`);
                return 1;
            }
            return initMark(process.cwd(), rest[0], state, flags.name);
        }
        console.error(`Unknown init command "${command}".\n\n${HELP}`);
        return 1;
    }
    if (group === "web") {
        if (command === "status")
            return webStatus(process.cwd());
        if (command === "init" || command === undefined) {
            // Only the provisioning half is gated. Scaffolding is repository-local
            // and safe on a stale trunk; creating a GCP project on one is not.
            if (flags.provision) {
                const { refused } = await guard(process.cwd(), "web init", GATED["web init"], flags.offline);
                if (refused !== null)
                    return refused;
            }
            return webInit({
                root: process.cwd(),
                project: flags.project,
                domain: flags.domain,
                account: flags.account,
                organization: flags.organization,
                vercelTeam: flags.vercelTeam,
                provision: flags.provision,
                waitlist: flags.waitlist,
                hq: flags.hq,
                openBrowser: flags.openBrowser,
            });
        }
        if (command === "add-consumer-auth") {
            // Same split as `web init`: only the provisioning half — creating the
            // staging GCP project — is gated on a fresh context receipt. `--check`
            // provisions nothing and reads only the repository.
            if (flags.provision && !flags.check) {
                const { refused } = await guard(process.cwd(), "web init", GATED["web init"], flags.offline);
                if (refused !== null)
                    return refused;
            }
            return webAddConsumerAuth({
                root: process.cwd(),
                stagingProject: flags.stagingProject,
                account: flags.account,
                provision: flags.provision,
                check: flags.check,
            });
        }
        console.error(`Unknown web command "${command}".\n\n${HELP}`);
        return 1;
    }
    if (group === "registry") {
        if (command === "list")
            return registry.list();
        if (command === "add")
            return registry.add(process.cwd(), flags.prefix);
        if (command === "remove")
            return registry.remove(rest[0] ?? "");
        console.error(`Unknown registry command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "hq") {
        if (command === "rules") {
            return flags.print ? printRules() : hqRules(process.cwd(), flags.check, flags.rulesPath);
        }
        console.error(`Unknown hq command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "access") {
        if (command === "sync" && !flags.dryRun) {
            const { refused } = await guard(process.cwd(), "access sync", GATED["access sync"], flags.offline);
            if (refused !== null)
                return refused;
        }
        if (command === "sync")
            return accessSync(process.cwd(), flags.project, flags.dryRun);
        console.error(`Unknown access command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "firebase") {
        if (command !== "auth") {
            console.error(`Unknown firebase command "${command ?? ""}".\n\n${HELP}`);
            return 1;
        }
        const action = rest[0];
        const options = {
            project: flags.project,
            domain: flags.domain,
            supportEmail: flags.supportEmail,
            brand: flags.brand,
            openBrowser: flags.openBrowser,
        };
        if (action === "setup") {
            const { refused } = await guard(process.cwd(), "firebase auth setup", GATED["firebase auth setup"], flags.offline);
            if (refused !== null)
                return refused;
            return configureGoogleAuth(process.cwd(), options);
        }
        if (action === "check")
            return checkGoogleAuthConfiguration(process.cwd(), options);
        console.error(`Unknown firebase auth command "${action ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "brand") {
        const brandDir = resolve(process.cwd(), flags.dir === "hq/product" ? "hq/brand" : flags.dir);
        const identity = await resolveBrandIdentity(process.cwd(), {
            name: flags.name,
            prefix: flags.prefix,
        });
        const brandName = identity.name;
        if (command === "status") {
            return brandStatus(brandDir, brandName);
        }
        const options = {
            brandDir,
            name: brandName,
            prefix: identity.prefix,
        };
        if (command === "build") {
            return brandBuild(options);
        }
        if (command === "explore" || command === "refresh") {
            return brandExplore(options);
        }
        if (command === "finalize") {
            return brandFinalize({ ...options, selection: flags.selection });
        }
        if (command === "migrate") {
            return brandMigrate(options);
        }
        if (command === "check") {
            return brandCheck(options);
        }
        if (command === "init") {
            return brandInit({ ...options, root: process.cwd() });
        }
        if (command === undefined) {
            return brandInit({ ...options, root: process.cwd() });
        }
        console.error(`Unknown brand command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "inbox") {
        if (command === "validate") {
            return validateInbox(resolve(process.cwd(), flags.dir === "hq/product" ? INBOX_DIR : flags.dir));
        }
        console.error(`Unknown inbox command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "review") {
        if (command === "prompt")
            return reviewPrompt(dir, process.cwd());
        if (command === "needed")
            return reviewNeeded(flags.base, flags.priorReview, flags.json);
        if (command === "delivery") {
            return reviewDelivery(flags.beforeCommentId, flags.commentId, flags.bodyFile, flags.prBodyFile);
        }
        console.error(`Unknown review command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "team") {
        if (command === "validate")
            return teamValidate(process.cwd());
        console.error(`Unknown team command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group === "context") {
        // `--offline` reaches these the way it reaches `doctor`: each consults a
        // remote, and on an unreachable one the declaration already answers the
        // question. `brief` also checks the installed CLI now, but remains
        // informational and always exits zero.
        const off = offlineDeclared(flags.offline);
        if (command === "refresh")
            return contextRefresh(process.cwd(), off);
        if (command === "check")
            return contextCheck(process.cwd(), off);
        if (command === "brief")
            return contextBrief(process.cwd(), { offline: off });
        // Not gated, and deliberately: this is the command that makes a project
        // able to be fresh, so refusing it without a receipt would lock out the
        // repair for the state it is diagnosing.
        if (command === "install") {
            return contextInstall(process.cwd(), { check: flags.check, handle: flags.handle });
        }
        if (command === "status" || command === undefined)
            return contextStatus(process.cwd(), off);
        console.error(`Unknown context command "${command}".\n\n${HELP}`);
        return 1;
    }
    if (group === "check") {
        if (command === "pr")
            return pr(dir, flags.base);
        console.error(`Unknown check command "${command ?? ""}".\n\n${HELP}`);
        return 1;
    }
    if (group !== "pm") {
        console.error(`Unknown command "${group ?? ""}".\n\n${HELP}`);
        return 1;
    }
    switch (command) {
        case "validate":
            return validate(dir);
        case "index":
            return index(dir, flags.check);
        case "claim": {
            const { refused } = await guard(process.cwd(), "pm claim", GATED["pm claim"], flags.offline);
            if (refused !== null)
                return refused;
            // No re-anchoring here: `check` does it wherever the re-observation
            // proves the receipt still true, which covers `pm claim`'s checkout and
            // the bare `git checkout` AGENTS.md prescribes for resuming blocked work
            // alike. A fix at this call site would have left the other.
            return claim(dir, rest[0] ?? "", process.cwd());
        }
        case "claims":
            return claims(dir, process.cwd());
        case "link-issue": {
            const { refused } = await guard(process.cwd(), "pm link-issue", GATED["pm link-issue"], flags.offline);
            if (refused !== null)
                return refused;
            return linkIssue(dir, rest[0] ?? "", rest[1] ?? "");
        }
        case "block": {
            const { refused, contained } = await guard(process.cwd(), "pm block", GATED["pm block"], flags.offline);
            if (refused !== null)
                return refused;
            // `block` raises an `❗` item in the owner's inbox, which is a required
            // record. Without the `noteWrite` below, the next gated command is
            // refused for drift this session authored, naming a file it just wrote.
            const outcome = await block(dir, process.cwd(), rest[0] ?? "", {
                ...(flags.needs ? { needs: flags.needs } : {}),
                ...(flags.owner ? { owner: flags.owner } : {}),
                ...(flags.context ? { context: flags.context } : {}),
                // From what the gate actually did, not from the declaration alone. A
                // sticky `MORPHEUS_OFFLINE=1` — set by a wrapper, outliving the
                // condition — would otherwise stop the one command whose purpose is
                // visibility from being visible, in a session where nothing else is
                // degraded and while claiming still pushes fine.
                push: !contained,
            });
            // Exactly what it wrote, and only when it wrote. A failed `block`
            // touches nothing, and re-fingerprinting there would silently clear
            // drift the session never read; passing the whole required inbox set
            // would have the receipt assert a record was read that this session
            // neither read nor wrote.
            await noteWrite(process.cwd(), outcome.written);
            return outcome.code;
        }
        case "unblock":
            return unblock(dir, rest[0] ?? "");
        case "ship":
            return ship(dir, rest, process.cwd(), flags.check);
        case "migrate-ids":
            return migrateIds(dir, flags.check);
        case "new": {
            const { refused } = await guard(process.cwd(), "pm new", GATED["pm new"], flags.offline);
            if (refused !== null)
                return refused;
            const [kind, ...titleParts] = rest;
            return create(dir, kind ?? "", titleParts.join(" "), { priority: flags.priority, goal: flags.goal, slug: flags.slug, issue: flags.issue }, process.cwd());
        }
        default:
            console.error(`Unknown pm command "${command ?? ""}".\n\n${HELP}`);
            return 1;
    }
}
main()
    .then((code) => process.exit(code))
    .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
//# sourceMappingURL=index.js.map