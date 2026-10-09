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
 *    proves who wrote it, the inspector URL proves which commit it describes.
 */
export declare const VERCEL_BOT = "vercel[bot]";
export interface DeploymentSource {
    creator: string;
    environmentUrl?: string | undefined;
    state?: string | undefined;
}
export interface StatusSource {
    context: string;
    state: string;
    targetUrl?: string | undefined;
    creator: string;
}
export interface CommentSource {
    author: string;
    authorType: string;
    body: string;
}
export interface PreviewSources {
    /** `"forbidden"` when the token may not read deployments; newest first otherwise. */
    deployments: DeploymentSource[] | "forbidden";
    /** The commit's statuses, newest first, as GitHub lists them. */
    statuses: StatusSource[];
    comments: CommentSource[];
}
export type Preview = {
    kind: "ready";
    urls: string[];
    source: "deployment" | "vercel-status";
} | {
    kind: "pending";
    reason: string;
} | {
    kind: "none";
    reason: string;
};
/** The projects a Vercel comment describes, from its `[vc]: #<hash>:<base64 JSON>` line. */
export declare function vercelCommentProjects(body: string): {
    inspectorUrl?: string;
    previewUrl?: string;
}[];
export declare function resolvePreview(sources: PreviewSources): Preview;
