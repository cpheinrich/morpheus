# CD V2 design probes

Run `node --test qa/prototypes/cd-v2/protocol.test.mjs` from the repository root.
These dependency-free probes use real local Git for concurrency and executable
models for delivery invariants. They do not exercise production CD adapters.
See [the design validation report](../../../docs/cd-pipeline-v2-validation.md)
for actual live GitHub results, counterexamples and limits. Do not count these
tests as TestFlight deliveries.
