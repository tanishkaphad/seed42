import { describe, it, expect } from 'vitest';
import {
  calculateInventoryCoverage,
  calculateProductionShortfall,
  calculateProcurementCost,
} from '../src/engine/inventoryCalculator.js';

describe('inventoryCalculator', () => {
  describe('calculateInventoryCoverage', () => {
    it('calculates correct coverage days for typical scenario', () => {
      const result = calculateInventoryCoverage({ currentStock: 420, dailyBurnRate: 100 });
      expect(result.coverageDays).toBe(4.2);
      expect(result.isCritical).toBe(false);
      expect(result.isBelow).toBe(false);
    });

    it('returns zero coverage when stock is empty', () => {
      const result = calculateInventoryCoverage({ currentStock: 0, dailyBurnRate: 100 });
      expect(result.coverageDays).toBe(0);
      expect(result.isCritical).toBe(true);
      expect(result.isBelow).toBe(true);
    });

    it('returns Infinity coverage when burn rate is zero', () => {
      const result = calculateInventoryCoverage({ currentStock: 500, dailyBurnRate: 0 });
      expect(result.coverageDays).toBe(Infinity);
      expect(result.isCritical).toBe(false);
    });

    it('marks coverage as critical when below 2 days', () => {
      const result = calculateInventoryCoverage({ currentStock: 150, dailyBurnRate: 100 });
      expect(result.coverageDays).toBe(1.5);
      expect(result.isCritical).toBe(true);
    });

    it('is deterministic: same input always produces same output', () => {
      const a = calculateInventoryCoverage({ currentStock: 420, dailyBurnRate: 100 });
      const b = calculateInventoryCoverage({ currentStock: 420, dailyBurnRate: 100 });
      expect(a).toEqual(b);
    });
  });

  describe('calculateProductionShortfall', () => {
    it('returns correct shortfall when stock is insufficient', () => {
      expect(calculateProductionShortfall(700, 420)).toBe(280);
    });

    it('returns 0 when stock meets or exceeds required quantity', () => {
      expect(calculateProductionShortfall(700, 700)).toBe(0);
      expect(calculateProductionShortfall(700, 800)).toBe(0);
    });
  });

  describe('calculateProcurementCost', () => {
    it('calculates total cost correctly', () => {
      expect(calculateProcurementCost(300, 260)).toBe(78000.0);
    });

    it('rounds floating point correctly', () => {
      // 7 * 11.11 = 77.77 (exact)
      expect(calculateProcurementCost(7, 11.11)).toBe(77.77);
    });
  });
});
