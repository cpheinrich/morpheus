/** The shape `gh api graphql` returned for cpheinrich/morpheus#354, plus a commit status and a re-run. */
export function rollup(sha: string, nodes: unknown[], hasNextPage = false, mergeable = "MERGEABLE", mergeStateStatus?: string): unknown {
  return {
    data: {
      repository: {
        pullRequest: {
          number: 354,
          mergeable,
          ...(mergeStateStatus === undefined ? {} : { mergeStateStatus }),
          url: "https://github.com/cpheinrich/morpheus/pull/354",
          commits: { nodes: [{ commit: { oid: sha, statusCheckRollup: { contexts: { pageInfo: { hasNextPage }, nodes } } } }] },
        },
      },
    },
  };
}

export function run(name: string, status: string, conclusion: string | null, opts: { required?: boolean; startedAt?: string; job?: string; workflow?: string; suite?: string; workflowId?: string; runId?: string } = {}) {
  return {
    __typename: "CheckRun",
    name,
    status,
    conclusion,
    detailsUrl: `https://github.com/cpheinrich/morpheus/actions/runs/${opts.runId ?? "37724037716"}/job/${opts.job ?? "113138012168"}`,
    startedAt: opts.startedAt ?? "2026-10-08T03:43:05Z",
    isRequired: opts.required ?? false,
    checkSuite: { id: opts.suite ?? `suite-${opts.workflow ?? "CI"}`, workflowRun: { workflow: { id: opts.workflowId ?? `workflow-${opts.workflow ?? "CI"}`, name: opts.workflow ?? "CI" } } },
  };
}

