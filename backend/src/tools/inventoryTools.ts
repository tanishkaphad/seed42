// ==========================================
// Inventory Tools
// ==========================================
// All DB access is simulated — no real ERP.
// Each tool reads from the Prisma-backed PostgreSQL database.

import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { calculateInventoryCoverage, calculateProductionShortfall } from '../engine/constraintEngine.js';

// ---- Schemas ----

export const CheckInventoryInputSchema = z.object({
  componentId: z.string().min(1, 'componentId is required'),
});
export type CheckInventoryInput = z.infer<typeof CheckInventoryInputSchema>;

export const CheckInventoryOutputSchema = z.object({
  found: z.boolean(),
  component: z
    .object({
      id: z.string(),
      sku: z.string(),
      name: z.string(),
      category: z.string(),
      location: z.string(),
      status: z.string(),
    })
    .nullable(),
  quantity: z.number(),
  dailyBurnRate: z.number(),
  daysOfCoverage: z.number(),
  safetyStock: z.number(),
  reorderPoint: z.number(),
  isBelowSafetyStock: z.boolean(),
  isCritical: z.boolean(),
  productionShortfall: z.number().optional(),
});
export type CheckInventoryOutput = z.infer<typeof CheckInventoryOutputSchema>;

// ---- Tool ----

/**
 * checkInventory
 *
 * Retrieves the current stock, burn rate, and computed coverage days
 * for a component identified by its SKU (e.g. "COMP-104").
 */
export async function checkInventory(
  input: CheckInventoryInput
): Promise<CheckInventoryOutput> {
  CheckInventoryInputSchema.parse(input);

  const item = await prisma.inventory.findFirst({
    where: {
      OR: [{ id: input.componentId }, { sku: input.componentId }],
    },
  });

  if (!item) {
    return {
      found: false,
      component: null,
      quantity: 0,
      dailyBurnRate: 0,
      daysOfCoverage: 0,
      safetyStock: 0,
      reorderPoint: 0,
      isBelowSafetyStock: false,
      isCritical: false,
    };
  }

  const coverage = calculateInventoryCoverage({
    currentStock: item.currentStock,
    dailyBurnRate: item.dailyBurnRate,
  });

  return CheckInventoryOutputSchema.parse({
    found: true,
    component: {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      location: item.location,
      status: item.status,
    },
    quantity: item.currentStock,
    dailyBurnRate: item.dailyBurnRate,
    daysOfCoverage: coverage.coverageDays === Infinity ? 999 : coverage.coverageDays,
    safetyStock: item.safetyStock,
    reorderPoint: item.reorderPoint,
    isBelowSafetyStock: item.currentStock < item.safetyStock,
    isCritical: coverage.isCritical,
  });
}
