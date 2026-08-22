import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, initDb, seedGoldenScenario, closePool } from '../src/sim/database.js';

describe('Neon Database Connection & Schema Verification', () => {
  beforeAll(async () => {
    await initDb();
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should connect to Neon PostgreSQL and verify simulation schema exists', async () => {
    const res = await query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'simulation';
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].schema_name).toBe('simulation');
  });

  it('should have all 16 required tables in the simulation schema', async () => {
    const res = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'simulation'
      ORDER BY table_name;
    `);
    const tableNames = res.rows.map((r) => r.table_name);
    const expectedTables = [
      'approvals',
      'audit_trail',
      'components',
      'disruptions',
      'erp_updates',
      'inventory',
      'production_orders',
      'purchase_orders',
      'rfq_quotes',
      'rfqs',
      'shipment_tracking',
      'simulation_events',
      'simulation_state',
      'supplier_components',
      'supplier_messages',
      'suppliers',
    ];

    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });
});
