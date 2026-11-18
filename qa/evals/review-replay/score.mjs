import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function compare(rubric, { base, candidate }) {
  const defect = { paired: 0, base: [], candidate: [], lost: [], gained: [] };
  const waste = { paired: 0, base: [], candidate: [], removed: [], added: [] };
  const newFalseBlockers = [];
  const unknown = [];

  for (const [id, { axis }] of Object.entries(rubric)) {
    const before = base[id];
    const after = candidate[id];
    if (before?.outcome !== "complete" || after?.outcome !== "complete") {
      unknown.push(id);
      continue;
    }
    if (after.waste.includes("false-blocker") && !before.waste.includes("false-blocker")) {
      newFalseBlockers.push(id);
    }
    if (axis === "defect") {
      record(defect, id, before.caught, after.caught, defect.lost, defect.gained);
    } else {
      assert.equal(axis, "waste", id);
      record(waste, id, before.waste.length > 0, after.waste.length > 0, waste.removed, waste.added);
    }
  }
  return { defect, waste, newFalseBlockers, unknown };
}

function record(metric, id, before, after, beforeOnly, afterOnly) {
  metric.paired++;
  if (before) metric.base.push(id);
  if (after) metric.candidate.push(id);
  if (before && !after) beforeOnly.push(id);
  if (after && !before) afterOnly.push(id);
}

function lockedJson(file, sha256) {
  const bytes = readFileSync(new URL(file, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256, file);
  return JSON.parse(bytes);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", import.meta.url)));
  const packets = lockedJson("packets.json", manifest.packetsSha256);
  const rubric = lockedJson("rubric.json", manifest.rubricSha256);
  assert.deepEqual(Object.keys(packets), Object.keys(rubric));
  const results = JSON.parse(readFileSync(process.argv[2]));
  console.log(JSON.stringify(results.map(attempt => compare(rubric, attempt)), null, 2));
}
