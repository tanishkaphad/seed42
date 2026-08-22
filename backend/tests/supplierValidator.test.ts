import { describe, it, expect } from 'vitest';
import { validateSupplier } from '../src/engine/supplierValidator.js';
import type { SupplierInput } from '../src/engine/types.js';

// ---------- Fixtures ----------

const certifiedSupplier: SupplierInput = {
  code: 'SUP-37',
  name: 'Certified Components Co',
  iso9001Certified: true,
  availableCapacity: 500,
  reliabilityScore: 0.91,
  leadTimeDaysAvg: 3,
  unitPrice: 145.0,
};

const uncertifiedSupplier: SupplierInput = {
  code: 'SUP-18',
  name: 'CheapParts Manufacturing',
  iso9001Certified: false, // NON-COMPLIANT
  availableCapacity: 600,
  reliabilityScore: 0.88,
  leadTimeDaysAvg: 1,
  unitPrice: 85.0,
};

const zeroCapacitySupplier: SupplierInput = {
  code: 'SUP-21',
  name: 'Global Components Ltd',
  iso9001Certified: true,
  availableCapacity: 0, // Can't supply anything
  reliabilityScore: 0.82,
  leadTimeDaysAvg: 5,
  unitPrice: 120.0,
};

const lowReliabilitySupplier: SupplierInput = {
  code: 'SUP-99',
  name: 'Shaky Parts Corp',
  iso9001Certified: true,
  availableCapacity: 400,
  reliabilityScore: 0.65, // Below 0.80 threshold
  leadTimeDaysAvg: 2,
  unitPrice: 100.0,
};

// ---------- Tests ----------

describe('supplierValidator — validateSupplier()', () => {
  it('Test 1: accepts a certified, capable, reliable supplier', () => {
    const result = validateSupplier({
      supplier: certifiedSupplier,
      requiredQuantity: 280,
    });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('Test 2: rejects an uncertified supplier (missing ISO-9001)', () => {
    const result = validateSupplier({
      supplier: uncertifiedSupplier,
      requiredQuantity: 280,
    });

    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe('ISO_9001');
    expect(result.violations[0].message).toMatch(/ISO-9001 certification is required/);
  });

  it('Test 5: rejects a supplier with insufficient available quantity', () => {
    const result = validateSupplier({
      supplier: zeroCapacitySupplier,
      requiredQuantity: 280,
    });

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'INSUFFICIENT_CAPACITY')).toBe(true);
    expect(result.violations[0].context?.availableCapacity).toBe(0);
    expect(result.violations[0].context?.requiredQuantity).toBe(280);
  });

  it('rejects a supplier with a reliability score below minimum threshold', () => {
    const result = validateSupplier({
      supplier: lowReliabilitySupplier,
      requiredQuantity: 100,
    });

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'RELIABILITY_THRESHOLD')).toBe(true);
  });

  it('accumulates multiple violations when supplier fails several rules', () => {
    // Uncertified AND zero capacity
    const badSupplier: SupplierInput = {
      ...uncertifiedSupplier,
      availableCapacity: 0,
    };
    const result = validateSupplier({ supplier: badSupplier, requiredQuantity: 200 });

    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    const ruleNames = result.violations.map((v) => v.rule);
    expect(ruleNames).toContain('ISO_9001');
    expect(ruleNames).toContain('INSUFFICIENT_CAPACITY');
  });

  it('is deterministic: same supplier always gets same result', () => {
    const a = validateSupplier({ supplier: uncertifiedSupplier, requiredQuantity: 280 });
    const b = validateSupplier({ supplier: uncertifiedSupplier, requiredQuantity: 280 });
    expect(a).toEqual(b);
  });
});
