import { checkApproval } from '../sim/approval.js';
import { logAgentEvent } from '../sim/agentStore.js';
import type { ParsedEmailSignal } from '../llm/parser.js';

export type AgentDecision = 'execute' | 'negotiate' | 'escalate';

/** Escalation agent — a supplier YES is never enough on its own. */
export function decideFromRules(input: {
  signal: ParsedEmailSignal;
  risks: string[];
  componentId: string | null;
  dealContext: boolean;
}): AgentDecision {
  if (input.signal.deal_intent === 'reject' || input.signal.classification === 'contradictory') return 'escalate';
  if (input.risks.length) return 'escalate';
  if (input.signal.classification === 'vague' || input.signal.deal_intent === 'unclear' || !input.componentId) {
    return 'negotiate';
  }
  if (input.signal.deal_intent === 'confirm' && input.signal.classification === 'confirmed' && input.dealContext) {
    return 'execute';
  }
  return 'negotiate';
}

export async function guardSpend(input: {
  runId: string;
  estimatedCost: number;
  reason: string;
}) {
  const approval = await checkApproval({
    action_type: 'supplier_confirmed_deal',
    estimated_cost: input.estimatedCost,
    reason: input.reason,
  });
  const allowed = approval.approval_status === 'auto_approved' || approval.approval_status === 'approved';
  await logAgentEvent(
    input.runId,
    'escalation',
    allowed
      ? `Spend ${input.estimatedCost} within threshold (${approval.approval_id}).`
      : `Spend ${input.estimatedCost} blocked — ${approval.approval_status} (${approval.approval_id}).`
  );
  return { allowed, approval };
}
