import { query } from './database.js';
import { updateUsableInventory } from './inventory.js';
import { logErpUpdate } from './erp.js';
import { updatePurchaseOrderStatus } from './purchaseOrders.js';

export interface SimulationStateRecord {
  id: number;
  simulation_time: number;
  status: string;
  updated_at: string;
}

export interface SimulationEventRecord {
  event_id: string;
  event_type: string;
  event_time: number;
  description: string;
  payload: Record<string, any>;
  executed: boolean;
  created_at: string;
}

export interface DisruptionRecord {
  disruption_id: string;
  disruption_type: string;
  component_id: string;
  po_id?: string | null;
  production_order_id?: string | null;
  severity: string;
  description: string;
  active: boolean;
  detected: boolean;
  created_at: string;
}

export async function getSimulationState(): Promise<SimulationStateRecord> {
  const sql = `SELECT id, simulation_time, status, updated_at FROM simulation.simulation_state WHERE id = 1;`;
  const res = await query(sql);
  if (res.rows.length === 0) {
    await query(`INSERT INTO simulation.simulation_state (id, simulation_time, status) VALUES (1, 0, 'running') ON CONFLICT DO NOTHING;`);
    const recheck = await query(sql);
    return recheck.rows[0];
  }
  return res.rows[0];
}

export async function getDisruptions(activeOnly: boolean = false): Promise<DisruptionRecord[]> {
  let sql = `
    SELECT 
      disruption_id,
      disruption_type,
      component_id,
      po_id,
      production_order_id,
      severity,
      description,
      active,
      detected,
      created_at
    FROM simulation.disruptions
  `;
  if (activeOnly) {
    sql += ` WHERE active = TRUE`;
  }
  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql);
  return res.rows;
}

