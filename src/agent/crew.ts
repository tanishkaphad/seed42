import { env } from '../config/env.js';
import { getInventory, InventoryRecord } from '../sim/inventory.js';
import { evaluateDisruption, executeRecoveryPlan, RecoveryEvaluationResult } from '../sim/recovery.js';
import { sendSupplierMessage } from '../sim/messaging.js';
import { checkApproval } from '../sim/approval.js';
import { planMailbox } from '../mail/deliver.js';
import {
  createAgentRun,
  logAgentEvent,
  patchAgentRun,
  findRunByApproval,
  recordPayment,
} from '../sim/agentStore.js';

export async function watchShortages(maxDays = env.AGENT_COVERAGE_DAYS): Promise<InventoryRecord[]> {
  const items = await getInventory();
  return items.filter((x) => x.days_of_coverage < maxDays).sort((a, b) => a.days_of_coverage - b.days_of_coverage);
}

async function treasurerSettle(runId: string, evaluation: RecoveryEvaluationResult) {
  const execution = await executeRecoveryPlan(evaluation);
  const amount = evaluation.recommendation.estimated_cost;
  const paymentId = await recordPayment(runId, execution.po_created?.po_id || null, amount);
  await logAgentEvent(
    runId,
    'treasurer',
    `Payment ${paymentId} recorded (${amount}) and PO ${execution.po_created?.po_id || 'none'} processed.`
  );
  await patchAgentRun(runId, 'completed', { evaluation, execution, payment_id: paymentId });
  return { execution, paymentId };
}

export async function runShortageCrew(componentId?: string) {
  const shortages = await watchShortages();
  const pick = componentId
    ? shortages.find((x) => x.component_id === componentId) || (await getInventory(componentId))[0]
    : shortages[0];

  const runId = await createAgentRun(pick?.component_id);
  await logAgentEvent(
    runId,
    'watcher',
    pick
      ? `Shortage on ${pick.component_id}: ${pick.days_of_coverage} days coverage (threshold ${env.AGENT_COVERAGE_DAYS}).`
      : `No component below ${env.AGENT_COVERAGE_DAYS} days of coverage.`
  );

  if (!pick) {
    await patchAgentRun(runId, 'completed', { shortages });
    return { run_id: runId, status: 'completed', shortages };
  }

  const evaluation = await evaluateDisruption({ component_id: pick.component_id });
  await logAgentEvent(
    runId,
    'sourcer',
    `${evaluation.recommendation.action} via ${evaluation.recommendation.chosen_supplier_name || 'no supplier'} at ${evaluation.recommendation.estimated_cost}. ${evaluation.recommendation.justification}`
  );

  const supplierId = evaluation.recommendation.chosen_supplier_id || evaluation.disruption.original_supplier;
  let mail: Awaited<ReturnType<typeof sendSupplierMessage>> | null = null;
  if (supplierId) {
    const mailbox = planMailbox('supplier');
    mail = await sendSupplierMessage({
      supplier_id: supplierId,
      po_id: evaluation.disruption.affected_po_id || undefined,
      subject: `Shortage cover — ${evaluation.disruption.component_name} (${pick.component_id})`,
      body: [
        `We are short on ${evaluation.disruption.component_name} (${pick.component_id}).`,
        `Usable coverage is ${evaluation.operational_metrics.days_of_coverage} days.`,
        `Requested quantity: ${evaluation.recommendation.order_quantity}.`,
        `Please confirm supply against this RFQ/emergency cover.`,
      ].join('\n'),
    });
    await logAgentEvent(
      runId,
      'mailer',
      mailbox.mode === 'live'
        ? `Live mail sent to ${mailbox.to} (supplier ${supplierId}, message ${mail.outbound.message_id}).`
        : `Sandbox mail logged as ${mail.outbound.message_id}. Set MAIL_TO and RESEND_API_KEY for live delivery.`
    );
  } else {
    await logAgentEvent(runId, 'mailer', 'No supplier mailbox — skipped send.');
  }

  if (evaluation.recommendation.action !== 'place_emergency_order' || !evaluation.recommendation.chosen_supplier_id) {
    await patchAgentRun(runId, 'completed', { evaluation, mail });
    return { run_id: runId, status: 'completed', evaluation, mail };
  }

  const approval = await checkApproval({
    action_type: 'emergency_purchase',
    estimated_cost: evaluation.recommendation.estimated_cost,
    reason: evaluation.recommendation.justification,
  });
  await logAgentEvent(runId, 'treasurer', `Approval ${approval.approval_id} is ${approval.approval_status}.`);

  if (approval.approval_status === 'pending_human_approval') {
    await patchAgentRun(runId, 'waiting_approval', { evaluation, approval_id: approval.approval_id, mail });
    return { run_id: runId, status: 'waiting_approval', approval, evaluation, mail };
  }

  const settled = await treasurerSettle(runId, evaluation);
  return { run_id: runId, status: 'completed', approval, evaluation, mail, ...settled };
}

export async function resumeAfterApproval(approvalId: string, action: 'approved' | 'rejected') {
  const run = await findRunByApproval(approvalId);
  if (!run || run.status !== 'waiting_approval') return null;
  await logAgentEvent(run.run_id, 'treasurer', `Human ${action} ${approvalId}.`);
  if (action === 'rejected') {
    await patchAgentRun(run.run_id, 'rejected', { ...run.payload, rejected: true });
    return { run_id: run.run_id, status: 'rejected' };
  }
  const payload = typeof run.payload === 'string' ? JSON.parse(run.payload) : run.payload;
  const settled = await treasurerSettle(run.run_id, payload.evaluation);
  return { run_id: run.run_id, status: 'completed', ...settled };
}
