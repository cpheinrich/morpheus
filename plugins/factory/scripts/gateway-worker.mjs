#!/usr/bin/env node
import { gatewayWorker, workerResult } from '../src/gateway-worker.mjs';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/gateway-worker.mjs --config /private/job.json [--resume ADMISSION_ID] < prompt.txt; --status ADMISSION_ID');
} else {
  try {
    if (args[0] === '--status' && args.length === 2) {
      console.log(JSON.stringify(await workerResult(args[1])));
    } else {
    if (args[0] !== '--config' || !args[1] || ![2, 4].includes(args.length) || (args.length === 4 && args[2] !== '--resume'))
      throw new Error('Expected --config FILE [--resume ADMISSION_ID]');
    const chunks = []; let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw new Error('Prompt exceeds 1048576 bytes');
      chunks.push(chunk);
    }
    const result = await gatewayWorker(args[1], Buffer.concat(chunks).toString('utf8'), args[3]);
    console.log(JSON.stringify(result));
    process.exitCode = result.result.outcome === 'failed' ? 1 : 0;
    }
  } catch (error) {
    // No stack, command stderr, config contents or credential resolver output.
    console.log(JSON.stringify({ outcome: 'failed', summary: error.message, evidence: [], question: '' }));
    process.exitCode = 1;
  }
}
