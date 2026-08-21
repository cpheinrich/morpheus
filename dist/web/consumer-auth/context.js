/**
 * Everything a consumer-auth template may vary on.
 *
 * The templates in this directory are Evo's working files with these values
 * lifted out (cpheinrich/morpheus#135). The context is deliberately flat and
 * string-typed: a template interpolates, it never computes, so anything that
 * needs deriving is derived once here — where it can be unit-tested — rather
 * than in nineteen template literals.
 */
/** `Heinrich Money` → `heinrich-money`; also the identifier stem. */
export function slugOf(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
/** `heinrich-money` → `heinrichMoney`. */
export function camelOf(name) {
    const parts = slugOf(name).split("-").filter(Boolean);
    return parts
        .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
        .join("");
}
/** `heinrich-money` → `HeinrichMoney`. */
export function pascalOf(name) {
    const camel = camelOf(name);
    return camel ? camel[0].toUpperCase() + camel.slice(1) : camel;
}
/** `heinrich-money` → `HEINRICH_MONEY`. */
export function constOf(name) {
    return slugOf(name).replace(/-/g, "_").toUpperCase();
}
/** Host with no scheme, port, or path — what the allowlist compares against. */
export function hostOf(domainOrOrigin) {
    const value = domainOrOrigin.trim();
    try {
        return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host;
    }
    catch {
        return value;
    }
}
/**
 * Escape a host for the KNOWN_HOST character-for-character alternation.
 *
 * Only `.` occurs in a hostname and means "any character" in a regex; a host
 * that slipped through unescaped would also match `evoxmed`, which is exactly
 * the lookalike the allowlist exists to refuse.
 */
export function hostPatternOf(host) {
    return host.replace(/\./g, "\\.");
}
/**
 * Relative specifier from `<webRoot>/__tests__/` to the shared user schema.
 *
 * Computed rather than hardcoded because the app is not always at `apps/web` —
 * a root-level app is one directory shallower, and a wrong depth here is a
 * test suite that fails on its first import.
 */
export function sharedSchemaFromTests(webRoot) {
    const depth = webRoot === "." ? 1 : webRoot.split("/").length + 1;
    return `${"../".repeat(depth)}packages/shared/schema/user.ts`;
}
export function buildContext(input) {
    const slug = slugOf(input.name);
    const productionHost = hostOf(input.publicDomain);
    const stagingHost = hostOf(input.stagingDomain);
    return {
        name: input.name,
        upper: input.name.toUpperCase(),
        camel: camelOf(input.name),
        pascal: pascalOf(input.name),
        slug,
        constName: constOf(input.name),
        scope: input.sharedPackageName.split("/")[0] ?? input.sharedPackageName,
        productionHost,
        stagingHost,
        productionHostPattern: hostPatternOf(productionHost),
        stagingHostPattern: hostPatternOf(stagingHost),
        supportEmail: input.supportEmail,
        production: input.production,
        staging: input.staging,
        workloadIdentity: input.workloadIdentity,
        sharedSchemaFromTests: sharedSchemaFromTests(input.webRoot),
    };
}
/** Narrow `web init`'s FirebaseFacts to the fields the templates interpolate. */
export function environmentFacts(facts) {
    return {
        projectId: facts.projectId,
        apiKey: facts.apiKey,
        authDomain: facts.authDomain,
        storageBucket: facts.storageBucket,
        messagingSenderId: facts.messagingSenderId,
        appId: facts.appId,
    };
}
//# sourceMappingURL=context.js.map