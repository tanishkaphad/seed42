import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSuppliers, SupplierCapabilityRecord } from '../src/sim/suppliers.js';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';

describe('Suppliers & Certification Constraints', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should list all suppliers for COMP-104', async () => {
    const suppliers = (await getSuppliers('COMP-104')) as SupplierCapabilityRecord[];
    expect(suppliers.length).toBe(4);

    const ids = suppliers.map((s) => s.supplier_id);
    expect(ids).toContain('SUP-21');
    expect(ids).toContain('SUP-42');
    expect(ids).toContain('SUP-37');
    expect(ids).toContain('SUP-18');
  });

  it('should verify that SUP-18 lacks Automotive-Grade certification', async () => {
    const suppliers = (await getSuppliers('COMP-104')) as SupplierCapabilityRecord[];
    const sup18 = suppliers.find((s) => s.supplier_id === 'SUP-18');
    expect(sup18).toBeDefined();
    expect(sup18!.certifications).toContain('ISO-9001');
    expect(sup18!.certifications).not.toContain('Automotive-Grade');
    expect(sup18!.has_required_certification).toBe(false);

    // Certified suppliers
    const sup21 = suppliers.find((s) => s.supplier_id === 'SUP-21');
    const sup42 = suppliers.find((s) => s.supplier_id === 'SUP-42');
    const sup37 = suppliers.find((s) => s.supplier_id === 'SUP-37');
    expect(sup21!.has_required_certification).toBe(true);
    expect(sup42!.has_required_certification).toBe(true);
    expect(sup37!.has_required_certification).toBe(true);
  });
});
