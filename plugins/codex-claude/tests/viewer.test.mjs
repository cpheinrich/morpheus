import { test } from "node:test";
import assert from "node:assert/strict";
import { Viewer } from "../src/viewer.mjs";
import { randomUUID } from "node:crypto";
test("viewer requires capability, serves text safely and never renews run lease", async (t) => {
  const id = randomUUID();
  const manager = {
    status: async (requested) => {
      assert.equal(requested, id);
      return {
        id,
        host: "host",
        cwd: "/repo",
        state: "running",
        progress: "<script>bad</script>",
      };
    },
  };
  const v = new Viewer(manager);
  t.after(() => v.close());
  const { url } = await v.open(id);
  const u = new URL(url);
  const endpoint = `${u.origin}/state/${id}`;
  assert.equal((await fetch(endpoint)).status, 403);
  assert.equal(
    (await fetch(endpoint, { headers: { Authorization: "Bearer wrong" } }))
      .status,
    403,
  );
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${u.hash.slice(1)}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).progress, "<script>bad</script>");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(endpoint, { method: "POST" })).status, 403);
  const page = await (await fetch(url)).text();
  assert.match(page, /textContent=/);
  assert.equal(page.includes("bad"), false);
});
