// Operator entry for the repair-only control. It parses a closed grammar and runs the leaf against
// an INJECTED store and hash; binding a real ledger store is the caller's (pinned runtime's) job.
// It imports no worker, provider, Apple, Actions or source module.
import { parseArgs } from "node:util";
import { RepairControlRefused, applyHold, applyRelease, REPAIR_SCOPE_PREFIX } from "./repair-control.js";
const USAGE = "repair-control hold|release|show --operation-id ID --intent ID --epoch E --observed-head SHA --actor HANDLE [hold: --request-transaction ID --campaign-ref REF --request-operation ID --authorization-ref REF] [release: --hold-operation ID]";
export async function runRepairControl(argv, d) {
    let parsed;
    try {
        parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: Object.fromEntries(["operation-id", "intent", "epoch", "observed-head", "actor", "request-transaction", "campaign-ref", "request-operation", "authorization-ref", "hold-operation"].map(name => [name, { type: "string" }])) });
    }
    catch (error) {
        d.out(JSON.stringify({ refused: true, reason: String(error.message), usage: USAGE }));
        return 2;
    }
    const { positionals, values } = parsed, command = positionals[0];
    if (positionals.length !== 1 || !["hold", "release", "show"].includes(command ?? "")) {
        d.out(JSON.stringify({ refused: true, usage: USAGE }));
        return 2;
    }
    if (command === "show") {
        const state = (await d.store.read()).state;
        d.out(JSON.stringify({ controls: state.pauses.filter(pause => pause.scope.startsWith(REPAIR_SCOPE_PREFIX) && (!values.intent || pause.scope === REPAIR_SCOPE_PREFIX + values.intent)) }));
        return 0;
    }
    const v = (name) => values[name] ?? "";
    try {
        const outcome = command === "hold"
            ? await applyHold(d.store, { schemaVersion: 1, operationId: v("operation-id"), intentId: v("intent"), expectedEpoch: v("epoch"), observedHead: v("observed-head"), requestTransactionId: v("request-transaction"), campaignRef: v("campaign-ref"), requestOperationId: v("request-operation"), actor: v("actor"), authorizationRef: v("authorization-ref") }, d.now(), d.hash)
            : await applyRelease(d.store, { schemaVersion: 1, operationId: v("operation-id"), holdOperationId: v("hold-operation"), intentId: v("intent"), expectedEpoch: v("epoch"), observedHead: v("observed-head"), actor: v("actor") }, d.now(), d.hash);
        d.out(JSON.stringify({ committed: outcome.exit === 0, replayed: outcome.replayed, result: outcome.result }));
        return outcome.exit;
    }
    catch (error) {
        if (error instanceof RepairControlRefused) {
            d.out(JSON.stringify({ refused: true, reason: error.message }));
            return 2;
        }
        throw error;
    }
}
//# sourceMappingURL=repair-control-entry.js.map