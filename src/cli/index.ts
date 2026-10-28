#!/usr/bin/env node
const argv = process.argv.slice(2);

// The read hook runs after every Read and shell call in every session, so it
// must not load the whole CLI: it imports only the session evidence modules.
const main: Promise<number> =
  argv[0] === "context" && argv[1] === "record-read"
    ? import("../session/read-hook.js").then((m) => m.runReadHook())
    : import("./run.js").then((m) => m.run(argv));

main
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
