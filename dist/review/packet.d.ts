/**
 * What a fresh reviewer needs that the contract and the diff range do not say:
 * where the repository is, and how to run its tests.
 *
 * The first packet ever handed to an isolated reviewer omitted both, so the
 * reviewer either had to ask the author — defeating the isolation — or rebuild
 * an environment and spend its whole budget on setup (#241). `morpheus.json`
 * knows the project's shape; the commands are derived from the files that
 * actually define them rather than guessed.
 */
export declare function projectCommands(root: string): Promise<string[]>;
/**
 * The author knows which decisions, runbooks and earlier worklogs govern a change; the reviewer
 * starts cold. This line asks the author to name them before handing the packet over.
 */
export declare const AUTHOR_CONTEXT_SLOT = "AUTHOR: before spawning the reviewer, replace this line with the decisions, runbooks, worklogs or meeting notes that govern this change, or write \"none beyond the ticket\".";
export interface PacketTicket {
    id?: string;
    title?: string;
    intent?: string;
    acceptance?: string;
    missingAcceptance?: string;
}
/**
 * The lines after the contract. Ticket and acceptance are described rather
 * than reported as `none`: an unclaimed two-file fix is a legitimate thing to
 * review, and a packet that prints `none` reads as something missing and
 * invites the author to create an item just to fill the line.
 */
export declare function reviewPacket(opts: {
    root: string;
    fork: string;
    head: string;
    ticket: PacketTicket;
    commands: string[];
    /** `morpheus complexity check` on the range, or why it did not run; never just the command. */
    complexity?: string;
    /** Records the reviewer reads while orienting; the ticket's own files come first. */
    suggested?: string[];
}): string;
