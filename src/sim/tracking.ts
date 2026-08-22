import { query } from './database.js';

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
  const isContradictory =
    row.supplier_claim === 'dispatched' &&
    row.tracking_status === 'label_created_no_pickup';

  return {
    ...row,
    contradiction_detected: isContradictory,
    discrepancy_details: isContradictory
      ? 'Supplier claims shipment has been dispatched, but tracking confirms carrier has not picked up package (label_created_no_pickup).'
      : null,
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
