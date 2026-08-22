import { query } from './database.js';
import { logErpUpdate } from './erp.js';

export interface InventoryRecord {
  inventory_id: string;
  component_id: string;
  component_name?: string;
  warehouse: string;
  current_stock: number;
  usable_stock: number;
  daily_usage: number;
  safety_stock: number;
  days_of_coverage: number;
  last_updated: string;
}

export function calculateDaysOfCoverage(usableStock: number, dailyUsage: number): number {
  if (dailyUsage <= 0) return 9999.0;
  const coverage = usableStock / dailyUsage;
  return Number(coverage.toFixed(2));
}

export async function getInventory(componentId?: string): Promise<InventoryRecord[]> {
  let sql = `
    SELECT 
      i.inventory_id,
      i.component_id,
      c.name AS component_name,
      i.warehouse,
      i.current_stock,
      i.usable_stock,
      i.daily_usage,
      i.safety_stock,
      i.last_updated
    FROM simulation.inventory i
    JOIN simulation.components c ON i.component_id = c.component_id
  `;
  const params: any[] = [];

  if (componentId) {
    sql += ` WHERE i.component_id = $1`;
    params.push(componentId);
  }

  sql += ` ORDER BY i.component_id ASC`;

  const res = await query(sql, params);
  return res.rows.map((row) => ({
    ...row,
    days_of_coverage: calculateDaysOfCoverage(row.usable_stock, row.daily_usage),
  }));
}

export async function getInventoryByComponent(componentId: string): Promise<InventoryRecord | null> {
  const list = await getInventory(componentId);
  return list.length > 0 ? list[0] : null;
}

export async function updateUsableInventory(
  componentId: string,
  newUsableStock: number,
  reason: string = 'Simulation inventory update'
): Promise<InventoryRecord> {
  if (newUsableStock < 0) {
    throw new Error('Usable stock cannot be negative');
  }

  const existing = await getInventoryByComponent(componentId);
  if (!existing) {
    throw new Error(`Component ${componentId} not found in inventory`);
  }

  const prevValue = { usable_stock: existing.usable_stock, current_stock: existing.current_stock };
  const newValue = { usable_stock: newUsableStock, current_stock: existing.current_stock };

  const sql = `
    UPDATE simulation.inventory
    SET usable_stock = $1, last_updated = CURRENT_TIMESTAMP
    WHERE component_id = $2
    RETURNING *;
  `;
  await query(sql, [newUsableStock, componentId]);

  await logErpUpdate(
    'inventory',
    componentId,
    'update_usable_stock',
    prevValue,
    newValue,
    reason
  );

  const updated = await getInventoryByComponent(componentId);
  return updated!;
}

export async function updateStock(
  componentId: string,
  currentStock: number,
  usableStock: number,
  reason: string = 'Stock adjustment'
): Promise<InventoryRecord> {
  if (currentStock < 0 || usableStock < 0) {
    throw new Error('Stock quantities cannot be negative');
  }

  const existing = await getInventoryByComponent(componentId);
  if (!existing) {
    throw new Error(`Component ${componentId} not found in inventory`);
  }

  const prevValue = { current_stock: existing.current_stock, usable_stock: existing.usable_stock };
  const newValue = { current_stock: currentStock, usable_stock: usableStock };

  const sql = `
    UPDATE simulation.inventory
    SET current_stock = $1, usable_stock = $2, last_updated = CURRENT_TIMESTAMP
    WHERE component_id = $3
    RETURNING *;
  `;
  await query(sql, [currentStock, usableStock, componentId]);

  await logErpUpdate(
    'inventory',
    componentId,
    'update_stock',
    prevValue,
    newValue,
    reason
  );

  const updated = await getInventoryByComponent(componentId);
  return updated!;
}
