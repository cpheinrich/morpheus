import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { scaffoldWeb } from "../web/scaffold.js";
import { outstanding, provisionWeb } from "../web/provision.js";
import { surveyWeb } from "../web/survey.js";
import { configureGoogleAuth } from "./firebase.js";
async function manifest(root) {
    try {
        return JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"));
    }
    catch (error) {
        throw new Error(`Could not read morpheus.json: ${error instanceof Error ? error.message : String(error)}. ` +
            "Run `morpheus init` first — the website is scaffolded into a Morpheus project, not " +
            "into a bare directory.");
    }
}
/** The email domain to name on the sign-in page, from the HQ allowlist. */
function allowlistDomain(config) {
    const domains = new Set((config.hq?.allowlist ?? [])
        .map((address) => address.split("@")[1]?.trim().toLowerCase())
        .filter((domain) => Boolean(domain)));
    // Only when the whole team shares one. Naming a domain that half the
    // allowlist does not use tells the other half their account is wrong.
    return domains.size === 1 ? [...domains][0] : undefined;
}
const MARK = {
    already: "·",
    created: "+",
    skipped: "~",
    blocked: "✗",
};
function printSteps(steps) {
    if (!steps.length)
        return;
    console.log("\n\x1b[1mProvisioning\x1b[0m");
    for (const entry of steps) {
        console.log(`  ${MARK[entry.state]} ${entry.title} \x1b[2m— ${entry.detail}\x1b[0m`);
    }
}
export async function webInit(opts) {
    let config;
    try {
        config = await manifest(opts.root);
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
    const name = config.displayName?.trim() || config.name?.trim() || "The project";
    const project = opts.project ?? config.accounts?.firebase ?? config.accounts?.gcpProject;
    const domain = opts.domain ?? config.publicDomain ?? config.domain;
    const survey = await surveyWeb(opts.root);
    let firebase;
    let steps = [];
    if (opts.provision) {
        if (!project) {
            console.error("No Firebase project id. Pass --project, or set accounts.firebase in morpheus.json.\n" +
                "Ids are globally unique across all of GCP, so the convention is <org>-<app>: dh-evo.");
            return 1;
        }
        const result = await provisionWeb({
            root: opts.root,
            project,
            // Display names under four characters fail with an error that reads like
            // "id taken", which is the wrong thing to go and debug.
            displayName: name.length >= 4 ? name : `${name} app`,
            ...(opts.organization ? { organization: opts.organization } : {}),
            ...(opts.vercelTeam ?? config.accounts?.vercel
                ? { vercelTeam: opts.vercelTeam ?? config.accounts.vercel }
                : {}),
            ...(opts.account ? { account: opts.account } : {}),
        });
        steps = result.steps;
        firebase = result.firebase;
    }
    else if (survey.hasFirebaseConfig) {
        // Already scaffolded against a real project: the rest can be added around
        // it without re-reading anything from Google.
        console.log("Skipping provisioning; lib/firebase/config.ts is already present.");
    }
    const { written, skipped, merged, notes } = await scaffoldWeb({
        root: opts.root,
        survey,
        name,
        description: config.description?.trim() || `${name} — coming soon.`,
        scope: `@${config.name ?? "app"}`,
        ...(firebase ? { firebase } : {}),
        ...(allowlistDomain(config) ? { emailDomain: allowlistDomain(config) } : {}),
        waitlist: opts.waitlist,
        hq: opts.hq,
    });
    console.log(`\n\x1b[1m${name}\x1b[0m \x1b[2m· ${survey.webRoot}\x1b[0m`);
    printSteps(steps);
    if (written.length) {
        console.log(`\n\x1b[32mCreated ${written.length} file(s)\x1b[0m`);
        for (const file of written)
            console.log(`  ${file}`);
    }
    if (merged.length) {
        console.log(`\n\x1b[33mMerged into ${merged.length} existing file(s)\x1b[0m`);
        for (const file of merged)
            console.log(`  ${file}`);
    }
    if (skipped.length) {
        console.log(`\n\x1b[2mLeft ${skipped.length} existing file(s) untouched:\x1b[0m`);
        for (const file of skipped)
            console.log(`  \x1b[2m${file}\x1b[0m`);
    }
    for (const note of notes)
        console.log(`\n\x1b[2m${note}\x1b[0m`);
    // Google sign-in last: it is the only step that can need a human at a consent
    // screen, and everything before it is worth keeping even if this stops.
    let authExit = 0;
    if (opts.hq && firebase && domain) {
        console.log("\n\x1b[1mGoogle sign-in\x1b[0m");
        authExit = await configureGoogleAuth(opts.root, {
            project: firebase.projectId,
            domain,
            openBrowser: opts.openBrowser,
        });
    }
    else if (opts.hq && firebase && !domain) {
        console.log("\n\x1b[2mSkipped Google sign-in setup: no public origin. Set `domain` in " +
            "morpheus.json or pass --domain, then run `morpheus firebase auth setup`.\x1b[0m");
    }
    const blocked = outstanding(steps);
    if (blocked.length) {
        console.log("\n\x1b[33mStill outstanding\x1b[0m");
        for (const entry of blocked)
            console.log(`  ${MARK[entry.state]} ${entry.title} — ${entry.detail}`);
    }
    if (!survey.vercelLinked) {
        console.log("\n\x1b[2mNo .vercel/project.json. Run `vercel link` in the web app, and set the " +
            "project's Root Directory — a monorepo deploys the wrong thing until it is set, " +
            "and the failure looks like a build error.\x1b[0m");
    }
    return blocked.some((entry) => entry.state === "blocked") || authExit !== 0 ? 1 : 0;
}
function line(label, value) {
    const mark = value === true ? "\x1b[32m✓\x1b[0m" : value === false || value === null ? "\x1b[33m·\x1b[0m" : " ";
    const detail = typeof value === "string" ? value : value ? "yes" : "no";
    return `  ${mark} ${label} \x1b[2m— ${detail}\x1b[0m`;
}
/** What the web surface has, and what it does not. Read-only. */
export async function webStatus(root) {
    const survey = await surveyWeb(root);
    console.log(`\n\x1b[1mWeb surface\x1b[0m \x1b[2m· ${survey.webRoot}\x1b[0m`);
    console.log(line("Next.js app", survey.webAppExists));
    console.log(line("Firebase web config", survey.hasFirebaseConfig));
    console.log(line("Waitlist capture", survey.hasWaitlist));
    console.log(line("Google sign-in page", survey.hasSignIn));
    console.log(line("/hq route", survey.hasHqRoute));
    console.log(line("Route gate", survey.hasRouteGate));
    console.log(line("Firestore rules", survey.firestoreRulesPath ?? "none configured"));
    console.log(line("Vercel linked", survey.vercelLinked));
    if (survey.staticExport) {
        console.log('\n\x1b[33mThis app sets `output: "export"` — HTML only, no route handlers, no route ' +
            "gate, no server rendering. The waitlist endpoint and /hq cannot run under it.\x1b[0m");
    }
    const missing = !survey.hasWaitlist || !survey.hasHqRoute || !survey.hasFirebaseConfig;
    if (missing)
        console.log("\n\x1b[2mRun `morpheus web init` to add what is missing.\x1b[0m");
    return 0;
}
//# sourceMappingURL=web.js.map