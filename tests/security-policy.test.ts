import { describe, expect, it } from "vitest";
import {
  hasSecurityMarker,
  isSecurityDependencyOnly,
} from "../src/security/policy.js";

describe("security remediation policy", () => {
  it("requires the exact marker and dependency-only paths", () => {
    expect(hasSecurityMarker("<!-- morpheus-security-update -->")).toBe(true);
    expect(isSecurityDependencyOnly(["apps/web/package.json", "apps/web/package-lock.json"])).toBe(true);
    expect(isSecurityDependencyOnly(["pnpm-workspace.yaml", "pnpm-lock.yaml"])).toBe(true);
    expect(isSecurityDependencyOnly(["apps/web/package-lock.json", ".github/workflows/ci.yml"])).toBe(false);
  });
});
