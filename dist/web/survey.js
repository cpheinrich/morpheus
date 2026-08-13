import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
async function exists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function readJson(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    }
    catch {
        return null;
    }
}
/**
 * Where the Next.js app lives.
 *
 * `apps/web` is the canonical answer (§3), and it is also the answer for a
 * repository that has nothing yet. A root-level `app/` directory is accepted
 * because two personal sites predate the convention, and writing a second app
 * beside a working one would be worse than following it.
 */
export async function findWebRoot(root) {
    if (await exists(join(root, "apps/web/package.json")))
        return { webRoot: "apps/web", exists: true };
    if (await exists(join(root, "app")) && (await exists(join(root, "package.json")))) {
        const pkg = await readJson(join(root, "package.json"));
        if (pkg?.dependencies?.["next"])
            return { webRoot: ".", exists: true };
    }
    return { webRoot: "apps/web", exists: false };
}
/** The `@/*` alias, only when the app's own tsconfig actually declares it. */
async function readAlias(root, webRoot) {
    const tsconfig = await readJson(join(root, webRoot, "tsconfig.json"));
    const paths = tsconfig?.compilerOptions?.paths;
    return paths && Object.keys(paths).includes("@/*") ? "@/" : null;
}
/**
 * The shared workspace package, if there is one.
 *
 * The waitlist record shape is product vocabulary, so it belongs beside
 * `schema/analytics.ts` under the same rule (§ analytics decision): one
 * meaning, many transports. Without a shared package the schema goes inside
 * the app instead — a project with one surface does not need a package
 * boundary invented for it.
 */
export async function findSharedPackage(root) {
    for (const dir of ["packages/shared"]) {
        const pkg = await readJson(join(root, dir, "package.json"));
        if (!pkg?.name)
            continue;
        const exportsMap = pkg.exports && typeof pkg.exports === "object" && !Array.isArray(pkg.exports)
            ? pkg.exports
            : null;
        return {
            dir,
            name: pkg.name,
            hasExportsMap: exportsMap !== null,
            exportsWaitlist: exportsMap !== null && "./schema/waitlist" in exportsMap,
        };
    }
    return null;
}
async function readTestRunner(root, webRoot) {
    const pkg = await readJson(join(root, webRoot, "package.json"));
    if (!pkg)
        return null;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["vitest"])
        return "vitest";
    // `node --test` leaves no dependency behind, so the script is the only
    // evidence it is the runner. Evo tests this way and has no vitest at all.
    if (Object.values(pkg.scripts ?? {}).some((script) => script.includes("--test")))
        return "node";
    return null;
}
/**
 * Whether the Next config asks for a static export.
 *
 * Read as text rather than imported: the config is TypeScript, may import from
 * the project, and evaluating a repository's code to answer a question about it
 * is a much larger thing to do than matching one key. A commented-out line
 * would be a false positive; the comment stripping keeps that from happening
 * for the one shape that actually occurs.
 */
