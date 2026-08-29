export declare const MORPHEUS_BOOTSTRAP = ".morpheus/bootstrap.sh";
export declare const MORPHEUS_SESSION_START = ".morpheus/session-start.sh";
export declare const MORPHEUS_BOOTSTRAP_README = ".morpheus/README.md";
export declare const BOOTSTRAP_MARKER = "# morpheus:bootstrap:v1";
export declare const SESSION_START_MARKER = "# morpheus:session-start:v1";
/**
 * Bootstrap from committed current-main code rather than the installed CLI.
 *
 * The installed binary is precisely the thing this script cannot trust: a
 * device may predate the entire `self` command. The committed CLI in the
 * disposable clone performs the reviewed install, registry update and hook
 * installation after consent.
 */
export declare const bootstrapScript: () => string;
/**
 * Session hooks may execute this without consent because it only inspects the
 * CLI. Installation remains a separate command the agent runs after a yes.
 */
export declare const sessionStartScript: () => string;
export declare const bootstrapReadme: () => string;
