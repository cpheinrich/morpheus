import { listPending, resolveBatch, showBatch } from "../qa/store.js";

/**
 * `morpheus qa comments …` — agent-facing side of the QA comment loop.
 *
 * Writers (local overlay) drop batches under `local/qa-comments/pending/`.
 * Agents list, read, act, then resolve. See docs/runbooks/qa-comments.md.
 */

const USAGE = `Usage
  morpheus qa comments pending
  morpheus qa comments show <batchId>
  morpheus qa comments resolve <batchId> [batchId...]
`;

export async function dispatchQaComments(
  root: string,
  command: string | undefined,
  rest: string[],
): Promise<number> {
  if (command === "pending" || command === undefined) {
    const listings = await listPending(root);
    for (const item of listings) {
      console.log(
        `${item.id}\t${item.commentCount}\t${item.project}\t${item.createdAt}\t${item.path}`,
      );
    }
    return 0;
  }

  if (command === "show") {
    const id = rest[0];
    if (!id) {
      console.error(`Which batch?\n\n${USAGE}`);
      return 1;
    }
    const found = await showBatch(root, id);
    if (!found) {
      console.error(`No QA comment batch "${id}" under local/qa-comments/.`);
      return 1;
    }
    console.log(JSON.stringify(found.batch, null, 2));
    return 0;
  }

  if (command === "resolve") {
    if (rest.length === 0) {
      console.error(`Which batch?\n\n${USAGE}`);
      return 1;
    }
    let failed = 0;
    for (const id of rest) {
      const resolved = await resolveBatch(root, id);
      if (!resolved) {
        console.error(`No QA comment batch "${id}" under local/qa-comments/.`);
        failed += 1;
        continue;
      }
      console.log(`Resolved ${resolved.id}`);
    }
    return failed === 0 ? 0 : 1;
  }

  console.error(`Unknown qa comments command "${command}".\n\n${USAGE}`);
  return 1;
}
