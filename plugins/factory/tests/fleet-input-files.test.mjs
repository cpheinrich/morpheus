import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { materializeInputs, privateInputPrompt, removeInputs } from "../src/fleet-input-files.mjs";
import { downloadTaskInputs, inputManifest, maxInputBytes, maxInputTotal, uploadInput } from "../src/fleet-inputs.mjs";

const contents = Buffer.from("{}");
const descriptor = { name: "notes.json", type: "application/json", size: contents.length,
  sha256: createHash("sha256").update(contents).digest("hex"), generation: "12345678901234567", objectName: "fixture" };
const encoded = [contents.toString("base64")];

test("private input byte and manifest boundaries are inclusive at exact limits", async () => {
  const scope = { contextId: "context", project: "project", messageId: "message" };
  const objectStore = { async put(file, bytes) { assert.equal(bytes.length, maxInputBytes); return { ...file, generation: "1" }; } };
  const maximal = Buffer.alloc(maxInputBytes).toString("base64");
  const over = Buffer.alloc(maxInputBytes + 1).toString("base64");
  assert.equal((await uploadInput(objectStore, scope, { ...descriptor, bytes: maximal })).size, maxInputBytes);
  await assert.rejects(uploadInput(objectStore, scope, { ...descriptor, bytes: over }), { status: 413 });
  const manifest = Array.from({ length: 64 }, (_, index) => ({ ...descriptor, name: `file-${index}`, size: index < 4 ? maxInputBytes : 0 }));
  assert.equal(manifest.reduce((total, file) => total + file.size, 0), maxInputTotal);
  assert.deepEqual(inputManifest.parse(manifest), manifest);
  assert.equal(inputManifest.safeParse([...manifest, { ...descriptor, size: 0 }]).success, false);
  assert.equal(inputManifest.safeParse(manifest.map(file => file.name === "file-4" ? { ...file, size: 1 } : file)).success, false);
  assert.equal(inputManifest.safeParse([{ ...descriptor, size: maxInputBytes + 1 }]).success, false);
  assert.equal(inputManifest.safeParse([descriptor, { ...descriptor, name: "NOTES.JSON" }]).success, false);
});

test("private input materialization refuses traversal, redirected directories and linked files", async t => {
  const root = await mkdtemp(join(tmpdir(), "fleet-private-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, "state");
  await mkdir(state, { mode: 0o700 });
  const attemptId = randomUUID();
  const directory = join(state, `${attemptId}.inputs`);
  const path = join(directory, descriptor.name);
  const target = join(root, "external.json");
  await writeFile(target, contents, { mode: 0o600 });

  await assert.rejects(materializeInputs(state, "../outside", [descriptor], encoded), /UUID/i);
  await assert.rejects(materializeInputs(state, attemptId, [{ ...descriptor, name: "../external.json" }], encoded));
  await symlink(root, directory);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded), { code: "EEXIST" });
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /not private/);
  await removeInputs(state, attemptId);
  assert.deepEqual(await readFile(target), contents);

  assert.deepEqual(await materializeInputs(state, attemptId, [descriptor], encoded), [path]);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(await readFile(path), contents);
  assert.match(privateInputPrompt("claude", [path]), /Use Read to inspect images/);
  await writeFile(path, "[]");
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /integrity/);
  await rm(path);
  await symlink(target, path);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), { code: "ELOOP" });
  await rm(path);
  await link(target, path);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /Unsafe retained/);
  await removeInputs(state, attemptId);
  assert.deepEqual(await readFile(target), contents);
});

test("the supervisor rejects incorrect input replies and stops requesting later files on abort", async () => {
  const task = { id: "fixture", attempt: { id: "attempt" }, inputs: [descriptor, { ...descriptor, name: "next.json" }] };
  const controller = new AbortController();
  const reply = { input: descriptor, bytes: encoded[0] };
  await assert.rejects(downloadTaskInputs(async () => ({ ...reply, bytes: "W10=" }), task, controller.signal), /integrity/);
  await assert.rejects(downloadTaskInputs(async () => ({ ...reply, input: { ...descriptor, generation: "2" } }), task, controller.signal), /descriptor mismatch/);
  const requested = [];
  await assert.rejects(downloadTaskInputs(async (op, request) => {
    requested.push([op, request]);
    controller.abort();
    return reply;
  }, task, controller.signal), { name: "AbortError" });
  assert.deepEqual(requested, [["input", { taskId: "fixture", attemptId: "attempt", name: "notes.json" }]]);
});
