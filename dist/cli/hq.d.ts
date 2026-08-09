/**
 * Write or refresh the generated role helpers in the project's deployed rules file.
 *
 * `--check` writes nothing and fails when the block is stale, which is the
 * form CI needs. Drift here is the dangerous kind: the claim writer and the
 * data gate disagreeing means a role that grants nothing, or worse, a role
 * removed from the vocabulary that a rule still honours.
 */
export declare function rules(repoRoot: string, check: boolean, rulesPath?: string): Promise<number>;
/** Print the generated block, for pasting into rules that have no markers. */
export declare function printRules(): number;
