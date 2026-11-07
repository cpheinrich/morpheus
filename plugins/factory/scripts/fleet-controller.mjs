import { readFile, writeFile } from "node:fs/promises";
import { connectFleet, readFleetConfig } from "../src/fleet-client.mjs";

try {
  const [path, op, bodyFile, output] = process.argv.slice(2);
  if (!path || !op || !bodyFile || (op === "download" && !output))
    throw new Error("Usage: node scripts/fleet-controller.mjs CONFIG OP BODY_JSON_FILE [ARTIFACT_OUTPUT]");
  const input = JSON.parse(await readFile(bodyFile, "utf8"));
  const client = await connectFleet(await readFleetConfig(path));
  try {
    const result = op === "wait" ? await waitForFleetTask(client, input, 120) : await client.call(op, input);
    if (op === "download") {
      await writeFile(output, Buffer.from(result.bytes, "base64"), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify(result.artifact));
    } else {
      console.log(JSON.stringify(result));
    }
  } finally { await client.close(); }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
