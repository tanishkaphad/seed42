import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getInventoryByComponent, calculateDaysOfCoverage, updateUsableInventory } from '../src/sim/inventory.js';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';

describe('Inventory & Coverage Calculations', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should verify COMP-104 initial stock and coverage calculation', async () => {
    const inv = await getInventoryByComponent('COMP-104');
    expect(inv).not.toBeNull();
    expect(inv!.current_stock).toBe(420);
    expect(inv!.usable_stock).toBe(390);
    expect(inv!.daily_usage).toBe(90);
    expect(inv!.safety_stock).toBe(150);

    // 390 / 90 = 4.333... -> 4.33
    expect(inv!.days_of_coverage).toBeCloseTo(4.33, 2);
  });

  it('should correctly calculate days of coverage', () => {
    expect(calculateDaysOfCoverage(390, 90)).toBe(4.33);
    expect(calculateDaysOfCoverage(250, 90)).toBe(2.78);
    expect(calculateDaysOfCoverage(0, 90)).toBe(0);
    expect(calculateDaysOfCoverage(100, 0)).toBe(9999);
  });

  it('should prevent setting negative stock', async () => {
    await expect(updateUsableInventory('COMP-104', -50)).rejects.toThrow('Usable stock cannot be negative');
  });
});
