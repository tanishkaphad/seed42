import { Pool, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';

let poolInstance: Pool | null = null;

export function getPool(): Pool {
  if (!poolInstance) {
    if (!env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set. Please provide a Neon PostgreSQL connection string in .env file.'
      );
    }

    // Configure connection pool optimized for Neon Serverless / PostgreSQL
    poolInstance = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    poolInstance.on('error', (err) => {
      console.error('Unexpected Neon PostgreSQL pool error:', err);
    });
  }

  return poolInstance;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

/**
 * Execute schema scripts to ensure all tables exist.
 */
export async function initDb(): Promise<void> {
  const dbDir = path.resolve(process.cwd(), 'database');
  const schemaSql = fs.readFileSync(path.join(dbDir, '01_schema.sql'), 'utf8');
  await query(schemaSql);

  const rulesPath = path.join(dbDir, '05_contradiction_rules.sql');
  if (fs.existsSync(rulesPath)) {
    const rulesSql = fs.readFileSync(rulesPath, 'utf8');
    await query(rulesSql);
  }

  const configPath = path.join(dbDir, '06_config.sql');
  if (fs.existsSync(configPath)) {
    const configSql = fs.readFileSync(configPath, 'utf8');
    await query(configSql);
  }
}

/**
 * Seed the simulation database using the CSV ingestion pipeline.
 */
export async function seedGoldenScenario(): Promise<void> {
  await resetSimulation();
}

/**
 * Reset simulation schema state back to clean baseline using CSV sync.
 */
export async function resetSimulation(): Promise<void> {
  const resetSql = `
    TRUNCATE TABLE 
      simulation.audit_trail,
      simulation.erp_updates,
      simulation.simulation_events,
      simulation.shipment_tracking,
      simulation.approvals,
      simulation.rfq_quotes,
      simulation.rfqs,
      simulation.supplier_messages,
      simulation.disruptions,
      simulation.purchase_orders,
      simulation.production_orders,
      simulation.supplier_components,
      simulation.inventory,
      simulation.suppliers,
      simulation.components,
      simulation.config,
      simulation.tracking_contradiction_rules,
      simulation.simulation_state
    CASCADE;
  `;
  await query(resetSql);
  const { runSync } = await import('../ingest/sync.js');
  await runSync();
}
