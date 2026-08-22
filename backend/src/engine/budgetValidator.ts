// ==========================================
// Budget Validator
// ==========================================
// Deterministic financial rule enforcement. Do NOT use an LLM for this.

import type {
  ConstraintResult,
  ConstraintViolation,
  BudgetValidationInput,
} from './types.js';

const DEFAULT_AUTONOMOUS_BUDGET_LIMIT_USD = 150_000;

/**
 * Validate whether a recovery action's cost falls within the
 * autonomous execution budget, or requires human approval.
 *
 * Rules:
 *  - If cost <= $150,000: autonomous execution allowed.
 *  - If cost >  $150,000: execution BLOCKED; human approval required.
 *
 * The LLM MUST NOT make this determination.
 *
 * @param input - recoveryCostUSD and optional autonomousBudgetLimitUSD
 * @returns ConstraintResult with requiresHumanApproval flag
 */
export function validateBudget(input: BudgetValidationInput): ConstraintResult {
  const {
    recoveryCostUSD,
    autonomousBudgetLimitUSD = DEFAULT_AUTONOMOUS_BUDGET_LIMIT_USD,
  } = input;

  const violations: ConstraintViolation[] = [];
  const exceedsBudget = recoveryCostUSD > autonomousBudgetLimitUSD;

  if (exceedsBudget) {
    violations.push({
      rule: 'AUTONOMOUS_BUDGET',
      message: `Recovery cost ($${recoveryCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}) exceeds the autonomous execution limit ($${autonomousBudgetLimitUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}). Human approval is required.`,
      context: {
        recoveryCostUSD,
        autonomousBudgetLimitUSD,
        overageUSD: Math.round((recoveryCostUSD - autonomousBudgetLimitUSD) * 100) / 100,
      },
    });
  }

  return {
    allowed: !exceedsBudget,
    requiresHumanApproval: exceedsBudget,
    violations,
    metadata: {
      recoveryCostUSD,
      autonomousBudgetLimitUSD,
      exceedsBudget,
    },
  };
}
