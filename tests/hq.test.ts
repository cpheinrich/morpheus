import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role as RoleSchema } from "../src/access/schema.js";
import { rules } from "../src/cli/hq.js";
import { canAccessHq, HQ_ROLES, isAdmin, isRole, ROLES } from "../src/hq/roles.js";
import { decideFromClaims, decideHqAccess } from "../src/hq/gate.js";
import { resetCertificateCache, toClaims } from "../src/hq/session-cookie.js";
import {
  BEGIN,
  END,
  renderFirestoreRules,
  renderRoleHelpers,
  updateRoleHelpers,
} from "../src/hq/rules.js";

describe("the one fact", () => {
  // The whole point of MO-004. If these drift, `morpheus access sync` writes a
  // claim that one of the two gates does not recognise — which fails open or
  // closed depending on which side moved, and neither is visible at the time.
  it("the claim writer's enum is exactly the role vocabulary", () => {
    expect(RoleSchema.options).toEqual([...ROLES]);
  });

  it("the generated Firestore helpers cover every role in the vocabulary", () => {
    const block = renderRoleHelpers();
    for (const role of ROLES) {
      expect(block).toContain(`role() == '${role}'`);
    }
  });

  it("the Firestore /hq test admits exactly the roles canAccessHq admits", () => {
    const block = renderRoleHelpers();
    const hqFn = /function canAccessHq\(\) \{\s*return ([^;]+);/.exec(block)?.[1] ?? "";
    const admitted = [...hqFn.matchAll(/role\(\) == '(\w+)'/g)].map((m) => m[1]!);

    expect(admitted).toEqual([...HQ_ROLES]);
    for (const role of ROLES) {
      expect(admitted.includes(role)).toBe(canAccessHq(role));
    }
  });
});

describe("roles", () => {
  it("admits admin and employee to /hq, and not investor", () => {
    expect(canAccessHq("admin")).toBe(true);
    expect(canAccessHq("employee")).toBe(true);
    expect(canAccessHq("investor")).toBe(false);
  });

  it("refuses an absent, empty or mis-cased role", () => {
    expect(canAccessHq(null)).toBe(false);
    expect(canAccessHq(undefined)).toBe(false);
    expect(canAccessHq("")).toBe(false);
    expect(canAccessHq("Employee")).toBe(false);
  });

  it("isAdmin is exact — an employee is not an admin", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("employee")).toBe(false);
  });

  it("isRole rejects anything outside the vocabulary", () => {
    expect(isRole("owner")).toBe(false);
    expect(isRole(42)).toBe(false);
    expect(ROLES.every(isRole)).toBe(true);
  });
});

describe("toClaims", () => {
  it("maps a well-formed payload", () => {
    expect(toClaims({ sub: "u1", email: "c@x.com", role: "admin", iat: 100, exp: 200 })).toEqual({
      uid: "u1",
      email: "c@x.com",
      role: "admin",
      // Carried, not projected away: `renewalDue` reads the window off the
      // claims, and dropping it here left the kit's own renewal predicate with
      // no reachable source of input.
      iat: 100,
      exp: 200,
    });
  });

  it("reports an absent window as null rather than omitting it", () => {
    expect(toClaims({ sub: "u1", email: "c@x.com", role: "admin" })).toMatchObject({
      iat: null,
      exp: null,
    });
  });

  it("returns null without a subject — there is no user to speak of", () => {
    expect(toClaims({ email: "c@x.com", role: "admin" })).toBeNull();
  });

  it("maps an unrecognised role to null rather than passing the string through", () => {
    // Fails closed at the boundary, so no unknown role travels into the app.
    expect(toClaims({ sub: "u1", role: "owner" })?.role).toBeNull();
  });

  it("tolerates a missing email", () => {
    expect(toClaims({ sub: "u1", role: "employee" })?.email).toBeNull();
  });
});

