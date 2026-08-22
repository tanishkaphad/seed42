// ==========================================
// Human-in-the-Loop Approval Service
// ==========================================
// Manages the creation, retrieval, approval, and rejection
// of recovery actions that exceed autonomous budget limits ($150,000)
// or require explicit human intervention.

import { prisma } from '../db/prisma.js';
import { writeAuditLog } from '../tools/auditTools.js';
import { createPurchaseOrder } from '../tools/procurementTools.js';
import type { PriorityLevel } from '@prisma/client';

export interface CreateApprovalRequestInput {
  disruptionEventId: string;
  recoveryPlanId?: string;
  planTitle?: string;
  disruption: {
    title: string;
    description: string;
    severity: string;
    affectedPoIds: string[];
    affectedSkuIds: string[];
    estimatedDelayDays: number;
    impactScore: number;
  };
  productionRisk: {
    componentSku: string;
    currentStock: number;
    daysOfCoverage: number;
    totalRequiredQuantity: number;
    shortfallUnits: number;
    deadlineDays: number | null;
    riskLevel: string;
    riskReason: string | null;
  };
  supplierVerificationResult: {
    purchaseOrderId: string;
    supplierClaimStatus: string | null;
    latestCarrierEventType: string | null;
    hasContradiction: boolean;
    contradictionDetails: {
      supplierClaim: string;
      carrierStatus: string;
      explanation: string;
    } | null;
  };
  recoveryPlan: {
    planId: string;
    description: string;
    actions: Array<{
      supplierId: string;
      supplierCode: string;
      quantityOrdered: number;
      unitPrice: number;
      estimatedLeadTimeDays: number;
    }>;
    totalQuantity: number;
    totalCostUSD: number;
    fastestDeliveryDays: number;
    reasoning?: string;
  };
  totalCostUSD: number;
  autonomousBudgetUSD?: number;
  constraintViolations: Array<{
    rule: string;
    message: string;
    context?: unknown;
  }>;
  estimatedImpactIfNotExecuted?: string;
  recommendedAction?: string;
  requiredRole?: string;
  riskLevel?: PriorityLevel;
}

export interface ApprovalActionInput {
  userId?: string;
  userName?: string;
  notes?: string;
}

/**
 * List all approval requests with optional status filter.
 */
