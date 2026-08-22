import { runSync } from '../ingest/sync.js';
import { closePool } from '../sim/database.js';

async function main() {
  console.log('--- Seeding database from CSV files ---');
  try {
    const results = await runSync();
    for (const r of results) {
      const status = r.errors.length > 0 ? '⚠' : '✓';
      console.log(`  ${status} ${r.file}: +${r.inserted} inserted, ~${r.updated} updated, ${r.errors.length} errors`);
      for (const e of r.errors) console.error(`      row ${e.row}: ${e.error}`);
    }
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
