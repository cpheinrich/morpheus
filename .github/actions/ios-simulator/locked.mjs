import { cloneFromWarmedTemplate, shutdownTemplate } from './simulator.mjs';

try {
  const [operation, value, jobName] = process.argv.slice(2);
  if (operation === 'clone') {
    const udid = cloneFromWarmedTemplate(JSON.parse(value), jobName);
    process.stdout.write(udid);
  } else if (operation === 'shutdown') {
    shutdownTemplate(value);
  } else {
    throw Error(`Unknown locked simulator operation: ${operation}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
