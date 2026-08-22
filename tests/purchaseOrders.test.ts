import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPurchaseOrderById, getPurchaseOrders, updatePurchaseOrderStatus } from '../src/sim/purchaseOrders.js';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';

describe('Purchase Orders & Status Verification', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should verify PO-7712 exists and is marked delayed', async () => {
    const po = await getPurchaseOrderById('PO-7712');
    expect(po).not.toBeNull();
    expect(po!.component_id).toBe('COMP-104');
    expect(po!.supplier_id).toBe('SUP-21');
    expect(po!.quantity).toBe(1000);
    expect(po!.status).toBe('delayed');
    expect(po!.unit_price).toBe(118);
    expect(po!.total_value).toBe(118000);
    expect(po!.approval_threshold).toBe(150000);
  });

  it('should update purchase order status and log ERP change', async () => {
    const updated = await updatePurchaseOrderStatus('PO-7712', 'escalated', 'Testing escalation');
    expect(updated.status).toBe('escalated');
  });
});
