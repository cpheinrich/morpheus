#!/usr/bin/env node
import { gatewayWorker, reconcileWorker, workerResult } from '../src/gateway-worker.mjs';
const args = process.argv.slice(2);
function workerOptions(args) {
  const options = {};
  if (args.length % 2) throw new Error('Expected --config FILE [--admission-id UUID] [--resume ADMISSION_ID]');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--config', '--resume', '--admission-id'].includes(args[i]) || options[args[i]] !== undefined || !args[i + 1])
      throw new Error('Invalid or repeated worker option');
    options[args[i]] = args[i + 1];
  }
  if (!options['--config']) throw new Error('Expected --config FILE');
  return options;
}
async function readPrompt() {
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error('Prompt exceeds 1048576 bytes');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function runWorker(args) {
  if (args[0] === '--status' && args.length === 2) {
    const result = await workerResult(args[1]);
    console.log(JSON.stringify(result));
    process.exitCode = result.result.outcome === 'failed' ? 1 : 0;
    return;
  }
  if (args[0] === '--reconcile' && args.length === 2) {
    const result = await reconcileWorker(args[1]);
    console.log(JSON.stringify(result));
    process.exitCode = result.terminationVerified ? 0 : 1;
    return;
  }
  const options = workerOptions(args);
  const result = await gatewayWorker(options['--config'], await readPrompt(), options['--resume'], options['--admission-id']);
  console.log(JSON.stringify(result));
  process.exitCode = result.result.outcome === 'failed' ? 1 : 0;
}
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/gateway-worker.mjs --config /private/job.json [--admission-id UUID] [--resume ADMISSION_ID] < prompt.txt; --status ADMISSION_ID; --reconcile ADMISSION_ID');
} else {
  try {
    await runWorker(args);
  } catch (error) {
    // No stack, command stderr, config contents or credential resolver output.
    console.log(JSON.stringify({ outcome: 'failed', summary: error.message, evidence: [], question: '' }));
    process.exitCode = 1;
  }
}
