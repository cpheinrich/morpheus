# Native evidence runtime

Roadmap: MO-26-09-26-14.30.36

Evo run 36272503282 proved Node was absent from the macOS service PATH. A commit-pinned
setup-node v6 step now provides Node24 in that job whenever a caller configures an evidence
validator; package-manager caching is disabled. Consumer native verification remains pending.

Six focused evidence tests, typecheck, lint and diff checks passed. Fresh independent reviewer
/root/ios_node_runtime_review inspected the setup ordering and pinned upstream action definition,
independently reran all six tests, and cleared with no findings (two minutes, small/low risk).

Fresh independent review cleared same-job Node setup, pinned action inputs, cache disablement and validator ordering. All six focused evidence tests independently passed; no findings.

```morpheus-review
{"version":1,"base":"15d6476cbe40d7d55164b84f572d6a32bd37eccb","reviewed":"1223dfe06cca82318e26959c8af51ed19ffddc15","covered":"1223dfe06cca82318e26959c8af51ed19ffddc15","authorSession":"01a0ded2-7ceb-7743-9092-7056a08f0eab","reviewerSession":"/root/ios_node_runtime_review","risk":"small","elapsedMinutes":2,"outcome":"complete","summary":"Fresh independent review cleared same-job Node setup, pinned action inputs, cache disablement and validator ordering. All six focused evidence tests independently passed; no findings.","findings":[]}
```
