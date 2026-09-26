import { cleanup, shutdownTemplate, withTemplateLock } from './simulator.mjs';
const errors = [];
try { if (process.env.STATE_simulator_name) cleanup(process.env.STATE_simulator_name); }
catch (error) { errors.push(error); }
try {
  if (process.env.STATE_simulator_template) {
    withTemplateLock(() => shutdownTemplate(process.env.STATE_simulator_template));
  }
} catch (error) { errors.push(error); }
if (errors.length) {
  for (const error of errors) console.error(error.message);
  console.error(`iOS simulator cleanup failed in ${errors.length} phase(s).`);
  process.exitCode = 1;
}
