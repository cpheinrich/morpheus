import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
test("dependency-free installer reaches its package-manager bootstrap", async (t) => {
  if (process.platform !== "darwin") return;
  const root = await mkdtemp(join(tmpdir(), "clean-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "codex-claude");
  await cp(new URL("..", import.meta.url), source, {
    recursive: true,
    filter: (p) => !["node_modules", ".git"].includes(basename(p)),
  });
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "pnpm"),
    "#!/bin/sh\necho reached-staged-bootstrap >&2\nexit 19\n",
    { mode: 0o700 },
  );
  const helper = join(root, "helper.py");
  await writeFile(helper, "");
  await assert.rejects(
    exec(process.execPath, [join(source, "scripts", "install.mjs")], {
      env: {
        ...process.env,
        PATH: bin + ":" + process.env.PATH,
        CODEX_PLUGIN_CREATOR: helper,
      },
      timeout: 10000,
    }),
    (e) => {
      assert.match(e.stderr, /reached-staged-bootstrap/);
      assert.doesNotMatch(e.stderr, /ERR_MODULE_NOT_FOUND/);
      return true;
    },
  );
});