export async function listApprovals(filters?: { status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' }) {
  return prisma.approvalRequest.findMany({
    where: filters?.status ? { status: filters.status } : undefined,
    include: {
      recoveryPlan: {
        include: {
          disruptionEvent: true,
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  });
}

/**
 * Get a single approval request by ID with full details.
 */
export async function getApprovalById(id: string) {
  return prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      recoveryPlan: {
        include: {
          disruptionEvent: true,
        },
      },
    },
  });
}

/**
 * Create a new approval request with structured operational context.
 */
export async function createApprovalRequest(input: CreateApprovalRequestInput) {
  const autonomousLimit = input.autonomousBudgetUSD ?? 150_000;

  // 1. Ensure or find recovery plan
  let recoveryPlanId = input.recoveryPlanId;
  if (!recoveryPlanId) {
    const plan = await prisma.recoveryPlan.create({
      data: {
        disruptionEventId: input.disruptionEventId,
        title: input.planTitle ?? input.recoveryPlan.description,
        status: 'PENDING_APPROVAL',
        strategySummary: input.recoveryPlan.reasoning ?? input.recoveryPlan.description,
        proposedActions: input.recoveryPlan.actions as object[],
        costEstimate: input.totalCostUSD,
        timeRecoveryDays: input.recoveryPlan.fastestDeliveryDays,
        recommendedBy: 'AI_AGENT',
      },
    });
    recoveryPlanId = plan.id;
  }

  // 2. Structured payload for human reviewer
  const payload = {
    status: 'pending',
    recoveryCost: input.totalCostUSD,
    autonomousLimit,
    overageAmount: Math.max(0, input.totalCostUSD - autonomousLimit),
    reason:
      input.totalCostUSD > autonomousLimit
        ? `Recovery cost ($${input.totalCostUSD.toLocaleString()}) exceeds autonomous execution limit ($${autonomousLimit.toLocaleString()})`
        : 'High-risk procurement action requires human approval',
    disruption: input.disruption,
    productionRisk: input.productionRisk,
    supplierVerificationResult: input.supplierVerificationResult,
    recoveryPlan: input.recoveryPlan,
    constraintViolations: input.constraintViolations,
    estimatedImpactIfNotExecuted:
      input.estimatedImpactIfNotExecuted ??
      `Factory line stoppage imminent for ${input.productionRisk.componentSku}. Production shortfall of ${input.productionRisk.shortfallUnits} units within ${input.productionRisk.deadlineDays ?? 4} days.`,
    recommendedAction:
      input.recommendedAction ??
      `Approve recovery purchase order of ${input.recoveryPlan.totalQuantity} units for total cost $${input.totalCostUSD.toLocaleString()}.`,
  };

  // 3. Create the approval request record
  const approval = await prisma.approvalRequest.create({
    data: {
      recoveryPlanId,
      actionType: 'EXECUTE_RECOVERY_PURCHASE',
      requiredRole: input.requiredRole ?? 'OPERATIONS_MANAGER',
      status: 'PENDING',
      riskLevel: input.riskLevel ?? 'HIGH',
      payload: payload as object,
    },
  });

  // 4. Record audit log
  await writeAuditLog({
    action: 'APPROVAL_REQUEST_CREATED',
    actorType: 'AGENT',
    actorId: 'supply-chain-agent-v1',
    targetEntity: 'ApprovalRequest',
    targetEntityId: approval.id,
    reasoning: payload.reason,
    metadata: {
      recoveryPlanId,
      totalCostUSD: input.totalCostUSD,
      autonomousLimit,
    },
  });

  return approval;
}

/**
 * Approve a pending approval request.
 * Triggers actual purchase order execution and audit logging.
 */
export async function approveRequest(id: string, input?: ApprovalActionInput) {
  const approval = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      recoveryPlan: {
        include: {
          disruptionEvent: true,
        },
      },
    },
  });

  if (!approval) {
    throw new Error(`Approval request "${id}" not found.`);
  }

  if (approval.status !== 'PENDING') {
    throw new Error(
      `Approval request "${id}" is already ${approval.status}. Only PENDING requests can be approved.`
    );
  }

  const approverName = input?.userName ?? input?.userId ?? 'Operations Manager';
  const approverNotes = input?.notes ?? 'Approved by human operator.';
  const now = new Date();

  // 1. Update ApprovalRequest record
  const updatedApproval = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      respondedAt: now,
      respondedBy: approverName,
      approverNotes,
    },
  });

  // 2. Update RecoveryPlan record
  await prisma.recoveryPlan.update({
    where: { id: approval.recoveryPlanId },
    data: {
      status: 'APPROVED',
      approvedBy: approverName,
      executedAt: now,
    },
  });

  // 3. Write approval audit log & emit live event
  const { recordAndEmitEvent } = await import('../audit/auditService.js');
  await recordAndEmitEvent({
    disruptionId: approval.recoveryPlan.disruptionEventId,
    step: 'APPROVAL_GATE',
    type: 'GOVERNANCE',
    eventType: 'APPROVAL_GRANTED',
    status: 'SUCCESS',
    message: `Human operator (${approverName}) explicitly approved recovery plan. Approver notes: ${approverNotes}`,
    actorType: 'USER',
    actorId: approverName,
    data: {
      outputSummary: {
        approvalRequestId: id,
        recoveryPlanId: approval.recoveryPlanId,
        approver: approverName,
        approverNotes,
      },
    },
  });

  await writeAuditLog({
    action: 'HUMAN_APPROVAL_GRANTED',
    actorType: 'USER',
    actorId: approverName,
    targetEntity: 'ApprovalRequest',
    targetEntityId: id,
    previousState: { status: 'PENDING' },
    newState: { status: 'APPROVED', approverNotes },
    reasoning: `Human operator explicitly approved recovery plan. Approver notes: ${approverNotes}`,
    metadata: {
      recoveryPlanId: approval.recoveryPlanId,
      disruptionEventId: approval.recoveryPlan.disruptionEventId,
    },
  });

  // 4. Trigger recovery execution (Create PO for the approved actions)
  const payload = approval.payload as Record<string, unknown>;
  const recoveryPlanPayload = (payload?.recoveryPlan ?? {}) as {
    actions?: Array<{
      supplierCode: string;
      quantityOrdered: number;
      unitPrice: number;
    }>;
  };
  const actions = recoveryPlanPayload.actions ?? [];
  const componentSku =
    (payload?.productionRisk as { componentSku?: string })?.componentSku ?? 'COMP-104';

  const executionResults = [];

  for (const action of actions) {
    const poResult = await createPurchaseOrder({
      supplierCode: action.supplierCode,
      quantityOrdered: action.quantityOrdered,
      unitPrice: action.unitPrice,
      componentSku,
      deadlineDays: 4,
      currentInventory: 420,
      dailyBurnRate: 100,
      constraintValidationResult: {
        allowed: false, // was blocked autonomously due to budget
        requiresHumanApproval: true,
        violations: [],
      },
      humanApprovalRequestId: id, // human approval bypasses budget limit
    });
    executionResults.push(poResult);
  }

  // 5. Update Disruption status to RESOLVED if execution succeeded
  const allSucceeded = executionResults.every((r) => r.success);
  if (allSucceeded && approval.recoveryPlan.disruptionEventId) {
    try {
      await prisma.disruptionEvent.update({
        where: { id: approval.recoveryPlan.disruptionEventId },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
        },
      });
    } catch {
      // Non-fatal if disruption record is not found
    }

    try {
      await prisma.recoveryPlan.update({
        where: { id: approval.recoveryPlanId },
        data: { status: 'COMPLETED' },
      });
    } catch {
      // Non-fatal
    }
  }

  return {
    success: true,
    approval: updatedApproval,
    executionResults,
    message: `Approval request "${id}" successfully approved and executed.`,
  };
}

