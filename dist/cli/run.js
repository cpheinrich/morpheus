import { credentials } from "../credentials/index.js";
import { HELP } from "./help.js";
import { parseArgs } from "./args.js";
import { dispatch } from "./dispatch.js";
/** Importable invocation seam; only the executable owns process exit. */
export async function run(argv) {
    // Preserve all child arguments, including --help and flags owned by the child.
    if (argv[0] === "credentials")
        return credentials(argv.slice(1));
    if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
        console.log(HELP);
        return 0;
    }
    return dispatch(parseArgs(argv));
}
//# sourceMappingURL=run.js.map