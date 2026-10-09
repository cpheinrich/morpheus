/**
 * Where a pull request's web preview for one exact commit lives, decided from sources nobody but
 * the deployer can write.
 *
 * A session screenshots that preview as visual evidence, so the URL must belong to the commit the
 * session finished on and must not come from text anyone can post. Two sources qualify:
 *
 * 1. **GitHub deployment records** for the commit, created by `vercel[bot]`. They need the App's
 *    Deployments permission, which the manager may not hold, so a refusal falls through.
 * 2. **Vercel's own pull request comment, bound to the commit by its status.** Vercel sets a
 *    `Vercel` commit status whose `target_url` is the deployment's inspector page, and keeps one
 *    comment, authored by the `vercel[bot]` App identity, whose `[vc]:` line embeds each project's
 *    `inspectorUrl` and `previewUrl`. Only a comment by that identity is read, and only a project
 *    whose `inspectorUrl` equals the commit's successful status `target_url` is used: the author
 *    shows Vercel wrote it, the inspector URL shows which commit it describes. A collaborator can
 *    still edit the comment, so its preview must also be a `*.vercel.app` host.
 *
 * The comment's `previewUrl` is the branch alias, which follows the branch's newest ready
 * deployment. It is bound to the commit only when this runs; a push after that moves it, and the
 * apply step's refusal to act on a moved head is what closes that gap.
 */

export const VERCEL_BOT = "vercel[bot]";

export interface DeploymentSource { creator: string; environmentUrl?: string | undefined; state?: string | undefined }
export interface StatusSource { context: string; state: string; targetUrl?: string | undefined; creator: string }
export interface CommentSource { author: string; authorType: string; body: string }

export interface PreviewSources {
  /** `"forbidden"` when the token may not read deployments; newest first otherwise. */
  deployments: DeploymentSource[] | "forbidden";
  /** The commit's statuses, newest first, as GitHub lists them. */
  statuses: StatusSource[];
  comments: CommentSource[];
}

export type Preview =
  | { kind: "ready"; urls: string[]; source: "deployment" | "vercel-status" }
  | { kind: "pending"; reason: string }
  | { kind: "none"; reason: string };

/**
 * A preview read from the comment must be on Vercel's own domain. A collaborator can edit any
 * comment, Vercel's included, and the API still names `vercel[bot]` as its author; keeping the
 * origin to `*.vercel.app` means such an edit can at most point at another Vercel deployment.
 */
function vercelHost(url: string | undefined): string | undefined {
  return url && new URL(url).hostname.endsWith(".vercel.app") ? url : undefined;
}

function httpsUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.origin;
  } catch { return undefined; }
}

/** The projects a Vercel comment describes, from its `[vc]: #<hash>:<base64 JSON>` line. */
export function vercelCommentProjects(body: string): { inspectorUrl?: string; previewUrl?: string }[] {
  const line = body.split("\n", 1)[0] ?? "";
  const match = /^\[vc\]: #[^:]*:([A-Za-z0-9+/=]+)\s*$/.exec(line);
  if (!match) return [];
  try {
    const parsed = JSON.parse(Buffer.from(match[1]!, "base64").toString("utf8")) as { projects?: unknown };
    return Array.isArray(parsed.projects) ? parsed.projects.filter((p): p is { inspectorUrl?: string; previewUrl?: string } => typeof p === "object" && p !== null) : [];
  } catch { return []; }
}

function isVercelContext(context: string): boolean {
  return context === "Vercel" || context.startsWith("Vercel – ") || context.startsWith("Vercel - ");
}

export function resolvePreview(sources: PreviewSources): Preview {
  if (sources.deployments !== "forbidden") {
    const urls = sources.deployments
      .filter(d => d.creator === VERCEL_BOT && d.state === "success")
      .map(d => httpsUrl(d.environmentUrl))
      .filter((u): u is string => Boolean(u));
    if (urls.length) return { kind: "ready", urls: [...new Set(urls)], source: "deployment" };
  }

  // The newest status per Vercel context, and only Vercel's own.
  const latest = new Map<string, StatusSource>();
  for (const status of sources.statuses) {
    if (status.creator === VERCEL_BOT && isVercelContext(status.context) && !latest.has(status.context)) latest.set(status.context, status);
  }
  // Vercel's first status arrives seconds after a push, so none yet is the start of a build, not
  // its absence; the caller's ten-minute retry turns a commit Vercel never sees into an escalation.
  if (!latest.size) return { kind: "pending", reason: "Vercel has not set a status on this commit yet" };
  const succeeded = [...latest.values()].filter(s => s.state === "success" && s.targetUrl);
  if (!succeeded.length) {
    const states = [...latest.values()].map(s => s.state);
    return states.some(s => s === "pending")
      ? { kind: "pending", reason: "Vercel is still building this commit" }
      : { kind: "none", reason: `Vercel's build of this commit did not succeed (${states.join(", ")})` };
  }

  const projects = sources.comments
    .filter(c => c.author === VERCEL_BOT && c.authorType === "Bot")
    .flatMap(c => vercelCommentProjects(c.body));
  const urls = succeeded
    .map(status => projects.find(p => p.inspectorUrl === status.targetUrl))
    .map(project => vercelHost(httpsUrl(project?.previewUrl)))
    .filter((u): u is string => Boolean(u));
  if (urls.length) return { kind: "ready", urls: [...new Set(urls)], source: "vercel-status" };
  // The status is set before the comment is updated, so a comment still naming the previous
  // deployment usually means it is about to change.
  return { kind: "pending", reason: "Vercel's pull request comment does not yet describe this commit's deployment" };
}
