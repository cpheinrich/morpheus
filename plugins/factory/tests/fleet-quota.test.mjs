import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createFleetQuota } from "../src/fleet-quota.mjs";

test("Studio admits only the enrolled gateway below its threshold using the scoped credential", async () => {
  const gateway = { name: "fixture", baseUrl: "https://gateway.example.invalid" };
  const selection = { provider: "codex", gateway: gateway.name };
  let usedPercent = null;
  let reads = 0;
  const check = createFleetQuota({ ...gateway, threshold: 90, keyRef: "env:PILOT_QUOTA_KEY" }, {
    async resolve(ref) {
      assert.equal(ref, "env:PILOT_QUOTA_KEY");
      return "fixture-key";
    },
    async read(gateways, options) {
      assert.deepEqual(gateways, [{ ...gateway, provider: "codex" }]);
      assert.deepEqual(options, { adminKey: "fixture-key" });
      reads++;
      return [{ usedPercent }];
    },
  });
  await assert.rejects(check({ ...selection, gateway: "other" }), /not enrolled/);
  assert.equal(reads, 0);
  await assert.rejects(check(selection), /unknown/);
  usedPercent = 90;
  await assert.rejects(check(selection), /threshold/);
  usedPercent = 89.99;
  assert.equal(await check(selection), undefined);
  assert.equal(reads, 3);
});

test("the heartbeat quota observation is sanitized, bounded, and cannot admit a launch", async () => {
  let tick = 0;
  let usage = 20;
  let reads = 0;
  const selection = { provider: "codex", gateway: "fixture" };
  const check = createFleetQuota({
    name: "fixture", baseUrl: "https://gateway.example.invalid", threshold: 90, keyRef: "env:PILOT_QUOTA_KEY",
  }, {
    resolve: async () => "do-not-publish",
    read: async () => { reads++; return [{ usedPercent: usage, private: "not a receipt field" }]; },
    now: () => tick,
  });
  assert.equal(check.observation(), undefined);
  assert.equal(check.observation(), undefined);
  await setImmediate();
  assert.deepEqual(check.observation(), { ...selection, status: "available", checkedAt: 0 });
  tick = 59_999;
  assert.equal(check.observation().checkedAt, 0);
  assert.equal(reads, 1);
  tick = 60_000;
  usage = 90;
  assert.equal(check.observation().checkedAt, 0);
  await setImmediate();
  assert.deepEqual(check.observation(), { ...selection, status: "limited", checkedAt: 60_000 });
  assert.equal(reads, 2);
  usage = -1;
  await assert.rejects(check(selection), /unknown/);
  assert.equal(check.observation().status, "unknown");
  assert.equal(reads, 3);
});
