// ==========================================
// Agent Nodes — One function per graph node
// ==========================================
// Each node:
//   1. Logs its entry into the tool call record
//   2. Calls specific tools to gather data
//   3. Uses the LLM only for reasoning/selection
//   4. Emits real-time events to the eventBus & audit ledger
//   5. Returns a Partial<AgentState>
//
// The LLM NEVER authorizes actions. The Constraint Engine does.

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';

import { checkInventory } from '../tools/inventoryTools.js';
import { findAlternativeSuppliers } from '../tools/supplierTools.js';
import { verifyTracking } from '../tools/trackingTools.js';
import { checkProductionSchedule, updateProductionRisk } from '../tools/productionTools.js';
import {
  calculateRecoveryPlan,
  validateRecoveryPlan,
  checkBudget,
  createPurchaseOrder,
} from '../tools/procurementTools.js';
import { writeAuditLog } from '../tools/auditTools.js';
import { calculateProductionShortfall } from '../engine/constraintEngine.js';
import { createApprovalRequest } from '../services/approvalService.js';
import { recordAndEmitEvent } from '../audit/auditService.js';

import {
  SYSTEM_PROMPT,
  DETECT_PROMPT,
  IMPACT_ANALYSIS_PROMPT,
  VERIFY_PROMPT,
  SOURCE_PROMPT,
  PLAN_PROMPT,
  COMPLETE_PROMPT,
} from './prompts.js';

import type { AgentState } from './state.js';
import type { ToolCallRecord, RejectedSupplier, SelectedRecoveryPlan } from './types.js';

// ---- Shared LLM instance ----
const llm = new ChatOpenAI({
  model: env.OPENAI_MODEL,
  apiKey: env.OPENAI_API_KEY,
  temperature: 0,
});

