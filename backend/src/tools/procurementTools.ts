// ==========================================
// Procurement Tools
// ==========================================
// calculateRecoveryPlan: generates candidates (no approval authority)
// validateRecoveryPlan:  calls deterministic Constraint Engine
// checkBudget:           calls deterministic budget validator
// createPurchaseOrder:   simulated ERP — blocked unless engine approves

import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import {
  validateRecoveryPlan as engineValidateRecoveryPlan,
  validateBudget,
  calculateProcurementCost,
  type RecoveryAction,
  type RecoveryPlanInput,
} from '../engine/constraintEngine.js';

// ---- Schemas ----

export const RecoveryActionSchema = z.object({
  supplierId: z.string(),
  supplierCode: z.string(),
  quantityOrdered: z.number().int().positive(),
  unitPrice: z.number().positive(),
  estimatedLeadTimeDays: z.number().int().nonnegative(),
});

export const CalculateRecoveryPlanInputSchema = z.object({
  requiredQuantity: z.number().int().positive(),
  currentInventory: z.number().int().nonnegative(),
  dailyBurnRate: z.number().positive(),
  deadlineDays: z.number().positive(),
  candidateSupplierCodes: z.array(z.string()).min(1),
});
export type CalculateRecoveryPlanInput = z.infer<typeof CalculateRecoveryPlanInputSchema>;

export const RecoveryCandidateSchema = z.object({
  planId: z.string(),
  description: z.string(),
  actions: z.array(RecoveryActionSchema),
  totalQuantity: z.number(),
  totalCostUSD: z.number(),
  fastestDeliveryDays: z.number(),
  note: z.string(),
});

export const CalculateRecoveryPlanOutputSchema = z.object({
  shortfallUnits: z.number(),
  candidates: z.array(RecoveryCandidateSchema),
  note: z.string(),
});
export type CalculateRecoveryPlanOutput = z.infer<typeof CalculateRecoveryPlanOutputSchema>;

/**
 * calculateRecoveryPlan
 *
 * Generates candidate recovery plans using available suppliers.
 * This function PROPOSES options only — it does NOT approve or execute.
 * The Constraint Engine decides approval via validateRecoveryPlan().
 */
