import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startQaCommentServer } from "../serve.js";
/** Native accessibility calls run here, outside the preview supervisor. */
async function main([stateFile, mode]) {
    if (!stateFile || (mode !== "ax" && mode !== "screenshot"))
        throw new Error("usage: overlay-child <state.json> <ax|screenshot>");
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    const server = await startQaCommentServer({
        root: state.root,
        previewUrl: `http://127.0.0.1:${state.port}/`,
        port: state.overlayPort,
        axEnabled: mode === "ax",
        onListen: (info) => console.log(`QA comments overlay: ${info.url} (${mode}; stream ${info.streamUrl ?? "undiscovered"})`),
    });
    const stop = () => { void server.close().then(() => { process.exitCode = 0; }); };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
//# sourceMappingURL=overlay-child.js.map