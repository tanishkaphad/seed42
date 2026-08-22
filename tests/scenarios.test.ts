import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetSimulation, closePool, query } from '../src/sim/database.js';
import { getInventoryByComponent } from '../src/sim/inventory.js';
import { getPurchaseOrderById } from '../src/sim/purchaseOrders.js';
import { getSuppliers, SupplierCapabilityRecord } from '../src/sim/suppliers.js';
import { createRfq } from '../src/sim/rfq.js';
import { checkApproval } from '../src/sim/approval.js';
import { getTrackingByPoId } from '../src/sim/tracking.js';
import { advanceSimulationTime, getSimulationState, getDisruptions } from '../src/sim/events.js';
import { logErpUpdate, getErpUpdates } from '../src/sim/erp.js';
import { recordAuditTrail, getAuditTrail } from '../src/audit/trail.js';

describe('End-to-End Golden Scenario & Scenario Simulation', () => {
  beforeAll(async () => {
    await resetSimulation();
  });

  afterAll(async () => {
    await closePool();
  });

  it('Step 1: Check initial inventory and verify ~4.33 days coverage', async () => {
    const inv = await getInventoryByComponent('COMP-104');
    expect(inv).not.toBeNull();
    expect(inv!.usable_stock).toBe(390);
    expect(inv!.daily_usage).toBe(90);
    expect(inv!.days_of_coverage).toBe(4.33);
  });

  it('Step 2: Check delayed PO-7712 and PROD-882 production order', async () => {
    const po = await getPurchaseOrderById('PO-7712');
    expect(po!.status).toBe('delayed');

    const prodRes = await query(`SELECT * FROM simulation.production_orders WHERE production_order_id = 'PROD-882'`);
    expect(prodRes.rows.length).toBe(1);
    expect(prodRes.rows[0].priority).toBe('high');
  });

  it('Step 3: Verify shipment tracking contradiction', async () => {
    const tracking = await getTrackingByPoId('PO-7712');
    expect(tracking!.contradiction_detected).toBe(true);
  });

  it('Step 4: Request RFQ and verify supplier options', async () => {
    const { quotes } = await createRfq({
      component_id: 'COMP-104',
      requested_quantity: 600,
      required_delivery_date: '2026-09-06T00:00:00Z',
    });

    expect(quotes.length).toBe(4);
    const sup18 = quotes.find((q) => q.supplier_id === 'SUP-18');
    expect(sup18!.has_required_certification).toBe(false);
  });

  it('Step 5: Verify approval threshold triggers on emergency procurement exceeding 150000', async () => {
    const approval = await checkApproval({
      action_type: 'emergency_procurement',
      estimated_cost: 168000,
    });
    expect(approval.approval_required).toBe(true);
    expect(approval.approval_status).toBe('pending_human_approval');
  });

  it('Step 6: Log ERP update and record audit trail', async () => {
    await logErpUpdate(
      'purchase_order',
      'PO-7712',
      'mark_disrupted',
      { status: 'delayed' },
      { status: 'under_replanning' },
      'Supplier delay confirmed and tracking contradiction verified'
    );

    const audit = await recordAuditTrail({
      disruption_id: 'DIS-001',
      detected_disruption: 'Supplier SUP-21 delayed delivery on PO-7712',
      data_sources_checked: ['inventory', 'purchase_orders', 'shipment_tracking'],
      messages_sent: [{ to: 'SUP-21', subject: 'Status check' }],
      messages_received: [{ from: 'SUP-21', body: '5-7 days delay' }],
      alternatives_considered: [{ supplier: 'SUP-42', cost: 79200, lead_time: 4 }],
      calculations: { days_of_coverage: 4.33, shortfall: 310 },
      decision: 'Escalate emergency PO creation with SUP-42 due to threshold and lead time constraints',
      decision_reason: 'SUP-18 lacked Automotive-Grade certification, SUP-42 meets deadline with expediting',
      erp_updates: ['PO-7712 status updated'],
      escalations: ['Approval requested for cost > threshold'],
      remaining_risks: ['Courier transit delay risk'],
    });

    expect(audit.audit_id).toBeDefined();
    const trail = await getAuditTrail('DIS-001');
    expect(trail.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 7: Advance simulation time and verify event execution', async () => {
    const res = await advanceSimulationTime(3);
    expect(res.current_time).toBe(3);

    // Event EVT-001 (at time 2) should have executed: inventory_correction to usable_stock=250
    const inv = await getInventoryByComponent('COMP-104');
    expect(inv!.usable_stock).toBe(250);
    expect(inv!.days_of_coverage).toBe(2.78);
  });

  it('Step 8: Reset simulation and verify golden state is restored', async () => {
    await resetSimulation();
    const inv = await getInventoryByComponent('COMP-104');
    expect(inv!.usable_stock).toBe(390);
    expect(inv!.days_of_coverage).toBe(4.33);

    const state = await getSimulationState();
    expect(state.simulation_time).toBe(0);
  });
});