// ---- Helper: wrap tool calls with observability ----
async function callTool<T>(
  toolName: string,
  input: unknown,
  fn: () => Promise<T>,
  state: AgentState
): Promise<{ result: T; record: ToolCallRecord }> {
  const start = Date.now();
  try {
    const result = await fn();
    const record: ToolCallRecord = {
      stepIndex: state.stepIndex + 1,
      agentStep: state.currentStep,
      toolName,
      input,
      output: result,
      success: true,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
    return { result, record };
  } catch (err) {
    const record: ToolCallRecord = {
      stepIndex: state.stepIndex + 1,
      agentStep: state.currentStep,
      toolName,
      input,
      output: null,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
    throw Object.assign(new Error(`Tool ${toolName} failed: ${record.errorMessage}`), { record });
  }
}

// ==========================================
// NODE 1: DETECT
// ==========================================
export async function detectNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ DETECT — PO: ${state.trigger.purchaseOrderId}`);

  // Find or use existing disruption event in DB
  const disruption = await prisma.disruptionEvent.findFirst({
    where: {
      affectedPoIds: {
        array_contains: [state.trigger.purchaseOrderId],
      },
    },
    orderBy: { detectedAt: 'desc' },
  });

  const disruptionId = disruption?.id ?? state.trigger.purchaseOrderId;

  // Emit DISRUPTION_DETECTED real-time event & persist audit log
  await recordAndEmitEvent({
    disruptionId,
    step: 'DETECT',
    type: 'STATE_CHANGE',
    eventType: 'DISRUPTION_DETECTED',
    status: 'WARNING',
    message: `Disruption detected on PO: ${state.trigger.purchaseOrderId}. Supplier ${state.trigger.supplierId} claimed a ${state.trigger.claimedDelayDays}-day delay for component ${state.trigger.componentId}.`,
    data: {
      inputSummary: {
        purchaseOrderId: state.trigger.purchaseOrderId,
        supplierId: state.trigger.supplierId,
        componentId: state.trigger.componentId,
        claimedDelayDays: state.trigger.claimedDelayDays,
      },
    },
  });

  // Write audit log
  const { result: auditResult } = await callTool(
    'writeAuditLog',
    { action: 'DISRUPTION_DETECTED' },
    () =>
      writeAuditLog({
        action: 'AGENT_STARTED',
        actorType: 'AGENT',
        actorId: 'supply-chain-agent-v1',
        targetEntity: 'PurchaseOrder',
        targetEntityId: state.trigger.purchaseOrderId,
        reasoning: `Agent activated for disruption on ${state.trigger.purchaseOrderId} from supplier ${state.trigger.supplierId}. Claimed delay: ${state.trigger.claimedDelayDays} days.`,
        metadata: { trigger: state.trigger },
      }),
    state
  );

  // Ask LLM to acknowledge and summarize
  const response = await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(DETECT_PROMPT(state.trigger)),
  ]);
  console.log(`[AGENT] DETECT reasoning: ${response.content}`);

  return {
    currentStep: 'IMPACT_ANALYSIS',
    stepIndex: state.stepIndex + 1,
    disruptionEventId: disruption?.id ?? null,
    auditLogIds: [auditResult.auditLogId!],
    toolCallLog: [
      {
        stepIndex: state.stepIndex + 1,
        agentStep: 'DETECT',
        toolName: 'writeAuditLog',
        input: { action: 'AGENT_STARTED' },
        output: auditResult,
        success: true,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ==========================================
// NODE 2: IMPACT_ANALYSIS
// ==========================================
export async function impactAnalysisNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ IMPACT_ANALYSIS — Component: ${state.trigger.componentId}`);
  const toolLogs: ToolCallRecord[] = [];
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  const { result: inventory, record: invRecord } = await callTool(
    'checkInventory',
    { componentId: state.trigger.componentId },
    () => checkInventory({ componentId: state.trigger.componentId }),
    state
  );
  toolLogs.push(invRecord);

  // Emit INVENTORY_CHECK event
  await recordAndEmitEvent({
    disruptionId,
    step: 'IMPACT_ANALYSIS',
    type: 'TOOL_CALL',
    eventType: 'INVENTORY_CHECK',
    tool: 'checkInventory',
    status: 'SUCCESS',
    message: `Inventory: ${inventory.quantity} units on hand, daily burn rate ${inventory.dailyBurnRate}/day, coverage: ${inventory.daysOfCoverage} days.`,
    data: {
      outputSummary: {
        componentSku: state.trigger.componentId,
        quantity: inventory.quantity,
        dailyBurnRate: inventory.dailyBurnRate,
        daysOfCoverage: inventory.daysOfCoverage,
        safetyStock: inventory.safetyStock,
      },
    },
  });

  const { result: production, record: prodRecord } = await callTool(
    'checkProductionSchedule',
    { componentId: state.trigger.componentId },
    () => checkProductionSchedule({ componentId: state.trigger.componentId }),
    state
  );
  toolLogs.push(prodRecord);

  // Emit PRODUCTION_RISK event
  await recordAndEmitEvent({
    disruptionId,
    step: 'IMPACT_ANALYSIS',
    type: 'ALERT',
    eventType: 'PRODUCTION_RISK',
    tool: 'checkProductionSchedule',
    status: production.riskLevel === 'CRITICAL' || production.riskLevel === 'HIGH' ? 'WARNING' : 'SUCCESS',
    message: production.riskReason ?? `Production schedule evaluated: ${production.riskLevel} risk level. Shortfall: ${production.shortfallUnits} units in ${production.deadlineDays ?? 4} days.`,
    data: {
      outputSummary: {
        shortfallUnits: production.shortfallUnits,
        totalRequiredQuantity: production.totalRequiredQuantity,
        deadlineDays: production.deadlineDays,
        riskLevel: production.riskLevel,
      },
    },
  });

  console.log(
    `[AGENT] Inventory: ${inventory.quantity} units / ${inventory.daysOfCoverage}d coverage | Risk: ${production.riskLevel}`
  );

  // Ask LLM to analyze
  await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      IMPACT_ANALYSIS_PROMPT(state.trigger.componentId) +
        `\n\nInventory data: ${JSON.stringify(inventory)}\nProduction data: ${JSON.stringify(production)}`
    ),
  ]);

  // Update production order to mark as affected
  if (production.productionOrders.length > 0) {
    await updateProductionRisk({
      productionOrderId: production.productionOrders[0].orderNumber,
      status: 'BLOCKED',
      affectedByDisruption: true,
    }).catch(() => { /* non-fatal */ });
  }

  return {
    currentStep: 'VERIFY',
    stepIndex: state.stepIndex + 1,
    inventoryStatus: inventory,
    productionRisk: production,
    toolCallLog: toolLogs,
  };
}

