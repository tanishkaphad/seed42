import { resetSimulation, closePool } from '../sim/database.js';

async function main() {
  console.log('--- Resetting Neon Database to Golden Scenario ---');
  try {
    await resetSimulation();
    console.log('Simulation environment reset successfully!');
  } catch (err) {
    console.error('Reset failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
