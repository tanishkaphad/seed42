import { evaluateDisruption, executeRecoveryPlan, RecoveryEvaluationResult } from '../sim/recovery.js';
import { logAgentEvent } from '../sim/agentStore.js';
import type { ParsedEmailSignal } from '../llm/parser.js';

/** Supplier recovery agent — ranks fallbacks on the live sim, not a second catalog. */
export async function recoverSupplier(input: {
  runId: string;
  componentId: string;
  poId?: string | null;
}) {
  const evaluation = await evaluateDisruption({
    component_id: input.componentId,
    po_id: input.poId || undefined,
  });
  await logAgentEvent(
    input.runId,
    'supplier',
    `${evaluation.recommendation.action} via ${evaluation.recommendation.chosen_supplier_name || 'none'} @ ${evaluation.recommendation.estimated_cost}.`
  );
  return evaluation;
}

export function collectDealRisks(input: {
  signal: ParsedEmailSignal;
  supplierId?: string;
  poSupplierId?: string | null;
  capabilityCertOk?: boolean | null;
  quoteUnitPrice?: number | null;
  evaluation: RecoveryEvaluationResult | null;
  trackingContradiction?: string | null;
}): string[] {
  const risks: string[] = [];
  if (input.signal.classification === 'contradictory') risks.push('Contradictory supplier language');
  if (input.signal.deal_intent === 'reject') risks.push('Supplier rejected the deal');
  if (input.capabilityCertOk === false) risks.push('Missing required certification');
  if (input.quoteUnitPrice && input.signal.quoted_unit_price && input.signal.quoted_unit_price > input.quoteUnitPrice * 1.05) {
    risks.push(`Quoted unit price ${input.signal.quoted_unit_price} exceeds open quote ${input.quoteUnitPrice}`);
  }
  if (
    input.evaluation &&
    input.signal.reported_delay_days !== null &&
    input.signal.reported_delay_days > input.evaluation.operational_metrics.days_of_coverage
  ) {
    risks.push(
      `Delay ${input.signal.reported_delay_days}d exceeds ${input.evaluation.operational_metrics.days_of_coverage}d coverage`
    );
  }
  if (input.trackingContradiction && input.supplierId && input.poSupplierId === input.supplierId) {
    risks.push(input.trackingContradiction);
  }
  return risks;
}

export { executeRecoveryPlan };
