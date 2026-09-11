import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("CLI argument compatibility", () => {
  it.each([["--project", "project"], ["--bucket", "bucket"], ["--object-prefix", "objectPrefix"], ["--catalog-dir", "catalogDir"], ["--local-root", "localRoot"], ["--gcloud", "gcloud"], ["--domain", "domain"], ["--support-email", "supportEmail"], ["--brand", "brand"], ["--staging-project", "stagingProject"], ["--account", "account"], ["--organization", "organization"], ["--vercel-team", "vercelTeam"], ["--name", "name"], ["--prefix", "prefix"], ["--kind", "kind"], ["--source", "source"], ["--css", "css"], ["--ts", "ts"], ["--owner", "owner"], ["--handle", "handle"], ["--priority", "priority"], ["--goal", "goal"], ["--slug", "slug"], ["--needs", "needs"], ["--context", "context"], ["--notes", "notes"], ["--prior-review", "priorReview"], ["--before-comment-id", "beforeCommentId"], ["--comment-id", "commentId"], ["--body-file", "bodyFile"], ["--pr-body-file", "prBodyFile"], ["--selection", "selection"], ["--title", "title"], ["--edition", "edition"], ["--publisher", "publisher"], ["--year", "year"], ["--language", "language"], ["--rules-path", "rulesPath"], ["--out", "out"]])("consumes %s, including missing/repeated values", (option, key) => {
    expect(parseArgs(["pm", option, "value", "tail"])).toMatchObject({ [key]: "value", positional: ["pm", "tail"] });
    expect(parseArgs([option, "first", option, "last"])).toMatchObject({ [key]: "last" });
    expect(parseArgs([option])[key as keyof ReturnType<typeof parseArgs>]).toBeUndefined();
    expect(parseArgs([option, "--check"])).toMatchObject({ [key]: "--check", check: false });
  });
  it.each([["--check", "check", true], ["--all", "all", true], ["--offline", "offline", true], ["--print", "print", true], ["--dry-run", "dryRun", true], ["--no-browser", "openBrowser", false], ["--no-provision", "provision", false], ["--no-waitlist", "waitlist", false], ["--no-hq", "hq", false], ["--json", "json", true], ["--full", "full", true], ["--dispatch", "dispatch", true]])("preserves %s", (option, key, value) => {
    expect(parseArgs([String(option), "tail"])).toMatchObject({ [String(key)]: value, positional: ["tail"] });
  });
  it("preserves defaults and special-value consumption", () => {
    expect(parseArgs([])).toEqual({ dir: "hq/product", base: "origin/main", check: false, dryRun: false,
      all: false, offline: false, full: false, json: false, dispatch: false, print: false,
      openBrowser: true, provision: true, waitlist: true, hq: true, positional: [], authors: [], isbns: [] });
    expect(parseArgs(["--dir"])).toMatchObject({ dir: "hq/product" });
    expect(parseArgs(["--base", "topic", "--base"])).toMatchObject({ base: "topic" });
    expect(parseArgs(["--issue"])).toMatchObject({ issue: "" });
    expect(parseArgs(["--author", "A", "--author", "B", "--isbn", "1", "--isbn", "2"])).toMatchObject({ authors: ["A", "B"], isbns: ["1", "2"] });
    expect(parseArgs(["--isbn", "", "tail"])).toMatchObject({ isbns: [], positional: ["", "tail"] });
    expect(parseArgs(["--author", "", "tail"])).toMatchObject({ authors: [], positional: ["tail"] });
    expect(parseArgs(["--ceiling", "3", "--ceiling", "0"])).toMatchObject({ ceiling: 3 });
    for (const value of ["0", "-1", "1.5", "no", "Infinity"]) expect(parseArgs(["--ceiling", value]).ceiling).toBeUndefined();
    expect(parseArgs(["--unknown", "--", "constructor", "__proto__"])).toMatchObject({ positional: ["--unknown", "--", "constructor", "__proto__"] });
  });
});
