import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `tests/firestore-rules.test.mjs` is a `node:test` suite, not a vitest one:
    // it needs the Firestore emulator and a JDK, so it runs under
    // `pnpm test:rules` instead. Vitest would otherwise collect it, find no
    // vitest suite, and fail the default run on a file that is working fine.
    include: ["tests/**/*.test.{ts,tsx}"],

    // The session-freshness suites stand up real git repositories — `init`,
    // commits, bare remotes, `ls-remote`, `fetch` — and vitest runs files in
    // parallel, so a dozen `git` processes can be in flight at once. Every one
    // of these tests passes in well under a second alone; the 5s default is
    // contention, not slowness, and it fails a *different* four tests each
    // run, including ones nothing on this branch touched.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
