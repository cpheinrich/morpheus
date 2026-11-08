import assert from "node:assert/strict";
import { test } from "node:test";
import { getApps } from "firebase/app";
import { connectFleet } from "../src/fleet-client.mjs";

const config = {
  endpoint: "https://example.invalid",
  firebase: { projectId: "demo-factory", apiKey: "fake-api-key" },
  databaseId: "factory-pilot",
  email: "fixture@example.invalid",
  password: "fixture-password",
};

test("one desktop request can close while another root still listens", async (t) => {
  const apps = [];
  const signIn = async (auth) => {
    apps.push(auth.app.name);
    return { user: { uid: "fixture" } };
  };
  const [left, right] = await Promise.all([connectFleet(config, signIn), connectFleet(config, signIn)]);
  t.after(() => right.close());
  assert.equal(new Set(apps).size, 2);
  await left.close();
  assert.deepEqual(getApps().map(({ name }) => name), [apps[1]]);
  const unsubscribe = right.listen(() => {}, () => {});
  unsubscribe();
});

test("failed sign-in removes the partially initialized app", async () => {
  const count = getApps().length;
  await assert.rejects(connectFleet(config, async () => { throw new Error("sign-in denied"); }), /sign-in denied/);
  assert.equal(getApps().length, count);
});
