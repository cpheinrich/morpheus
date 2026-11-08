import assert from "node:assert/strict";
import { test } from "node:test";
import { macCapacity } from "../src/fleet-capacity.mjs";

const sample = (free, inactive) => `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:          ${free}.
Pages active:        1750961.
Pages inactive:      ${inactive}.
Pages speculative:   1305.
Pages wired down:    293122.
Pages purgeable:     143555.
`;

test("Studio counts reclaimable pages and leaves its four GiB reserve", () => {
  assert.equal(macCapacity(sample(173762, 1759405)), 26109);
  assert.equal(macCapacity(sample(262143, 0)), 0);
  assert.equal(macCapacity(sample(262144, 0)), 0);
  assert.equal(macCapacity(sample(262208, 0)), 1);
});

test("incomplete samples fall back to immediately free memory", () => {
  assert.equal(macCapacity(sample(173762, 1759405).replace("Pages inactive:", "Unrecognized:")), null);
});