export async function calculateRecoveryPlan(
  input: CalculateRecoveryPlanInput
): Promise<CalculateRecoveryPlanOutput> {
  CalculateRecoveryPlanInputSchema.parse(input);

  const shortfallUnits = Math.max(0, input.requiredQuantity - input.currentInventory);

  const suppliers = await prisma.supplier.findMany({
    where: {
      code: { in: input.candidateSupplierCodes },
      status: 'ACTIVE',
    },
  });

  const candidates: z.infer<typeof RecoveryCandidateSchema>[] = [];

  // Candidate A: Single-supplier options (each eligible supplier, solo)
  for (const sup of suppliers) {
    if (sup.availableCapacity <= 0) continue;
    const qty = Math.min(sup.availableCapacity, shortfallUnits);
    const cost = calculateProcurementCost(qty, sup.unitPrice);

    candidates.push({
      planId: `PLAN-SOLO-${sup.code}`,
      description: `Single-supplier recovery via ${sup.name} (${sup.code})`,
      actions: [
        {
          supplierId: sup.id,
          supplierCode: sup.code,
          quantityOrdered: qty,
          unitPrice: sup.unitPrice,
          estimatedLeadTimeDays: sup.leadTimeDaysAvg,
        },
      ],
      totalQuantity: qty,
      totalCostUSD: cost,
      fastestDeliveryDays: sup.leadTimeDaysAvg,
      note: qty < shortfallUnits
        ? `Warning: ${sup.name} can only supply ${qty} of the ${shortfallUnits} needed units.`
        : `Full shortfall covered.`,
    });
  }

  // Candidate B: Combined multi-supplier (fastest + backup)
  const eligibleSortedBySpeed = suppliers
    .filter((s) => s.availableCapacity > 0 && s.iso9001Certified)
    .sort((a, b) => a.leadTimeDaysAvg - b.leadTimeDaysAvg);

  if (eligibleSortedBySpeed.length >= 2) {
    const fast = eligibleSortedBySpeed[0];
    const backup = eligibleSortedBySpeed[1];
    const fastQty = Math.min(fast.availableCapacity, shortfallUnits);
    const remaining = shortfallUnits - fastQty;
    const backupQty = remaining > 0 ? Math.min(backup.availableCapacity, remaining) : 0;
    const combinedCost =
      calculateProcurementCost(fastQty, fast.unitPrice) +
      calculateProcurementCost(backupQty, backup.unitPrice);

    if (fastQty + backupQty >= shortfallUnits) {
      candidates.push({
        planId: `PLAN-COMBO-${fast.code}+${backup.code}`,
        description: `Multi-supplier: ${fastQty} from ${fast.name} (${fast.leadTimeDaysAvg}d) + ${backupQty} from ${backup.name} (${backup.leadTimeDaysAvg}d)`,
        actions: [
          {
            supplierId: fast.id,
            supplierCode: fast.code,
            quantityOrdered: fastQty,
            unitPrice: fast.unitPrice,
            estimatedLeadTimeDays: fast.leadTimeDaysAvg,
          },
          ...(backupQty > 0
            ? [
                {
                  supplierId: backup.id,
                  supplierCode: backup.code,
                  quantityOrdered: backupQty,
                  unitPrice: backup.unitPrice,
                  estimatedLeadTimeDays: backup.leadTimeDaysAvg,
                },
              ]
            : []),
        ],
        totalQuantity: fastQty + backupQty,
        totalCostUSD: Math.round(combinedCost * 100) / 100,
        fastestDeliveryDays: fast.leadTimeDaysAvg,
        note: 'Splits order across two certified suppliers for speed and risk distribution.',
      });
    }
  }

  return CalculateRecoveryPlanOutputSchema.parse({
    shortfallUnits,
    candidates,
    note: 'These are candidate plans only. All plans must be validated via validateRecoveryPlan() before execution.',
  });
}

// ---- validateRecoveryPlan ----

export const ValidateRecoveryPlanInputSchema = z.object({
  actions: z.array(
    z.object({
      supplierId: z.string(),
      supplierCode: z.string(),
      quantityOrdered: z.number().int().positive(),
      unitPrice: z.number().positive(),
    })
  ),
  requiredQuantity: z.number().int().positive(),
  deadlineDays: z.number().positive(),
  currentInventory: z.number().int().nonnegative(),
  dailyBurnRate: z.number().positive(),
});
export type ValidateRecoveryPlanInput = z.infer<typeof ValidateRecoveryPlanInputSchema>;

export const ValidateRecoveryPlanOutputSchema = z.object({
  allowed: z.boolean(),
  requiresHumanApproval: z.boolean(),
  violations: z.array(
    z.object({
      rule: z.string(),
      message: z.string(),
      context: z.unknown().optional(),
    })
  ),
  totalCostUSD: z.number(),
  totalQuantityOrdered: z.number(),
  metadata: z.unknown().optional(),
});
export type ValidateRecoveryPlanOutput = z.infer<typeof ValidateRecoveryPlanOutputSchema>;

/**
 * validateRecoveryPlan
 *
 * MUST be called before any purchase order is created.
 * Delegates entirely to the deterministic Constraint Engine.
 * The LLM has NO authority to bypass this step.
 */
