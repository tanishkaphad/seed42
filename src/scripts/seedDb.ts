import { seedGoldenScenario, closePool } from '../sim/database.js';

async function main() {
  console.log('--- Seeding Golden Scenario to Neon Database ---');
  try {
    await seedGoldenScenario();
    console.log('Golden scenario seeded successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
