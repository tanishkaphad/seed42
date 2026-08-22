// ==========================================
// Agent Types
// ==========================================

import type { CheckInventoryOutput } from '../tools/inventoryTools.js';
import type { CheckProductionScheduleOutput } from '../tools/productionTools.js';
import type { VerifyTrackingOutput } from '../tools/trackingTools.js';
import type { SupplierRecord } from '../tools/supplierTools.js';
import type {
  CalculateRecoveryPlanOutput,
  ValidateRecoveryPlanOutput,
  CreatePurchaseOrderOutput,
} from '../tools/procurementTools.js';

// ---- Agent Step names ----
export type AgentStep =
  | 'DETECT'
  | 'IMPACT_ANALYSIS'
  | 'VERIFY'
  | 'SOURCE'
  | 'PLAN'
  | 'CONSTRAINT_CHECK'
  | 'APPROVAL_GATE'
  | 'EXECUTE'
  | 'VERIFY_OUTCOME'
  | 'COMPLETE'
  | 'FAILED';

// ---- Final status ----
export type FinalStatus =
  | 'IN_PROGRESS'
  | 'MITIGATED'
  | 'PENDING_APPROVAL'
  | 'FAILED'
  | 'NO_ACTION_REQUIRED';

// ---- Tool call record (for full observability) ----
export interface ToolCallRecord {
  stepIndex: number;
  agentStep: AgentStep;
  toolName: string;
  input: unknown;
  output: unknown;
  success: boolean;
  errorMessage?: string;
  durationMs: number;
  timestamp: string;
}

// ---- Rejected supplier record ----
export interface RejectedSupplier {
  supplierCode: string;
  supplierName: string;
  violations: Array<{ rule: string; message: string }>;
  rejectedAt: string;
}

// ---- Recovery candidate selected by agent ----
export interface SelectedRecoveryPlan {
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
  reasoning: string; // LLM's reasoning for choosing this plan
}

// ---- Disruption input trigger ----
export interface DisruptionTrigger {
  purchaseOrderId: string;
  supplierId: string;
  componentId: string;
  claimedDelayDays: number;
  disruptionEventId?: string; // if already in DB
}
