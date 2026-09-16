#!/usr/bin/env node
import { run } from "./run.js";
run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
//# sourceMappingURL=index.js.map