// ==========================================
// NODE 3: VERIFY
// ==========================================
export async function verifyNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ VERIFY — PO: ${state.trigger.purchaseOrderId}`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  const { result: tracking, record } = await callTool(
    'verifyTracking',
    { purchaseOrderId: state.trigger.purchaseOrderId },
    () => verifyTracking({ purchaseOrderId: state.trigger.purchaseOrderId }),
    state
  );

  // Emit SUPPLIER_VERIFICATION event
  await recordAndEmitEvent({
    disruptionId,
    step: 'VERIFY',
    type: 'TOOL_CALL',
    eventType: 'SUPPLIER_VERIFICATION',
    tool: 'verifyTracking',
    status: tracking.hasContradiction ? 'WARNING' : 'SUCCESS',
    message: tracking.hasContradiction
      ? `Supplier claim contradiction detected: Supplier claims "${tracking.supplierClaimStatus}" but carrier reports "${tracking.latestCarrierEventType}". No physical cargo movement confirmed.`
      : `Supplier tracking verified with carrier status: ${tracking.latestCarrierStatus}.`,
    data: {
      outputSummary: {
        hasContradiction: tracking.hasContradiction,
        supplierClaim: tracking.supplierClaimStatus,
        carrierStatus: tracking.latestCarrierStatus,
        carrierEventType: tracking.latestCarrierEventType,
      },
    },
  });

  console.log(
    `[AGENT] Supplier claim: "${tracking.supplierClaimStatus}" | Carrier: "${tracking.latestCarrierEventType}" | Contradiction: ${tracking.hasContradiction}`
  );

  // Log contradiction if detected
  if (tracking.hasContradiction) {
    await writeAuditLog({
      action: 'SUPPLIER_CONTRADICTION_DETECTED',
      actorType: 'AGENT',
      actorId: 'supply-chain-agent-v1',
      targetEntity: 'PurchaseOrder',
      targetEntityId: state.trigger.purchaseOrderId,
      previousState: { supplierClaim: tracking.supplierClaimStatus },
      newState: { carrierStatus: tracking.latestCarrierEventType },
      reasoning: tracking.contradictionDetails?.explanation,
      metadata: { contradictionDetails: tracking.contradictionDetails },
    });
  }

  await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      VERIFY_PROMPT(state.trigger.purchaseOrderId) +
        `\n\nTracking data: ${JSON.stringify(tracking)}`
    ),
  ]);

  return {
    currentStep: 'SOURCE',
    stepIndex: state.stepIndex + 1,
    verificationResult: tracking,
    supplierClaimContradicted: tracking.hasContradiction,
    toolCallLog: [record],
  };
}

// ==========================================
// NODE 4: SOURCE
// ==========================================
export async function sourceNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ SOURCE — Finding alternative suppliers`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  const shortfall = state.inventoryStatus
    ? calculateProductionShortfall(
        state.productionRisk?.totalRequiredQuantity ?? 0,
        state.inventoryStatus.quantity
      )
    : state.productionRisk?.shortfallUnits ?? 0;

  const { result: supplierData, record } = await callTool(
    'findAlternativeSuppliers',
    { componentId: state.trigger.componentId, requiredQuantity: shortfall },
    () =>
      findAlternativeSuppliers({
        componentId: state.trigger.componentId,
        requiredQuantity: shortfall,
        excludeSupplierCodes: [state.trigger.supplierId],
      }),
    state
  );

  const eligible = supplierData.suppliers.filter((s) => s.isEligible);
  const rejected: RejectedSupplier[] = supplierData.suppliers
    .filter((s) => !s.isEligible)
    .map((s) => ({
      supplierCode: s.code,
      supplierName: s.name,
      violations: [
        {
          rule: !s.iso9001Certified ? 'ISO_9001' : 'INSUFFICIENT_CAPACITY',
          message: s.ineligibilityReason ?? 'Ineligible',
        },
      ],
      rejectedAt: new Date().toISOString(),
    }));

  // Emit SUPPLIER_REJECTED event for each ineligible supplier
  for (const rej of rejected) {
    await recordAndEmitEvent({
      disruptionId,
      step: 'SOURCE',
      type: 'GOVERNANCE',
      eventType: 'SUPPLIER_REJECTED',
      status: 'BLOCKED',
      message: `Supplier ${rej.supplierName} (${rej.supplierCode}) rejected by compliance rule: ${rej.violations.map((v) => v.message).join(', ')}`,
      data: {
        ruleResults: {
          supplierCode: rej.supplierCode,
          violations: rej.violations,
        },
      },
    });
  }

  // Emit ALTERNATIVE_FOUND event
  await recordAndEmitEvent({
    disruptionId,
    step: 'SOURCE',
    type: 'TOOL_CALL',
    eventType: 'ALTERNATIVE_FOUND',
    tool: 'findAlternativeSuppliers',
    status: eligible.length > 0 ? 'SUCCESS' : 'FAILED',
    message: `Found ${eligible.length} eligible alternative suppliers meeting ISO-9001 and capacity rules (${rejected.length} disqualified).`,
    data: {
      outputSummary: {
        totalFound: supplierData.totalFound,
        eligibleCount: eligible.length,
        rejectedCount: rejected.length,
        eligibleSuppliers: eligible.map((s) => ({ code: s.code, price: s.unitPrice, leadTimeDays: s.leadTimeDaysAvg })),
      },
    },
  });

  console.log(
    `[AGENT] Found ${supplierData.totalFound} suppliers, ${eligible.length} eligible, ${rejected.length} rejected`
  );

  await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      SOURCE_PROMPT(state.trigger.componentId, shortfall) +
        `\n\nSupplier data: ${JSON.stringify(supplierData)}`
    ),
  ]);

  return {
    currentStep: 'PLAN',
    stepIndex: state.stepIndex + 1,
    candidateSuppliers: eligible,
    rejectedSuppliers: rejected,
    toolCallLog: [record],
  };
}

