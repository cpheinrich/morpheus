import { describe, expect, it } from "vitest";
import { timestamp } from "../../src/cd/schema.js";

describe("CD timestamps", () => {
  it("preserves minute precision without widening the timezone contract", () => {
    expect(timestamp.parse("2026-11-02T12:34Z")).toBe("2026-11-02T12:34Z");
    expect(timestamp.parse("2026-11-02T12:34:56.789Z")).toBe("2026-11-02T12:34:56.789Z");
    expect(timestamp.safeParse("2026-11-02T12:34+00:00").success).toBe(false);
    expect(timestamp.safeParse("2026-11-02T12:34").success).toBe(false);
  });
});
