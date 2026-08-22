import { describe, it, expect } from 'vitest';
import { validateBudget } from '../src/engine/budgetValidator.js';

describe('budgetValidator — validateBudget()', () => {
  it('Test 3: allows autonomous execution when cost is exactly at the limit', () => {
    const result = validateBudget({ recoveryCostUSD: 150_000 });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('Test 3b: allows autonomous execution when cost is below the limit', () => {
    // SUP-37: 280 units × $145 = $40,600
    const result = validateBudget({ recoveryCostUSD: 40_600 });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('Test 4: blocks autonomous execution and requires human approval when cost exceeds limit', () => {
    // SUP-42: 300 units × $260 = $78,000 ... 200 more units needed elsewhere at high cost
    const result = validateBudget({ recoveryCostUSD: 175_000 });

    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe('AUTONOMOUS_BUDGET');
    expect(result.violations[0].message).toMatch(/exceeds the autonomous execution limit/);
  });

  it('uses a custom budget limit when supplied', () => {
    const result = validateBudget({
      recoveryCostUSD: 60_000,
      autonomousBudgetLimitUSD: 50_000,
    });
    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('reports the correct overage amount in violation context', () => {
    const result = validateBudget({ recoveryCostUSD: 200_000 });
    const violation = result.violations[0];
    expect(violation.context?.overageUSD).toBe(50_000);
  });

  it('is deterministic: same cost always produces same result', () => {
    const a = validateBudget({ recoveryCostUSD: 175_000 });
    const b = validateBudget({ recoveryCostUSD: 175_000 });
    expect(a).toEqual(b);
  });
});
