import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "vitest";

it("serializes native signing processes through cleanup, failure, timeout and cancellation", async () => {
  await promisify(execFile)("python3", ["-B", new URL("./signing-lock.test.py", import.meta.url).pathname], {
    timeout: 20_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
}, 25_000);
