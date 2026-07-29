import { describe, expect, it } from "vitest";
import { canAccessHq, HqConfig, resolveEntries, Role } from "../src/access/schema.js";

const cfg = (o: Partial<HqConfig>): HqConfig =>
  HqConfig.parse({ route: "/hq", allowlist: [], investorAllowlist: [], admins: [], ...o });

describe("resolveEntries", () => {
  it("maps each list to its role", () => {
    const e = resolveEntries(cfg({
      allowlist: ["a@x.com"],
      investorAllowlist: ["i@x.com"],
      admins: ["ad@x.com"],
    }));
    expect(new Map(e.map((x) => [x.email, x.role]))).toEqual(
      new Map([["a@x.com", "employee"], ["i@x.com", "investor"], ["ad@x.com", "admin"]]),
    );
  });

  it("gives the most privileged role when someone appears twice", () => {
    // An admin is also an employee — listing both must not be an error.
    const e = resolveEntries(cfg({ allowlist: ["c@x.com"], admins: ["c@x.com"] }));
    expect(e).toHaveLength(1);
    expect(e[0]!.role).toBe("admin");
  });

  it("promotes an investor who is also an employee", () => {
    const e = resolveEntries(cfg({ allowlist: ["c@x.com"], investorAllowlist: ["c@x.com"] }));
    expect(e[0]!.role).toBe("employee");
  });

  it("lowercases emails so casing cannot create a duplicate grant", () => {
    const e = resolveEntries(cfg({ allowlist: ["Chris@X.com", "chris@x.com"] }));
    expect(e).toHaveLength(1);
    expect(e[0]!.email).toBe("chris@x.com");
  });

  it("returns nothing for an empty config", () => {
    expect(resolveEntries(cfg({}))).toHaveLength(0);
  });
});

describe("canAccessHq", () => {
  it("admits admin and employee", () => {
    expect(canAccessHq("admin")).toBe(true);
    expect(canAccessHq("employee")).toBe(true);
  });

  it("refuses investor — a strictly smaller surface", () => {
    expect(canAccessHq("investor")).toBe(false);
  });

  it("refuses an absent or unknown role", () => {
    expect(canAccessHq(undefined)).toBe(false);
    expect(canAccessHq("")).toBe(false);
    expect(canAccessHq("Employee")).toBe(false);
  });
});

describe("schema", () => {
  it("rejects a role outside the enum", () => {
    expect(Role.safeParse("owner").success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(HqConfig.safeParse({ allowlist: ["not-an-email"] }).success).toBe(false);
  });

  it("defaults the route to /hq", () => {
    expect(HqConfig.parse({}).route).toBe("/hq");
  });

  it("rejects a route that is not a path", () => {
    expect(HqConfig.safeParse({ route: "hq" }).success).toBe(false);
  });
});
