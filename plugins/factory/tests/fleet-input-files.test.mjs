import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { materializeInputs, privateInputPrompt, removeInputs } from "../src/fleet-input-files.mjs";
import { downloadTaskInputs, inputManifest, maxInputBytes, maxInputTotal, uploadInput } from "../src/fleet-inputs.mjs";

const contents = Buffer.from("{}");
const descriptor = { name: "notes.json", type: "application/json", size: contents.length,
  sha256: createHash("sha256").update(contents).digest("hex"), generation: "12345678901234567", objectName: "fixture" };
const encoded = [contents.toString("base64")];
const redirectedDirectory = error => ["ELOOP", "ENOTDIR"].includes(error.code);

async function inputFixture(t) {
  const state = await mkdtemp(join(tmpdir(), "fleet-private-inputs-"));
  const attemptId = randomUUID();
  const directory = join(state, `${attemptId}.inputs`);
  t.after(async () => {
    if ((await lstat(directory).catch(() => null))?.isDirectory()) await chmod(directory, 0o700);
    await rm(state, { recursive: true, force: true });
  });
  return { state, attemptId, directory, path: join(directory, descriptor.name) };
}

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
  const { state, attemptId, directory, path } = await inputFixture(t);
  const target = join(state, "external.json");
  const redirect = join(state, "redirect");
  await writeFile(target, contents, { mode: 0o600 });
  await mkdir(redirect, { mode: 0o500 });

  await assert.rejects(materializeInputs(state, "../outside", [descriptor], encoded), /UUID/i);
  await assert.rejects(materializeInputs(state, attemptId, [{ ...descriptor, name: "../external.json" }], encoded));
  await symlink(redirect, directory);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded), { code: "EEXIST" });
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), redirectedDirectory);
  await assert.rejects(removeInputs(state, attemptId), redirectedDirectory);
  assert.equal((await stat(redirect)).mode & 0o777, 0o500);
  await rm(directory);

  assert.deepEqual(await materializeInputs(state, attemptId, [descriptor], encoded), [path]);
  const info = await stat(path);
  assert.equal(info.uid, process.getuid());
  assert.equal(info.mode & 0o777, 0o400);
  assert.deepEqual(await readFile(path), contents);
  assert.deepEqual(await materializeInputs(state, attemptId, [descriptor], encoded, true), [path]);
  assert.match(privateInputPrompt("claude", [path]), /Use Read to inspect images/);
  await chmod(directory, 0o700);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /not sealed/);
  await chmod(directory, 0o550);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /not private/);
  await assert.rejects(removeInputs(state, attemptId), /not private/);
  assert.equal((await stat(directory)).mode & 0o777, 0o550);
  await chmod(directory, 0o500);
  for (const mode of [0o600, 0o420, 0o402]) {
    await chmod(path, mode);
    await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /Unsafe retained/);
  }
  await chmod(path, 0o600);
  await writeFile(path, "[]");
  await chmod(path, 0o400);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /integrity/);
  await chmod(directory, 0o700);
  await rm(path);
  await symlink(target, path);
  await chmod(directory, 0o500);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), { code: "ELOOP" });
  await chmod(directory, 0o700);
  await rm(path);
  await chmod(target, 0o400);
  await link(target, path);
  await chmod(directory, 0o500);
  await assert.rejects(materializeInputs(state, attemptId, [descriptor], encoded, true), /Unsafe retained/);
  await removeInputs(state, attemptId);
  await assert.rejects(stat(directory), { code: "ENOENT" });
  assert.deepEqual(await readFile(target), contents);
});

test("ordinary writes and temp-file replacement by the input owner are refused",
  { skip: process.getuid() === 0 && "root bypasses file modes" }, async t => {
    const { state, attemptId, directory, path } = await inputFixture(t);
    await materializeInputs(state, attemptId, [descriptor], encoded);
    await assert.rejects(writeFile(path, "[]"), { code: "EACCES" });
    const temporary = join(state, "notes.tmp");
    await writeFile(temporary, "[]");
    await assert.rejects(rename(temporary, path), { code: "EACCES" });
    assert.deepEqual(await materializeInputs(state, attemptId, [descriptor], encoded, true), [path]);
    assert.deepEqual(await readFile(path), contents);
    assert.equal(await readFile(temporary, "utf8"), "[]");
    assert.equal((await stat(directory)).mode & 0o777, 0o500);
  });

test("cleanup accepts absent and partially materialized input directories", async t => {
  const { state, attemptId, directory, path } = await inputFixture(t);
  await removeInputs(state, attemptId);
  await assert.rejects(lstat(directory), { code: "ENOENT" });
  await assert.rejects(materializeInputs(state, attemptId,
    [descriptor, { ...descriptor, name: "second.json" }], [encoded[0], "W10="]), /integrity/);
  assert.deepEqual(await readFile(path), contents);
  await removeInputs(state, attemptId);
  await assert.rejects(lstat(directory), { code: "ENOENT" });
  await removeInputs(state, attemptId);
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
