import assert from "node:assert/strict";
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
