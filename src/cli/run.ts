import { credentials } from "../credentials/index.js";
import { HELP } from "./help.js";
import { parseArgs } from "./args.js";
import { dispatch } from "./dispatch.js";
import { cd } from "../cd/cli.js";
import { runMeetingIntake } from "../meeting-intake/cli.js";

/** Importable invocation seam; only the executable owns process exit. */
export async function run(argv: string[]): Promise<number> {
  if (argv[0] !== "cd" && argv.some(argument => ["--authority", "--authority-digest"].some(flag => argument === flag || argument.startsWith(`${flag}=`)))) {
    throw new Error("Reviewed source authority is only valid for cd budget reserve");
  }
  // Preserve all child arguments, including --help and flags owned by the child.
  if (argv[0] === "credentials") return credentials(argv.slice(1));
  if (argv[0] === "cd") return cd(argv.slice(1));
  if (argv[0] === "meeting-intake") return runMeetingIntake(argv.slice(1));
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  return dispatch(parseArgs(argv));
}