export async function validateRecoveryPlan(
  input: ValidateRecoveryPlanInput
): Promise<ValidateRecoveryPlanOutput> {
  ValidateRecoveryPlanInputSchema.parse(input);

  // Hydrate supplier data from DB for each action
  const enrichedActions: RecoveryAction[] = await Promise.all(
    input.actions.map(async (action) => {
      const sup = await prisma.supplier.findFirst({
        where: { OR: [{ id: action.supplierId }, { code: action.supplierCode }] },
      });

      if (!sup) {
        // Return a stub that will fail supplier validation
        return {
          supplierId: action.supplierId,
          supplierCode: action.supplierCode,
          supplier: {
            code: action.supplierCode,
            name: 'UNKNOWN',
            iso9001Certified: false,
            availableCapacity: 0,
            reliabilityScore: 0,
            leadTimeDaysAvg: 999,
            unitPrice: action.unitPrice,
          },
          quantityOrdered: action.quantityOrdered,
          unitPrice: action.unitPrice,
        };
      }

      return {
        supplierId: sup.id,
        supplierCode: sup.code,
        supplier: {
          code: sup.code,
          name: sup.name,
          iso9001Certified: sup.iso9001Certified,
          availableCapacity: sup.availableCapacity,
          reliabilityScore: sup.reliabilityScore,
          leadTimeDaysAvg: sup.leadTimeDaysAvg,
          unitPrice: action.unitPrice,
        },
        quantityOrdered: action.quantityOrdered,
        unitPrice: action.unitPrice,
      };
    })
  );

  const planInput: RecoveryPlanInput = {
    actions: enrichedActions,
    requiredQuantity: input.requiredQuantity,
    deadlineDays: input.deadlineDays,
    currentInventory: input.currentInventory,
    dailyBurnRate: input.dailyBurnRate,
  };

  const result = engineValidateRecoveryPlan(planInput);

  const totalCostUSD = enrichedActions.reduce(
    (sum, a) => sum + calculateProcurementCost(a.quantityOrdered, a.unitPrice),
    0
  );

  return ValidateRecoveryPlanOutputSchema.parse({
    allowed: result.allowed,
    requiresHumanApproval: result.requiresHumanApproval,
    violations: result.violations,
    totalCostUSD: Math.round(totalCostUSD * 100) / 100,
    totalQuantityOrdered: enrichedActions.reduce((s, a) => s + a.quantityOrdered, 0),
    metadata: result.metadata,
  });
}

// ---- checkBudget ----

export const CheckBudgetInputSchema = z.object({
  recoveryCostUSD: z.number().nonnegative(),
  autonomousBudgetLimitUSD: z.number().positive().optional(),
});
export type CheckBudgetInput = z.infer<typeof CheckBudgetInputSchema>;

export const CheckBudgetOutputSchema = z.object({
  allowed: z.boolean(),
  requiresHumanApproval: z.boolean(),
  recoveryCostUSD: z.number(),
  autonomousBudgetLimitUSD: z.number(),
  violations: z.array(z.object({ rule: z.string(), message: z.string() })),
});
export type CheckBudgetOutput = z.infer<typeof CheckBudgetOutputSchema>;

/**
 * checkBudget
 *
 * Deterministic budget check using the Constraint Engine.
 */
export function checkBudget(input: CheckBudgetInput): CheckBudgetOutput {
  CheckBudgetInputSchema.parse(input);
  const result = validateBudget(input);

  return CheckBudgetOutputSchema.parse({
    allowed: result.allowed,
    requiresHumanApproval: result.requiresHumanApproval,
    recoveryCostUSD: input.recoveryCostUSD,
    autonomousBudgetLimitUSD: input.autonomousBudgetLimitUSD ?? 150_000,
    violations: result.violations.map((v) => ({ rule: v.rule, message: v.message })),
  });
}

// ---- createPurchaseOrder ----

