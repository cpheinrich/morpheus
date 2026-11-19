import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compare } from "./score.mjs";

const rubric = {
  lost: { axis: "defect" },
  gained: { axis: "defect" },
  unknown: { axis: "defect" },
  waste: { axis: "waste" },
  falseBlocker: { axis: "waste" },
};
const review = (caught = false, waste = []) => ({ outcome: "complete", caught, waste });

test("equal totals cannot hide a lost defect, additional blocker, or unknown", () => {
  assert.deepEqual(compare(rubric, {
    base: {
      lost: review(true),
      gained: review(),
      unknown: review(true),
      waste: review(false, ["redundant-change", "nit"]),
      falseBlocker: review(),
    },
    candidate: {
      lost: review(),
      gained: review(true),
      unknown: { outcome: "incomplete" },
      waste: review(),
      falseBlocker: review(false, ["false-blocker"]),
    },
  }), {
    defect: { paired: 2, base: ["lost"], candidate: ["gained"], lost: ["lost"], gained: ["gained"] },
    waste: { paired: 2, base: ["waste"], candidate: ["falseBlocker"], removed: ["waste"], added: ["falseBlocker"] },
    newFalseBlockers: ["falseBlocker"],
    unknown: ["unknown"],
  });
});

test("missing output in a waste case is not counted as clean", () => {
  assert.deepEqual(compare({ a: { axis: "waste" } }, { base: {}, candidate: { a: review() } }), {
    defect: { paired: 0, base: [], candidate: [], lost: [], gained: [] },
    waste: { paired: 0, base: [], candidate: [], removed: [], added: [] },
    newFalseBlockers: [],
    unknown: ["a"],
  });
});
