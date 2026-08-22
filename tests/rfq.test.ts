import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRfq, getRfqQuotes } from '../src/sim/rfq.js';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';

describe('RFQ & Multi-Supplier Quote Generation', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should generate multiple supplier quotes when creating an RFQ for COMP-104', async () => {
    const res = await createRfq({
      component_id: 'COMP-104',
      requested_quantity: 600,
      required_delivery_date: '2026-09-06T00:00:00Z',
    });

    expect(res.rfq).toBeDefined();
    expect(res.rfq.requested_quantity).toBe(600);
    expect(res.quotes.length).toBeGreaterThanOrEqual(4);

    const suppliers = res.quotes.map((q) => q.supplier_id);
    expect(suppliers).toContain('SUP-21');
    expect(suppliers).toContain('SUP-42');
    expect(suppliers).toContain('SUP-37');
    expect(suppliers).toContain('SUP-18');

    // SUP-42 expedited fee verification
    const sup42 = res.quotes.find((q) => q.supplier_id === 'SUP-42');
    expect(sup42!.expedite_available).toBe(true);
    expect(sup42!.expedite_fee).toBe(12000);
    expect(sup42!.total_standard_cost).toBe(600 * 132);
    expect(sup42!.total_expedited_cost).toBe(600 * 132 + 12000);
  });
});