export function withoutComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
export async function readsStaticExport(source) {
    return /output\s*:\s*["']export["']/.test(withoutComments(source));
}
/** Whether the config asks Next to canonicalise every route with a trailing slash. */
export function readsTrailingSlash(source) {
    return /trailingSlash\s*:\s*true/.test(withoutComments(source));
}
/** The Firestore rules file Firebase actually deploys, when one is configured. */
export async function deployedRulesPath(root) {
    const config = await readJson(join(root, "firebase.json"));
    const configured = config?.firestore?.rules;
    if (typeof configured === "string" && configured.trim())
        return configured.trim();
    if (await exists(join(root, "firestore.rules")))
        return "firestore.rules";
    return null;
}
export async function surveyWeb(root) {
    const { webRoot, exists: webAppExists } = await findWebRoot(root);
    const app = (path) => join(root, webRoot, path);
    const [alias, shared, testRunner, hasTailwindConfig, hasWaitlist, hasHqRoute, hasSignIn, hasFirebaseConfig, proxyGate, middlewareGate, firestoreRulesPath, vercelRoot, vercelApp,] = await Promise.all([
        readAlias(root, webRoot),
        findSharedPackage(root),
        readTestRunner(root, webRoot),
        exists(app("postcss.config.mjs")),
        exists(app("app/api/waitlist/route.ts")),
        exists(app("app/hq")),
        exists(app("app/sign-in")),
        exists(app("lib/firebase/config.ts")),
        exists(app("proxy.ts")),
        exists(app("middleware.ts")),
        deployedRulesPath(root),
        exists(join(root, ".vercel/project.json")),
        exists(app(".vercel/project.json")),
    ]);
    const nextConfig = await Promise.all(["next.config.ts", "next.config.mjs", "next.config.js"].map((name) => readFile(app(name), "utf8").catch(() => "")));
    const staticExport = (await Promise.all(nextConfig.map((source) => readsStaticExport(source)))).some(Boolean);
    const trailingSlash = nextConfig.some((source) => readsTrailingSlash(source));
    return {
        webRoot,
        webAppExists,
        alias,
        shared,
        testRunner,
        hasTailwind: hasTailwindConfig,
        hasWaitlist,
        hasHqRoute,
        hasSignIn,
        hasFirebaseConfig,
        hasRouteGate: proxyGate || middlewareGate,
        firestoreRulesPath,
        vercelLinked: vercelRoot || vercelApp,
        staticExport,
        trailingSlash,
    };
}
/**
 * Import specifier for one of the app's own modules.
 *
 * `from` is the generated file's path inside the web root; `to` is the target.
 * With an alias configured the result is idiomatic; without one it is relative
 * and still correct, which is the property that matters.
 */
export function importPath(survey, from, to) {
    if (survey.alias)
        return `${survey.alias}${to}`;
    const fromParts = from.split("/").slice(0, -1);
    const toParts = to.split("/");
    let shared = 0;
    while (shared < fromParts.length && shared < toParts.length - 1 && fromParts[shared] === toParts[shared]) {
        shared += 1;
    }
    const up = fromParts.length - shared;
    const prefix = up === 0 ? "./" : "../".repeat(up);
    return `${prefix}${toParts.slice(shared).join("/")}`;
}
/**
 * Read the Firebase facts back out of a config this scaffold already wrote.
 *
 * Re-running to pick up an improved template is the whole point of a scaffold
 * that never overwrites, and without this `--no-provision` could not do it: the
 * Firebase-dependent half is written only when the facts are known, and with
 * provisioning skipped they were known to nobody — so a re-run silently
 * produced nothing.
 *
 * Parsed rather than imported: the file is TypeScript, and reading a
 * repository's code to answer a question about it is a much larger thing to do
 * than matching the keys we generated. Any missing key returns null, so a
 * hand-edited or foreign config is treated as unknown rather than
 * half-understood.
 */
export async function readFirebaseFacts(root, webRoot) {
    const source = await readFile(join(root, webRoot === "." ? "lib/firebase/config.ts" : `${webRoot}/lib/firebase/config.ts`), "utf8").catch(() => null);
    if (!source)
        return null;
    const read = (key) => new RegExp(`${key}\\s*:\\s*"([^"]+)"`).exec(source)?.[1];
    const projectId = read("projectId");
    const apiKey = read("apiKey");
    const authDomain = read("authDomain");
    const storageBucket = read("storageBucket");
    const messagingSenderId = read("messagingSenderId");
    const appId = read("appId");
    if (!projectId || !apiKey || !authDomain || !storageBucket || !messagingSenderId || !appId) {
        return null;
    }
    const poolId = read("poolId");
    const providerId = read("providerId");
    const serviceAccount = read("serviceAccount");
    return {
        projectId,
        apiKey,
        authDomain,
        storageBucket,
        messagingSenderId,
        appId,
        ...(poolId && providerId && serviceAccount
            ? { workloadIdentity: { poolId, providerId, serviceAccount } }
            : {}),
    };
}
/** Where the waitlist schema lives, and how the app imports it. */
export function waitlistSchemaLocation(survey) {
    if (survey.shared) {
        return {
            path: `${survey.shared.dir}/schema/waitlist.ts`,
            specifier: () => `${survey.shared.name}/schema/waitlist`,
        };
    }
    return {
        path: `${survey.webRoot}/lib/waitlist/schema.ts`,
        specifier: (from) => importPath(survey, from, "lib/waitlist/schema"),
    };
}
//# sourceMappingURL=survey.js.map