import { posix } from "node:path";
import matter from "@11ty/gray-matter";
import { ROADMAP_ID } from "../pm/id.js";
function recordSource(source) {
    const lines = source.text.split(/\r?\n/);
    const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
    const bodyStart = end < 0 ? 0 : end + 1;
    try {
        const metadata = bodyStart ? matter(source.text, {}).data : undefined;
        const data = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
        return { path: source.path, lines, bodyStart, data };
    }
    catch {
        // A malformed record can still declare ordinary Markdown links in its body.
        return { path: source.path, lines, bodyStart, data: {} };
    }
}
const fieldLine = (record, field) => record.lines.slice(1, record.bodyStart).findIndex(line => line.startsWith(field + ":")) + 2;
function roadmapIds(records) {
    const ids = new Map();
    const duplicate = new Set();
    for (const { path, data } of records) {
        if (!path.startsWith("hq/product/roadmap/") || typeof data.id !== "string" || !ROADMAP_ID.test(data.id))
            continue;
        if (ids.has(data.id))
            duplicate.add(data.id);
        ids.set(data.id, path);
    }
    for (const id of duplicate)
        ids.delete(id);
    return ids;
}
function githubRepo(origin) {
    const match = /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(origin ?? "");
    return match ? `https://github.com/${match[1]}/${match[2]}` : undefined;
}
function githubTarget(target) {
    const match = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/([1-9]\d*)(?:[/?#].*)?$/i.exec(target);
    if (!match)
        return;
    const kind = match[3].toLowerCase() === "pull" ? "pull_request" : "issue";
    return { kind, to: `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}/${match[3].toLowerCase()}/${match[4]}` };
}
function localTarget(from, target, eligible) {
    const index = target.indexOf("#");
    const file = index < 0 ? target : target.slice(0, index);
    const anchor = index < 0 ? "" : target.slice(index);
    if (/^(?:[a-z][\w+.-]*:|\/)/i.test(file) || /[?\\\u0000-\u001f]/.test(file))
        return;
    try {
        const decoded = decodeURIComponent(file);
        if (decoded.startsWith("/") || /[\\\u0000-\u001f]/.test(decoded))
            return;
        const path = decoded ? posix.normalize(posix.join(posix.dirname(from), decoded)) : from;
        if (eligible.has(path) && (path !== from || anchor))
            return path + anchor;
    }
    catch {
        // Invalid URL escapes cannot resolve to a local record.
    }
}
function githubNumbers(value) {
    return Array.isArray(value) ? value.filter(number => Number.isSafeInteger(number) && number > 0) : [];
}
function metadataEdges(record, ids, eligible, repo) {
    const { data, path } = record;
    const edges = [];
    const add = (kind, to, field) => edges.push({ kind, from: path, to, sourceLine: fieldLine(record, field) });
    const roadmap = typeof data.roadmap === "string" ? ids.get(data.roadmap) : undefined;
    if (roadmap && roadmap !== path)
        add("roadmap", roadmap, "roadmap");
    if (repo && typeof data.id === "string" && ids.get(data.id) === path) {
        for (const [field, segment, kind] of [["prs", "pull", "pull_request"], ["issues", "issues", "issue"]]) {
            for (const number of githubNumbers(data[field]))
                add(kind, `${repo}/${segment}/${number}`, field);
        }
    }
    const superseded = Array.isArray(data.supersedes) ? data.supersedes : [data.supersedes];
    for (const reference of superseded) {
        if (typeof reference !== "string")
            continue;
        const target = ids.get(reference) ?? localTarget(path, reference, eligible);
        if (target && target !== path)
            add("supersedes", target, "supersedes");
    }
    return edges;
}
function markdownEdges(record, eligible) {
    const edges = [];
    let fence;
    for (let index = record.bodyStart; index < record.lines.length; index++) {
        const line = record.lines[index];
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (marker) {
            const run = marker[1];
            if (!fence)
                fence = run;
            else if (run.startsWith(fence) && !marker[2].trim())
                fence = undefined;
            continue;
        }
        if (fence || /^(?: {4}|\t)/.test(line))
            continue;
        const prose = line.replace(/(`+).*?\1/g, "");
        const explicit = /^\s*(?:[-*]\s+)?(?:Supersedes:|\*\*Supersedes:\*\*)\s/i.test(prose);
        for (const match of prose.matchAll(/(?<!!)\[[^\]\n]+\]\(\s*(?:<([^<>]+)>|([^\s)]+))[^)]*\)|\b(https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues)\/[1-9]\d*(?![\w]))/gi)) {
            const target = match[1] ?? match[2] ?? match[3];
            const github = githubTarget(target);
            const local = github ? undefined : localTarget(record.path, target, eligible);
            if (github)
                edges.push({ ...github, from: record.path, sourceLine: index + 1 });
            if (local)
                edges.push({ kind: explicit ? "supersedes" : "links_to", from: record.path, to: local, sourceLine: index + 1 });
        }
    }
    return edges;
}
/** Derive explicit relationships from the same eligible records used by search. */
export function buildRelationships(sources, origin) {
    const records = [...sources].sort((a, b) => a.path.localeCompare(b.path)).map(recordSource);
    const eligible = new Set(records.map(record => record.path));
    const ids = roadmapIds(records);
    const repo = githubRepo(origin)?.toLowerCase();
    const edges = new Map();
    for (const record of records) {
        for (const edge of [...metadataEdges(record, ids, eligible, repo), ...markdownEdges(record, eligible)]) {
            const key = JSON.stringify([edge.kind, edge.from, edge.to]);
            if (!edges.has(key))
                edges.set(key, edge);
        }
    }
    return [...edges.values()];
}
const node = (target) => target.split("#", 1)[0];
function edgesByEndpoint(edges) {
    const adjacency = new Map();
    for (const edge of edges) {
        for (const endpoint of new Set([edge.from, node(edge.to)])) {
            const existing = adjacency.get(endpoint) ?? [];
            existing.push(edge);
            adjacency.set(endpoint, existing);
        }
    }
    return adjacency;
}
/** Traverse explicit edges in either direction, retaining their original provenance. */
export function relatedContext(edges, path, depth = 1, limit = 20) {
    const maximumDepth = Math.min(3, Math.max(1, Math.floor(depth) || 1));
    const maximumResults = Math.min(100, Math.max(1, Math.floor(limit) || 1));
    const adjacency = edgesByEndpoint(edges);
    const start = node(path);
    const relationships = [];
    const seen = new Set([start]);
    const emitted = new Set();
    let frontier = [start];
    for (let hop = 1; hop <= maximumDepth && frontier.length; hop++) {
        const next = [];
        for (const current of frontier) {
            for (const edge of adjacency.get(current) ?? []) {
                if (emitted.has(edge))
                    continue;
                if (relationships.length === maximumResults)
                    return { relationships, truncated: true };
                emitted.add(edge);
                const direction = edge.from === current ? "outgoing" : "incoming";
                relationships.push({ ...edge, depth: hop, direction });
                const peer = direction === "outgoing" ? node(edge.to) : edge.from;
                if (!seen.has(peer)) {
                    seen.add(peer);
                    next.push(peer);
                }
            }
        }
        frontier = next;
    }
    return { relationships, truncated: false };
}
//# sourceMappingURL=relationships.js.map