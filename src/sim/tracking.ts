import { query } from './database.js';

// ponytail: lazy-loaded Map, O(1) lookup. Invalidated by invalidateContradictionCache().
let rulesCache: Map<string, string> | null = null;

async function getContradictionRules(): Promise<Map<string, string>> {
  if (rulesCache) return rulesCache;
  const res = await query(
    `SELECT supplier_claim, tracking_status, description FROM simulation.tracking_contradiction_rules`
  );
  rulesCache = new Map(
    res.rows.map((r: any) => [`${r.supplier_claim}:${r.tracking_status}`, r.description])
  );
  return rulesCache;
}

export function invalidateContradictionCache(): void {
  rulesCache = null;
}

export interface ShipmentTrackingRecord {
  tracking_id: string;
  po_id: string;
  supplier_claim: string;
  tracking_status: string;
  last_movement: string | null;
  tracking_updated_at: string;
  contradiction_detected: boolean;
  discrepancy_details?: string | null;
}

export async function getTrackingByPoId(poId: string): Promise<ShipmentTrackingRecord | null> {
  const sql = `
    SELECT 
      tracking_id,
      po_id,
      supplier_claim,
      tracking_status,
      last_movement,
      tracking_updated_at
    FROM simulation.shipment_tracking
    WHERE po_id = $1;
  `;
  const res = await query(sql, [poId]);
  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  const rules = await getContradictionRules();
  const key = `${row.supplier_claim}:${row.tracking_status}`;
  const discrepancy = rules.get(key) ?? null;

  return {
    ...row,
    contradiction_detected: !!discrepancy,
    discrepancy_details: discrepancy,
  };
}

export async function updateTracking(
  poId: string,
  supplierClaim: string,
  trackingStatus: string,
  lastMovement?: string | null
): Promise<ShipmentTrackingRecord> {
  const sql = `
    INSERT INTO simulation.shipment_tracking (
      tracking_id,
      po_id,
      supplier_claim,
      tracking_status,
      last_movement,
      tracking_updated_at
    ) VALUES (
      'TRK-' || substr(md5(random()::text), 1, 8),
      $1, $2, $3, $4, CURRENT_TIMESTAMP
    )
    ON CONFLICT (tracking_id) DO UPDATE SET
      supplier_claim = EXCLUDED.supplier_claim,
      tracking_status = EXCLUDED.tracking_status,
      last_movement = EXCLUDED.last_movement,
      tracking_updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  await query(sql, [poId, supplierClaim, trackingStatus, lastMovement || null]);
  const tracking = await getTrackingByPoId(poId);
  return tracking!;
}
