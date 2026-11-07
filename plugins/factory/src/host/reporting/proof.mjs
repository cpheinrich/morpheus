import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { jsonFile } from './files.mjs';
const exec = promisify(execFile);
export async function validTerminationProof(directory, runId) {
  try {
    await jsonFile(directory + '/reconciliation.json');
    const installed = new URL('./proof/termination_proof.py', import.meta.url);
    const script = existsSync(installed) ? installed : new URL('../../termination_proof.py', import.meta.url);
    await exec('python3', ['-B', fileURLToPath(script), 'valid', directory, runId], {timeout:3000,maxBuffer:2048});
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 1) return false;
    throw new Error('unavailable');
  }
}

export async function currentFactoryCensus(run=exec) {
  const script=new URL('./census.py',import.meta.url);
  const {stdout}=await run('python3',['-B',fileURLToPath(script)],{timeout:3000,maxBuffer:1048576});
  const value=JSON.parse(stdout);
  if(!value.identities||!value.owned||!Array.isArray(value.markedRunIds))throw new Error('unavailable');
  return value;
}