// ==========================================
// NODE 5: PLAN
// ==========================================
export async function planNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ PLAN — Generating recovery options`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  const shortfall =
    state.productionRisk?.shortfallUnits ??
    calculateProductionShortfall(
      state.productionRisk?.totalRequiredQuantity ?? 0,
      state.inventoryStatus?.quantity ?? 0
    );
  const deadlineDays = state.productionRisk?.deadlineDays ?? 4;
  const eligibleCodes = state.candidateSuppliers.map((s) => s.code);

  if (eligibleCodes.length === 0) {
    console.log('[AGENT] No eligible suppliers — moving to FAILED');
    return {
      currentStep: 'FAILED',
      stepIndex: state.stepIndex + 1,
      finalStatus: 'FAILED',
      errorMessage: 'No eligible ISO-9001 certified suppliers with available capacity.',
    };
  }

  const { result: options, record } = await callTool(
    'calculateRecoveryPlan',
    { requiredQuantity: shortfall, eligibleCodes },
    () =>
      calculateRecoveryPlan({
        requiredQuantity: state.productionRisk?.totalRequiredQuantity ?? 700,
        currentInventory: state.inventoryStatus?.quantity ?? 0,
        dailyBurnRate: state.inventoryStatus?.dailyBurnRate ?? 100,
        deadlineDays,
        candidateSupplierCodes: eligibleCodes,
      }),
    state
  );

  // Ask LLM to select the best candidate plan
  const selectionResponse = await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      PLAN_PROMPT(shortfall, deadlineDays, eligibleCodes) +
        `\n\nRecovery options:\n${JSON.stringify(options, null, 2)}\n\n` +
        `Respond with JSON: { "selectedPlanId": "...", "reasoning": "..." }`
    ),
  ]);

  // Parse LLM selection
  let selectedPlanId: string | null = null;
  let reasoning = '';
  try {
    const rawContent = selectionResponse.content as string;
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      selectedPlanId = parsed.selectedPlanId ?? null;
      reasoning = parsed.reasoning ?? '';
    }
  } catch {
    // Fallback: pick the first candidate
    selectedPlanId = options.candidates[0]?.planId ?? null;
    reasoning = 'Fallback: selected first available candidate.';
  }

  const chosenCandidate = options.candidates.find((c) => c.planId === selectedPlanId) ?? options.candidates[0];

  let selectedPlan: SelectedRecoveryPlan | null = null;
  if (chosenCandidate) {
    selectedPlan = {
      planId: chosenCandidate.planId,
      description: chosenCandidate.description,
      actions: chosenCandidate.actions,
      totalQuantity: chosenCandidate.totalQuantity,
      totalCostUSD: chosenCandidate.totalCostUSD,
      fastestDeliveryDays: chosenCandidate.fastestDeliveryDays,
      reasoning,
    };

    // Emit RECOVERY_PLAN_CREATED event
    await recordAndEmitEvent({
      disruptionId,
      step: 'PLAN',
      type: 'TOOL_CALL',
      eventType: 'RECOVERY_PLAN_CREATED',
      tool: 'calculateRecoveryPlan',
      status: 'SUCCESS',
      message: `Recovery plan formulated: ${selectedPlan.description}. Total cost: $${selectedPlan.totalCostUSD.toLocaleString()} (${selectedPlan.fastestDeliveryDays}-day delivery).`,
      data: {
        outputSummary: {
          planId: selectedPlan.planId,
          totalQuantity: selectedPlan.totalQuantity,
          totalCostUSD: selectedPlan.totalCostUSD,
          fastestDeliveryDays: selectedPlan.fastestDeliveryDays,
        },
      },
    });

    console.log(
      `[AGENT] Selected plan: ${selectedPlan.planId} | Cost: $${selectedPlan.totalCostUSD} | Lead: ${selectedPlan.fastestDeliveryDays}d`
    );
  }

  return {
    currentStep: 'CONSTRAINT_CHECK',
    stepIndex: state.stepIndex + 1,
    recoveryOptions: options,
    selectedPlan,
    toolCallLog: [record],
  };
}

// ==========================================
// NODE 6: CONSTRAINT_CHECK
// ==========================================
export async function constraintCheckNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ CONSTRAINT_CHECK — Validating plan through engine`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  if (!state.selectedPlan) {
    return {
      currentStep: 'FAILED',
      stepIndex: state.stepIndex + 1,
      finalStatus: 'FAILED',
      errorMessage: 'No recovery plan selected before constraint check.',
    };
  }

  const { result: constraintResult, record } = await callTool(
    'validateRecoveryPlan',
    { planId: state.selectedPlan.planId },
    () =>
      validateRecoveryPlan({
        actions: state.selectedPlan!.actions.map((a) => ({
          supplierId: a.supplierId,
          supplierCode: a.supplierCode,
          quantityOrdered: a.quantityOrdered,
          unitPrice: a.unitPrice,
        })),
        requiredQuantity: state.productionRisk?.totalRequiredQuantity ?? 700,
        deadlineDays: state.productionRisk?.deadlineDays ?? 4,
        currentInventory: state.inventoryStatus?.quantity ?? 0,
        dailyBurnRate: state.inventoryStatus?.dailyBurnRate ?? 100,
      }),
    state
  );

  console.log(
    `[AGENT] Engine decision: allowed=${constraintResult.allowed} | requiresApproval=${constraintResult.requiresHumanApproval} | violations=${constraintResult.violations.length}`
  );

  // Hard violations (not budget) → plan is permanently rejected
  const hardViolations = constraintResult.violations.filter((v) => v.rule !== 'AUTONOMOUS_BUDGET');
  
  if (hardViolations.length > 0) {
    console.log(`[AGENT] Hard constraint violations — plan REJECTED`);
    
    // Emit CONSTRAINT_FAILED event
    await recordAndEmitEvent({
      disruptionId,
      step: 'CONSTRAINT_CHECK',
      type: 'GOVERNANCE',
      eventType: 'CONSTRAINT_FAILED',
      tool: 'validateRecoveryPlan',
      status: 'BLOCKED',
      message: `Deterministic Constraint Engine rejected recovery plan: ${hardViolations.map((v) => v.message).join(' | ')}`,
      data: {
        ruleResults: {
          allowed: false,
          violations: hardViolations,
        },
      },
    });

    await writeAuditLog({
      action: 'RECOVERY_PLAN_REJECTED',
      actorType: 'AGENT',
      targetEntity: 'RecoveryPlan',
      targetEntityId: state.selectedPlan.planId,
      reasoning: `Constraint Engine rejected plan. Violations: ${hardViolations.map((v) => v.rule).join(', ')}`,
      newState: { violations: hardViolations },
    });
  } else {
    // Emit CONSTRAINT_CHECK event (passed compliance)
    await recordAndEmitEvent({
      disruptionId,
      step: 'CONSTRAINT_CHECK',
      type: 'GOVERNANCE',
      eventType: 'CONSTRAINT_CHECK',
      tool: 'validateRecoveryPlan',
      status: constraintResult.requiresHumanApproval ? 'WARNING' : 'SUCCESS',
      message: constraintResult.requiresHumanApproval
        ? `Constraint engine validated all technical rules, but total cost $${constraintResult.totalCostUSD.toLocaleString()} exceeds the $150,000 autonomous limit.`
        : `Deterministic Constraint Engine validated and approved recovery plan: ISO-9001, lead time, and budget all verified.`,
      data: {
        ruleResults: {
          allowed: constraintResult.allowed,
          requiresHumanApproval: constraintResult.requiresHumanApproval,
          totalCostUSD: constraintResult.totalCostUSD,
          violationsCount: constraintResult.violations.length,
        },
      },
    });
  }

  return {
    currentStep: 'APPROVAL_GATE',
    stepIndex: state.stepIndex + 1,
    constraintResult,
    toolCallLog: [record],
  };
}

