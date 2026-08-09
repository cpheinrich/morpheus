/**
 * `morpheus team validate` — the roster and the meeting notes.
 *
 * Separate from `pm validate` because they answer different questions and a
 * project can legitimately have one and not the other: Morpheus has a board and
 * no roster, and a services company might have the reverse.
 */
export declare function validate(root: string): Promise<number>;
