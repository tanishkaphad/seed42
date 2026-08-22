import { initDb, closePool } from '../sim/database.js';
import { runSync } from '../ingest/sync.js';

async function main() {
  console.log('--- Initializing Neon PostgreSQL Simulation Database ---');
  try {
    console.log('Creating schema and tables in simulation schema...');
    await initDb();
    console.log('Seeding dataset from CSV files...');
    const results = await runSync();
    for (const r of results) {
      const status = r.errors.length > 0 ? '⚠' : '✓';
      console.log(`  ${status} ${r.file}: +${r.inserted} inserted, ~${r.updated} updated, ${r.errors.length} errors`);
      for (const e of r.errors) console.error(`      row ${e.row}: ${e.error}`);
    }
    console.log('Database initialization completed successfully!');
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
