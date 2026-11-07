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

async function putArtifact(putObject, prefix, name, bytes) {
  const objectName = `${prefix}/${name}`;
  const type = contentTypes.get(extname(name).toLowerCase()) ?? "application/octet-stream";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const generation = await putObject({ objectName, bytes, ifGenerationMatch: 0, type, sha256 });
  if (typeof generation !== "string" || !/^[1-9][0-9]*$/.test(generation))
    throw new Error("Artifact upload did not return an object generation.");
  return { name, objectName, generation, type, size: bytes.length, sha256 };
}

export async function publishArtifacts({ outputDir, files, taskId, attemptId, putObject }) {
  if (typeof taskId !== "string" || !taskIdentity.test(taskId) ||
      typeof attemptId !== "string" || !taskIdentity.test(attemptId))
    throw new Error("Artifacts require valid task and attempt identities.");
  const names = artifactNames(files);
  if (!names.length) return [];
  if (!isAbsolute(outputDir)) throw new Error("Artifact output directory must be absolute.");
  const directory = resolve(outputDir);
  const root = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
  try {
    const directoryStat = await root.stat(statOptions);
    const prefix = `factory/${taskId}/${attemptId}`;
    const artifacts = [];
    for (const name of names) {
      const bytes = await readArtifact(directory, directoryStat, name);
      artifacts.push(await putArtifact(putObject, prefix, name, bytes));
    }
    return artifacts;
  } finally {
    await root.close();
  }
}
