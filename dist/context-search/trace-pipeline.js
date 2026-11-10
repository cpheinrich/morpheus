import { codexHome } from "../doctor/codex-trust.js";
import { percentile } from "../profile/derive.js";
import { codexFirstTurnStarts } from "../profile/extract.js";
import { contextTraceSession } from "./rollout.js";
function earlier(prior, next) {
    return !prior || next.at < prior.at ? next : prior;
}
function timings(values) {
    const samples = values.filter((value) => value !== undefined && value >= 0);
    return {
        samples: samples.length,
        meanMs: samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null,
        p50Ms: percentile(samples, 50),
        p95Ms: percentile(samples, 95),
    };
}
function elapsed(from, to) {
    return from !== undefined && to !== undefined ? to - from : undefined;
}
function observeSearch(session, trace) {
    if (trace.queryStartedAt === undefined)
        return;
    if (trace.queryStartedAt < (session.firstSearch?.queryStartedAt ?? Infinity))
        session.firstSearch = trace;
    if (trace.outcome === "ok")
        session.firstResult = earlier(session.firstResult, trace);
}
function observeSession(session, trace) {
    switch (trace.type) {
        case "session-start":
            session.start = earlier(session.start, trace);
            break;
        case "prompt":
            session.prompt = earlier(session.prompt, trace);
            break;
        case "visible":
            if (trace.operation === "search")
                session.visible = earlier(session.visible, trace);
            break;
        case "query":
            observeSearch(session, trace);
            break;
    }
}
export class ContextPipeline {
    sessions = new Map();
    warm = new Map();
    observe(trace) {
        if (trace.type === "warm" && trace.mcpStartedAt !== undefined) {
            this.warm.set(trace.mcpStartedAt, trace);
            return;
        }
        if (!trace.session)
            return;
        const phase = trace.arm === "tantivy-compact" || trace.arm === "tantivy-full" ? "current" : "pilot";
        const key = `${trace.rollout ?? ""}/${trace.session}/${phase}`;
        const session = this.sessions.get(key) ?? {};
        observeSession(session, trace);
        this.sessions.set(key, session);
    }
    async report() {
        const fallback = await this.promptFallbacks();
        const rows = [...this.sessions.entries()].filter(([, row]) => row.start || row.prompt || row.firstSearch).map(([key, session]) => {
            const { firstSearch, firstResult, visible } = session;
            const mcp = firstSearch?.mcpStartedAt;
            const warm = mcp === undefined ? undefined : this.warm.get(mcp);
            const hostStart = session.start?.at;
            const prompt = session.prompt?.at ?? fallback.get(key);
            const start = Math.min(hostStart ?? Infinity, mcp ?? Infinity);
            return {
                start: Number.isFinite(start) ? start : undefined, prompt, firstSearch, firstResult, visible, warm,
                promptSource: session.prompt ? "hook" : prompt !== undefined ? "codexTurn" : "missing",
            };
        });
        const warms = [...this.warm.values()];
        return {
            sessions: rows.length,
            promptHooks: rows.filter(row => row.promptSource === "hook").length,
            codexTurnFallbacks: rows.filter(row => row.promptSource === "codexTurn").length,
            noPromptTimestamp: rows.filter(row => row.promptSource === "missing").length,
            firstSearches: rows.filter(row => row.firstSearch).length,
            firstSearchCacheHits: rows.filter(row => row.firstSearch?.cacheHit).length,
            firstResults: rows.filter(row => row.firstResult).length,
            visibleSearchResults: rows.filter(row => row.visible).length,
            startToPrompt: timings(rows.map(row => elapsed(row.start, row.prompt))),
            promptToFirstSearch: timings(rows.map(row => elapsed(row.prompt, row.firstSearch?.queryStartedAt))),
            promptToFirstResult: timings(rows.map(row => elapsed(row.prompt, row.firstResult?.at))),
            startToFirstResult: timings(rows.map(row => elapsed(row.start, row.firstResult?.at))),
            promptToFirstVisibleResult: timings(rows.map(row => elapsed(row.prompt, row.visible?.at))),
            firstSearch: timings(rows.map(row => row.firstSearch?.durationMs)),
            firstSearchIndexWait: timings(rows.map(row => row.firstSearch?.waitMs).filter(value => value)),
            warmups: warms.length,
            warmupFailures: warms.filter(row => row.outcome === "error").length,
            warmupCacheHits: warms.filter(row => row.cacheHit).length,
            warmupDuration: timings(warms.map(row => row.durationMs)),
            warmupBuild: timings(warms.map(row => row.buildMs).filter(value => value)),
            warmedBeforePrompt: rows.filter(row => row.warm?.outcome === "ok" && row.prompt !== undefined && row.warm.at <= row.prompt).length,
        };
    }
    async promptFallbacks() {
        const missing = [...this.sessions.entries()].filter(([, session]) => !session.prompt && (session.start || session.firstSearch));
        if (!missing.length)
            return new Map();
        const missingKeys = new Set(missing.map(([key]) => key));
        const ids = new Set(missing.map(([key]) => key.split("/")[0]));
        const keys = (session) => [...ids].flatMap(id => ["current", "pilot"].map(phase => `${id}/${contextTraceSession(id, session)}/${phase}`));
        const codex = await codexFirstTurnStarts(codexHome(), session => keys(session).some(key => missingKeys.has(key)));
        const result = new Map();
        for (const [session, at] of codex) {
            for (const key of keys(session)) {
                const state = this.sessions.get(key);
                const boundary = Math.min(state?.start?.at ?? Infinity, state?.firstSearch?.mcpStartedAt ?? Infinity);
                // A resumed chat may have begun days before the trace window.
                if (at >= boundary - 60_000 && missingKeys.has(key))
                    result.set(key, at);
            }
        }
        return result;
    }
}
//# sourceMappingURL=trace-pipeline.js.map