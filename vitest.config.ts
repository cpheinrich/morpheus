import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `tests/firestore-rules.test.mjs` is a `node:test` suite, not a vitest one:
    // it needs the Firestore emulator and a JDK, so it runs under
    // `pnpm test:rules` instead. Vitest would otherwise collect it, find no
    // vitest suite, and fail the default run on a file that is working fine.
    include: ["tests/**/*.test.ts"],
  },
});
