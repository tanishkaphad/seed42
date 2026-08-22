import { query } from './database.js';

export interface ProductionOrderRecord {
  production_order_id: string;
  product: string;
  component_id: string;
  component_name?: string;
  units_planned: number;
  component_required_per_unit: number;
  total_components_needed: number;
  deadline: string;
  priority: string;
  status: string;
  created_at: string;
}

export async function getProductionSchedule(): Promise<ProductionOrderRecord[]> {
  const sql = `
    SELECT 
      po.production_order_id,
      po.product,
      po.component_id,
      c.name AS component_name,
      po.units_planned,
      po.component_required_per_unit,
      (po.units_planned * po.component_required_per_unit) AS total_components_needed,
      po.deadline,
      po.priority,
      po.status,
      po.created_at
    FROM simulation.production_orders po
    JOIN simulation.components c ON po.component_id = c.component_id
    ORDER BY po.deadline ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

export async function getProductionOrderById(productionOrderId: string): Promise<ProductionOrderRecord | null> {
  const sql = `
    SELECT 
      po.production_order_id,
      po.product,
      po.component_id,
      c.name AS component_name,
      po.units_planned,
      po.component_required_per_unit,
      (po.units_planned * po.component_required_per_unit) AS total_components_needed,
      po.deadline,
      po.priority,
      po.status,
      po.created_at
    FROM simulation.production_orders po
    JOIN simulation.components c ON po.component_id = c.component_id
    WHERE po.production_order_id = $1;
  `;
  const res = await query(sql, [productionOrderId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}
