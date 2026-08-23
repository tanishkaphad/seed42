import { query } from './src/sim/database.js';

async function check() {
  console.log('--- LATEST MESSAGES ---');
  const msgs = await query(`SELECT message_id, subject, direction, sent_at FROM simulation.supplier_messages ORDER BY sent_at DESC LIMIT 2`);
  console.table(msgs.rows);
  
  console.log('--- LATEST EVENTS ---');
  const events = await query(`SELECT agent, message, created_at FROM simulation.agent_events ORDER BY created_at DESC LIMIT 10`);
  console.table(events.rows);
}

check().catch(console.error);
