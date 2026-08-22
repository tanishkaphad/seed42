import { initDb, seedGoldenScenario, closePool } from '../sim/database.js';

async function main() {
  console.log('--- Initializing Neon PostgreSQL Simulation Database ---');
  try {
    console.log('Creating schema and tables in simulation schema...');
    await initDb();
    console.log('Seeding golden scenario data...');
    await seedGoldenScenario();
    console.log('Database initialization completed successfully!');
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
