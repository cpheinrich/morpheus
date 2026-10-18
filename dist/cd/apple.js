import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";
import { invariant } from "./state.js";
import { CdWait } from "./errors.js";
export class AppleHttp {
    config;
    environment;
    fetcher;
    token;
    constructor(config, environment = process.env, fetcher = fetch) {
        this.config = config;
        this.environment = environment;
        this.fetcher = fetcher;
    }
    async authorization() {
        if (this.token && this.token.expiresAt > Date.now() + 60_000)
            return this.token.value;
        const issuer = this.environment[this.config.apple.issuerIdEnv], keyId = this.environment[this.config.apple.keyIdEnv], path = this.environment[this.config.apple.privateKeyPathEnv];
        invariant(issuer && keyId && path, `Missing named Apple credential reference (${Object.values(this.config.apple).join(", ")})`);
        const key = await importPKCS8(await readFile(path, "utf8"), "ES256"), now = Math.floor(Date.now() / 1000);
        const value = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" }).setIssuer(issuer).setAudience("appstoreconnect-v1").setIssuedAt(now).setExpirationTime(now + 600).sign(key);
        this.token = { value, expiresAt: (now + 600) * 1000 };
        return value;
    }
    async request(method, path, body) {
        const url = new URL(path, "https://api.appstoreconnect.apple.com");
        invariant(url.origin === "https://api.appstoreconnect.apple.com", "Apple pagination cannot redirect credentials to another host");
        let response;
        const authorization = await this.authorization();
        try {
            response = await this.fetcher(url, { method, headers: { Authorization: `Bearer ${authorization}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000), redirect: "error" });
        }
        catch {
            throw new CdWait(`Apple ${method} ${url.pathname} observation/network outcome unavailable`, "apple-network");
        }
        const text = await response.text();
        if (response.status === 429 || response.status >= 500)
            throw new CdWait(`Apple ${method} ${url.pathname} HTTP ${response.status}`, "apple-provider");
        if (!response.ok)
            throw new Error(`Apple ${method} ${url.pathname} HTTP ${response.status}: ${text.slice(0, 2000)}`);
        return (text.trim() ? JSON.parse(text) : undefined);
    }
}
export async function applePages(api, path) {
    const result = [], included = [], visited = new Set();
    for (let next = path; next;) {
        invariant(!visited.has(next), "Apple returned cyclic pagination");
        visited.add(next);
        const page = await api.request("GET", next);
        invariant(Array.isArray(page.data), "Expected Apple resource collection");
        result.push(...page.data);
        included.push(...page.included ?? []);
        next = page.links?.next;
    }
    return { data: result, included };
}
const filter = (values) => new URLSearchParams(values).toString();
export class AppleAdapter {
    api;
    constructor(api) {
        this.api = api;
    }
    async group(groupId) {
        const group = (await this.api.request("GET", `/v1/betaGroups/${encodeURIComponent(groupId)}?include=app`)).data;
        const groupApp = group.relationships?.app?.data;
        const members = await applePages(this.api, `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/betaTesters?limit=200`);
        const assigned = await applePages(this.api, `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/builds?limit=200`);
        return { id: group.id, appId: groupApp && !Array.isArray(groupApp) ? groupApp.id : "UNKNOWN", internal: group.attributes?.isInternalGroup === true, automaticDistribution: group.attributes?.hasAccessToAllBuilds !== false, buildIds: assigned.data.map(item => item.id), testerIds: members.data.map(item => item.id) };
    }
    async maximum(appId, version) {
        const builds = await applePages(this.api, `/v1/builds?${filter({ "filter[app]": appId, "filter[preReleaseVersion.version]": version, "fields[builds]": "version", limit: "200" })}`);
        return String(builds.data.reduce((maximum, build) => { const value = String(build.attributes?.version); invariant(/^[0-9]+$/.test(value), "Provider build number is not a decimal identity"); return BigInt(value) > maximum ? BigInt(value) : maximum; }, 0n));
    }
    async observe(attempt, groupId, now) {
        let uploadState, diagnostics;
        if (attempt.upload?.providerUploadId) {
            const upload = await this.api.request("GET", `/v1/buildUploads/${encodeURIComponent(attempt.upload.providerUploadId)}`), resource = upload.data;
            const rawState = resource.attributes?.state;
            uploadState = typeof rawState === "string" ? rawState : typeof rawState === "object" && rawState ? String(rawState.state ?? "UNKNOWN") : "UNKNOWN";
            diagnostics = JSON.stringify(rawState ?? resource.attributes ?? {}).slice(0, 6000);
        }
        const builds = await applePages(this.api, `/v1/builds?${filter({ "filter[app]": attempt.appId, "filter[preReleaseVersion.version]": attempt.version, "filter[version]": attempt.buildNumber, include: "preReleaseVersion,buildBetaDetail,app", limit: "200" })}`);
        invariant(builds.data.length <= 1, "Apple returned ambiguous exact app/version/build identity");
        const build = builds.data[0];
        if (!build)
            return { uploadState, diagnostics };
        const related = (name) => { const relation = build.relationships?.[name]?.data; return relation && !Array.isArray(relation) ? builds.included.find(item => item.id === relation.id && item.type === relation.type) : undefined; };
        invariant(related("preReleaseVersion")?.attributes?.version === attempt.version && related("app")?.id === attempt.appId, "Apple exact build relationships do not match selected app/version");
        const observation = { appId: attempt.appId, version: attempt.version, buildNumber: String(build.attributes?.version), buildId: build.id, processingState: String(build.attributes?.processingState ?? "UNKNOWN"), betaState: String(related("buildBetaDetail")?.attributes?.internalBuildState ?? "UNKNOWN"), group: await this.group(groupId), observedAt: now, uploadState, diagnostics };
        return { uploadState, diagnostics, observation };
    }
    async assign(buildId, groupId) {
        await this.api.request("POST", `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/builds`, { data: [{ type: "builds", id: buildId }] });
    }
}
//# sourceMappingURL=apple.js.map