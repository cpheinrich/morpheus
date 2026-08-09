export interface InitOptions {
    root: string;
    name?: string;
    prefix?: string;
    kind?: string;
    owner?: string;
}
/**
 * Scaffold the repository, then show what is left.
 *
 * Ends in `init status` rather than a wall of "next steps" prose: the
 * checklist is the durable version of that list, and printing a second copy
 * that cannot be ticked would be the thing this command exists to replace.
 */
export declare function init(opts: InitOptions): Promise<number>;
