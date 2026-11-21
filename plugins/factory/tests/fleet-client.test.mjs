import assert from "node:assert/strict";
import { test } from "node:test";
import { getApps } from "firebase/app";
import { connectFleet, submitFleetTask } from "../src/fleet-client.mjs";

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

test("Fleet marks network and service interruptions separately from an authority denial", async (t) => {
  const client = await connectFleet(config, async () => ({ user: { getIdToken: async () => "fixture-id-token" } }));
  t.after(() => client.close());
  const responses = [
    () => new Response("upstream temporarily unavailable", { status: 503 }),
    () => { throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); },
    () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 403 }),
    () => Response.json({ error: "Project revision or model is outside the pilot enrollment" }, { status: 403 }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift()());
  await assert.rejects(client.call("inspect", {}), error => error.retryable === true);
  await assert.rejects(client.call("renew", {}), { message: "Temporary Factory transport failure.", retryable: true });
  await assert.rejects(client.call("renew", {}), { message: "Factory authority request rejected (403).", retryable: false });
  await assert.rejects(client.call("submit", {}), { message: "Project revision or model is outside the pilot enrollment", retryable: false });
});

test("slow worker control requests have room to finish while controller and artifact deadlines stay bounded", async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ accepted: true }));
  const client = await connectFleet(config, async () => ({ user: { getIdToken: async () => "fixture-id-token" } }));
  t.after(() => client.close());
  const operations = {
    heartbeat: 20_000, claim: 20_000, inspect: 20_000, renew: 20_000, question: 20_000, finish: 20_000,
    submit: 8_000, get: 8_000, upload: 45_000, download: 45_000,
  };
  for (const [op, duration] of Object.entries(operations)) {
    assert.deepEqual(await client.call(op, {}), { accepted: true });
    assert.equal(timeout.mock.calls.at(-1).arguments[0], duration, op);
    assert.equal(JSON.parse(fetch.mock.calls.at(-1).arguments[1].body).op, op);
  }
});

test("the total deadline includes token acquisition and a stalled successful response body", async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", () => timeout(50));
  const keepAlive = setTimeout(() => {}, 1_000);
  t.after(() => clearTimeout(keepAlive));
  const token = Promise.withResolvers();
  const clientWaitingForToken = await connectFleet(config, async () => ({ user: { getIdToken: () => token.promise } }));
  const clientWaitingForBody = await connectFleet(config, async () => ({ user: { getIdToken: async () => "fixture-id-token" } }));
  t.after(() => Promise.all([clientWaitingForToken.close(), clientWaitingForBody.close()]));
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    new Response(new ReadableStream({ pull() { return new Promise(() => {}); } })));
  const interruption = { message: "Temporary Factory transport failure.", retryable: true };
  await Promise.all([
    assert.rejects(clientWaitingForToken.call("inspect", {}), interruption),
    assert.rejects(clientWaitingForBody.call("renew", {}), interruption),
  ]);
  token.resolve("fixture-expired-token");
  await token.promise;
  assert.equal(fetch.mock.callCount(), 1);
});


test("a lost Fleet submission acknowledgement reuses the exact message and original task", async () => {
  const requests = [];
  const body = { messageId: "stable-message", project: "fixture", text: "brief" };
  const original = { task: { id: "accepted-task" }, replay: true };
  const client = { async call(op, input) {
    requests.push([op, input]);
    if (requests.length === 1) throw Object.assign(new Error("lost acknowledgement"), { retryable: true });
    return original;
  } };
  assert.deepEqual(await submitFleetTask(client, body), original);
  assert.deepEqual(requests, [["submit", body], ["submit", body]]);
});

test("an authority denial is returned immediately, while two lost acknowledgements identify the same message", async () => {
  const denied = new Error("not enrolled");
  const temporary = Object.assign(new Error("lost acknowledgement"), { retryable: true });
  const body = { messageId: "stable-message" };
  const requests = [];
  const client = { async call(op, input) { requests.push([op, input]); throw requests.length === 1 ? denied : temporary; } };
  await assert.rejects(submitFleetTask(client, body), error => error === denied);
  assert.deepEqual(requests, [["submit", body]]);
  await assert.rejects(submitFleetTask(client, body), /Retry the same message ID: stable-message/);
  assert.deepEqual(requests, [["submit", body], ["submit", body], ["submit", body]]);
});
