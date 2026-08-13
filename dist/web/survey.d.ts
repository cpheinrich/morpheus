/**
 * What a repository's web surface already has.
 *
 * `web init` runs on established projects far more often than on empty ones —
 * Evo has a home page, a token pipeline and a Vercel link before it has any of
 * this — so every template decision is made from what is *there*, not from a
 * fixed idea of what a project looks like. The survey is the whole of that
 * reading, kept separate from the writing so it can be tested against fixture
 * trees with no filesystem mutation at all.
 *
 * Nothing here decides what to write. It answers *where does code live here*
 * and *what is already done*, and `scaffold.ts` decides.
 */
export interface SharedPackage {
    /** Directory relative to the repository root, e.g. `packages/shared`. */
    dir: string;
    /** Package name, e.g. `@evo/shared`. */
    name: string;
    /** True when `exports` is an explicit map that must gain an entry. */
    hasExportsMap: boolean;
    /** True when the waitlist schema is already exported. */
    exportsWaitlist: boolean;
}
export interface WebSurvey {
    /** Directory of the Next.js app relative to the root, e.g. `apps/web`. */
    webRoot: string;
    /** True when that directory already holds an app — anything but a bare path. */
    webAppExists: boolean;
    /**
     * Import prefix for the app's own modules. `@/` when the app's tsconfig
     * declares it, otherwise null, and generated files use relative specifiers.
     * Guessing `@/` where it is not configured produces files that do not
     * compile, which is the one failure a scaffold must not ship.
     */
    alias: string | null;
    shared: SharedPackage | null;
    /** `vitest` or `node:test`, from the app's devDependencies. */
    testRunner: "vitest" | "node" | null;
    hasTailwind: boolean;
    /** Already-present pieces. Each one is skipped rather than rewritten. */
    hasWaitlist: boolean;
    hasHqRoute: boolean;
    hasSignIn: boolean;
    hasFirebaseConfig: boolean;
    hasRouteGate: boolean;
    /** Path of the deployed Firestore rules, when one is configured. */
    firestoreRulesPath: string | null;
    /** `.vercel/project.json`, at the root or in the web root. */
    vercelLinked: boolean;
}
/**
 * Where the Next.js app lives.
 *
 * `apps/web` is the canonical answer (§3), and it is also the answer for a
 * repository that has nothing yet. A root-level `app/` directory is accepted
 * because two personal sites predate the convention, and writing a second app
 * beside a working one would be worse than following it.
 */
export declare function findWebRoot(root: string): Promise<{
    webRoot: string;
    exists: boolean;
}>;
/**
 * The shared workspace package, if there is one.
 *
 * The waitlist record shape is product vocabulary, so it belongs beside
 * `schema/analytics.ts` under the same rule (§ analytics decision): one
 * meaning, many transports. Without a shared package the schema goes inside
 * the app instead — a project with one surface does not need a package
 * boundary invented for it.
 */
export declare function findSharedPackage(root: string): Promise<SharedPackage | null>;
/** The Firestore rules file Firebase actually deploys, when one is configured. */
export declare function deployedRulesPath(root: string): Promise<string | null>;
export declare function surveyWeb(root: string): Promise<WebSurvey>;
/**
 * Import specifier for one of the app's own modules.
 *
 * `from` is the generated file's path inside the web root; `to` is the target.
 * With an alias configured the result is idiomatic; without one it is relative
 * and still correct, which is the property that matters.
 */
export declare function importPath(survey: Pick<WebSurvey, "alias">, from: string, to: string): string;
/** Where the waitlist schema lives, and how the app imports it. */
export declare function waitlistSchemaLocation(survey: WebSurvey): {
    path: string;
    specifier: (from: string) => string;
};