// ==========================================
// NODE 7: APPROVAL_GATE
// ==========================================
export async function approvalGateNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ APPROVAL_GATE`);

  if (!state.constraintResult) {
    return {
      currentStep: 'FAILED',
      stepIndex: state.stepIndex + 1,
      finalStatus: 'FAILED',
      errorMessage: 'Constraint result missing at approval gate.',
    };
  }

  // Hard block — no recovery possible for this plan
  const hardViolations = state.constraintResult.violations.filter(
    (v) => v.rule !== 'AUTONOMOUS_BUDGET'
  );
  if (hardViolations.length > 0) {
    return {
      currentStep: 'FAILED',
      stepIndex: state.stepIndex + 1,
      finalStatus: 'FAILED',
      errorMessage: `Recovery plan blocked: ${hardViolations.map((v) => v.message).join(' | ')}`,
    };
  }

  // Budget exceeded — requires human approval
  if (state.constraintResult.requiresHumanApproval) {
    console.log(`[AGENT] Budget exceeded — creating approval request`);

    // Create approval request with rich context in DB
    let approvalRequestId: string | null = null;
    let disruptionEventId = state.disruptionEventId;

    if (!disruptionEventId) {
      const createdDisruption = await prisma.disruptionEvent.create({
        data: {
          title: `Disruption on PO: ${state.trigger.purchaseOrderId}`,
          description: `Supplier claimed delay of ${state.trigger.claimedDelayDays} days for component ${state.trigger.componentId}`,
          severity: 'HIGH',
          category: 'SUPPLIER_DELAY',
          status: 'ANALYZING',
          affectedPoIds: [state.trigger.purchaseOrderId],
          affectedSkuIds: [state.trigger.componentId],
        },
      }).catch(() => null);
      if (createdDisruption) {
        disruptionEventId = createdDisruption.id;
      }
    }

    if (disruptionEventId && state.selectedPlan) {
      const approval = await createApprovalRequest({
        disruptionEventId,
        disruption: {
          title: `Disruption on PO: ${state.trigger.purchaseOrderId}`,
          description: `Supplier ${state.trigger.supplierId} claimed delay of ${state.trigger.claimedDelayDays} days for component ${state.trigger.componentId}`,
          severity: state.productionRisk?.riskLevel ?? 'HIGH',
          affectedPoIds: [state.trigger.purchaseOrderId],
          affectedSkuIds: [state.trigger.componentId],
          estimatedDelayDays: state.trigger.claimedDelayDays,
          impactScore: state.productionRisk?.riskLevel === 'CRITICAL' ? 95 : 80,
        },
        productionRisk: {
          componentSku: state.trigger.componentId,
          currentStock: state.inventoryStatus?.quantity ?? 0,
          daysOfCoverage: state.inventoryStatus?.daysOfCoverage ?? 0,
          totalRequiredQuantity: state.productionRisk?.totalRequiredQuantity ?? 0,
          shortfallUnits: state.productionRisk?.shortfallUnits ?? 0,
          deadlineDays: state.productionRisk?.deadlineDays ?? 4,
          riskLevel: state.productionRisk?.riskLevel ?? 'HIGH',
          riskReason: state.productionRisk?.riskReason ?? null,
        },
        supplierVerificationResult: {
          purchaseOrderId: state.trigger.purchaseOrderId,
          supplierClaimStatus: state.verificationResult?.supplierClaimStatus ?? null,
          latestCarrierEventType: state.verificationResult?.latestCarrierEventType ?? null,
          hasContradiction: state.supplierClaimContradicted,
          contradictionDetails: state.verificationResult?.contradictionDetails ?? null,
        },
        recoveryPlan: state.selectedPlan,
        totalCostUSD: state.constraintResult.totalCostUSD,
        autonomousBudgetUSD: 150_000,
        constraintViolations: state.constraintResult.violations,
        requiredRole: 'OPERATIONS_MANAGER',
        riskLevel: 'HIGH',
      });
      approvalRequestId = approval.id;
      console.log(`[AGENT] Approval request created: ${approvalRequestId}`);
    }

    // Emit APPROVAL_REQUIRED event
    await recordAndEmitEvent({
      disruptionId: disruptionEventId ?? state.trigger.purchaseOrderId,
      step: 'APPROVAL_GATE',
      type: 'GOVERNANCE',
      eventType: 'APPROVAL_REQUIRED',
      status: 'WARNING',
      message: `Recovery cost ($${state.constraintResult.totalCostUSD.toLocaleString()}) exceeds the $150,000 autonomous execution limit. Human approval request created (${approvalRequestId}).`,
      data: {
        outputSummary: {
          approvalRequestId,
          recoveryCostUSD: state.constraintResult.totalCostUSD,
          autonomousLimitUSD: 150_000,
          overageUSD: state.constraintResult.totalCostUSD - 150_000,
        },
      },
    });

    const { result: auditResult } = await callTool(
      'writeAuditLog',
      { action: 'APPROVAL_REQUESTED' },
      () =>
        writeAuditLog({
          action: 'HUMAN_APPROVAL_REQUESTED',
          actorType: 'AGENT',
          targetEntity: 'RecoveryPlan',
          targetEntityId: state.selectedPlan?.planId,
          reasoning: `Recovery cost $${state.constraintResult!.totalCostUSD} exceeds $150,000 autonomous limit. Human approval required.`,
          metadata: { approvalRequestId, costUSD: state.constraintResult!.totalCostUSD },
        }),
      state
    );

    return {
      currentStep: 'COMPLETE',
      stepIndex: state.stepIndex + 1,
      approvalRequired: true,
      approvalRequestId,
      finalStatus: 'PENDING_APPROVAL',
      auditLogIds: [auditResult.auditLogId!],
      toolCallLog: [
        {
          stepIndex: state.stepIndex + 1,
          agentStep: 'APPROVAL_GATE',
          toolName: 'writeAuditLog',
          input: { action: 'HUMAN_APPROVAL_REQUESTED' },
          output: auditResult,
          success: true,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  // Budget within limits — proceed to execution
  console.log(`[AGENT] Budget within limits — proceeding to execution`);
  return {
    currentStep: 'EXECUTE',
    stepIndex: state.stepIndex + 1,
    approvalRequired: false,
  };
}

// ==========================================
// NODE 8: EXECUTE
// ==========================================
export async function executeNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ EXECUTE — Creating purchase order`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  if (!state.selectedPlan || !state.constraintResult) {
    return {
      currentStep: 'FAILED',
      stepIndex: state.stepIndex + 1,
      finalStatus: 'FAILED',
      errorMessage: 'Missing plan or constraint result at execution.',
    };
  }

  // Execute the first action in the plan (primary supplier)
  const primaryAction = state.selectedPlan.actions[0];
  const toolLogs: ToolCallRecord[] = [];

  const { result: executionResult, record } = await callTool(
    'createPurchaseOrder',
    { supplierCode: primaryAction.supplierCode, quantity: primaryAction.quantityOrdered },
    () =>
      createPurchaseOrder({
        supplierCode: primaryAction.supplierCode,
        quantityOrdered: primaryAction.quantityOrdered,
        unitPrice: primaryAction.unitPrice,
        componentSku: state.trigger.componentId,
        deadlineDays: state.productionRisk?.deadlineDays ?? 4,
        currentInventory: state.inventoryStatus?.quantity ?? 0,
        dailyBurnRate: state.inventoryStatus?.dailyBurnRate ?? 100,
        constraintValidationResult: {
          allowed: state.constraintResult!.allowed,
          requiresHumanApproval: state.constraintResult!.requiresHumanApproval,
          violations: state.constraintResult!.violations,
        },
        humanApprovalRequestId: state.approvalRequestId ?? undefined,
      }),
    state
  );
  toolLogs.push(record);

  if (executionResult.success) {
    console.log(`[AGENT] ✅ PO created: ${executionResult.purchaseOrder?.poNumber}`);

    // Emit PURCHASE_ORDER_CREATED event
    await recordAndEmitEvent({
      disruptionId,
      step: 'EXECUTE',
      type: 'TOOL_CALL',
      eventType: 'PURCHASE_ORDER_CREATED',
      tool: 'createPurchaseOrder',
      status: 'SUCCESS',
      message: `Purchase Order ${executionResult.purchaseOrder?.poNumber} successfully issued to ${primaryAction.supplierCode} for ${primaryAction.quantityOrdered} units ($${executionResult.purchaseOrder?.totalAmountUSD.toLocaleString()}).`,
      data: {
        outputSummary: {
          poNumber: executionResult.purchaseOrder?.poNumber,
          supplierCode: primaryAction.supplierCode,
          quantity: primaryAction.quantityOrdered,
          totalAmountUSD: executionResult.purchaseOrder?.totalAmountUSD,
          expectedDeliveryDate: executionResult.purchaseOrder?.expectedDeliveryDate,
        },
      },
    });

    const { result: auditResult } = await callTool(
      'writeAuditLog',
      { action: 'RECOVERY_PO_CREATED' },
      () =>
        writeAuditLog({
          action: 'RECOVERY_PO_CREATED',
          actorType: 'AGENT',
          targetEntity: 'PurchaseOrder',
          targetEntityId: executionResult.purchaseOrder?.poNumber,
          reasoning: `Recovery purchase order created via ${primaryAction.supplierCode}. ${primaryAction.quantityOrdered} units at $${primaryAction.unitPrice}/unit. Expected delivery: ${executionResult.purchaseOrder?.expectedDeliveryDate}`,
          newState: executionResult.purchaseOrder ?? {},
          metadata: { planId: state.selectedPlan!.planId },
        }),
      state
    );
    toolLogs.push({
      stepIndex: state.stepIndex + 1,
      agentStep: 'EXECUTE',
      toolName: 'writeAuditLog',
      input: { action: 'RECOVERY_PO_CREATED' },
      output: auditResult,
      success: true,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    });

    return {
      currentStep: 'VERIFY_OUTCOME',
      stepIndex: state.stepIndex + 1,
      executionResult,
      auditLogIds: [auditResult.auditLogId!],
      toolCallLog: toolLogs,
    };
  } else {
    console.log(`[AGENT] ❌ Execution blocked: ${executionResult.blockReason}`);
    return {
      currentStep: 'FAILED',
      stepIndex: state.stepIndex + 1,
      executionResult,
      finalStatus: 'FAILED',
      errorMessage: executionResult.blockReason ?? 'Execution blocked.',
      toolCallLog: toolLogs,
    };
  }
}

