// =========================================================
// Frontend API & State Models
// =========================================================

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

export type DisruptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  currentStock: number;
  safetyStock: number;
  dailyBurnRate: number;
  unitCost: number;
  status: string;
  daysOfCoverage: number;
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  productName: string;
  targetQuantity: number;
  completedQuantity: number;
  status: string;
  priority: string;
  dueDate: string;
  affectedByDisruption: boolean;
}

export interface SupplierItem {
  id: string;
  code: string;
  name: string;
  country: string;
  tier: number;
  reliabilityScore: number;
  leadTimeDaysAvg: number;
  iso9001Certified: boolean;
  unitPrice: number;
  availableCapacity: number;
  status: string;
  isEligible: boolean;
  ineligibilityReason: string | null;
}

export interface TrackingEvent {
  id: string;
  eventType: string;
  status: string;
  location: string;
  carrier: string;
  eventTimestamp: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  status: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  expectedDeliveryDate: string;
  supplierClaimStatus: string | null;
  supplierClaimNotes: string | null;
  trackingEvents: TrackingEvent[];
  supplier?: {
    code: string;
    name: string;
  };
}

export interface DisruptionEvent {
  id: string;
  title: string;
  description: string;
  severity: DisruptionSeverity;
  category: string;
  status: string;
  affectedPoIds: string[];
  affectedSkuIds: string[];
  estimatedDelayDays: number;
  impactScore: number;
  detectedAt: string;
}

export interface ApprovalRequest {
  id: string;
  recoveryPlanId: string;
  actionType: string;
  requiredRole: string;
  status: ApprovalStatus;
  riskLevel: string;
  requestedAt: string;
  respondedAt?: string | null;
  respondedBy?: string | null;
  approverNotes?: string | null;
  payload: {
    status: string;
    recoveryCost: number;
    autonomousLimit: number;
    overageAmount?: number;
    reason: string;
    disruption: {
      title: string;
      severity: string;
      estimatedDelayDays: number;
      impactScore: number;
    };
    productionRisk: {
      componentSku: string;
      currentStock: number;
      shortfallUnits: number;
      deadlineDays: number | null;
      riskLevel: string;
    };
    supplierVerificationResult: {
      hasContradiction: boolean;
      supplierClaimStatus: string | null;
      latestCarrierEventType: string | null;
    };
    recoveryPlan: {
      planId: string;
      description: string;
      actions: Array<{
        supplierCode: string;
        quantityOrdered: number;
        unitPrice: number;
        estimatedLeadTimeDays: number;
      }>;
      totalQuantity: number;
      totalCostUSD: number;
      fastestDeliveryDays: number;
    };
    constraintViolations: Array<{
      rule: string;
      message: string;
    }>;
  };
}

export interface DemoStateResponse {
  timestamp: string;
  scenario: {
    title: string;
    component: {
      sku: string;
      name: string;
      currentStock: number;
      dailyBurnRate: number;
      daysOfCoverage: number;
      safetyStock: number;
    };
    productionOrder: {
      orderNumber: string;
      productName: string;
      requiredQuantity: number;
      deadlineDays: number;
      deficitUnits: number;
      lineShutdownRisk: boolean;
    };
    disruptedPurchaseOrder: {
      poNumber: string;
      supplierCode: string;
      supplierClaim: string;
      carrierTrackingStatus: string;
      hasContradiction: boolean;
    };
    businessRules: {
      mandatoryCertifications: string[];
      autonomousBudgetUSD: number;
    };
  };
  liveDatabase: {
    inventory: InventoryItem[];
    suppliers: SupplierItem[];
    purchaseOrders: PurchaseOrder[];
    productionOrders: ProductionOrder[];
    disruptions: DisruptionEvent[];
    approvalRequests: ApprovalRequest[];
  };
}

export interface AgentRealtimeEvent {
  id?: string;
  timestamp: string;
  disruptionId: string;
  step: string;
  type: 'TOOL_CALL' | 'STATE_CHANGE' | 'GOVERNANCE' | 'ALERT';
  eventType: string;
  tool?: string;
  status: 'SUCCESS' | 'WARNING' | 'BLOCKED' | 'FAILED';
  message: string;
  data?: {
    inputSummary?: Record<string, unknown> | string;
    outputSummary?: Record<string, unknown> | string;
    ruleResults?: Record<string, unknown>;
  };
}

export interface AgentRunResult {
  finalStatus: string;
  currentStep: AgentStep;
  stepCount: number;
  approvalRequired: boolean;
  approvalRequestId: string | null;
  supplierClaimContradicted: boolean;
  selectedPlan: {
    planId: string;
    description: string;
    totalQuantity: number;
    totalCostUSD: number;
    fastestDeliveryDays: number;
    reasoning: string;
  } | null;
  executionResult?: {
    success: boolean;
    purchaseOrder?: {
      poNumber: string;
      totalAmountUSD: number;
      supplierCode: string;
      quantityOrdered: number;
      expectedDeliveryDate: string;
    };
  } | null;
}
