import { readFile } from "node:fs/promises";
import { join } from "node:path";
function block(source, name) {
    const start = source.indexOf(`const ${name} = {`);
    if (start === -1)
        return null;
    const end = source.indexOf("}", start);
    return end === -1 ? null : source.slice(start, end);
}
function factsFrom(blockSource) {
    if (!blockSource)
        return null;
    const read = (key) => new RegExp(`${key}\\s*:\\s*"([^"]+)"`).exec(blockSource)?.[1];
    const projectId = read("projectId");
    const apiKey = read("apiKey");
    const authDomain = read("authDomain");
    const storageBucket = read("storageBucket");
    const messagingSenderId = read("messagingSenderId");
    const appId = read("appId");
    if (!projectId || !apiKey || !authDomain || !storageBucket || !messagingSenderId || !appId) {
        return null;
    }
    return { projectId, apiKey, authDomain, storageBucket, messagingSenderId, appId };
}
export function parseTwoEnvFacts(source) {
    const read = (key) => new RegExp(`${key}\\s*:\\s*"([^"]+)"`).exec(source)?.[1];
    const poolId = read("poolId");
    const providerId = read("providerId");
    const serviceAccount = read("serviceAccount");
    return {
        production: factsFrom(block(source, "PRODUCTION_CONFIG")),
        staging: factsFrom(block(source, "STAGING_CONFIG")),
        workloadIdentity: poolId && providerId && serviceAccount ? { poolId, providerId, serviceAccount } : null,
    };
}
export async function readTwoEnvFacts(root, webRoot) {
    const path = join(root, webRoot === "." ? "lib/firebase/config.ts" : `${webRoot}/lib/firebase/config.ts`);
    const source = await readFile(path, "utf8").catch(() => null);
    if (!source)
        return { production: null, staging: null, workloadIdentity: null };
    return parseTwoEnvFacts(source);
}
//# sourceMappingURL=facts.js.map