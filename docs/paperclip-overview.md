# Paperclip retirement

Paperclip execution integrations are retired. Use the optional [Factory plugin](../plugins/factory/README.md)
and its six direct `factory_*` tools with configured gateway workers. Internal `pool.*` and
`hq.*` dispatch, controller bridge/pilot/HQ scripts and live workflow-study collection are removed.

This source change does not stop installed services or alter local configuration, credentials
or databases. Runtime removal and Factory installation require controller-coordinated independent
review and protected delivery; source changes alone are not proof of installation.

Preserved records and offline tools:

- [Closeout archive contract](paperclip-closeout.md): immutable frozen snapshots, offline export,
  rendering and append-only history validation. No live API acquisition.
- [Frozen agent-stack study](../qa/evals/agent-stack/README.md): original inputs and hashes;
  the harness only renders, verifies, scores and reports.
- [Workflow comparison](paperclip-workflow-comparison.md) and
  [offline scoring](../qa/evals/workflow-repair/README.md).
- Tracked `.agent/paperclip*` evidence and historical roadmap, acceptance and worklog records.

Earlier integration designs are retained as historical reference, not operating instructions.
