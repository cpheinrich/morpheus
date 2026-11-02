#!/usr/bin/env node
const argv = process.argv.slice(2);
// The read hook runs after every Read and shell call in every session, so it
// must not load the whole CLI: it imports only the session evidence modules.
const main = argv[0] === "context" && argv[1] === "record-read"
    ? import("../session/read-hook.js").then((m) => m.runReadHook())
    : import("./run.js").then((m) => m.run(argv));
function ownsQuotaReader() {
    if (argv[0] !== "cd")
        return false;
    // CD accepts options before its command. Mirror its boolean options here;
    // every other long option consumes a value unless written with "=".
    const booleans = ["--validation", "--observe", "--help", "--json", "--revoke", "--probe"];
    for (let i = 1; i < argv.length; i++) {
        const argument = argv[i];
        if (argument === "--")
            return argv[i + 1] === "quota" || argv[i + 1] === "worker";
        if (argument === "-h")
            continue;
        if (argument.startsWith("--")) {
            if (!argument.includes("=") && !booleans.includes(argument))
                i++;
            continue;
        }
        return argument === "quota" || argument === "worker";
    }
    return false;
}
function finish(code) {
    // Quota failure returns immediately; its owned reader still drains and cleans up.
    if (ownsQuotaReader())
        process.exitCode = code;
    else
        process.exit(code);
}
main
    .then(finish)
    .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    finish(1);
});
export {};
//# sourceMappingURL=index.js.map