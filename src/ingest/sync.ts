import path from 'path';
import { readCsv } from './csv.js';
import { normalizers } from './normalize.js';
import { query } from '../sim/database.js';
import { invalidateContradictionCache } from '../sim/tracking.js';

export interface SyncTabResult {
  file: string;
  inserted: number;
  updated: number;
  errors: { row: number; error: string }[];
}

const SEED_DIR = path.resolve(process.cwd(), 'data', 'seed');
const HIDDEN_DIR = path.resolve(process.cwd(), 'data', 'hidden');

// ── Upsert functions per entity ────────────────────────────────────────────

async function upsertComponents(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.components (component_id, name, description, unit_of_measure, criticality, required_certification, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
       ON CONFLICT (component_id) DO UPDATE SET
         name=EXCLUDED.name, description=EXCLUDED.description,
         unit_of_measure=EXCLUDED.unit_of_measure, criticality=EXCLUDED.criticality,
         required_certification=EXCLUDED.required_certification
       RETURNING (xmax = 0) AS is_insert`,
      [r.component_id, r.name, r.description, r.unit_of_measure, r.criticality, r.required_certification]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertSuppliers(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.suppliers (supplier_id, supplier_name, email, reliability_score, quality_score, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
       ON CONFLICT (supplier_id) DO UPDATE SET
         supplier_name=EXCLUDED.supplier_name, email=EXCLUDED.email,
         reliability_score=EXCLUDED.reliability_score, quality_score=EXCLUDED.quality_score,
         active=EXCLUDED.active
       RETURNING (xmax = 0) AS is_insert`,
      [r.supplier_id, r.supplier_name, r.email, r.reliability_score, r.quality_score, r.active]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertSupplierComponents(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.supplier_components
         (supplier_component_id, supplier_id, component_id, unit_price, lead_time_days,
          available_quantity, minimum_order_quantity, certifications, expedite_available, expedite_fee, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
       ON CONFLICT (supplier_component_id) DO UPDATE SET
         unit_price=EXCLUDED.unit_price, lead_time_days=EXCLUDED.lead_time_days,
         available_quantity=EXCLUDED.available_quantity, minimum_order_quantity=EXCLUDED.minimum_order_quantity,
         certifications=EXCLUDED.certifications, expedite_available=EXCLUDED.expedite_available,
         expedite_fee=EXCLUDED.expedite_fee
       RETURNING (xmax = 0) AS is_insert`,
      [r.supplier_component_id, r.supplier_id, r.component_id, r.unit_price, r.lead_time_days,
       r.available_quantity, r.minimum_order_quantity, r.certifications, r.expedite_available, r.expedite_fee]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertInventory(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.inventory
         (inventory_id, component_id, warehouse, current_stock, usable_stock, daily_usage, safety_stock, last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
       ON CONFLICT (inventory_id) DO UPDATE SET
         current_stock=EXCLUDED.current_stock, usable_stock=EXCLUDED.usable_stock,
         daily_usage=EXCLUDED.daily_usage, safety_stock=EXCLUDED.safety_stock,
         last_updated=CURRENT_TIMESTAMP
       RETURNING (xmax = 0) AS is_insert`,
      [r.inventory_id, r.component_id, r.warehouse, r.current_stock, r.usable_stock, r.daily_usage, r.safety_stock]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertProductionOrders(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.production_orders
         (production_order_id, product, component_id, units_planned, component_required_per_unit, deadline, priority, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
       ON CONFLICT (production_order_id) DO UPDATE SET
         product=EXCLUDED.product, units_planned=EXCLUDED.units_planned,
         component_required_per_unit=EXCLUDED.component_required_per_unit,
         deadline=EXCLUDED.deadline, priority=EXCLUDED.priority, status=EXCLUDED.status
       RETURNING (xmax = 0) AS is_insert`,
      [r.production_order_id, r.product, r.component_id, r.units_planned,
       r.component_required_per_unit, r.deadline, r.priority, r.status]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertPurchaseOrders(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.purchase_orders
         (po_id, component_id, supplier_id, quantity, expected_delivery, status, unit_price, total_value, approval_threshold, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
       ON CONFLICT (po_id) DO UPDATE SET
         quantity=EXCLUDED.quantity, expected_delivery=EXCLUDED.expected_delivery,
         status=EXCLUDED.status, unit_price=EXCLUDED.unit_price, total_value=EXCLUDED.total_value
       RETURNING (xmax = 0) AS is_insert`,
      [r.po_id, r.component_id, r.supplier_id, r.quantity, r.expected_delivery,
       r.status, r.unit_price, r.total_value, r.approval_threshold ?? 150000]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertShipmentTracking(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.shipment_tracking
         (tracking_id, po_id, supplier_claim, tracking_status, last_movement, tracking_updated_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
       ON CONFLICT (tracking_id) DO UPDATE SET
         supplier_claim=EXCLUDED.supplier_claim, tracking_status=EXCLUDED.tracking_status,
         last_movement=EXCLUDED.last_movement, tracking_updated_at=CURRENT_TIMESTAMP
       RETURNING (xmax = 0) AS is_insert`,
      [r.tracking_id, r.po_id, r.supplier_claim, r.tracking_status, r.last_movement || null]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertSupplierMessages(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.supplier_messages
         (message_id, supplier_id, po_id, direction, subject, body, message_status, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
       ON CONFLICT (message_id) DO UPDATE SET
         subject=EXCLUDED.subject, body=EXCLUDED.body, message_status=EXCLUDED.message_status
       RETURNING (xmax = 0) AS is_insert`,
      [r.message_id, r.supplier_id, r.po_id, r.direction, r.subject, r.body, r.message_status]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertDisruptions(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.disruptions
         (disruption_id, disruption_type, component_id, po_id, production_order_id,
          severity, description, active, detected, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
       ON CONFLICT (disruption_id) DO UPDATE SET
         severity=EXCLUDED.severity, description=EXCLUDED.description,
         active=EXCLUDED.active, detected=EXCLUDED.detected
       RETURNING (xmax = 0) AS is_insert`,
      [r.disruption_id, r.disruption_type, r.component_id, r.po_id, r.production_order_id,
       r.severity, r.description, r.active, r.detected]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertSimulationEvents(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const payloadStr = typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload);
    const res = await query(
      `INSERT INTO simulation.simulation_events
         (event_id, event_type, event_time, description, payload, executed, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,CURRENT_TIMESTAMP)
       ON CONFLICT (event_id) DO UPDATE SET
         event_type=EXCLUDED.event_type, event_time=EXCLUDED.event_time,
         description=EXCLUDED.description, payload=EXCLUDED.payload, executed=EXCLUDED.executed
       RETURNING (xmax = 0) AS is_insert`,
      [r.event_id, r.event_type, r.event_time, r.description, payloadStr, r.executed]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertConfig(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.config (key, value, description)
       VALUES ($1,$2,$3)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, description=EXCLUDED.description
       RETURNING (xmax = 0) AS is_insert`,
      [r.key, r.value, r.description]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  return { inserted, updated };
}

async function upsertContradictionRules(rows: any[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO simulation.tracking_contradiction_rules (supplier_claim, tracking_status, description)
       VALUES ($1,$2,$3)
       ON CONFLICT (supplier_claim, tracking_status) DO UPDATE SET description=EXCLUDED.description
       RETURNING (xmax = 0) AS is_insert`,
      [r.supplier_claim, r.tracking_status, r.description]
    );
    res.rows[0].is_insert ? inserted++ : updated++;
  }
  invalidateContradictionCache(); // rules changed — clear the in-memory lookup
  return { inserted, updated };
}

// ── Simulation state bootstrap ─────────────────────────────────────────────

async function ensureSimulationState(): Promise<void> {
  await query(
    `INSERT INTO simulation.simulation_state (id, simulation_time, status, updated_at)
     VALUES (1, 0, 'running', CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET simulation_time = 0, status = 'running', updated_at = CURRENT_TIMESTAMP`
  );
}

// ── Main sync orchestrator ─────────────────────────────────────────────────

/** Ordered by FK dependency: components/suppliers first, dependents after. */
const SYNC_PLAN: Array<{
  file: string;
  entity: keyof typeof normalizers;
  upsert: (rows: any[]) => Promise<{ inserted: number; updated: number }>;
}> = [
  { file: 'components.csv',          entity: 'components',          upsert: upsertComponents },
  { file: 'suppliers.csv',           entity: 'suppliers',           upsert: upsertSuppliers },
  { file: 'inventory.csv',           entity: 'inventory',           upsert: upsertInventory },
  { file: 'supplier_components.csv', entity: 'supplier_components', upsert: upsertSupplierComponents },
  { file: 'production_orders.csv',   entity: 'production_orders',   upsert: upsertProductionOrders },
  { file: 'purchase_orders.csv',     entity: 'purchase_orders',     upsert: upsertPurchaseOrders },
  { file: 'shipment_tracking.csv',   entity: 'shipment_tracking',   upsert: upsertShipmentTracking },
  { file: 'supplier_messages.csv',   entity: 'supplier_messages',   upsert: upsertSupplierMessages },
  { file: 'disruptions.csv',         entity: 'disruptions',         upsert: upsertDisruptions },
  { file: 'simulation_events.csv',   entity: 'simulation_events',   upsert: upsertSimulationEvents },
  { file: 'config.csv',              entity: 'config',              upsert: upsertConfig },
  { file: 'contradiction_rules.csv', entity: 'contradiction_rules', upsert: upsertContradictionRules },
];

export async function runSync(includeHidden = false): Promise<SyncTabResult[]> {
  await ensureSimulationState();
  const results: SyncTabResult[] = [];

  for (const plan of SYNC_PLAN) {
    const filePath = path.join(SEED_DIR, plan.file);
    try {
      const rawRows = await readCsv(filePath);
      const { valid, errors } = normalizers[plan.entity](rawRows);
      const { inserted, updated } = valid.length > 0
        ? await plan.upsert(valid)
        : { inserted: 0, updated: 0 };
      results.push({ file: plan.file, inserted, updated, errors });
    } catch (err: any) {
      results.push({ file: plan.file, inserted: 0, updated: 0, errors: [{ row: 0, error: err.message }] });
    }
  }

  // Load hidden evaluation events if requested
  if (includeHidden) {
    const hiddenPath = path.join(HIDDEN_DIR, 'evaluation_events.csv');
    try {
      const rawRows = await readCsv(hiddenPath);
      const { valid, errors } = normalizers.simulation_events(rawRows);
      const { inserted, updated } = valid.length > 0
        ? await upsertSimulationEvents(valid)
        : { inserted: 0, updated: 0 };
      results.push({ file: 'hidden/evaluation_events.csv', inserted, updated, errors });
    } catch (err: any) {
      results.push({ file: 'hidden/evaluation_events.csv', inserted: 0, updated: 0, errors: [{ row: 0, error: err.message }] });
    }
  }

  return results;
}
