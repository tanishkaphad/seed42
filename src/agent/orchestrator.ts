import { parseInboundEmailWithGroq } from '../llm/parser.js';
import { recordInboundMessage, sendSupplierMessage, extractMailbox } from '../sim/messaging.js';
import { createPurchaseOrder } from '../sim/purchaseOrders.js';
import { acceptQuote } from '../sim/rfq.js';
import { createAgentRun, logAgentEvent, recordPayment } from '../sim/agentStore.js';
import { loadErpSnapshot } from './simulation.js';
import { recoverSupplier, collectDealRisks, executeRecoveryPlan } from './supplier.js';
import { decideFromRules, guardSpend } from './escalation.js';
import { recordAndReport } from './audit.js';

export interface InboundEmailInput {
  from: string;
  subject?: string;
  text?: string;
  html?: string;
}

export function normalizeInbound(raw: any): InboundEmailInput {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const from = data.from || data.sender || data.From || '';
  const fromAddr = typeof from === 'string' ? from : from?.address || from?.email || '';
  return {
    from: fromAddr,
    subject: data.subject || data.Subject || '',
    text: data.text || data.body || data.html || data.TextBody || '',
    html: data.html,
  };
}

/** Orchestrator — supplier email → ERP facts → recovery → rules → execute/negotiate/escalate → audit. */
export async function processInboundEmail(raw: unknown) {
  const input = normalizeInbound(raw);
  const from = extractMailbox(input.from || '');
  const body = String(input.text || '').trim();
  const subject = String(input.subject || 'Supplier message');
  if (!from || !body) throw new Error('Inbound email needs from and body text');

  const signal = await parseInboundEmailWithGroq(body, subject, from);
  const runId = await createAgentRun(signal.component_id || undefined);
  await logAgentEvent(runId, 'orchestrator', `Inbound from ${from}: ${signal.summary}`);

  const erp = await loadErpSnapshot({
    runId,
    fromEmail: from,
    poId: signal.affected_po_id,
    componentId: signal.component_id,
    rfqId: signal.rfq_id,
  });

  if (!erp.supplier) {
    const audit = await recordAndReport({
      runId,
      decision: 'escalate',
      summary: `Unmatched sender ${from}`,
      from,
      subject,
      body,
      supplierLabel: `unknown (${from})`,
      poLabel: signal.affected_po_id || '—',
      quoteLabel: '—',
      price: '—',
      delivery: '—',
      actions: [],
      paymentStatus: 'none',
      risks: ['Unknown counterpart — add this mailbox under Contacts'],
      calculations: { from },
    });
    return { run_id: runId, status: 'escalated', reason: 'unknown_sender', signal, audit_id: audit.audit_id };
  }

  const stored = await recordInboundMessage({
    supplier_id: erp.supplier.supplier_id,
    po_id: signal.affected_po_id || erp.po?.po_id,
    subject,
    body,
  });

  const evaluation = erp.componentId
    ? await recoverSupplier({ runId, componentId: erp.componentId, poId: erp.po?.po_id })
    : null;

  const risks = collectDealRisks({
    signal,
    supplierId: erp.supplier.supplier_id,
    poSupplierId: erp.po?.supplier_id,
    capabilityCertOk: erp.capability?.has_required_certification,
    quoteUnitPrice: erp.quote ? Number(erp.quote.unit_price) : null,
    evaluation,
    trackingContradiction: erp.tracking?.contradiction_detected ? erp.tracking.discrepancy_details || 'Tracking contradiction' : null,
  });

  const dealContext = Boolean(
    erp.quote || evaluation?.recommendation.chosen_supplier_id === erp.supplier.supplier_id
  );
  let decision = decideFromRules({
    signal,
    risks,
    componentId: erp.componentId,
    dealContext,
  });

  await logAgentEvent(runId, 'orchestrator', `Proposed ${decision}. Risks: ${risks.join('; ') || 'none'}.`);

  let paymentStatus = 'none';
  const actions: string[] = [];
  let execution: unknown = null;

  if (decision === 'negotiate') {
    await sendSupplierMessage({
      supplier_id: erp.supplier.supplier_id,
      po_id: erp.po?.po_id,
      subject: `RE: ${subject} — clarification required`,
      body: [
        `Please confirm the deal for ${erp.componentId || 'the requested component'}.`,
        `Reply with: confirm/accept, unit price, delivery days, and PO/RFQ reference.`,
        erp.inventory ? `We have ${erp.inventory.days_of_coverage} days of coverage remaining.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      skipSimulatedReply: true,
    });
    actions.push('Requested clarification from supplier');
  }

  if (decision === 'execute') {
    const amount = erp.quote ? Number(erp.quote.total_standard_cost) : evaluation?.recommendation.estimated_cost || 0;
    const spend = await guardSpend({ runId, estimatedCost: amount, reason: signal.summary });
    if (!spend.allowed) {
      decision = 'escalate';
      paymentStatus = `waiting_approval ${spend.approval.approval_id}`;
      actions.push(`Human approval required (${spend.approval.approval_id})`);
    } else if (erp.quote) {
      await acceptQuote(erp.quote.quote_id);
      const days = signal.stated_delivery_days || erp.quote.delivery_days || 5;
      const poCreated = await createPurchaseOrder({
        component_id: erp.quote.component_id,
        supplier_id: erp.supplier.supplier_id,
        quantity: erp.quote.quantity_available,
        unit_price: erp.quote.unit_price,
        expected_delivery: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
      });
      const paymentId = await recordPayment(runId, poCreated.po_id, amount);
      paymentStatus = `simulated_paid ${paymentId}`;
      actions.push(`Accepted ${erp.quote.quote_id}`, `Created ${poCreated.po_id}`, `Payment ${paymentId}`);
      execution = { po: poCreated, paymentId, quote_id: erp.quote.quote_id };
    } else if (evaluation) {
      const settled = await executeRecoveryPlan(evaluation);
      const paymentId = await recordPayment(runId, settled.po_created?.po_id || null, amount);
      paymentStatus = `simulated_paid ${paymentId}`;
      actions.push(settled.message, `Payment ${paymentId}`);
      execution = { ...settled, paymentId };
    }
  }

  const audit = await recordAndReport({
    runId,
    decision,
    summary: signal.summary,
    from,
    subject,
    body,
    inboundId: stored.message_id,
    supplierLabel: `${erp.supplier.supplier_name} (${erp.supplier.supplier_id}) <${erp.supplier.email}>`,
    poLabel: erp.po?.po_id || signal.affected_po_id || (execution as any)?.po?.po_id || '—',
    quoteLabel: erp.quote?.quote_id || '—',
    price: signal.quoted_unit_price || erp.quote?.unit_price || evaluation?.recommendation.estimated_cost || '—',
    delivery: signal.stated_delivery_days || erp.quote?.delivery_days || evaluation?.recommendation.expected_delivery_days || '—',
    actions,
    paymentStatus,
    risks,
    calculations: {
      deal_intent: signal.deal_intent,
      quoted_unit_price: signal.quoted_unit_price,
      days_of_coverage: erp.inventory?.days_of_coverage,
      tracking_contradiction: erp.tracking?.contradiction_detected || false,
    },
  });

  return {
    run_id: runId,
    status: decision,
    supplier: erp.supplier,
    signal,
    quote: erp.quote,
    po: erp.po,
    tracking: erp.tracking,
    risks,
    actions,
    paymentStatus,
    execution,
    audit_id: audit.audit_id,
    inbound_message_id: stored.message_id,
  };
}
