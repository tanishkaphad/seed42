import { query } from './src/sim/database.js';

async function check() {
  console.log('--- LATEST AUDIT LOGS ---');
  const logs = await query(`SELECT decision, summary, from_address, created_at FROM simulation.audit_trail ORDER BY created_at DESC LIMIT 5`);
  console.table(logs.rows);
}

check().catch(console.error);
