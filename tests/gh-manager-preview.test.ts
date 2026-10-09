import { describe, expect, it } from "vitest";
import { type CommentSource, type PreviewSources, resolvePreview, type StatusSource, vercelCommentProjects } from "../src/gh-manager/preview.js";

const INSPECTOR = "https://vercel.com/darwin-health/evo/7dM5zS3qrM7pwTFSwFD8t4WHgDJs";
const OLD_INSPECTOR = "https://vercel.com/darwin-health/evo/OLDdeployment";
const PREVIEW = "evo-git-cursor-dataset-collection-labels-f8a6-darwin-health.vercel.app";

/** Vercel's comment as it appears on Evo #378: a `[vc]:` line of base64 JSON, then a table. */
function vercelComment(projects: object[], author = "vercel[bot]", authorType = "Bot"): CommentSource {
  const json = Buffer.from(JSON.stringify({ isMonorepo: true, type: "github", projects })).toString("base64");
  return { author, authorType, body: `[vc]: #YdSR13bZfM6+3qlwVzkOzr/IAU5ZZm7UAvIqx7ypYoE=:${json}\nThe latest updates on your projects.` };
}
const vercelStatus = (state: string, targetUrl = INSPECTOR, creator = "vercel[bot]", context = "Vercel"): StatusSource => ({ context, state, targetUrl, creator });
const sources = (over: Partial<PreviewSources>): PreviewSources => ({
  deployments: "forbidden",
  statuses: [vercelStatus("success")],
  comments: [vercelComment([{ name: "evo", inspectorUrl: INSPECTOR, previewUrl: PREVIEW }])],
  ...over,
});

describe("vercelCommentProjects", () => {
  it("reads the projects from the [vc] line", () => {
    expect(vercelCommentProjects(vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: PREVIEW }]).body)).toEqual([{ inspectorUrl: INSPECTOR, previewUrl: PREVIEW }]);
  });
  it("reads nothing from a body without one, or with broken JSON", () => {
    expect(vercelCommentProjects("Visit the preview at https://evil.example")).toEqual([]);
    expect(vercelCommentProjects(`[vc]: #x:${Buffer.from("{not json").toString("base64")}`)).toEqual([]);
    // Only the first line counts: a [vc] line quoted further down is ignored.
    expect(vercelCommentProjects(`hello\n${vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: PREVIEW }]).body}`)).toEqual([]);
  });
});

describe("resolvePreview", () => {
  it("uses Vercel's comment when its inspector URL matches the commit's successful status", () => {
    expect(resolvePreview(sources({}))).toEqual({ kind: "ready", urls: [`https://${PREVIEW}`], source: "vercel-status" });
  });

  it("prefers deployment records when the token can read them", () => {
    const deployments = [{ creator: "vercel[bot]", state: "success", environmentUrl: "https://evo-abc123-darwin-health.vercel.app" }];
    expect(resolvePreview(sources({ deployments }))).toEqual({ kind: "ready", urls: ["https://evo-abc123-darwin-health.vercel.app"], source: "deployment" });
  });

  it("ignores deployments someone else created, and falls back to the status", () => {
    const deployments = [{ creator: "someone", state: "success", environmentUrl: "https://evil.example" }];
    expect(resolvePreview(sources({ deployments }))).toEqual({ kind: "ready", urls: [`https://${PREVIEW}`], source: "vercel-status" });
  });

  it("never reads a comment written by anyone but vercel[bot]", () => {
    const forged = vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: "evil.example" }], "mallory", "User");
    expect(resolvePreview(sources({ comments: [forged] }))).toEqual({ kind: "pending", reason: expect.stringContaining("does not yet describe") });
    // A user cannot hold the bot's login, but the type is checked as well.
    const userTyped = vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: "evil.example" }], "vercel[bot]", "User");
    expect(resolvePreview(sources({ comments: [userTyped] })).kind).toBe("pending");
  });

  it("ignores a status set by anyone but vercel[bot]", () => {
    expect(resolvePreview(sources({ statuses: [vercelStatus("success", INSPECTOR, "mallory")] }))).toEqual({ kind: "none", reason: expect.stringContaining("no status") });
  });

  it("waits while the comment still describes an earlier deployment", () => {
    const stale = vercelComment([{ inspectorUrl: OLD_INSPECTOR, previewUrl: PREVIEW }]);
    expect(resolvePreview(sources({ comments: [stale] })).kind).toBe("pending");
  });

  it("waits while Vercel is building, and refuses a failed build", () => {
    expect(resolvePreview(sources({ statuses: [vercelStatus("pending")] }))).toEqual({ kind: "pending", reason: "Vercel is still building this commit" });
    expect(resolvePreview(sources({ statuses: [vercelStatus("failure")] }))).toEqual({ kind: "none", reason: "Vercel's build of this commit did not succeed (failure)" });
  });

  it("reads only the newest status per context, as GitHub lists them newest first", () => {
    // A newer pending status supersedes an older success: the commit is being rebuilt.
    expect(resolvePreview(sources({ statuses: [vercelStatus("pending"), vercelStatus("success")] })).kind).toBe("pending");
  });

  it("covers each project in a monorepo by its own status", () => {
    const docsInspector = "https://vercel.com/darwin-health/docs/xyz";
    const result = resolvePreview(sources({
      statuses: [vercelStatus("success", INSPECTOR, "vercel[bot]", "Vercel – evo"), vercelStatus("success", docsInspector, "vercel[bot]", "Vercel – docs")],
      comments: [vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: PREVIEW }, { inspectorUrl: docsInspector, previewUrl: "docs-git-x.vercel.app" }])],
    }));
    expect(result).toEqual({ kind: "ready", urls: [`https://${PREVIEW}`, "https://docs-git-x.vercel.app"], source: "vercel-status" });
  });

  it("refuses a preview URL that is not plain https", () => {
    const comments = [vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: "http://evo.vercel.app" }])];
    expect(resolvePreview(sources({ comments })).kind).toBe("pending");
    const withCredentials = [vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: "https://user:pass@evo.vercel.app" }])];
    expect(resolvePreview(sources({ comments: withCredentials })).kind).toBe("pending");
  });

  it("has nothing to offer a commit Vercel never saw", () => {
    expect(resolvePreview(sources({ statuses: [] }))).toEqual({ kind: "none", reason: "Vercel has set no status on this commit, so there is no preview for it" });
  });
});