/**
 * Reject a pending approval request.
 * Marks the plan as REJECTED and records audit log.
 */
export async function rejectRequest(id: string, input?: ApprovalActionInput) {
  const approval = await prisma.approvalRequest.findUnique({
    where: { id },
    include: {
      recoveryPlan: true,
    },
  });

  if (!approval) {
    throw new Error(`Approval request "${id}" not found.`);
  }

  if (approval.status !== 'PENDING') {
    throw new Error(
      `Approval request "${id}" is already ${approval.status}. Only PENDING requests can be rejected.`
    );
  }

  const rejecterName = input?.userName ?? input?.userId ?? 'Operations Manager';
  const rejectNotes = input?.notes ?? 'Rejected by human operator.';
  const now = new Date();

  // 1. Update ApprovalRequest
  const updatedApproval = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      respondedAt: now,
      respondedBy: rejecterName,
      approverNotes: rejectNotes,
    },
  });

  // 2. Update RecoveryPlan
  await prisma.recoveryPlan.update({
    where: { id: approval.recoveryPlanId },
    data: {
      status: 'REJECTED',
      approvedBy: rejecterName,
    },
  });

  // 3. Write rejection audit log
  await writeAuditLog({
    action: 'HUMAN_APPROVAL_REJECTED',
    actorType: 'USER',
    actorId: rejecterName,
    targetEntity: 'ApprovalRequest',
    targetEntityId: id,
    previousState: { status: 'PENDING' },
    newState: { status: 'REJECTED', approverNotes: rejectNotes },
    reasoning: `Human operator rejected recovery plan. Reason: ${rejectNotes}`,
    metadata: {
      recoveryPlanId: approval.recoveryPlanId,
    },
  });

  return {
    success: true,
    approval: updatedApproval,
    message: `Approval request "${id}" has been rejected.`,
  };
}
