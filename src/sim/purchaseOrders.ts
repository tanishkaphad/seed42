import { query } from './database.js';
import { logErpUpdate } from './erp.js';
import { getConfigValue } from './config.js';

export interface PurchaseOrderRecord {
  po_id: string;
  component_id: string;
  component_name?: string;
  supplier_id: string;
  supplier_name?: string;
  quantity: number;
  expected_delivery: string;
  status: string;
  unit_price: number;
  total_value: number;
  approval_threshold: number;
  created_at: string;
}

export async function getPurchaseOrders(status?: string): Promise<PurchaseOrderRecord[]> {
  let sql = `
    SELECT 
      po.po_id,
      po.component_id,
      c.name AS component_name,
      po.supplier_id,
      s.supplier_name,
      po.quantity,
      po.expected_delivery,
      po.status,
      po.unit_price::float,
      po.total_value::float,
      po.approval_threshold::float,
      po.created_at
    FROM simulation.purchase_orders po
    JOIN simulation.components c ON po.component_id = c.component_id
    JOIN simulation.suppliers s ON po.supplier_id = s.supplier_id
  `;
  const params: any[] = [];

  if (status) {
    sql += ` WHERE po.status = $1`;
    params.push(status);
  }

  sql += ` ORDER BY po.created_at DESC`;

  const res = await query(sql, params);
  return res.rows;
}

export async function getPurchaseOrderById(poId: string): Promise<PurchaseOrderRecord | null> {
  const sql = `
    SELECT 
      po.po_id,
      po.component_id,
      c.name AS component_name,
      po.supplier_id,
      s.supplier_name,
      po.quantity,
      po.expected_delivery,
      po.status,
      po.unit_price::float,
      po.total_value::float,
      po.approval_threshold::float,
      po.created_at
    FROM simulation.purchase_orders po
    JOIN simulation.components c ON po.component_id = c.component_id
    JOIN simulation.suppliers s ON po.supplier_id = s.supplier_id
    WHERE po.po_id = $1;
  `;
  const res = await query(sql, [poId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}

export async function updatePurchaseOrderStatus(
  poId: string,
  newStatus: string,
  reason: string = 'Status update'
): Promise<PurchaseOrderRecord> {
  const existing = await getPurchaseOrderById(poId);
  if (!existing) {
    throw new Error(`Purchase order ${poId} not found`);
  }

  const prevValue = { status: existing.status };
  const newValue = { status: newStatus };

  const sql = `
    UPDATE simulation.purchase_orders
    SET status = $1
    WHERE po_id = $2
    RETURNING *;
  `;
  await query(sql, [newStatus, poId]);

  await logErpUpdate('purchase_order', poId, 'update_status', prevValue, newValue, reason);

  const updated = await getPurchaseOrderById(poId);
  return updated!;
}

export async function createPurchaseOrder(data: {
  component_id: string;
  supplier_id: string;
  quantity: number;
  unit_price: number;
  expected_delivery: string;
  status?: string;
  approval_threshold?: number;
}): Promise<PurchaseOrderRecord> {
  const totalValue = data.quantity * data.unit_price;
  const configThreshold = await getConfigValue('approval_threshold');
  const threshold = data.approval_threshold ?? (configThreshold ? Number(configThreshold) : 150000);
  const poId = `PO-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
  const status = data.status || 'placed';

  const sql = `
    INSERT INTO simulation.purchase_orders (
      po_id,
      component_id,
      supplier_id,
      quantity,
      expected_delivery,
      status,
      unit_price,
      total_value,
      approval_threshold,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    RETURNING *;
  `;

  await query(sql, [
    poId,
    data.component_id,
    data.supplier_id,
    data.quantity,
    data.expected_delivery,
    status,
    data.unit_price,
    totalValue,
    threshold,
  ]);

  await logErpUpdate(
    'purchase_order',
    poId,
    'create_po',
    {},
    { component_id: data.component_id, supplier_id: data.supplier_id, quantity: data.quantity, total_value: totalValue },
    'Emergency procurement order created'
  );

  const created = await getPurchaseOrderById(poId);
  return created!;
}