export async function injectDisruption(data: {
  disruption_type: string;
  component_id: string;
  po_id?: string;
  production_order_id?: string;
  severity: string;
  description: string;
}): Promise<DisruptionRecord> {
  const disruptionId = `DIS-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
  const sql = `
    INSERT INTO simulation.disruptions (
      disruption_id,
      disruption_type,
      component_id,
      po_id,
      production_order_id,
      severity,
      description,
      active,
      detected,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, FALSE, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const res = await query(sql, [
    disruptionId,
    data.disruption_type,
    data.component_id,
    data.po_id || null,
    data.production_order_id || null,
    data.severity,
    data.description,
  ]);

  await logErpUpdate(
    'disruption',
    disruptionId,
    'inject_disruption',
    {},
    data,
    `Disruption injected: ${data.description}`
  );

  return res.rows[0];
}

export async function injectSimulationEvent(data: {
  event_type: string;
  event_time: number;
  description: string;
  payload: Record<string, any>;
}): Promise<SimulationEventRecord> {
  const eventId = `EVT-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
  const sql = `
    INSERT INTO simulation.simulation_events (
      event_id,
      event_type,
      event_time,
      description,
      payload,
      executed,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, FALSE, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const res = await query(sql, [
    eventId,
    data.event_type,
    data.event_time,
    data.description,
    JSON.stringify(data.payload),
  ]);
  return res.rows[0];
}

export async function advanceSimulationTime(steps: number = 1): Promise<{
  previous_time: number;
  current_time: number;
  executed_events: SimulationEventRecord[];
  state: SimulationStateRecord;
}> {
  if (steps <= 0) {
    throw new Error('Steps to advance must be at least 1');
  }

  const currentState = await getSimulationState();
  const previousTime = currentState.simulation_time;
  const newTime = previousTime + steps;

  // Update simulation clock
  const updateStateSql = `
    UPDATE simulation.simulation_state
    SET simulation_time = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    RETURNING *;
  `;
  const stateRes = await query(updateStateSql, [newTime]);
  const newState = stateRes.rows[0];

  // Find all pending events up to newTime
  const findEventsSql = `
    SELECT event_id, event_type, event_time, description, payload, executed, created_at
    FROM simulation.simulation_events
    WHERE executed = FALSE AND event_time <= $1
    ORDER BY event_time ASC, created_at ASC;
  `;
  const eventsRes = await query(findEventsSql, [newTime]);
  const eventsToExecute: SimulationEventRecord[] = eventsRes.rows;

  const executedList: SimulationEventRecord[] = [];

  for (const event of eventsToExecute) {
    let payload = event.payload;
    while (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        break;
      }
    }
    payload = payload || {};

    switch (event.event_type) {
      case 'inventory_correction': {
        const targetStock = Number(payload.usable_stock);
        if (payload.component_id && !isNaN(targetStock)) {
          await updateUsableInventory(
            payload.component_id,
            targetStock,
            `Event ${event.event_id}: ${event.description}`
          );
        }
        break;
      }
      case 'demand_spike': {
        const targetDailyUsage = Number(payload.daily_usage);
        if (payload.component_id && !isNaN(targetDailyUsage)) {
          await query(
            `UPDATE simulation.inventory SET daily_usage = $1, last_updated = CURRENT_TIMESTAMP WHERE component_id = $2`,
            [targetDailyUsage, payload.component_id]
          );
          await logErpUpdate(
            'inventory',
            payload.component_id,
            'demand_spike',
            {},
            { daily_usage: targetDailyUsage },
            `Event ${event.event_id}: ${event.description}`
          );
        }
        break;
      }
      case 'supplier_delay': {
        if (payload.po_id) {
          await updatePurchaseOrderStatus(
            payload.po_id,
            'delayed',
            `Event ${event.event_id}: ${event.description}`
          );
        }
        break;
      }
      case 'expedite_unavailable': {
        if (payload.supplier_id && payload.component_id) {
          await query(
            `UPDATE simulation.supplier_components SET expedite_available = FALSE WHERE supplier_id = $1 AND component_id = $2`,
            [payload.supplier_id, payload.component_id]
          );
        }
        break;
      }
      default: {
        console.log(`[Event Engine] Executed generic event ${event.event_type}: ${event.description}`);
        break;
      }
    }

    // Mark event as executed
    await query(
      `UPDATE simulation.simulation_events SET executed = TRUE WHERE event_id = $1`,
      [event.event_id]
    );

    executedList.push({ ...event, executed: true });
  }

  return {
    previous_time: previousTime,
    current_time: newTime,
    executed_events: executedList,
    state: newState,
  };
}

export async function injectHiddenTest(data: { test_type: string; component_id: string }): Promise<void> {
  const { test_type, component_id } = data;

  switch (test_type) {
    case 'erp_mismatch': {
      // Cuts usable_stock in half to simulate phantom stock
      await query(
        `UPDATE simulation.inventory SET usable_stock = current_stock / 2 WHERE component_id = $1`,
        [component_id]
      );
      break;
    }
    case 'demand_spike': {
      // Triples daily_usage
      await query(
        `UPDATE simulation.inventory SET daily_usage = daily_usage * 3 WHERE component_id = $1`,
        [component_id]
      );
      break;
    }
    case 'expedite_revoked': {
      // Revokes expedite availability
      await query(
        `UPDATE simulation.supplier_components SET expedite_available = FALSE WHERE component_id = $1`,
        [component_id]
      );
      await query(
        `UPDATE simulation.rfq_quotes SET expedite_available = FALSE WHERE rfq_id IN (SELECT rfq_id FROM simulation.rfqs WHERE component_id = $1)`,
        [component_id]
      );
      break;
    }
    case 'priority_change': {
      // Sets a production order to critical and brings deadline forward by 1 day
      await query(
        `UPDATE simulation.production_orders SET priority = 'critical', deadline = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE component_id = $1`,
        [component_id]
      );
      break;
    }
    default:
      throw new Error(`Unknown test_type: ${test_type}`);
  }
}
