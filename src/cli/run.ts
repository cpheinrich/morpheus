import { HELP } from "./help.js";
import { parseArgs } from "./args.js";
import { dispatch } from "./dispatch.js";

/** Importable invocation seam; only the executable owns process exit. */
export async function run(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  return dispatch(parseArgs(argv));
}
