import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export async function checkContract(consumer) {
  const canonical=await readFile(new URL('./protocol.mjs',import.meta.url));
  if(!canonical.equals(await readFile(consumer)))throw new Error('Infrastructure wire contract differs from canonical source');
  return createHash('sha256').update(canonical).digest('hex');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {process.stdout.write(await checkContract(process.argv[2])+'\n');}
  catch {process.stderr.write('Infrastructure wire contract parity failed.\n');process.exitCode=1;}
}
