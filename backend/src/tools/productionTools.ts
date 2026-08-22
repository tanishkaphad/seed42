// ==========================================
// Production Tools
// ==========================================
// Read production order state and update production risk status.

import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { calculateInventoryCoverage, calculateProductionShortfall } from '../engine/constraintEngine.js';

// ---- Schemas ----

export const CheckProductionScheduleInputSchema = z.object({
  componentId: z.string().min(1, 'componentId (SKU) is required'),
});
export type CheckProductionScheduleInput = z.infer<typeof CheckProductionScheduleInputSchema>;

export const ProductionRiskLevel = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type ProductionRiskLevel = z.infer<typeof ProductionRiskLevel>;

export const ProductionOrderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  productName: z.string(),
  targetQuantity: z.number(),
  completedQuantity: z.number(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string(),
  daysUntilDue: z.number(),
  affectedByDisruption: z.boolean(),
});

export const CheckProductionScheduleOutputSchema = z.object({
  found: z.boolean(),
  componentSku: z.string(),
  currentStock: z.number(),
  daysOfCoverage: z.number(),
  productionOrders: z.array(ProductionOrderSummarySchema),
  totalRequiredQuantity: z.number(),
  shortfallUnits: z.number(),
  deadlineDays: z.number().nullable(),
  riskLevel: ProductionRiskLevel,
  riskReason: z.string().nullable(),
});
export type CheckProductionScheduleOutput = z.infer<typeof CheckProductionScheduleOutputSchema>;

/**
 * checkProductionSchedule
 *
 * Returns all production orders that depend on the given component,
 * plus a computed risk assessment based on inventory coverage vs deadline.
 */
export async function checkProductionSchedule(
  input: CheckProductionScheduleInput
): Promise<CheckProductionScheduleOutput> {
  CheckProductionScheduleInputSchema.parse(input);

  const inventory = await prisma.inventory.findFirst({
    where: { OR: [{ id: input.componentId }, { sku: input.componentId }] },
  });

  if (!inventory) {
    return {
      found: false,
      componentSku: input.componentId,
      currentStock: 0,
      daysOfCoverage: 0,
      productionOrders: [],
      totalRequiredQuantity: 0,
      shortfallUnits: 0,
      deadlineDays: null,
      riskLevel: 'NONE',
      riskReason: 'Component not found in inventory database.',
    };
  }

  // Find all production orders that include this component in their BOM
  const allOrders = await prisma.productionOrder.findMany({
    where: { status: { not: 'COMPLETED' } },
    orderBy: { dueDate: 'asc' },
  });

  // Filter to those that reference the component SKU in billOfMaterials
  const now = new Date();
  const relatedOrders = allOrders.filter((o) => {
    const bom = Array.isArray(o.billOfMaterials) ? o.billOfMaterials : [];
    return bom.some(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        (item as Record<string, unknown>)['sku'] === inventory.sku
    );
  });

  const totalRequired = relatedOrders.reduce((sum, o) => sum + o.targetQuantity, 0);
  const shortfall = calculateProductionShortfall(totalRequired, inventory.currentStock);

  const coverage = calculateInventoryCoverage({
    currentStock: inventory.currentStock,
    dailyBurnRate: inventory.dailyBurnRate,
  });
  const coverageDays = coverage.coverageDays === Infinity ? 999 : coverage.coverageDays;

  // Compute deadline as the earliest due date across related orders
  const earliestDue = relatedOrders.length > 0 ? relatedOrders[0].dueDate : null;
  const deadlineDays = earliestDue
    ? Math.max(0, Math.round(((earliestDue.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) * 10) / 10)
    : null;

  // Risk assessment (deterministic)
  let riskLevel: ProductionRiskLevel = 'NONE';
  let riskReason: string | null = null;

  if (shortfall > 0 && deadlineDays !== null) {
    if (deadlineDays <= 1 || coverageDays < 1) {
      riskLevel = 'CRITICAL';
      riskReason = `Factory line stoppage imminent. Shortfall of ${shortfall} units with only ${coverageDays} days of coverage and ${deadlineDays} day(s) until deadline.`;
    } else if (deadlineDays <= 3 || coverageDays < 2) {
      riskLevel = 'HIGH';
      riskReason = `Shortfall of ${shortfall} units. Deadline in ${deadlineDays} days with ${coverageDays} days coverage.`;
    } else if (deadlineDays <= 7) {
      riskLevel = 'MEDIUM';
      riskReason = `Shortfall of ${shortfall} units within the next week.`;
    } else {
      riskLevel = 'LOW';
      riskReason = `Shortfall of ${shortfall} units detected, but deadline is more than 7 days away.`;
    }
  }

  const orderSummaries = relatedOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    productName: o.productName,
    targetQuantity: o.targetQuantity,
    completedQuantity: o.completedQuantity,
    status: o.status,
    priority: o.priority,
    dueDate: o.dueDate.toISOString(),
    daysUntilDue:
      Math.max(0, Math.round(((o.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) * 10) / 10),
    affectedByDisruption: o.affectedByDisruption,
  }));

  return CheckProductionScheduleOutputSchema.parse({
    found: true,
    componentSku: inventory.sku,
    currentStock: inventory.currentStock,
    daysOfCoverage: coverageDays,
    productionOrders: orderSummaries,
    totalRequiredQuantity: totalRequired,
    shortfallUnits: shortfall,
    deadlineDays,
    riskLevel,
    riskReason,
  });
}

// ---- updateProductionRisk ----

export const UpdateProductionRiskInputSchema = z.object({
  productionOrderId: z.string().min(1),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']),
  affectedByDisruption: z.boolean().optional(),
});
export type UpdateProductionRiskInput = z.infer<typeof UpdateProductionRiskInputSchema>;

export const UpdateProductionRiskOutputSchema = z.object({
  success: z.boolean(),
  orderNumber: z.string().nullable(),
  previousStatus: z.string().nullable(),
  newStatus: z.string(),
  message: z.string(),
});
export type UpdateProductionRiskOutput = z.infer<typeof UpdateProductionRiskOutputSchema>;

/**
 * updateProductionRisk
 *
 * Updates the status and disruption flag on a production order.
 * This simulates the ERP production status update.
 */
export async function updateProductionRisk(
  input: UpdateProductionRiskInput
): Promise<UpdateProductionRiskOutput> {
  UpdateProductionRiskInputSchema.parse(input);

  const existing = await prisma.productionOrder.findFirst({
    where: { OR: [{ id: input.productionOrderId }, { orderNumber: input.productionOrderId }] },
  });

  if (!existing) {
    return {
      success: false,
      orderNumber: null,
      previousStatus: null,
      newStatus: input.status,
      message: `Production order "${input.productionOrderId}" not found.`,
    };
  }

  const updated = await prisma.productionOrder.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      ...(input.affectedByDisruption !== undefined && {
        affectedByDisruption: input.affectedByDisruption,
      }),
    },
  });

  return UpdateProductionRiskOutputSchema.parse({
    success: true,
    orderNumber: updated.orderNumber,
    previousStatus: existing.status,
    newStatus: updated.status,
    message: `Production order ${updated.orderNumber} updated from ${existing.status} to ${updated.status}.`,
  });
}
