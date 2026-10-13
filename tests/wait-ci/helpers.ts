/** The shape `gh api graphql` returned for cpheinrich/morpheus#354, plus a commit status and a re-run. */
export function rollup(sha: string, nodes: unknown[], hasNextPage = false): unknown {
  return {
    data: {
      repository: {
        pullRequest: {
          number: 354,
          url: "https://github.com/cpheinrich/morpheus/pull/354",
          commits: { nodes: [{ commit: { oid: sha, statusCheckRollup: { contexts: { pageInfo: { hasNextPage }, nodes } } } }] },
        },
      },
    },
  };
}

export function run(name: string, status: string, conclusion: string | null, opts: { required?: boolean; startedAt?: string; job?: string; workflow?: string } = {}) {
  return {
    __typename: "CheckRun",
    name,
    status,
    conclusion,
    detailsUrl: `https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/${opts.job ?? "113138012168"}`,
    startedAt: opts.startedAt ?? "2026-10-08T03:43:05Z",
    isRequired: opts.required ?? false,
    checkSuite: { workflowRun: { workflow: { name: opts.workflow ?? "CI" } } },
  };
}

