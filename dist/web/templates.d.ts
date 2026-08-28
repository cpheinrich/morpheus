/**
 * The files `morpheus web init` writes.
 *
 * Every template here was extracted from a working surface rather than
 * designed: the waitlist from Darwin's `feat(web): capture waitlist emails`
 * (darwin-health/darwin#35), the `/hq` gate from DW-002, which Chris verified
 * renders `chris@darwin.health · admin`. That is the same rule the repository
 * scaffold followed — *the retrofit is the specification* — and it is why the
 * comments explaining a decision travel with the code instead of being
 * summarised away.
 *
 * **Styling is deliberately neutral.** Generated components use Tailwind core
 * utilities and nothing from a project's semantic layer: `border`, not
 * `border-line`. The kit generates primitives and each project owns its
 * vocabulary (§12.1), so a template that reached for `text-ink` would render
 * unstyled in every project that names its tokens differently — and would look
 * finished while doing it.
 */
export interface FirebaseFacts {
    /** Firebase / GCP project id, e.g. `dh-evo`. */
    projectId: string;
    apiKey: string;
    authDomain: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    /** Workload Identity Federation, when `web init` provisioned it. */
    workloadIdentity?: {
        poolId: string;
        providerId: string;
        serviceAccount: string;
    };
}
/** How a generated file refers to another generated file. */
export type Specifier = (from: string, to: string) => string;
export interface TemplateContext {
    /** Display name, e.g. `Evo`. */
    name: string;
    /** Import specifier for one of the app's own modules. */
    imp: Specifier;
    /**
     * The same, forced relative. For files a bundler does not resolve — which is
     * only ever a test run directly by `node --test`.
     */
    relative: Specifier;
    /** Import specifier for the waitlist schema, wherever it landed. */
    schema: (from: string) => string;
    /**
     * The waitlist endpoint as the app serves it. Carries a trailing slash when
     * the project sets `trailingSlash: true`, where the unslashed path is a 308.
     */
    waitlistEndpoint: string;
    firebase?: FirebaseFacts;
}
export declare const waitlistSchema: () => string;
export declare const waitlistRecord: (ctx: TemplateContext) => string;
export declare const waitlistThrottle: () => string;
/**
 * The Firestore REST encoding, kept pure and apart from the request.
 *
 * Separate from `store.ts` for the same reason `record.ts` is separate from the
 * route: this is a total function from a record to a wire shape, it is the part
 * that silently corrupts data when it is wrong, and it can be tested without a
 * credential, a network, or `server-only`.
 */
export declare const firestoreValue: () => string;
export declare const waitlistStore: (ctx: TemplateContext) => string;
export declare const waitlistRoute: (ctx: TemplateContext) => string;
export declare const waitlistForm: (ctx: TemplateContext) => string;
/**
 * The one generated test.
 *
 * `record.ts` is where the decisions are, and it is pure — so it is the module
 * whose behaviour a project can regress without noticing. Emitted in whichever
 * runner the app already uses: a scaffold that brought its own runner would be
 * adding a dependency to make its own output pass.
 */
export declare const waitlistRecordTest: (ctx: TemplateContext, runner: "vitest" | "node") => {
    path: string;
    content: string;
};
/**
 * The Firestore block for the waitlist collection.
 *
 * Written out explicitly rather than left to the catch-all deny: a collection
 * closed by omission looks like an oversight, and the next person wanting a
 * signup form would "fix" it by opening it up.
 */
export declare const WAITLIST_RULES_BLOCK = "\n    // Waitlist signups are written only by the server, through\n    // /api/waitlist, with the Admin SDK \u2014 which bypasses these rules. Every\n    // client operation is denied in both directions, deliberately and\n    // explicitly: a public form does not need a public collection, and reading\n    // the list is not something a browser should ever do.\n    match /waitlist/{email} {\n      allow read, write: if false;\n    }\n";
export declare const firebaseConfigFile: (facts: FirebaseFacts) => string;
export declare const firebaseClient: (ctx: TemplateContext) => string;
export declare const firebaseAdmin: (ctx: TemplateContext, facts: FirebaseFacts) => string;
export declare const authRoles: () => string;
export declare const authSessionCookie: (ctx: TemplateContext) => string;
export declare const authCurrentUser: (ctx: TemplateContext) => string;
export declare const routeGate: (ctx: TemplateContext) => string;
export declare const apiAuthSession: (ctx: TemplateContext, name: string) => string;
/**
 * The sign-in page.
 *
 * **It does not say what kind of account to use.** The allowlist is a list of
 * addresses and nothing more — personal or work is not a distinction it makes,
 * so the page must not imply one. The earlier version derived a domain from the
 * allowlist and said "personal Google accounts are not on the allowlist", which
 * was true when generated and false the first time anyone added one: a one-line
 * manifest change nobody pairs with a copy edit, telling exactly the people just
 * granted access not to bother trying. Darwin and Evo both shipped it.
 */
export declare const signInPage: (ctx: TemplateContext, name: string) => string;
export declare const signInForm: (ctx: TemplateContext) => string;
export declare const signOutButton: (ctx: TemplateContext) => string;
export declare const hqSearch: (name: string) => string;
export declare const hqSearchBuild: (name: string) => string;
export declare const hqSearchRoute: (ctx: TemplateContext) => string;
export declare const hqLayout: (ctx: TemplateContext, name: string) => string;
export declare const hqPage: (ctx: TemplateContext, name: string) => string;
export declare const noAccessPage: () => string;
export declare const appPackageJson: (scope: string, sharedName?: string) => string;
export declare const appTsconfig: () => string;
export declare const nextConfig: () => string;
export declare const postcssConfig: () => string;
export declare const globalsCss: () => string;
export declare const rootLayout: (name: string, description: string) => string;
export declare const homePage: (ctx: TemplateContext, name: string, description: string) => string;
export declare const envExample: (facts?: FirebaseFacts) => string;
/** The `/hq` and waitlist rows a project's README should carry. */
export declare const readmeSection: (name: string, hasHq: boolean, hasWaitlist: boolean) => string;
