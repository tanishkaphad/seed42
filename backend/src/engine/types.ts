// ==========================================
// Constraint Engine - Shared Types
// ==========================================

export interface ConstraintViolation {
  rule: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ConstraintResult {
  allowed: boolean;
  requiresHumanApproval: boolean;
  violations: ConstraintViolation[];
  metadata?: Record<string, unknown>;
}

// ---- Inventory ----

export interface InventoryCoverageInput {
  currentStock: number;
  dailyBurnRate: number;
}

export interface InventoryCoverageResult {
  coverageDays: number;
  isCritical: boolean;
  isBelow: boolean; // below safety stock
  dailyBurnRate: number;
  currentStock: number;
}

// ---- Supplier Validation ----

export interface SupplierInput {
  code: string;
  name: string;
  iso9001Certified: boolean;
  availableCapacity: number;
  reliabilityScore: number;       // 0.0 to 1.0
  leadTimeDaysAvg: number;
  unitPrice: number;
}

export interface SupplierValidationInput {
  supplier: SupplierInput;
  requiredQuantity: number;
  minimumReliability?: number;    // default: 0.80
}

// ---- Budget Validation ----

export interface BudgetValidationInput {
  recoveryCostUSD: number;
  autonomousBudgetLimitUSD?: number;  // default: 150000
}

// ---- Recovery Plan Validation ----

export interface RecoveryAction {
  supplierId: string;
  supplierCode: string;
  supplier: SupplierInput;
  quantityOrdered: number;
  unitPrice: number;
}

export interface RecoveryPlanInput {
  actions: RecoveryAction[];
  requiredQuantity: number;
  deadlineDays: number;
  currentInventory: number;
  dailyBurnRate: number;
}
