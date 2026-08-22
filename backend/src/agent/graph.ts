// ==========================================
// Agent Graph — LangGraph StateGraph
// ==========================================
// Defines the directed graph of nodes and conditional edges.
// The graph encodes the DETECT → ... → COMPLETE workflow.

import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentStateAnnotation } from './state.js';
import {
  detectNode,
  impactAnalysisNode,
  verifyNode,
  sourceNode,
  planNode,
  constraintCheckNode,
  approvalGateNode,
  executeNode,
  verifyOutcomeNode,
  completeNode,
} from './nodes.js';
import type { AgentState } from './state.js';

// ---- Routing functions (conditional edges) ----

/**
 * After IMPACT_ANALYSIS: if production is at risk → proceed.
 * If no risk detected (shortfall=0, no deadline pressure) → skip to COMPLETE.
 */
function routeAfterImpact(state: AgentState): string {
  const riskLevel = state.productionRisk?.riskLevel;
  if (riskLevel === 'NONE' && (state.productionRisk?.shortfallUnits ?? 0) === 0) {
    console.log('[GRAPH] No production risk — routing to COMPLETE directly');
    return 'complete';
  }
  return 'verify';
}

/**
 * After CONSTRAINT_CHECK:
 * - Hard violations → directly to APPROVAL_GATE (which will route to FAILED)
 * - Budget issue → APPROVAL_GATE (which will create approval request)
 * - All clear → APPROVAL_GATE (which will route to EXECUTE)
 */
function routeAfterConstraint(state: AgentState): string {
  if (!state.constraintResult) return 'complete';
  return 'approval_gate';
}

/**
 * After APPROVAL_GATE:
 * - PENDING_APPROVAL → COMPLETE (workflow pauses — human must resume)
 * - FAILED → COMPLETE (record failure)
 * - EXECUTE → execute
 */
function routeAfterApprovalGate(state: AgentState): string {
  if (state.currentStep === 'FAILED') return 'complete';
  if (state.finalStatus === 'PENDING_APPROVAL') return 'complete';
  if (state.approvalRequired && !state.approvalRequestId) return 'complete';
  return 'execute';
}

/**
 * After EXECUTE: success → VERIFY_OUTCOME, failure → COMPLETE.
 */
function routeAfterExecute(state: AgentState): string {
  if (state.currentStep === 'FAILED' || !state.executionResult?.success) {
    return 'complete';
  }
  return 'verify_outcome';
}

/**
 * After PLAN: if no plan was generated → FAILED.
 */
function routeAfterPlan(state: AgentState): string {
  if (!state.selectedPlan || state.currentStep === 'FAILED') return 'complete';
  return 'constraint_check';
}

// ---- Build the graph ----

export function buildAgentGraph() {
  const builder = new StateGraph(AgentStateAnnotation)
    // Register all nodes
    .addNode('detect', detectNode)
    .addNode('impact_analysis', impactAnalysisNode)
    .addNode('verify', verifyNode)
    .addNode('source', sourceNode)
    .addNode('plan', planNode)
    .addNode('constraint_check', constraintCheckNode)
    .addNode('approval_gate', approvalGateNode)
    .addNode('execute', executeNode)
    .addNode('verify_outcome', verifyOutcomeNode)
    .addNode('complete', completeNode)

    // Entry point
    .addEdge(START, 'detect')

    // Fixed edges (always follow)
    .addEdge('detect', 'impact_analysis')
    .addEdge('verify', 'source')
    .addEdge('source', 'plan')
    .addEdge('verify_outcome', 'complete')
    .addEdge('complete', END)

    // Conditional edges (routing logic)
    .addConditionalEdges('impact_analysis', routeAfterImpact, {
      verify: 'verify',
      complete: 'complete',
    })
    .addConditionalEdges('plan', routeAfterPlan, {
      constraint_check: 'constraint_check',
      complete: 'complete',
    })
    .addConditionalEdges('constraint_check', routeAfterConstraint, {
      approval_gate: 'approval_gate',
      complete: 'complete',
    })
    .addConditionalEdges('approval_gate', routeAfterApprovalGate, {
      execute: 'execute',
      complete: 'complete',
    })
    .addConditionalEdges('execute', routeAfterExecute, {
      verify_outcome: 'verify_outcome',
      complete: 'complete',
    });

  return builder.compile();
}

// Singleton compiled graph
export const agentGraph = buildAgentGraph();
