import { minimatch } from "minimatch";
import { z } from "zod";
/**
 * New projects start with the React and Swift/SwiftUI surfaces covered.
 *
 * These are path contracts, not guesses about rendered pixels. A project can
 * narrow them to its own UI-owned directories, while a legacy project with no
 * declaration receives an advisory migration warning instead of a surprise
 * cross-repository failure.
 */
export const DEFAULT_VISUAL_EVIDENCE = {
    enabled: true,
    include: [
        "apps/web/**/*.{avif,css,gif,ico,jpeg,jpg,jsx,png,scss,svg,tsx,webp}",
        "apps/ios/**/*.swift",
        "apps/ios/**/*.xcassets/**",
        "packages/shared/tokens/**",
        "hq/brand/tokens.json",
    ],
    exclude: [
        "apps/web/**/*.{spec,test}.{ts,tsx}",
        "apps/web/e2e/**",
        "apps/ios/**/*Tests/**",
    ],
    allowedUrlPrefixes: [],
};
const NON_REASONS = new Set(["yes", "y", "true", "n/a", "na", "none", "ok", "-"]);
function isRealReason(reason) {
    return reason.length >= 4 && !NON_REASONS.has(reason.toLowerCase());
}
const Pattern = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !value.startsWith("/"), "must be repository-relative")
    .refine((value) => !value.startsWith("!"), "negation is not supported; use exclude")
    .refine((value) => !value.includes("\\"), "must use forward slashes")
    .refine((value) => !value.split("/").includes(".."), "must not leave the repository with '..'");
const AllowedUrlPrefix = z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:"
            && !url.username
            && !url.password
            && !url.search
            && !url.hash
            && url.pathname.endsWith("/");
    }
    catch {
        return false;
    }
}, "must be an HTTPS URL prefix ending in '/' with no credentials, query, or fragment");
const EnabledConfig = z
    .object({
    enabled: z.literal(true),
    include: z.array(Pattern).min(1).max(32),
    exclude: z.array(Pattern).max(32).default([]),
    allowedUrlPrefixes: z.array(AllowedUrlPrefix).max(16).default([]),
})
    .strict();
const DisabledConfig = z
    .object({
    enabled: z.literal(false),
    reason: z.string().trim().refine(isRealReason, "must explain why visual evidence is disabled"),
})
    .strict();
