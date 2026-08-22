// ==========================================
// Agent Public API
// ==========================================
// Import this in routes and SSE handlers.
// Never import graph.ts or nodes.ts directly from routes.

import { agentGraph } from './graph.js';
import type { DisruptionTrigger } from './types.js';
import type { AgentState } from './state.js';

export interface AgentRunResult {
  finalStatus: AgentState['finalStatus'];
  currentStep: AgentState['currentStep'];
  stepCount: number;
  disruptionEventId: string | null;
  inventoryStatus: AgentState['inventoryStatus'];
  productionRisk: AgentState['productionRisk'];
  supplierClaimContradicted: boolean;
  verificationResult: AgentState['verificationResult'];
  candidateSuppliers: AgentState['candidateSuppliers'];
  rejectedSuppliers: AgentState['rejectedSuppliers'];
  selectedPlan: AgentState['selectedPlan'];
  constraintResult: AgentState['constraintResult'];
  approvalRequired: boolean;
  approvalRequestId: string | null;
  executionResult: AgentState['executionResult'];
  postExecutionInventory: AgentState['postExecutionInventory'];
  toolCallLog: AgentState['toolCallLog'];
  auditLogIds: string[];
  errorMessage: string | null;
}

/**
 * runDisruptionAgent
 *
 * Executes the full supply chain disruption response workflow.
 *
 * The agent:
 *  1. Detects and logs the disruption
 *  2. Analyses inventory and production impact
 *  3. Verifies supplier claim vs carrier tracking
 *  4. Sources alternative suppliers
 *  5. Generates and evaluates recovery plans
 *  6. Passes plans through the Constraint Engine (deterministic)
 *  7. Executes autonomously (if within $150k budget) or creates approval request
 *  8. Verifies post-execution state
 *  9. Writes a complete audit trail
 *
 * @param trigger - Disruption event details
 * @param humanApprovalId - Optional: provide after human approves to resume execution
 */
export async function runDisruptionAgent(
  trigger: DisruptionTrigger,
  humanApprovalId?: string
): Promise<AgentRunResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[AGENT] Starting Supply Chain Disruption Response`);
  console.log(`[AGENT] PO: ${trigger.purchaseOrderId} | Component: ${trigger.componentId}`);
  console.log(`${'='.repeat(60)}\n`);

  const initialState: Partial<AgentState> = {
    trigger,
    currentStep: 'DETECT',
    stepIndex: 0,
    // Inject human approval ID if resuming after approval
    approvalRequestId: humanApprovalId ?? null,
    approvalRequired: false,
  };

  const finalState = await agentGraph.invoke(initialState, {
    recursionLimit: 25,
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[AGENT] Completed — Status: ${finalState.finalStatus}`);
  console.log(`[AGENT] Steps: ${finalState.stepIndex} | Tools called: ${finalState.toolCallLog?.length ?? 0}`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    finalStatus: finalState.finalStatus,
    currentStep: finalState.currentStep,
    stepCount: finalState.stepIndex,
    disruptionEventId: finalState.disruptionEventId,
    inventoryStatus: finalState.inventoryStatus,
    productionRisk: finalState.productionRisk,
    supplierClaimContradicted: finalState.supplierClaimContradicted,
    verificationResult: finalState.verificationResult,
    candidateSuppliers: finalState.candidateSuppliers,
    rejectedSuppliers: finalState.rejectedSuppliers,
    selectedPlan: finalState.selectedPlan,
    constraintResult: finalState.constraintResult,
    approvalRequired: finalState.approvalRequired,
    approvalRequestId: finalState.approvalRequestId,
    executionResult: finalState.executionResult,
    postExecutionInventory: finalState.postExecutionInventory,
    toolCallLog: finalState.toolCallLog ?? [],
    auditLogIds: finalState.auditLogIds ?? [],
    errorMessage: finalState.errorMessage,
  };
}

export type { DisruptionTrigger };
