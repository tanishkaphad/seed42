// ==========================================
// Agent Audit & Real-time Event Types
// ==========================================

export type AgentEventType =
  | 'DISRUPTION_DETECTED'
  | 'INVENTORY_CHECK'
  | 'PRODUCTION_RISK'
  | 'SUPPLIER_VERIFICATION'
  | 'SUPPLIER_REJECTED'
  | 'ALTERNATIVE_FOUND'
  | 'RECOVERY_PLAN_CREATED'
  | 'CONSTRAINT_CHECK'
  | 'CONSTRAINT_FAILED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_GRANTED'
  | 'PURCHASE_ORDER_CREATED'
  | 'OUTCOME_VERIFIED'
  | 'DISRUPTION_MITIGATED';

export type EventCategory = 'TOOL_CALL' | 'STATE_CHANGE' | 'GOVERNANCE' | 'ALERT';

export type EventStatus = 'SUCCESS' | 'WARNING' | 'BLOCKED' | 'FAILED';

export interface AgentEventPayload {
  inputSummary?: Record<string, unknown> | string;
  outputSummary?: Record<string, unknown> | string;
  ruleResults?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AgentRealtimeEvent {
  id?: string;
  timestamp: string;
  disruptionId: string;
  step: string;
  type: EventCategory;
  eventType: AgentEventType;
  tool?: string;
  status: EventStatus;
  message: string;
  data?: AgentEventPayload;
}

export interface EmitEventInput {
  disruptionId: string;
  step: string;
  type: EventCategory;
  eventType: AgentEventType;
  tool?: string;
  status: EventStatus;
  message: string;
  data?: AgentEventPayload;
  actorType?: 'AGENT' | 'USER' | 'SYSTEM';
  actorId?: string;
  targetEntity?: string;
  targetEntityId?: string;
}
