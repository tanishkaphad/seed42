import { env } from '../config/env.js';
import { recordAuditTrail } from '../audit/trail.js';
import { deliverLiveEmail } from '../mail/deliver.js';
import { logAgentEvent, patchAgentRun } from '../sim/agentStore.js';

/** Email / audit agent — persist the decision and notify the operator. */
export async function recordAndReport(input: {
  runId: string;
  decision: string;
  summary: string;
  from: string;
  subject: string;
  body: string;
  inboundId?: string;
  supplierLabel: string;
  poLabel: string;
  quoteLabel: string;
  price: string | number;
  delivery: string | number;
  actions: string[];
  paymentStatus: string;
  risks: string[];
  calculations: Record<string, unknown>;
}) {
  const audit = await recordAuditTrail({
    disruption_id: `INB-${input.runId}`,
    detected_disruption: input.summary,
    data_sources_checked: ['inventory', 'purchase_orders', 'rfq_quotes', 'shipment_tracking', 'suppliers'],
    messages_received: [{ from: input.from, subject: input.subject, body: input.body, message_id: input.inboundId }],
    calculations: input.calculations,
    decision: input.decision,
    decision_reason: input.risks.join('; ') || input.summary,
    erp_updates: input.actions,
    escalations: input.decision === 'escalate' ? input.risks : [],
    remaining_risks: input.risks,
  });

  await patchAgentRun(input.runId, input.decision === 'execute' ? 'completed' : input.decision, {
    decision: input.decision,
    paymentStatus: input.paymentStatus,
    audit_id: audit.audit_id,
  });
  await logAgentEvent(input.runId, 'audit', `Logged ${audit.audit_id}. Status ${input.paymentStatus}.`);

  await deliverLiveEmail({
    intended: env.MAIL_TO || 'operator',
    audience: 'user',
    subject: `Agent report — ${input.decision} — ${input.supplierLabel}`,
    body: [
      `Supplier: ${input.supplierLabel}`,
      `PO: ${input.poLabel}`,
      `Quote: ${input.quoteLabel}`,
      `Incoming: ${input.subject}`,
      input.body.slice(0, 1200),
      `Decision: ${input.decision}`,
      `Price: ${input.price}`,
      `Delivery: ${input.delivery}`,
      `Actions: ${input.actions.join('; ') || 'none'}`,
      `Payment/action status: ${input.paymentStatus}`,
      `Risks: ${input.risks.join('; ') || 'none'}`,
      `Audit: ${audit.audit_id}`,
    ].join('\n'),
  });

  return audit;
}
