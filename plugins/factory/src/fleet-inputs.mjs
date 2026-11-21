import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

export const maxInputBytes = 8 * 1024 * 1024;
export const maxInputTotal = 32 * 1024 * 1024;
export const maxInputBase64 = Math.ceil(maxInputBytes / 3) * 4;
export const inputName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
const inputType = z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/).max(100);
export const inputUploadFields = { name: inputName, type: inputType, bytes: z.base64().max(maxInputBase64) };
const capacity = { name: inputName, size: z.number().int().min(0).max(maxInputBytes) };
const descriptor = z.strictObject({
  ...capacity, type: inputType, sha256: z.string().regex(/^[0-9a-f]{64}$/),
  generation: z.string().regex(/^[0-9]{1,32}$/), objectName: z.string().max(600),
});

export const inputManifest = z.array(descriptor).max(64).refine(files =>
  new Set(files.map(({ name }) => name.toLowerCase())).size === files.length &&
  files.reduce((total, file) => total + file.size, 0) <= maxInputTotal);

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const inputFailure = (status, message) => Object.assign(new Error(message), { status });
const prefix = ({ contextId, project, messageId }) => `factory-inputs/${contextId}/${project}/${messageId}/`;

export function assertInputBytes(file, bytes) {
  if (bytes.length !== file.size || digest(bytes) !== file.sha256) throw new Error("Factory input integrity failure");
  return bytes;
}

export async function uploadInput(objects, scope, file) {
  const bytes = Buffer.from(file.bytes, "base64");
  if (bytes.length > maxInputBytes) throw inputFailure(413, "Factory input is too large");
  const { name, type } = file;
  return objects.put({ name, type, objectName: prefix(scope) + name, size: bytes.length, sha256: digest(bytes) }, bytes);
}

export async function validateStoredInputs(objects, scope, inputs) {
  if (inputs.some(file => file.objectName !== prefix(scope) + file.name))
    throw inputFailure(400, "Factory input is outside submission scope");
  const stored = await Promise.all(inputs.map(file => objects.metadata(file.objectName)));
  if (!isDeepStrictEqual(stored, inputs)) throw inputFailure(400, "Factory input does not match stored metadata");
}

export function decodedInput(file, encoded) {
  return assertInputBytes(file, Buffer.from(inputUploadFields.bytes.parse(encoded), "base64"));
}

export async function downloadTaskInputs(call, task, signal) {
  const files = [];
  for (const file of inputManifest.parse(task.inputs ?? [])) {
    signal.throwIfAborted();
    const { input, bytes } = await call("input", { taskId: task.id, attemptId: task.attempt.id, name: file.name });
    if (!isDeepStrictEqual(input, file)) throw new Error("Factory input descriptor mismatch");
    decodedInput(file, bytes);
    files.push(bytes);
  }
  signal.throwIfAborted();
  return files;
}