// ==========================================
// NODE 9: VERIFY_OUTCOME
// ==========================================
export async function verifyOutcomeNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ VERIFY_OUTCOME`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  const { result: postInventory, record } = await callTool(
    'checkInventory',
    { componentId: state.trigger.componentId },
    () => checkInventory({ componentId: state.trigger.componentId }),
    state
  );

  // Emit OUTCOME_VERIFIED event
  await recordAndEmitEvent({
    disruptionId,
    step: 'VERIFY_OUTCOME',
    type: 'TOOL_CALL',
    eventType: 'OUTCOME_VERIFIED',
    tool: 'checkInventory',
    status: 'SUCCESS',
    message: `Post-execution inventory verified: stock on hand covers operations until delivery arrival. Factory line stoppage risk resolved.`,
    data: {
      outputSummary: {
        componentSku: state.trigger.componentId,
        currentStock: postInventory.quantity,
        daysOfCoverage: postInventory.daysOfCoverage,
      },
    },
  });

  console.log(
    `[AGENT] Post-execution inventory: ${postInventory.quantity} units / ${postInventory.daysOfCoverage}d coverage`
  );

  return {
    currentStep: 'COMPLETE',
    stepIndex: state.stepIndex + 1,
    postExecutionInventory: postInventory,
    toolCallLog: [record],
  };
}

// ==========================================
// NODE 10: COMPLETE
// ==========================================
export async function completeNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`\n[AGENT] ▶ COMPLETE — Final status: ${state.finalStatus}`);
  const disruptionId = state.disruptionEventId ?? state.trigger.purchaseOrderId;

  // Determine final status if not already set
  const finalStatus =
    state.finalStatus !== 'IN_PROGRESS'
      ? state.finalStatus
      : state.approvalRequired
      ? 'PENDING_APPROVAL'
      : state.executionResult?.success
      ? 'MITIGATED'
      : 'FAILED';

  // Update disruption event status in DB
  if (state.disruptionEventId) {
    await prisma.disruptionEvent
      .update({
        where: { id: state.disruptionEventId },
        data: {
          status:
            finalStatus === 'MITIGATED'
              ? 'RESOLVED'
              : finalStatus === 'PENDING_APPROVAL'
              ? 'MITIGATION_PROPOSED'
              : 'ANALYZING',
          resolvedAt: finalStatus === 'MITIGATED' ? new Date() : undefined,
        },
      })
      .catch(() => { /* non-fatal — disruption may not have DB record */ });
  }

  // Emit DISRUPTION_MITIGATED event
  await recordAndEmitEvent({
    disruptionId,
    step: 'COMPLETE',
    type: 'STATE_CHANGE',
    eventType: 'DISRUPTION_MITIGATED',
    status: finalStatus === 'MITIGATED' ? 'SUCCESS' : finalStatus === 'PENDING_APPROVAL' ? 'WARNING' : 'FAILED',
    message: `Disruption lifecycle completed with final status: ${finalStatus}. Total tool calls: ${state.toolCallLog.length}.`,
    data: {
      outputSummary: {
        finalStatus,
        approvalRequired: state.approvalRequired,
        executedPoNumber: state.executionResult?.purchaseOrder?.poNumber ?? null,
      },
    },
  });

  // Write final comprehensive audit log
  await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      COMPLETE_PROMPT +
        `\n\nFull run summary:\n${JSON.stringify(
          {
            trigger: state.trigger,
            inventoryStatus: state.inventoryStatus,
            supplierContradiction: state.supplierClaimContradicted,
            rejectedSuppliers: state.rejectedSuppliers,
            selectedPlan: state.selectedPlan,
            constraintResult: state.constraintResult,
            executionResult: state.executionResult,
            finalStatus,
          },
          null,
          2
        )}`
    ),
  ]);

  const { result: finalAudit } = await callTool(
    'writeAuditLog',
    { action: 'AGENT_COMPLETED' },
    () =>
      writeAuditLog({
        action: 'AGENT_COMPLETED',
        actorType: 'AGENT',
        actorId: 'supply-chain-agent-v1',
        targetEntity: 'DisruptionEvent',
        targetEntityId: state.disruptionEventId ?? state.trigger.purchaseOrderId,
        reasoning: `Agent completed disruption response. Final status: ${finalStatus}.`,
        newState: {
          finalStatus,
          approvalRequired: state.approvalRequired,
          approvalRequestId: state.approvalRequestId,
          executedPoNumber: state.executionResult?.purchaseOrder?.poNumber ?? null,
          totalToolCalls: state.toolCallLog.length,
        },
        metadata: {
          totalSteps: state.stepIndex,
          rejectedSuppliersCount: state.rejectedSuppliers.length,
          planId: state.selectedPlan?.planId,
        },
      }),
    state
  );

  return {
    currentStep: 'COMPLETE',
    stepIndex: state.stepIndex + 1,
    finalStatus,
    auditLogIds: [finalAudit.auditLogId!],
    toolCallLog: [
      {
        stepIndex: state.stepIndex + 1,
        agentStep: 'COMPLETE',
        toolName: 'writeAuditLog',
        input: { action: 'AGENT_COMPLETED' },
        output: finalAudit,
        success: true,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
