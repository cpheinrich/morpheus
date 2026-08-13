/**
 * What a Morpheus project starts as.
 *
 * Every template here is written from what the Evo and Darwin retrofits
 * actually needed, which is why this was deliberately built second. Guessing
 * the shape before doing it twice by hand would have produced a scaffold that
 * looked right and was wrong in ways nobody could name.
 *
 * Nothing emits a `TODO`. A file full of placeholders looks answered and is
 * not, which is worse than an absent file — the same rule the brand package
 * follows.
 */
export interface Seed {
    name: string;
    prefix: string;
    kind: "company" | "personal" | "internal";
    /** GitHub handle of the owner, for the inbox filename. */
    owner: string;
}
export declare const manifest: (s: Seed) => string;
export declare const firebaseConfig: (rulesPath: string) => string;
/**
 * The public Morpheus repository.
 *
 * Every scaffolded project links back here, because a project's conventions are
 * only legible to someone who has read Morpheus — and the readers who most need
 * that are the ones who cannot be told: code review agents, which start with no
 * memory by design, and agents working for collaborators.
 */
export declare const MORPHEUS_REPO = "https://github.com/cpheinrich/morpheus";
/**
 * The callout every project carries, in two registers.
 *
 * Kept as constants rather than inlined so the wording is one fact. Five repos
 * carry this text; five copies that drift are five different answers to "what
 * is this repo".
 */
export declare const morpheusCalloutForAgents: () => string;
export declare const morpheusCalloutForReadme: () => string;
/**
 * A README for humans.
 *
 * Deliberately short. `init` cannot know what the project *is*, and a template
 * that guesses produces prose nobody trusts — so it states only what is true of
 * every Morpheus project and leaves the description as one visible line to
 * fill in. The same rule as the rest of this file: no `TODO` that looks
 * answered.
 */
export declare const readme: (s: Seed) => string;
export declare const dirReadmes: Record<string, (s: Seed) => string>;
/**
 * Project-owned marketing briefs. They are deliberately useful before any provider is configured,
 * and the marker lets doctor distinguish a copied starting point from completed project work.
 */
export declare const marketingAnalytics: (s: Seed) => string;
export declare const marketingSeoStrategy: (s: Seed) => string;
export declare const marketingLaunchPlan: (s: Seed) => string;
export declare const agents: (s: Seed) => string;
export declare const decisions: (s: Seed) => string;
export declare const learned: () => string;
/**
 * The provider-neutral analytics contract every user-facing project owns.
 *
 * It is deliberately dependency-free. A fresh Morpheus project may not use
 * TypeScript at runtime, but the repository still needs one reviewable source
 * of truth that web, mobile and backend adapters can implement.
 */
export declare const analyticsSchema: () => string;
export declare const sharedReadme: () => string;
export declare const sharedSchemaReadme: () => string;
export declare const agentReadme: () => string;
export declare const worklogReadme: () => string;
export declare const inboxArchiveReadme: () => string;
/**
 * Deliberately short, and deliberately a pointer.
 *
 * The canonical version — frontmatter fields, both redaction passes, the
 * public-repo rule — is 130 lines in Morpheus's own `hq/team/meeting-notes/`.
 * Copying it into every project would give one copy per repo to drift, and the
 * one that drifts is a document about what may be published. What locality
 * buys is the *gate* being visible where somebody is standing; the depth stays
 * in one place.
 */
export declare const meetingNotesReadme: () => string;
export declare const inbox: (s: Seed) => string;
/**
 * CI for the project, matched to what the project actually is.
 *
 * `node-ci` runs `pnpm install --frozen-lockfile`, so wiring it into a static
 * site or a Python repo fails on the first push. A scaffold whose CI is red on
 * day one teaches people to ignore red CI, which costs more than the workflow
 * was worth.
 *
 * The convention checks are toolchain-agnostic — they build the Morpheus CLI
 * from a checkout — so every project gets those.
 */
export declare const ci: (opts?: {
    node: boolean;
    rulesPath?: string;
}) => string;
export declare const productReadme: (kind: "roadmap" | "goals" | "requests", s: Seed) => string;
export declare const hqReadme: (s: Seed) => string;
export declare const BRAND_MOODBOARD_IGNORE_RULES: readonly ["hq/brand/moodboard/*", "!hq/brand/moodboard/README.md"];
export declare const gitignore: () => string;
/**
 * A local, discoverable instruction for the visual-first brand workflow.
 *
 * `explore-prompt.md` is the handoff for one particular brand session; this
 * stays with every new project so a later agent knows how to resume the work
 * after that handoff has been archived or revised.
 */
export declare const brandReviewSkill: () => string;
/**
 * Claude Code's session hooks.
 *
 * One hook, and it is deliberately **informational rather than blocking**.
 * `context brief` prints what the session is missing and always exits 0; the
 * refusal lives in the `morpheus` CLI, which is provider-neutral and needs no
 * per-project wiring. A blocking `PreToolUse` hook would fire on every edit,
 * and a gate that fires constantly is a gate people disable — permanently,
 * where the staleness was temporary.
 *
 * Codex reads `AGENTS.md`, not this file, which is why the instruction is in
 * both places and the enforcement is in neither.
 */
export declare const claudeSettings: () => string;
/**
 * The freshness section every project's AGENTS.md carries.
 *
 * Short, and pointing rather than repeating — the reasoning is one copy, in
 * `architecture.md` §7.10. What has to be local is the two commands and the
 * list of what is refused, because an agent that has to follow a link to find
 * out it is about to be refused will not follow it.
 */
export declare const contextFreshness: () => string;
