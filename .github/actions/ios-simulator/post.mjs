import { cleanup } from './simulator.mjs';
try {
  if (process.env.STATE_simulator_name) cleanup(process.env.STATE_simulator_name);
} catch (error) { console.error(error.message); process.exitCode = 1; }
