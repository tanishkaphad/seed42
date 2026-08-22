// ==========================================
// Recovery Plan Validator
// ==========================================
// Validates a complete recovery plan against all constraints.
// The LLM may propose a plan; this engine decides if it is allowed.

import type {
  ConstraintResult,
  ConstraintViolation,
  RecoveryPlanInput,
  RecoveryAction,
} from './types.js';
import { validateSupplier } from './supplierValidator.js';
import { validateBudget } from './budgetValidator.js';
import { calculateInventoryCoverage, calculateProcurementCost } from './inventoryCalculator.js';

/**
 * Validate a complete recovery plan composed of one or more procurement actions.
 *
 * Checks (all deterministic, no LLM):
 *  1. Each supplier: ISO-9001 certification.
 *  2. Each supplier: available capacity >= ordered quantity.
 *  3. Each supplier: reliability score >= minimum threshold.
 *  4. Each supplier: lead time must not exceed the production deadline.
 *  5. Total quantity procured must meet the required production quantity.
 *  6. Total cost is calculated deterministically and checked against budget.
 *  7. Effective inventory coverage (existing stock + incoming delivery)
 *     must reach the production deadline before stock runs out.
 *
 * @param input - Recovery plan actions, production requirements, and inventory state
 * @returns ConstraintResult - full verdict with structured violations
 */
export function validateRecoveryPlan(input: RecoveryPlanInput): ConstraintResult {
  const {
    actions,
    requiredQuantity,
    deadlineDays,
    currentInventory,
    dailyBurnRate,
  } = input;

  const violations: ConstraintViolation[] = [];

  // ---- Step 1: Validate each supplier action ----
  let totalQuantityOrdered = 0;
  let totalCostUSD = 0;

  for (const action of actions) {
    // Per-supplier validation
    const supplierResult = validateSupplier({
      supplier: action.supplier,
      requiredQuantity: action.quantityOrdered,
    });

    if (!supplierResult.allowed) {
      violations.push(...supplierResult.violations);
    }

    // Lead time constraint: must deliver before the production deadline
    if (action.supplier.leadTimeDaysAvg > deadlineDays) {
      violations.push({
        rule: 'LEAD_TIME_DEADLINE',
        message: `Supplier ${action.supplierCode} lead time (${action.supplier.leadTimeDaysAvg} days) exceeds the production deadline (${deadlineDays} days).`,
        context: {
          supplierCode: action.supplierCode,
          leadTimeDays: action.supplier.leadTimeDaysAvg,
          deadlineDays,
        },
      });
    }

    const actionCost = calculateProcurementCost(action.quantityOrdered, action.unitPrice);
    totalQuantityOrdered += action.quantityOrdered;
    totalCostUSD += actionCost;
  }

  // Round total cost to 2 decimal places to avoid floating-point drift
  totalCostUSD = Math.round(totalCostUSD * 100) / 100;

  // ---- Step 2: Total quantity coverage ----
  // Available supply = current stock on hand + total incoming ordered quantity.
  // This must be >= required production quantity.
  const totalAvailableSupply = currentInventory + totalQuantityOrdered;
  if (totalAvailableSupply < requiredQuantity) {
    violations.push({
      rule: 'INSUFFICIENT_TOTAL_QUANTITY',
      message: `Total available supply (stock ${currentInventory} + ordered ${totalQuantityOrdered} = ${totalAvailableSupply}) does not meet the production requirement (${requiredQuantity}). Remaining deficit: ${requiredQuantity - totalAvailableSupply} units.`,
      context: {
        currentInventory,
        totalQuantityOrdered,
        totalAvailableSupply,
        requiredQuantity,
        deficit: requiredQuantity - totalAvailableSupply,
      },
    });
  }

  // ---- Step 3: Inventory coverage until earliest delivery ----
  //
  // We check that current stock can sustain operations until the fastest
  // delivery arrives. We use the minimum lead time across all actions.
  if (actions.length > 0) {
    const fastestLeadTime = Math.min(...actions.map((a: RecoveryAction) => a.supplier.leadTimeDaysAvg));
    const coverageResult = calculateInventoryCoverage({ currentStock: currentInventory, dailyBurnRate });

    if (
      coverageResult.coverageDays !== Infinity &&
      coverageResult.coverageDays < fastestLeadTime
    ) {
      violations.push({
        rule: 'COVERAGE_BRIDGE_FAILURE',
        message: `Current inventory (${currentInventory} units, ${coverageResult.coverageDays} days coverage) will be exhausted before the fastest supplier delivery arrives in ${fastestLeadTime} day(s).`,
        context: {
          currentInventory,
          coverageDays: coverageResult.coverageDays,
          fastestLeadTimeDays: fastestLeadTime,
          gapDays: Math.round((fastestLeadTime - coverageResult.coverageDays) * 10) / 10,
        },
      });
    }
  }

  // ---- Step 4: Budget validation ----
  const budgetResult = validateBudget({ recoveryCostUSD: totalCostUSD });
  if (!budgetResult.allowed) {
    violations.push(...budgetResult.violations);
  }

  // ---- Determine final verdict ----
  const hardViolations = violations.filter((v) => v.rule !== 'AUTONOMOUS_BUDGET');
  const budgetViolations = violations.filter((v) => v.rule === 'AUTONOMOUS_BUDGET');

  const hasHardBlocks = hardViolations.length > 0;
  const requiresHumanApproval = budgetViolations.length > 0;

  const allowed = !hasHardBlocks && !requiresHumanApproval;

  return {
    allowed,
    requiresHumanApproval: !hasHardBlocks && requiresHumanApproval,
    violations,
    metadata: {
      totalQuantityOrdered,
      requiredQuantity,
      totalCostUSD,
      deadlineDays,
      currentInventory,
      dailyBurnRate,
      actionCount: actions.length,
    },
  };
}