describe("decideFromClaims", () => {
  const claims = (role: string | null) => ({
    uid: "u1",
    email: "c@x.com",
    role: role as never,
    // The verified window travels with the claims so `renewalDue` can read
    // it off a decision — see tests/hq-session.test.ts.
    iat: 1_000_000,
    exp: 1_000_000 + 5 * 24 * 60 * 60,
  });

  it("allows an employee", () => {
    expect(decideFromClaims(claims("employee")).kind).toBe("allow");
  });

  it("sends an unauthenticated visitor to sign in", () => {
    expect(decideFromClaims(null)).toEqual({ kind: "sign-in", path: "/sign-in" });
  });

  it("sends a signed-in investor to no-access, not to sign-in", () => {
    // Redirecting them to sign-in would loop: they are already signed in.
    const d = decideFromClaims(claims("investor"));
    expect(d.kind).toBe("no-access");
    expect(d.kind === "no-access" && d.path).toBe("/hq/no-access");
  });

  it("treats a signed-in user with no role as no-access", () => {
    expect(decideFromClaims(claims(null)).kind).toBe("no-access");
  });

  it("honours custom paths", () => {
    const d = decideFromClaims(claims(null), { noAccessPath: "/denied" });
    expect(d.kind === "no-access" && d.path).toBe("/denied");
  });
});

describe("decideHqAccess", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCertificateCache();
  });

  it("treats a missing cookie as signed out without reaching the network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    return decideHqAccess({ cookie: undefined, projectId: "p" }).then((d) => {
      expect(d.kind).toBe("sign-in");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("treats a certificate fetch failure as signed out rather than throwing", async () => {
    // A gate that throws on hostile input is a gate that 500s under attack.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const d = await decideHqAccess({ cookie: "not.a.jwt", projectId: "p" });
    expect(d.kind).toBe("sign-in");
  });
});

describe("firestore rules", () => {
  it("renders a starter file containing the generated block", () => {
    const file = renderFirestoreRules();
    expect(file).toContain(BEGIN);
    expect(file).toContain(END);
    expect(file).toContain("rules_version = '2'");
    // Everything not named is closed — the default that makes adding a
    // collection deliberate.
    expect(file).toContain("allow read, write: if false;");
  });

  it("refreshes the block in place and is idempotent", () => {
    const file = renderFirestoreRules();
    const first = updateRoleHelpers(file);
    expect(first?.changed).toBe(false);

    const stale = file.replace("role() == 'admin';", "role() == 'owner';");
    const fixed = updateRoleHelpers(stale);
    expect(fixed?.changed).toBe(true);
    expect(fixed!.content).toBe(file);

    // Running again must be a no-op, not a second copy.
    expect(updateRoleHelpers(fixed!.content)?.changed).toBe(false);
  });

  it("does not accumulate indentation across runs", () => {
    let content = renderFirestoreRules();
    for (let i = 0; i < 3; i++) content = updateRoleHelpers(content)!.content;
    expect(content).toBe(renderFirestoreRules());
  });

  it("preserves match blocks the project added outside the markers", () => {
    const file = renderFirestoreRules().replace(
      "  }\n}\n",
      "    match /orders/{id} { allow read: if isAdmin(); }\n  }\n}\n",
    );
    const updated = updateRoleHelpers(file);
    expect(updated!.content).toContain("match /orders/{id}");
  });

  it("returns null for rules with no markers rather than guessing a position", () => {
    expect(updateRoleHelpers("rules_version = '2';\nservice cloud.firestore {}\n")).toBeNull();
  });

  it("returns null when the markers are inverted", () => {
    expect(updateRoleHelpers(`${END}\n${BEGIN}\n`)).toBeNull();
  });
});

describe("hq rules command", () => {
  let root: string;
  const rulesPath = "infra/firebase/firestore.rules";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-hq-rules-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("checks the configured rules path in each file state", async () => {
    const path = join(root, rulesPath);
    expect(await rules(root, true, rulesPath)).toBe(1);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "rules_version = '2';\nservice cloud.firestore {}\n", "utf8");
    expect(await rules(root, true, rulesPath)).toBe(1);

    await writeFile(path, renderFirestoreRules(), "utf8");
    expect(await rules(root, true, rulesPath)).toBe(0);

    const current = renderFirestoreRules();
    const stale = current.replace("role() == 'admin';", "role() == 'owner';");
    await writeFile(path, stale, "utf8");
    expect(await rules(root, true, rulesPath)).toBe(1);
    expect(await readFile(path, "utf8")).toBe(stale);
    expect(await rules(root, false, rulesPath)).toBe(0);
    expect(await readFile(path, "utf8")).toBe(current);
  });

  it("refuses to invent parent directories for a mistyped path", async () => {
    expect(await rules(root, false, rulesPath)).toBe(1);
    await expect(readFile(join(root, rulesPath), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires a non-empty path instead of falling back to the repository root", async () => {
    expect(await rules(root, true)).toBe(1);
    expect(await rules(root, true, "")).toBe(1);
    await expect(readFile(join(root, "firestore.rules"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
