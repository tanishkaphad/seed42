import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTrackingByPoId } from '../src/sim/tracking.js';
import { resetSimulation, closePool } from '../src/sim/database.js';

describe('Shipment Tracking & Contradiction Detection', () => {
  beforeAll(async () => {
    await resetSimulation();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should detect contradiction between supplier claim and courier tracking on PO-7712', async () => {
    const tracking = await getTrackingByPoId('PO-7712');
    expect(tracking).not.toBeNull();
    expect(tracking!.supplier_claim).toBe('dispatched');
    expect(tracking!.tracking_status).toBe('label_created_no_pickup');
    expect(tracking!.last_movement).toBeNull();
    expect(tracking!.contradiction_detected).toBe(true);
    expect(tracking!.discrepancy_details).toContain('tracking confirms carrier has not picked up');
  });
});
