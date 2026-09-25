import { describe, expect, it } from "vitest";
// @ts-expect-error operational JavaScript intentionally runs without a project install
import { combineFindings } from "../scripts/security-remediation.mjs";

const osv = {
  ecosystem: "npm", dependency: "uuid", version: "9.0.1", advisory: "GHSA-one",
  aliases: ["CVE-one", "GHSA-one"], fixedVersion: "11.1.1", sourcePath: "package-lock.json",
  malicious: false, withdrawn: false,
};

describe("security remediation inputs", () => {
  it("deduplicates GitHub alerts against OSV aliases", () => {
    const combined = combineFindings([structuredClone(osv)], [{
      ...structuredClone(osv), advisory: "GHSA-one", aliases: ["CVE-one", "GHSA-one"],
    }]);
    expect(combined).toHaveLength(1);
  });

  it("keeps an independent GitHub-reviewed advisory OSV did not return", () => {
    const combined = combineFindings([structuredClone(osv)], [{
      ...structuredClone(osv), dependency: "other", advisory: "GHSA-two", aliases: ["GHSA-two"],
    }]);
    expect(combined.map((finding: { dependency: string }) => finding.dependency).sort()).toEqual(["other", "uuid"]);
  });
});
