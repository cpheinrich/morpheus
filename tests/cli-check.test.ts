import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prCommitMessages } from "../src/cli/check.js";

describe("PR commit message extraction", () => {
  it("reads branch commits but excludes later trunk commits", () => {
    const root = mkdtempSync(join(tmpdir(), "morpheus-pr-commits-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q", "--initial-branch=main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    writeFileSync(join(root, "file.txt"), "base\n");
    git("add", "."); git("commit", "-qm", "base");
    git("checkout", "-qb", "repair");
    writeFileSync(join(root, "file.txt"), "repair\n");
    git("commit", "-qam", "Fixes: #493");
    const head = git("rev-parse", "HEAD");
    git("checkout", "-q", "main");
    writeFileSync(join(root, "other.txt"), "main\n");
    git("add", "."); git("commit", "-qm", "Closes #999");

    expect(prCommitMessages("main", head, root)).toEqual(["Fixes: #493"]);
    expect(prCommitMessages("missing-ref", head, root)).toBeNull();
  });
});
