import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(resolvePreview(sources({ statuses: [vercelStatus("success", INSPECTOR, "mallory")] }))).toEqual({ kind: "pending", reason: "Vercel has not set a status on this commit yet" });
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

  it("waits for Vercel's first status, which arrives seconds after a push", () => {
    expect(resolvePreview(sources({ statuses: [] }))).toEqual({ kind: "pending", reason: "Vercel has not set a status on this commit yet" });
  });

  it("takes only a *.vercel.app preview from the comment, which a collaborator can edit", () => {
    const edited = [vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: "https://evil.example" }])];
    expect(resolvePreview(sources({ comments: edited })).kind).toBe("pending");
    const lookalike = [vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: "https://evo.vercel.app.evil.example" }])];
    expect(resolvePreview(sources({ comments: lookalike })).kind).toBe("pending");
  });
});

describe("fetchPreviewSources and the preview-url command", () => {
  const SHA = "5a4b40d442124e6f27ce59f403169f85e96266c5";
  afterEach(() => { vi.doUnmock("node:child_process"); vi.resetModules(); });

  /** Stub `gh`: each call is matched by its endpoint; an Error with stderr stands for a refusal. */
  async function load(route: (path: string) => unknown) {
    vi.resetModules();
    vi.doMock("node:child_process", async orig => ({
      ...(await orig<typeof import("node:child_process")>()),
      execFileSync: (_cmd: string, args: string[]) => {
        const path = args.find(a => a.startsWith("repos/"))!;
        const result = route(path);
        if (result instanceof Error) throw result;
        // --slurp wraps pages in an outer array.
        return JSON.stringify(args.includes("--slurp") ? [result] : result);
      },
    }));
    return { github: await import("../src/gh-manager/github.js"), cli: await import("../src/cli/gh-manager.js") };
  }
  const refused = (message: string) => Object.assign(new Error("gh failed"), { stderr: message });
  const live = (deployments: unknown, statuses: unknown[]) => (path: string) =>
    path.includes("/deployments") ? deployments
      : path.includes("/statuses") ? statuses
      : [{ body: vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: PREVIEW }]).body, user: { login: "vercel[bot]", type: "Bot" } }, { body: null, user: null }];

  it("records a token without Deployments access as forbidden, and maps null fields", async () => {
    const { github } = await load(live(refused("gh: Resource not accessible by integration (HTTP 403)"), [{ context: "Vercel", state: "success", target_url: INSPECTOR, creator: { login: "vercel[bot]" } }, { context: "ci", state: "success", target_url: null, creator: null }]));
    expect(github.fetchPreviewSources("darwin-health/evo", 378, SHA)).toEqual({
      deployments: "forbidden",
      statuses: [{ context: "Vercel", state: "success", targetUrl: INSPECTOR, creator: "vercel[bot]" }, { context: "ci", state: "success", targetUrl: undefined, creator: "" }],
      comments: [{ author: "vercel[bot]", authorType: "Bot", body: vercelComment([{ inspectorUrl: INSPECTOR, previewUrl: PREVIEW }]).body }, { author: "", authorType: "", body: "" }],
    });
  });

  it("does not swallow any other failure", async () => {
    const { github } = await load(live(refused("gh: Server Error (HTTP 502)"), []));
    expect(() => github.fetchPreviewSources("darwin-health/evo", 378, SHA)).toThrow();
  });

  it("exits 0 with the URL, 2 while pending and 1 with nothing to capture", async () => {
    const forbidden = refused("HTTP 403");
    const status = (state: string) => [{ context: "Vercel", state, target_url: INSPECTOR, creator: { login: "vercel[bot]" } }];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await load(live(forbidden, status("success")))).cli.ghManagerPreviewUrl("darwin-health/evo", "378", SHA)).toBe(0);
    expect(log).toHaveBeenCalledWith(`https://${PREVIEW}`);
    expect((await load(live(forbidden, status("pending")))).cli.ghManagerPreviewUrl("darwin-health/evo", "378", SHA)).toBe(2);
    expect((await load(live(forbidden, status("failure")))).cli.ghManagerPreviewUrl("darwin-health/evo", "378", SHA)).toBe(1);
    const { cli } = await load(live(forbidden, []));
    expect(() => cli.ghManagerPreviewUrl("darwin-health/evo", "0", SHA)).toThrow("is not a pull request number");
    expect(() => cli.ghManagerPreviewUrl("darwin-health/evo", "378", "5a4b40d")).toThrow("is not a full commit SHA");
    log.mockRestore(); err.mockRestore();
  });
});
