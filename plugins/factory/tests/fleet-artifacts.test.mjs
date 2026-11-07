import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { publishArtifacts } from "../src/fleet-artifacts.mjs";

const taskId = "01890000-0000-7000-8000-000000000001";
const attemptId = "01890000-0000-7000-8000-000000000002";
const generation = "18014398509481984";
const sha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "factory-artifacts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = join(root, "output");
  await mkdir(outputDir);
  const uploads = [];
  const putObject = async (request) => {
    uploads.push(request);
    return generation;
  };
  return {
    root,
    outputDir,
    uploads,
    publish: (files, overrides = {}) =>
      publishArtifacts({ outputDir, files, taskId, attemptId, putObject, ...overrides }),
  };
}

test("publishes only selected artifacts using create-only storage and preserves exact generation", async (t) => {
  const { outputDir, uploads, publish } = await fixture(t);
  await writeFile(join(outputDir, "report.PDF"), "abc");
  await writeFile(join(outputDir, "unselected.txt"), "private");

  const objectName = `factory/${taskId}/${attemptId}/report.PDF`;
  assert.deepEqual(await publish(["report.PDF"]), [
    { name: "report.PDF", objectName, generation, type: "application/pdf", size: 3, sha256 },
  ]);
  assert.deepEqual(uploads, [
    { objectName, bytes: Buffer.from("abc"), ifGenerationMatch: 0, type: "application/pdf", sha256 },
  ]);
  assert.deepEqual(await publish([]), []);
  assert.equal(uploads.length, 1);
});

test("refuses invalid identities, nonflat names, duplicate names, and more than eight files", async (t) => {
  const { publish, uploads } = await fixture(t);
  await assert.rejects(publish(["report.pdf"], { attemptId: "../attempt" }), /identities/);
  for (const name of ["../report.pdf", "/report.pdf", "dir/report.pdf", "dir\\report.pdf", ".env"]) {
    await assert.rejects(publish([name]), /flat ASCII names/);
  }
  await assert.rejects(publish(["report.pdf", "report.pdf"]), /unique/);
  await assert.rejects(publish(Array.from({ length: 9 }, (_, i) => `f${i}`)), /at most 8/);
  assert.deepEqual(uploads, []);
});

test("refuses symlinked output directories, symlinked files, and hard links", async (t) => {
  const { root, outputDir, publish, uploads } = await fixture(t);
  const outside = join(root, "outside.txt");
  await writeFile(outside, "private");
  await symlink(outside, join(outputDir, "symlink.txt"));
  await link(outside, join(outputDir, "hardlink.txt"));
  const alias = join(root, "alias");
  await symlink(outputDir, alias);

  await assert.rejects(publish(["outside.txt"], { outputDir: `${alias}/` }), { code: /ELOOP|ENOTDIR/ });
  await assert.rejects(publish(["symlink.txt"]), /regular file with one link/);
  await assert.rejects(publish(["hardlink.txt"]), /regular file with one link/);
  assert.deepEqual(uploads, []);
});

test("rejects a replacement output directory between uploads", async (t) => {
  const { root, outputDir, publish } = await fixture(t);
  await writeFile(join(outputDir, "first.txt"), "first");
  await writeFile(join(outputDir, "second.txt"), "second");
  const attempted = [];
  await assert.rejects(publish(["first.txt", "second.txt"], {
    putObject: async ({ objectName }) => {
      attempted.push(objectName);
      await rename(outputDir, join(root, "original"));
      await mkdir(outputDir);
      await writeFile(join(outputDir, "second.txt"), "replacement");
      return generation;
    },
  }), /path changed/);
  assert.deepEqual(attempted, [`factory/${taskId}/${attemptId}/first.txt`]);
});

test("accepts an artifact at 8 MiB and refuses one byte over before upload", async (t) => {
  const { outputDir, publish, uploads } = await fixture(t);
  const path = join(outputDir, "payload.bin");
  await writeFile(path, "");
  await truncate(path, 8388608);
  assert.equal((await publish(["payload.bin"]))[0].size, 8388608);
  await truncate(path, 8388609);
  await assert.rejects(publish(["payload.bin"]), /exceeds 8388608 bytes/);
  assert.equal(uploads.length, 1);
});

test("propagates upload failure and requires a string generation on success", async (t) => {
  const { outputDir, publish } = await fixture(t);
  await writeFile(join(outputDir, "report.pdf"), "abc");
  const failure = new Error("Object already exists");
  await assert.rejects(publish(["report.pdf"], {
    putObject: async () => { throw failure; },
  }), (error) => error === failure);
  await assert.rejects(publish(["report.pdf"], {
    putObject: async () => Number(generation),
  }), /did not return an object generation/);
});
