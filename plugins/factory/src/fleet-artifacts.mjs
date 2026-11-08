import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";

const taskIdentity = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fileName = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const maxFiles = 8;
const maxBytes = 8 * 1024 * 1024;
const statOptions = { bigint: true };
const contentTypes = new Map([
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
  [".txt", "text/plain"],
  [".json", "application/json"],
]);

function artifactNames(files) {
  if (!Array.isArray(files) || files.length > maxFiles)
    throw new Error(`Select at most ${maxFiles} artifact files.`);
  const names = Array.from(files);
  if (names.some((name) => typeof name !== "string" || !fileName.test(name)))
    throw new Error("Artifact files must have flat ASCII names.");
  if (new Set(names).size !== names.length)
    throw new Error("Artifact names must be unique.");
  return names;
}

function assertIdentity(expected, actual) {
  if (expected.dev !== actual.dev || expected.ino !== actual.ino)
    throw new Error("Artifact path changed while reading.");
}

function assertStableFile(before, after) {
  assertIdentity(before, after);
  if (after.nlink !== 1n || before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
    throw new Error("Artifact file changed while reading.");
}

async function readExact(file, size) {
  // One extra byte detects growth without allocating an unbounded buffer.
  const bytes = Buffer.alloc(size + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
    if (!bytesRead) break;
    offset += bytesRead;
  }
  if (offset !== size) throw new Error("Artifact file changed while reading.");
  return bytes.subarray(0, size);
}

async function readArtifact(directory, directoryStat, name) {
  const path = join(directory, name);
  const before = await lstat(path, statOptions);
  if (!before.isFile() || before.nlink !== 1n)
    throw new Error("Artifact must be a regular file with one link.");
  if (before.size > BigInt(maxBytes))
    throw new Error(`Artifact exceeds ${maxBytes} bytes.`);

  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assertStableFile(before, await file.stat(statOptions));
    assertIdentity(directoryStat, await lstat(directory, statOptions));
    const bytes = await readExact(file, Number(before.size));
    assertStableFile(before, await file.stat(statOptions));
    assertStableFile(before, await lstat(path, statOptions));
    assertIdentity(directoryStat, await lstat(directory, statOptions));
    return bytes;
  } finally {
    await file.close();
  }
}

async function uploadArtifact(putObject, readObject, object) {
  try {
    return await putObject(object);
  } catch (error) {
    // A create can succeed before its response is lost. A storage adapter may
    // reconcile the exact object, but must verify the digest of the stored bytes.
    const existing = await readObject?.({ objectName: object.objectName });
    if (!existing) throw error;
    if (existing.sha256 !== object.sha256 || existing.size !== object.bytes.length)
      throw new Error("Artifact object already exists with different content.");
    return existing.generation;
  }
}

async function putArtifact(putObject, readObject, prefix, name, bytes, type) {
  const objectName = `${prefix}/${name}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const generation = await uploadArtifact(putObject, readObject, {
    objectName, bytes, ifGenerationMatch: 0, type, sha256,
  });
  if (typeof generation !== "string" || !/^[1-9][0-9]*$/.test(generation))
    throw new Error("Artifact upload did not return an object generation.");
  return { name, objectName, generation, type, size: bytes.length, sha256 };
}

export async function* readArtifactFiles(outputDir, files) {
  const names = artifactNames(files);
  if (!names.length) return;
  if (!isAbsolute(outputDir)) throw new Error("Artifact output directory must be absolute.");
  const directory = resolve(outputDir);
  const root = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
  try {
    const directoryStat = await root.stat(statOptions);
    for (const name of names) {
      const bytes = await readArtifact(directory, directoryStat, name);
      const type = contentTypes.get(extname(name).toLowerCase()) ?? "application/octet-stream";
      yield { name, bytes, type };
    }
  } finally {
    await root.close();
  }
}

export async function publishArtifacts({ outputDir, files, taskId, attemptId, putObject, readObject }) {
  if (typeof taskId !== "string" || !taskIdentity.test(taskId) ||
      typeof attemptId !== "string" || !taskIdentity.test(attemptId))
    throw new Error("Artifacts require valid task and attempt identities.");
  const prefix = `factory/${taskId}/${attemptId}`;
  const artifacts = [];
  for await (const { name, bytes, type } of readArtifactFiles(outputDir, files))
    artifacts.push(await putArtifact(putObject, readObject, prefix, name, bytes, type));
  return artifacts;
}
