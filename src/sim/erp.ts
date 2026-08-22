import { query } from './database.js';

export interface ErpUpdateRecord {
  update_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  previous_value: Record<string, any>;
  new_value: Record<string, any>;
  reason: string;
  created_at: string;
}

export async function logErpUpdate(
  entityType: string,
  entityId: string,
  action: string,
  previousValue: Record<string, any> = {},
  newValue: Record<string, any> = {},
  reason: string = 'Operational update'
): Promise<ErpUpdateRecord> {
  const updateId = `ERP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const sql = `
    INSERT INTO simulation.erp_updates (
      update_id,
      entity_type,
      entity_id,
      action,
      previous_value,
      new_value,
      reason,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const res = await query(sql, [
    updateId,
    entityType,
    entityId,
    action,
    JSON.stringify(previousValue),
    JSON.stringify(newValue),
    reason,
  ]);
  return res.rows[0];
}

export async function getErpUpdates(entityType?: string, entityId?: string): Promise<ErpUpdateRecord[]> {
  let sql = `
    SELECT 
      update_id,
      entity_type,
      entity_id,
      action,
      previous_value,
      new_value,
      reason,
      created_at
    FROM simulation.erp_updates
  `;
  const params: any[] = [];

  if (entityType && entityId) {
    sql += ` WHERE entity_type = $1 AND entity_id = $2`;
    params.push(entityType, entityId);
  } else if (entityType) {
    sql += ` WHERE entity_type = $1`;
    params.push(entityType);
  }

  sql += ` ORDER BY created_at DESC`;

  const res = await query(sql, params);
  return res.rows;
}
