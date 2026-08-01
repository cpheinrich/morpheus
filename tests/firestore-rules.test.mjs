/**
 * Behavioural tests for the rules `morpheus hq rules` generates.
 *
 * The unit tests in `hq.test.ts` prove the generated text agrees with the role
 * vocabulary. That is not the same as proving Firestore *enforces* what the
 * vocabulary says, and the gap between those two is where a security boundary
 * quietly fails: rules that parse, read correctly, and grant the wrong thing.
 *
 * An earlier attempt to validate these with `firebase emulators:exec` was
 * worthless — the emulator starts and the script exits 0 even with rules that
 * cannot compile. A check that passes when handed something broken reports an
 * empty result as correct; see `.agent/learned.md`.
 *
 * Run with `pnpm test:rules`. Kept out of the vitest run because it needs Java
 * and the Firestore emulator, and a default `pnpm test` that requires a JDK is
 * a default that gets skipped.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { renderFirestoreRules } from "../dist/hq/rules.js";

let testEnv;

/** A signed-in user carrying `role`, or carrying no role at all when null. */
const as = (uid, role) => testEnv.authenticatedContext(uid, role ? { role } : {}).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

before(async () => {
  const rules = renderFirestoreRules();

  // Guard against testing a stale build: an empty or marker-less string would
  // still load, and every assertFails below would pass for the wrong reason.
  assert.match(rules, /rules_version = '2'/);
  assert.match(rules, /function canAccessHq\(\)/);

  testEnv = await initializeTestEnvironment({
    projectId: "morpheus-rules-test",
    firestore: { rules, host: "127.0.0.1", port: 8080 },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe("hq collection", () => {
  it("lets an employee read", async () => {
    await assertSucceeds(getDoc(doc(as("u1", "employee"), "hq/finance")));
  });

  it("lets an admin read and write", async () => {
    await assertSucceeds(getDoc(doc(as("u1", "admin"), "hq/finance")));
    await assertSucceeds(setDoc(doc(as("u1", "admin"), "hq/finance"), { mrr: 0 }));
  });

  it("stops an employee writing", async () => {
    // An employee-role agent may report on the books but not rewrite them.
    await assertFails(setDoc(doc(as("u1", "employee"), "hq/finance"), { mrr: 999 }));
  });

  it("stops an investor reading hq", async () => {
    await assertFails(getDoc(doc(as("u1", "investor"), "hq/finance")));
  });

  it("stops a signed-in user with no role", async () => {
    // The exact case a stale session or a revoked claim lands in.
    await assertFails(getDoc(doc(as("u1", null), "hq/finance")));
  });

  it("stops an anonymous request", async () => {
    await assertFails(getDoc(doc(anon(), "hq/finance")));
  });

  it("ignores a role claim outside the vocabulary", async () => {
    await assertFails(getDoc(doc(as("u1", "superuser"), "hq/finance")));
  });
});

describe("investor collection", () => {
  it("lets an investor read", async () => {
    await assertSucceeds(getDoc(doc(as("u1", "investor"), "investor/update-2026-q3")));
  });

  it("lets the team read", async () => {
    await assertSucceeds(getDoc(doc(as("u1", "employee"), "investor/update-2026-q3")));
    await assertSucceeds(getDoc(doc(as("u1", "admin"), "investor/update-2026-q3")));
  });

  it("stops an investor writing", async () => {
    await assertFails(setDoc(doc(as("u1", "investor"), "investor/update-2026-q3"), { arr: 1 }));
  });

  it("stops an anonymous request", async () => {
    await assertFails(getDoc(doc(anon(), "investor/update-2026-q3")));
  });
});

describe("everything else", () => {
  it("is closed even to an admin", async () => {
    // The catch-all denies by default, so a collection nobody wrote a rule for
    // is closed rather than inheriting whatever the last match allowed.
    await assertFails(getDoc(doc(as("u1", "admin"), "orders/1")));
    await assertFails(setDoc(doc(as("u1", "admin"), "orders/1"), { total: 1 }));
  });
});
