#!/usr/bin/env node
import { gatewayWorker, workerResult } from '../src/gateway-worker.mjs';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node scripts/gateway-worker.mjs --config /private/job.json [--admission-id UUID] [--resume ADMISSION_ID] < prompt.txt; --status ADMISSION_ID');
} else {
  try {
    if (args[0] === '--status' && args.length === 2) {
      console.log(JSON.stringify(await workerResult(args[1])));
    } else {
    const options = {};
    if (args.length % 2) throw new Error('Expected --config FILE [--admission-id UUID] [--resume ADMISSION_ID]');
    for (let i = 0; i < args.length; i += 2) {
      if (!['--config', '--resume', '--admission-id'].includes(args[i]) || options[args[i]] !== undefined || !args[i + 1])
        throw new Error('Invalid or repeated worker option');
      options[args[i]] = args[i + 1];
    }
    if (!options['--config']) throw new Error('Expected --config FILE');
    const chunks = []; let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw new Error('Prompt exceeds 1048576 bytes');
      chunks.push(chunk);
    }
    const result = await gatewayWorker(options['--config'], Buffer.concat(chunks).toString('utf8'), options['--resume'], options['--admission-id']);
    console.log(JSON.stringify(result));
    process.exitCode = result.result.outcome === 'failed' ? 1 : 0;
    }
  } catch (error) {
    // No stack, command stderr, config contents or credential resolver output.
    console.log(JSON.stringify({ outcome: 'failed', summary: error.message, evidence: [], question: '' }));
    process.exitCode = 1;
  }
}