const Config = z.discriminatedUnion("enabled", [EnabledConfig, DisabledConfig]);
function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
/** Resolve only the manifest block this check owns; unrelated fields pass through untouched. */
export function visualEvidencePolicy(manifest) {
    const root = object(manifest);
    if (!root)
        return { state: "invalid", message: "morpheus.json is not an object" };
    const review = root["review"];
    if (review === undefined)
        return { state: "absent" };
    const reviewObject = object(review);
    if (!reviewObject)
        return { state: "invalid", message: "review must be an object" };
    const raw = reviewObject["visualEvidence"];
    if (raw === undefined)
        return { state: "absent" };
    const parsed = Config.safeParse(raw);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const at = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
        return {
            state: "invalid",
            message: `review.visualEvidence${at}: ${issue?.message ?? "invalid configuration"}`,
        };
    }
    return parsed.data.enabled
        ? { state: "configured", config: parsed.data }
        : { state: "disabled", reason: parsed.data.reason };
}
/** Use when the manifest itself could not be read, which must never look like an absent policy. */
export function unreadableVisualEvidencePolicy(message) {
    return { state: "invalid", message: `could not read morpheus.json: ${message}` };
}
const FRONTEND_LIKE = /(?:\.(?:avif|css|gif|ico|jpeg|jpg|jsx|png|scss|storyboard|svg|swift|tsx|webp)$|\.xcassets\/)/i;
const GITHUB_ATTACHMENT = /https:\/\/(?:github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+|user-images\.githubusercontent\.com\/[^\s)]+)/gi;
const GITHUB_ATTACHMENT_ON_LINE = /https:\/\/(?:github\.com\/user-attachments\/assets\/[A-Za-z0-9-]+|user-images\.githubusercontent\.com\/[^\s)]+)/i;
const HTTPS_URL = /https:\/\/[^\s)<>"']+/gi;
function matchesAllowedPrefix(value, prefixes) {
    try {
        const candidate = new URL(value);
        return prefixes.some((prefix) => {
            const allowed = new URL(prefix);
            return candidate.protocol === "https:"
                && !candidate.username
                && !candidate.password
                && !candidate.search
                && !candidate.hash
                && candidate.origin === allowed.origin
                && candidate.pathname.startsWith(allowed.pathname)
                && candidate.pathname.length > allowed.pathname.length;
        });
    }
    catch {
        return false;
    }
}
function evidenceUrls(content, prefixes) {
    const github = content.match(GITHUB_ATTACHMENT) ?? [];
    const external = (content.match(HTTPS_URL) ?? [])
        .filter((value) => matchesAllowedPrefix(value, prefixes));
    return [...new Set([...github, ...external])];
}
function matches(path, patterns) {
    return patterns.some((pattern) => minimatch(path, pattern, { dot: true, nocase: false }));
}
function paths(paths) {
    const shown = paths.slice(0, 5);
    return (shown.join(", ") +
        (paths.length > shown.length ? ` (+${paths.length - shown.length} more)` : ""));
}
/** Visible content below one Markdown heading, stopping at the next heading. */
function sectionContent(body, heading) {
    const lines = body
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/~~~[\s\S]*?~~~/g, "")
        .replace(/`[^`\r\n]*`/g, "")
        .split("\n");
    const want = heading.trim().toLowerCase();
    let start = -1;
    for (let i = 0; i < lines.length; i += 1) {
        const match = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i] ?? "");
        if (!match)
            continue;
        if (start >= 0)
            return lines.slice(start, i).join("\n").trim();
        if (match[2]?.toLowerCase() === want)
            start = i + 1;
    }
    return start >= 0 ? lines.slice(start).join("\n").trim() : null;
}
export function checkVisualEvidence(input) {
    const { body, changedFiles, policy } = input;
    const likely = changedFiles.filter((path) => FRONTEND_LIKE.test(path));
    if (policy.state === "invalid") {
        return [{
                level: "error",
                rule: "visual-evidence-config",
                message: `${policy.message}. Fix the manifest before CI can determine the evidence rule.`,
            }];
    }
    if (policy.state === "absent") {
        return likely.length
            ? [{
                    level: "warning",
                    rule: "visual-evidence-config",
                    message: `Front-end-looking files changed (${paths(likely)}), but this legacy manifest has no ` +
                        "review.visualEvidence policy. Add the default-on path contract before enabling the blocking rollout.",
                }]
            : [];
    }
    if (policy.state === "disabled") {
        return likely.length
            ? [{
                    level: "waived",
                    rule: "visual-evidence",
                    message: `visual evidence disabled for this repository — \"${policy.reason}\"`,
                }]
            : [];
    }
    const { include, exclude } = policy.config;
    const excluded = changedFiles.filter((path) => matches(path, exclude));
    const required = changedFiles.filter((path) => matches(path, include) && !excluded.includes(path));
    const unclassified = likely.filter((path) => !required.includes(path) && !excluded.includes(path));
    const findings = [];
    if (unclassified.length) {
        findings.push({
            level: "warning",
            rule: "visual-evidence-paths",
            message: `Front-end-looking files sit outside the declared path contract: ${paths(unclassified)}. ` +
                "Evidence is not required for them; update include or exclude if the contract drifted.",
        });
    }
    if (!required.length)
        return findings;
    const content = sectionContent(body, "Visual evidence");
    if (!content) {
        findings.push({
            level: "error",
            rule: "visual-evidence",
            message: `Declared front-end paths changed (${paths(required)}). Add a non-empty ` +
                '"## Visual evidence" section with an approved screen recording or screenshots.',
        });
        return findings;
    }
    const allowedUrlPrefixes = policy.config.allowedUrlPrefixes ?? [];
    const attachments = evidenceUrls(content, allowedUrlPrefixes);
    if (!attachments.length) {
        findings.push({
            level: "error",
            rule: "visual-evidence",
            message: 'The "## Visual evidence" section has no approved evidence URL. Paste a GitHub attachment ' +
                "or link media under review.visualEvidence.allowedUrlPrefixes; CI validates the URL " +
                "without fetching it.",
        });
        return findings;
    }
    const recording = content
        .split("\n")
        .some((line) => /(?:screen\s+recording|recording|video)(?:\*\*)?\s*:/i.test(line) &&
        (GITHUB_ATTACHMENT_ON_LINE.test(line) || evidenceUrls(line, allowedUrlPrefixes).length > 0));
    if (!recording) {
        findings.push({
            level: "warning",
            rule: "visual-evidence-recording",
            message: "Visual evidence is attached. A screen recording is preferred; label its line `Recording:`. " +
                "Screenshots remain accepted when a recording is not practical.",
        });
    }
    return findings;
}
//# sourceMappingURL=visual-evidence.js.map