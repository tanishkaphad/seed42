// ==========================================
// Constraint Engine — Public API
// ==========================================
// The single entry-point for all rule enforcement.
// Import this in agent nodes and routes. NEVER bypass it.

export {
  calculateInventoryCoverage,
  calculateProductionShortfall,
  calculateProcurementCost,
} from './inventoryCalculator.js';

export { validateSupplier } from './supplierValidator.js';
export { validateBudget } from './budgetValidator.js';
export { validateRecoveryPlan } from './recoveryValidator.js';

export type {
  ConstraintViolation,
  ConstraintResult,
  InventoryCoverageInput,
  InventoryCoverageResult,
  SupplierInput,
  SupplierValidationInput,
  BudgetValidationInput,
  RecoveryAction,
  RecoveryPlanInput,
} from './types.js';
