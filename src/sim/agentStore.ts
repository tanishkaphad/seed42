import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { publishAgentEvent } from '../agent/bus.js';

let schemaReady: Promise<void> | null = null;
async function ensure() {
  if (!schemaReady) {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'database/07_agent.sql'), 'utf8');
    schemaReady = query(sql)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  await schemaReady;
}

export async function createAgentRun(componentId?: string) {
  await ensure();
  const runId = `RUN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await query(
    `INSERT INTO simulation.agent_runs (run_id, status, component_id, payload) VALUES ($1, 'running', $2, '{}'::jsonb)`,
    [runId, componentId || null]
  );
  return runId;
}

export async function logAgentEvent(runId: string, agent: string, message: string) {
  const eventId = `EVT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await query(
    `INSERT INTO simulation.agent_events (event_id, run_id, agent, message) VALUES ($1, $2, $3, $4)`,
    [eventId, runId, agent, message]
  );
  publishAgentEvent({ run_id: runId, agent, message });
}

export async function patchAgentRun(runId: string, status: string, payload: Record<string, unknown>) {
  await query(`UPDATE simulation.agent_runs SET status = $1, payload = $2::jsonb WHERE run_id = $3`, [
    status,
    JSON.stringify(payload),
    runId,
  ]);
}

export async function getAgentRun(runId: string) {
  const res = await query(`SELECT * FROM simulation.agent_runs WHERE run_id = $1`, [runId]);
  return res.rows[0] || null;
}

export async function findRunByApproval(approvalId: string) {
  const res = await query(
    `SELECT * FROM simulation.agent_runs WHERE payload->>'approval_id' = $1 ORDER BY created_at DESC LIMIT 1`,
    [approvalId]
  );
  return res.rows[0] || null;
}

export async function listAgentRuns() {
  await ensure();
  const res = await query(
    `SELECT r.*, (SELECT count(*)::int FROM simulation.agent_events e WHERE e.run_id = r.run_id) AS event_count
     FROM simulation.agent_runs r ORDER BY r.created_at DESC LIMIT 40`
  );
  return res.rows;
}

export async function getAgentEvents(runId: string) {
  const res = await query(
    `SELECT * FROM simulation.agent_events WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId]
  );
  return res.rows;
}

export async function recordPayment(runId: string, poId: string | null, amount: number) {
  const paymentId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await query(
    `INSERT INTO simulation.payments (payment_id, run_id, po_id, amount, status) VALUES ($1, $2, $3, $4, 'simulated_paid')`,
    [paymentId, runId, poId, amount]
  );
  return paymentId;
}

export async function getPayments(runId?: string) {
  await ensure();
  if (runId) {
    const res = await query(`SELECT * FROM simulation.payments WHERE run_id = $1 ORDER BY created_at DESC`, [runId]);
    return res.rows;
  }
  const res = await query(`SELECT * FROM simulation.payments ORDER BY created_at DESC LIMIT 40`);
  return res.rows;
}
