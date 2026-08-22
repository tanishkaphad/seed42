import { groqReady, runSpecialist } from '../llm';
import { loadErpTool, recoverSupplierTool, checkApprovalTool } from './tools';
import { sim } from '../sim';

const ROLES = {
  orchestrator: 'You are the orchestrator. Sequence ERP, supplier recovery, escalation, then audit. A supplier YES is not payment.',
  simulation: 'You are the simulation/ERP agent. Summarize inventory coverage, PO status, quotes, and tracking contradictions.',
  supplier: 'You are supplier recovery. Recommend a certified fallback and shipping mode. Never pick a supplier missing required certification.',
  escalation: 'You are escalation. If cost exceeds the autonomous threshold or risks remain, require a human. Do not authorize payment on confirmation alone.',
  audit: 'You are email/audit. Draft the operator report: supplier, PO, inbound text, decision, price, delivery, actions, payment status, risks.',
};

export async function runLangChainInbound(input: { from: string; subject?: string; text?: string }) {
  const briefs: { agent: string; brief: string }[] = [];

  if (groqReady()) {
    try {
      const erp = await loadErpTool.invoke({
        from: input.from,
        po_id: input.text?.match(/PO[-_\s]?\d+/i)?.[0]?.replace(/\s/g, '-'),
        component_id: input.text?.match(/COMP[-_\s]?\d+/i)?.[0]?.replace(/\s/g, '-'),
      });
      const erpJson = JSON.parse(String(erp));
      briefs.push(await runSpecialist('simulation', ROLES.simulation, String(erp)));
      try {
        const rec = await recoverSupplierTool.invoke({
          component_id: String(erpJson.inventory?.component_id || erpJson.po?.component_id || 'COMP-104'),
          po_id: erpJson.po?.po_id,
        });
        briefs.push(await runSpecialist('supplier', ROLES.supplier, rec));
        const cost = Number(JSON.parse(rec).recommendation?.estimated_cost || 0);
        const gate = await checkApprovalTool.invoke({ estimated_cost: cost, reason: input.subject || 'inbound deal' });
        briefs.push(await runSpecialist('escalation', ROLES.escalation, gate));
      } catch (err: any) {
        briefs.push({ agent: 'supplier', brief: err.message });
      }
      briefs.push(
        await runSpecialist(
          'orchestrator',
          ROLES.orchestrator,
          `Inbound from ${input.from}\n${input.subject}\n${input.text}\n\n${briefs.map((b) => `${b.agent}: ${b.brief}`).join('\n')}`
        )
      );
      briefs.push(await runSpecialist('audit', ROLES.audit, JSON.stringify({ input, briefs })));
    } catch (err: any) {
      briefs.push({ agent: 'groq', brief: String(err.message || err) });
    }
  }

  const result = await sim('/inbound-email', { method: 'POST', body: JSON.stringify(input) });
  return { langchain: groqReady() ? 'groq' : 'skipped_no_key', briefs, result };
}

export async function runLangChainCrew(component_id?: string) {
  const briefs: { agent: string; brief: string }[] = [];
  if (groqReady()) {
    try {
      const inv = await sim('/inventory');
      const short = (inv.inventory || [])
        .filter((x: { days_of_coverage: number }) => x.days_of_coverage < 7)
        .map((x: any) => ({
          component_id: x.component_id,
          name: x.component_name,
          usable_stock: x.usable_stock,
          daily_usage: x.daily_usage,
          days_of_coverage: x.days_of_coverage,
        }));
      briefs.push(
        await runSpecialist(
          'simulation',
          ROLES.simulation,
          JSON.stringify(short.length ? short : { note: 'no SKU under 7 days', sample: (inv.inventory || []).slice(0, 5) })
        )
      );
      briefs.push(
        await runSpecialist(
          'orchestrator',
          ROLES.orchestrator,
          `Shortage crew${component_id ? ` for ${component_id}` : ''}. Critical SKUs: ${short.map((x: any) => x.component_id).join(', ') || 'none'}.`
        )
      );
    } catch (err: any) {
      briefs.push({ agent: 'groq', brief: String(err.message || err) });
    }
  }
  const result = await sim('/agent/run', { method: 'POST', body: JSON.stringify({ component_id }) });
  return { langchain: groqReady() ? 'groq' : 'skipped_no_key', briefs, result };
}
