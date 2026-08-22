// ==========================================
// Supplier Validator
// ==========================================
// Deterministic rule enforcement. No LLM involved.

import type {
  ConstraintResult,
  ConstraintViolation,
  SupplierValidationInput,
} from './types.js';

const DEFAULT_MINIMUM_RELIABILITY = 0.80;

/**
 * Validate whether a supplier is eligible to be used in a recovery plan.
 *
 * Rules enforced (in order):
 *  1. ISO-9001 certification MUST be present (mandatory, non-negotiable).
 *  2. Supplier must have enough available capacity to cover required quantity.
 *  3. Supplier reliability score must meet the minimum threshold.
 *
 * The LLM MUST NOT make this determination.
 *
 * @param input - supplier data and context
 * @returns ConstraintResult - allowed/blocked with structured violations
 */
export function validateSupplier(input: SupplierValidationInput): ConstraintResult {
  const {
    supplier,
    requiredQuantity,
    minimumReliability = DEFAULT_MINIMUM_RELIABILITY,
  } = input;

  const violations: ConstraintViolation[] = [];

  // Rule 1: ISO-9001 Certification (Mandatory)
  if (!supplier.iso9001Certified) {
    violations.push({
      rule: 'ISO_9001',
      message: 'ISO-9001 certification is required. This supplier is not certified.',
      context: {
        supplierCode: supplier.code,
        supplierName: supplier.name,
        certified: false,
      },
    });
  }

  // Rule 2: Sufficient Available Inventory Capacity
  if (supplier.availableCapacity < requiredQuantity) {
    violations.push({
      rule: 'INSUFFICIENT_CAPACITY',
      message: `Supplier does not have sufficient available inventory. Required: ${requiredQuantity}, Available: ${supplier.availableCapacity}.`,
      context: {
        supplierCode: supplier.code,
        requiredQuantity,
        availableCapacity: supplier.availableCapacity,
        shortage: requiredQuantity - supplier.availableCapacity,
      },
    });
  }

  // Rule 3: Minimum Reliability Score
  if (supplier.reliabilityScore < minimumReliability) {
    violations.push({
      rule: 'RELIABILITY_THRESHOLD',
      message: `Supplier reliability score (${supplier.reliabilityScore.toFixed(2)}) is below the minimum required threshold (${minimumReliability.toFixed(2)}).`,
      context: {
        supplierCode: supplier.code,
        reliabilityScore: supplier.reliabilityScore,
        minimumReliability,
      },
    });
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    requiresHumanApproval: false, // Supplier violations are hard blocks, not approval gates
    violations,
    metadata: {
      supplierCode: supplier.code,
      supplierName: supplier.name,
      iso9001Certified: supplier.iso9001Certified,
      availableCapacity: supplier.availableCapacity,
      reliabilityScore: supplier.reliabilityScore,
      requiredQuantity,
      minimumReliability,
    },
  };
}
