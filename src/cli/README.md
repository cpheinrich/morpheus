# CLI boundaries

`index.ts` owns process exit; `run.ts` is the importable invocation seam. `args.ts`
owns the existing permissive grammar and `dispatch.ts` routes each command family
to its own handler. Keep help text in `help.ts` and compatibility cases in the CLI tests.
See [architecture §18.1](../../architecture.md#181-morpheuss-own-structure) for distribution.
