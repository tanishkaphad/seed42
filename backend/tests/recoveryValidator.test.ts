import { describe, it, expect } from 'vitest';
import { validateRecoveryPlan } from '../src/engine/recoveryValidator.js';
import type { RecoveryAction, SupplierInput } from '../src/engine/types.js';

// ---------- Supplier Fixtures ----------

const sup42: SupplierInput = {
  code: 'SUP-42',
  name: 'Rapid Components',
  iso9001Certified: true,
  availableCapacity: 300,
  reliabilityScore: 0.96,
  leadTimeDaysAvg: 1,
  unitPrice: 260.0,
};

const sup37: SupplierInput = {
  code: 'SUP-37',
  name: 'Certified Components Co',
  iso9001Certified: true,
  availableCapacity: 500,
  reliabilityScore: 0.91,
  leadTimeDaysAvg: 3,
  unitPrice: 145.0,
};

const sup18_uncertified: SupplierInput = {
  code: 'SUP-18',
  name: 'CheapParts Manufacturing',
  iso9001Certified: false, // BLOCKS the plan
  availableCapacity: 600,
  reliabilityScore: 0.88,
  leadTimeDaysAvg: 1,
  unitPrice: 85.0,
};

const sup21_slowAndEmpty: SupplierInput = {
  code: 'SUP-21',
  name: 'Global Components Ltd',
  iso9001Certified: true,
  availableCapacity: 0, // No stock
  reliabilityScore: 0.82,
  leadTimeDaysAvg: 5,
  unitPrice: 120.0,
};

// ---------- Scenario Constants ----------
// PROD-882: Needs 700 units of COMP-104 within 4 days
// Current stock: 420 units, 100/day burn rate -> 4.2 days coverage
const SCENARIO = {
  requiredQuantity: 700,
  deadlineDays: 4,
  currentInventory: 420,
  dailyBurnRate: 100,
};

// ---------- Tests ----------

describe('recoveryValidator — validateRecoveryPlan()', () => {
  it('Test 1: accepts a plan with a single certified supplier meeting all constraints', () => {
    // SUP-37: 280 units × $145 = $40,600 (within $150k budget, delivers in 3 days)
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup37',
        supplierCode: 'SUP-37',
        supplier: sup37,
        quantityOrdered: 280, // Exactly the shortfall
        unitPrice: 145.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.metadata?.totalCostUSD).toBe(40_600);
  });

  it('Test 2: rejects a plan using an uncertified supplier (ISO-9001)', () => {
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup18',
        supplierCode: 'SUP-18',
        supplier: sup18_uncertified,
        quantityOrdered: 280,
        unitPrice: 85.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations.some((v) => v.rule === 'ISO_9001')).toBe(true);
  });

  it('Test 4: escalates to human approval when plan cost exceeds $150,000', () => {
    // SUP-42: 700 units × $260 = $182,000 > $150,000 limit
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup42',
        supplierCode: 'SUP-42',
        supplier: { ...sup42, availableCapacity: 700 },
        quantityOrdered: 700,
        unitPrice: 260.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.violations.some((v) => v.rule === 'AUTONOMOUS_BUDGET')).toBe(true);
    expect(result.metadata?.totalCostUSD).toBe(182_000);
  });

  it('Test 5: rejects a plan where a supplier has zero available quantity', () => {
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup21',
        supplierCode: 'SUP-21',
        supplier: sup21_slowAndEmpty,
        quantityOrdered: 280,
        unitPrice: 120.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'INSUFFICIENT_CAPACITY')).toBe(true);
  });

  it('Test 6: accepts a multi-supplier plan when all constraints pass', () => {
    // SUP-42: 280 units × $260 = $72,800  (1-day lead time)
    // SUP-37: 420 units × $145 = $60,900  (3-day lead time)
    // Total:  700 units, $133,700 — within budget, all certified
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup42',
        supplierCode: 'SUP-42',
        supplier: sup42,
        quantityOrdered: 280,
        unitPrice: 260.0,
      },
      {
        supplierId: 'id-sup37',
        supplierCode: 'SUP-37',
        supplier: sup37,
        quantityOrdered: 420,
        unitPrice: 145.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.metadata?.totalQuantityOrdered).toBe(700);
    expect(result.metadata?.totalCostUSD).toBe(133_700);
  });

  it('rejects a plan where lead time exceeds the production deadline', () => {
    // SUP-21 normally delivers in 5 days; deadline is 4 days
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup21-fast',
        supplierCode: 'SUP-21',
        supplier: { ...sup21_slowAndEmpty, leadTimeDaysAvg: 5, availableCapacity: 280 },
        quantityOrdered: 280,
        unitPrice: 120.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'LEAD_TIME_DEADLINE')).toBe(true);
  });

  it('rejects a plan where total ordered quantity is less than required', () => {
    // currentInventory(420) + ordered(100) = 520 < requiredQuantity(700) => deficit of 180
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup37',
        supplierCode: 'SUP-37',
        supplier: sup37,
        quantityOrdered: 100, // Not enough: 420 + 100 = 520 < 700
        unitPrice: 145.0,
      },
    ];

    const result = validateRecoveryPlan({ ...SCENARIO, actions });

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'INSUFFICIENT_TOTAL_QUANTITY')).toBe(true);
  });

  it('is deterministic: same plan always produces same result', () => {
    const actions: RecoveryAction[] = [
      {
        supplierId: 'id-sup37',
        supplierCode: 'SUP-37',
        supplier: sup37,
        quantityOrdered: 280,
        unitPrice: 145.0,
      },
    ];

    const a = validateRecoveryPlan({ ...SCENARIO, actions });
    const b = validateRecoveryPlan({ ...SCENARIO, actions });
    expect(a).toEqual(b);
  });
});