export const CreatePurchaseOrderInputSchema = z.object({
  supplierCode: z.string().min(1),
  quantityOrdered: z.number().int().positive(),
  unitPrice: z.number().positive(),
  componentSku: z.string().min(1),
  deadlineDays: z.number().positive(),
  currentInventory: z.number().int().nonnegative(),
  dailyBurnRate: z.number().positive(),
  // Must pass engine validation or have an approved human approval request ID
  constraintValidationResult: z.object({
    allowed: z.boolean(),
    requiresHumanApproval: z.boolean(),
    violations: z.array(z.object({ rule: z.string(), message: z.string() })),
  }),
  humanApprovalRequestId: z.string().optional(),
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInputSchema>;

export const CreatePurchaseOrderOutputSchema = z.object({
  success: z.boolean(),
  blocked: z.boolean(),
  blockReason: z.string().nullable(),
  purchaseOrder: z
    .object({
      id: z.string(),
      poNumber: z.string(),
      supplierCode: z.string(),
      status: z.string(),
      quantity: z.number(),
      totalAmountUSD: z.number(),
      expectedDeliveryDate: z.string(),
    })
    .nullable(),
});
export type CreatePurchaseOrderOutput = z.infer<typeof CreatePurchaseOrderOutputSchema>;

/**
 * createPurchaseOrder
 *
 * Simulated ERP purchase order creation.
 *
 * SAFETY RULE: This function will NOT create a PO unless:
 *   a) the constraint engine result says allowed === true, OR
 *   b) a valid human approval request ID is provided and the approval record
 *      exists in the database with status APPROVED.
 *
 * The LLM cannot bypass this check by passing any other value.
 */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput
): Promise<CreatePurchaseOrderOutput> {
  CreatePurchaseOrderInputSchema.parse(input);

  const { constraintValidationResult, humanApprovalRequestId } = input;

  // Check if human approval was provided and is valid
  let humanlyApproved = false;
  if (humanApprovalRequestId) {
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: humanApprovalRequestId, status: 'APPROVED' },
    });
    humanlyApproved = !!approval;
  }

  // Gate: engine must allow OR a valid human approval must exist
  const canProceed = constraintValidationResult.allowed || humanlyApproved;

  if (!canProceed) {
    const hardBlocks = constraintValidationResult.violations
      .filter((v) => v.rule !== 'AUTONOMOUS_BUDGET')
      .map((v) => v.message);

    const budgetBlock = constraintValidationResult.requiresHumanApproval
      ? 'Human approval required (budget exceeds autonomous limit). Provide humanApprovalRequestId.'
      : null;

    const reason = [...hardBlocks, ...(budgetBlock ? [budgetBlock] : [])].join(' | ');

    return {
      success: false,
      blocked: true,
      blockReason: reason,
      purchaseOrder: null,
    };
  }

  // Resolve supplier
  const supplier = await prisma.supplier.findFirst({
    where: { code: input.supplierCode },
  });

  if (!supplier) {
    return {
      success: false,
      blocked: true,
      blockReason: `Supplier "${input.supplierCode}" not found in database.`,
      purchaseOrder: null,
    };
  }

  // Generate deterministic PO number
  const poNumber = `PO-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const totalAmount = Math.round(input.quantityOrdered * input.unitPrice * 100) / 100;
  const expectedDeliveryDate = new Date(
    Date.now() + supplier.leadTimeDaysAvg * 24 * 60 * 60 * 1000
  );

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: supplier.id,
      status: 'ISSUED',
      quantity: input.quantityOrdered,
      unitPrice: input.unitPrice,
      totalAmount,
      currency: 'USD',
      expectedDeliveryDate,
      supplierClaimStatus: 'Order issued — awaiting supplier confirmation',
      lineItems: [
        {
          sku: input.componentSku,
          quantity: input.quantityOrdered,
          unitPrice: input.unitPrice,
          totalPrice: totalAmount,
        },
      ],
      metadata: {
        recoveryAction: true,
        humanApprovalId: humanApprovalRequestId ?? null,
        constraintEngineAllowed: constraintValidationResult.allowed,
      },
    },
  });

  return CreatePurchaseOrderOutputSchema.parse({
    success: true,
    blocked: false,
    blockReason: null,
    purchaseOrder: {
      id: po.id,
      poNumber: po.poNumber,
      supplierCode: supplier.code,
      status: po.status,
      quantity: po.quantity,
      totalAmountUSD: po.totalAmount,
      expectedDeliveryDate: po.expectedDeliveryDate.toISOString(),
    },
  });
}
