// ==========================================
// AgentState — LangGraph Annotation
// ==========================================
// All fields use "replace" reducer (last-write wins).
// Each node returns a Partial<AgentState> updating only what it changes.

import { Annotation } from '@langchain/langgraph';
import type {
  AgentStep,
  FinalStatus,
  ToolCallRecord,
  RejectedSupplier,
  SelectedRecoveryPlan,
  DisruptionTrigger,
} from './types.js';
import type { CheckInventoryOutput } from '../tools/inventoryTools.js';
import type { CheckProductionScheduleOutput } from '../tools/productionTools.js';
import type { VerifyTrackingOutput } from '../tools/trackingTools.js';
import type { SupplierRecord } from '../tools/supplierTools.js';
import type {
  CalculateRecoveryPlanOutput,
  ValidateRecoveryPlanOutput,
  CreatePurchaseOrderOutput,
} from '../tools/procurementTools.js';

export const AgentStateAnnotation = Annotation.Root({
  // ---- Input trigger ----
  trigger: Annotation<DisruptionTrigger>({ reducer: (_, v) => v }),
  disruptionEventId: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),

  // ---- Workflow position ----
  currentStep: Annotation<AgentStep>({ reducer: (_, v) => v, default: () => 'DETECT' }),
  stepIndex: Annotation<number>({ reducer: (_, v) => v, default: () => 0 }),

  // ---- Observability: full tool call log ----
  toolCallLog: Annotation<ToolCallRecord[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),

  // ---- Step: IMPACT_ANALYSIS ----
  inventoryStatus: Annotation<CheckInventoryOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  productionRisk: Annotation<CheckProductionScheduleOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),

  // ---- Step: VERIFY ----
  verificationResult: Annotation<VerifyTrackingOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  supplierClaimContradicted: Annotation<boolean>({
    reducer: (_, v) => v,
    default: () => false,
  }),

  // ---- Step: SOURCE ----
  candidateSuppliers: Annotation<SupplierRecord[]>({
    reducer: (_, v) => v,
    default: () => [],
  }),
  rejectedSuppliers: Annotation<RejectedSupplier[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),

  // ---- Step: PLAN ----
  recoveryOptions: Annotation<CalculateRecoveryPlanOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),
  selectedPlan: Annotation<SelectedRecoveryPlan | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),

  // ---- Step: CONSTRAINT_CHECK ----
  constraintResult: Annotation<ValidateRecoveryPlanOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),

  // ---- Step: APPROVAL_GATE ----
  approvalRequired: Annotation<boolean>({ reducer: (_, v) => v, default: () => false }),
  approvalRequestId: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),

  // ---- Step: EXECUTE ----
  executionResult: Annotation<CreatePurchaseOrderOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),

  // ---- Step: VERIFY_OUTCOME ----
  postExecutionInventory: Annotation<CheckInventoryOutput | null>({
    reducer: (_, v) => v,
    default: () => null,
  }),

  // ---- Terminal ----
  finalStatus: Annotation<FinalStatus>({
    reducer: (_, v) => v,
    default: () => 'IN_PROGRESS',
  }),
  errorMessage: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
  auditLogIds: Annotation<string[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;
