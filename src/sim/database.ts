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
 * Execute the 01_schema.sql script to ensure the `simulation` schema and all 16 tables exist.
 */
export async function initDb(): Promise<void> {
  const schemaPath = path.resolve(process.cwd(), 'database', '01_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await query(schemaSql);
}

/**
 * Seed the golden scenario data into the database.
 */
export async function seedGoldenScenario(): Promise<void> {
  const seedPath = path.resolve(process.cwd(), 'database', '02_seed_data.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');
  await query(seedSql);
}

/**
 * Reset simulation schema state back to the golden scenario without dropping the database.
 */
export async function resetSimulation(): Promise<void> {
  const resetSql = `
    -- Clear simulation data cleanly in reverse FK order
    DELETE FROM simulation.audit_trail;
    DELETE FROM simulation.erp_updates;
    DELETE FROM simulation.simulation_events;
    DELETE FROM simulation.shipment_tracking;
    DELETE FROM simulation.approvals;
    DELETE FROM simulation.rfq_quotes;
    DELETE FROM simulation.rfqs;
    DELETE FROM simulation.supplier_messages;
    DELETE FROM simulation.disruptions;
    DELETE FROM simulation.purchase_orders;
    DELETE FROM simulation.production_orders;
    DELETE FROM simulation.supplier_components;
    DELETE FROM simulation.inventory;
    DELETE FROM simulation.suppliers;
    DELETE FROM simulation.components;
    DELETE FROM simulation.simulation_state;
  `;
  await query(resetSql);
  await seedGoldenScenario();
}
