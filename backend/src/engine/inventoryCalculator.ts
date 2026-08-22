// ==========================================
// Inventory Calculator
// ==========================================
// Pure deterministic functions. No I/O, no LLM.

import type {
  InventoryCoverageInput,
  InventoryCoverageResult,
} from './types.js';

const CRITICAL_COVERAGE_DAYS_THRESHOLD = 2.0;

/**
 * Calculate how many days of inventory coverage remain.
 *
 * @param input - currentStock and dailyBurnRate
 * @returns InventoryCoverageResult
 *
 * @example
 * calculateInventoryCoverage({ currentStock: 420, dailyBurnRate: 100 })
 * // -> { coverageDays: 4.2, isCritical: false, ... }
 */
export function calculateInventoryCoverage(
  input: InventoryCoverageInput
): InventoryCoverageResult {
  const { currentStock, dailyBurnRate } = input;

  if (dailyBurnRate <= 0) {
    // Avoid division by zero; if there's no consumption, coverage is infinite
    return {
      coverageDays: Infinity,
      isCritical: false,
      isBelow: false,
      dailyBurnRate,
      currentStock,
    };
  }

  if (currentStock <= 0) {
    return {
      coverageDays: 0,
      isCritical: true,
      isBelow: true,
      dailyBurnRate,
      currentStock,
    };
  }

  // Round to 1 decimal place for determinism
  const coverageDays = Math.round((currentStock / dailyBurnRate) * 10) / 10;
  const isCritical = coverageDays <= CRITICAL_COVERAGE_DAYS_THRESHOLD;
  const isBelow = currentStock < dailyBurnRate; // below one day's worth

  return {
    coverageDays,
    isCritical,
    isBelow,
    dailyBurnRate,
    currentStock,
  };
}

/**
 * Calculate units required to meet production within a deadline,
 * accounting for current inventory.
 *
 * @param requiredQuantity - total units the production order needs
 * @param currentStock - units currently on hand
 * @returns shortfallUnits (0 if no shortfall)
 */
export function calculateProductionShortfall(
  requiredQuantity: number,
  currentStock: number
): number {
  return Math.max(0, requiredQuantity - currentStock);
}

/**
 * Calculate estimated cost for a recovery procurement action.
 *
 * @param quantity - units to procure
 * @param unitPrice - price per unit in USD
 * @returns total cost in USD
 */
export function calculateProcurementCost(quantity: number, unitPrice: number): number {
  // Round to 2 decimal places for financial determinism
  return Math.round(quantity * unitPrice * 100) / 100;
}
