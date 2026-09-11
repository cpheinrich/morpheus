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
import { prompt as reviewPrompt, reviewDelivery, reviewNeeded, prepareReview } from "./review.js";
import { brief as voiceBrief, knowledge as voiceKnowledge } from "./voice.js";
import { validate as teamValidate } from "./team.js";
import { check as contextCheck, guard, brief as contextBrief, install as contextInstall, refresh as contextRefresh, status as contextStatus, } from "./context.js";
import { GATED, offlineDeclared } from "../session/gate.js";
import { noteWrite } from "../session/context.js";
import { install as codebaseMemoryInstall } from "./codebase-memory.js";
import { initResearchLibrary, runResearchLibrary } from "./research-library.js";
import { autoUpdate as selfAutoUpdate, check as selfCheck, ensure as selfEnsure, install as selfInstall, update as selfUpdate, } from "./self.js";
import { HELP } from "./help.js";
async function dispatchSelf({ flags, command, rest }) {
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
async function dispatchDoctor({ flags }) {
    return doctorRun(process.cwd(), flags.all, flags.offline);
}
async function dispatchCodebaseMemory({ flags, command }) {
    if (command === "install" || command === undefined) {
        return codebaseMemoryInstall(process.cwd(), flags.check);
    }
    console.error(`Unknown codebase-memory command "${command}".\n\n${HELP}`);
    return 1;
}
async function dispatchHeartbeat({ flags, dir }) {
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
async function dispatchVoice({ flags, command, rest, dir }) {
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
async function dispatchTokens({ flags, command }) {
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
async function dispatchResearchLibrary({ flags, command, rest }) {
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
    const commands = new Set([
        "bundle", "upload", "fetch", "publish", "push", "pull", "verify", "verify-bundle",
    ]);
    if (command && commands.has(command)) {
        const publishArgs = command === "publish" ? [
            ...rest,
            ...(flags.slug ? ["--slug", flags.slug] : []),
            ...(flags.title ? ["--title", flags.title] : []),
            ...flags.authors.flatMap((author) => ["--author", author]),
            ...(flags.edition ? ["--edition", flags.edition] : []),
            ...(flags.publisher ? ["--publisher", flags.publisher] : []),
            ...(flags.year ? ["--year", flags.year] : []),
            ...flags.isbns.flatMap((isbn) => ["--isbn", isbn]),
            ...(flags.language ? ["--language", flags.language] : []),
        ] : rest;
        return runResearchLibrary(command, publishArgs, {
            root: process.cwd(),
            gcloud: flags.gcloud,
        });
    }
    console.error(`Unknown research-library command "${command ?? ""}".\n\n${HELP}`);
    return 1;
}
async function dispatchInit({ flags, command, rest }) {
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
async function dispatchWeb({ flags, command }) {
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
async function dispatchRegistry({ flags, command, rest }) {
    if (command === "list")
        return registry.list();
    if (command === "add")
        return registry.add(process.cwd(), flags.prefix);
    if (command === "remove")
        return registry.remove(rest[0] ?? "");
    console.error(`Unknown registry command "${command ?? ""}".\n\n${HELP}`);
    return 1;
}
async function dispatchHq({ flags, command }) {
    if (command === "rules") {
        return flags.print ? printRules() : hqRules(process.cwd(), flags.check, flags.rulesPath);
    }
    console.error(`Unknown hq command "${command ?? ""}".\n\n${HELP}`);
    return 1;
}
async function dispatchAccess({ flags, command }) {
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
async function dispatchFirebase({ flags, command, rest }) {
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
async function dispatchBrand({ flags, command, dir }) {
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
async function dispatchInbox({ flags, command, dir }) {
    if (command === "validate") {
        return validateInbox(resolve(process.cwd(), flags.dir === "hq/product" ? INBOX_DIR : flags.dir));
    }
    console.error(`Unknown inbox command "${command ?? ""}".\n\n${HELP}`);
    return 1;
}
async function dispatchReview({ flags, command, dir }) {
    if (command === "prepare")
        return prepareReview(dir, process.cwd(), flags.base);
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
async function dispatchTeam({ command }) {
    if (command === "validate")
        return teamValidate(process.cwd());
    console.error(`Unknown team command "${command ?? ""}".\n\n${HELP}`);
    return 1;
}
async function dispatchContext({ flags, command }) {
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
async function dispatchCheck({ flags, command, dir }) {
    if (command === "pr")
        return pr(dir, flags.base);
    console.error(`Unknown check command "${command ?? ""}".\n\n${HELP}`);
    return 1;
}
async function dispatchPm({ flags, command, rest, dir }) {
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
const groups = {
    "self": dispatchSelf,
    "doctor": dispatchDoctor,
    "codebase-memory": dispatchCodebaseMemory,
    "heartbeat": dispatchHeartbeat,
    "voice": dispatchVoice,
    "tokens": dispatchTokens,
    "research-library": dispatchResearchLibrary,
    "init": dispatchInit,
    "web": dispatchWeb,
    "registry": dispatchRegistry,
    "hq": dispatchHq,
    "access": dispatchAccess,
    "firebase": dispatchFirebase,
    "brand": dispatchBrand,
    "inbox": dispatchInbox,
    "review": dispatchReview,
    "team": dispatchTeam,
    "context": dispatchContext,
    "check": dispatchCheck,
    pm: dispatchPm,
};
export async function dispatch(flags) {
    const [group, command, ...rest] = flags.positional;
    const handler = group && Object.hasOwn(groups, group) ? groups[group] : undefined;
    if (!handler) {
        console.error(`Unknown command "${group ?? ""}".\n\n${HELP}`);
        return 1;
    }
    return handler({ flags, command, rest, dir: resolve(process.cwd(), flags.dir) });
}
//# sourceMappingURL=dispatch.js.map