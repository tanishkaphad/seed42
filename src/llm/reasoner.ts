import { callGroq, extractJsonFromLlm } from './groq.js';

export interface ReasonerInputContext {
  component_id: string;
  component_name: string;
  required_certification: string | null;
  affected_po_id: string | null;
  original_supplier_name: string | null;
  reported_delay_days: number | null;
  disruption_cause: string;
  operational_metrics: {
    current_usable_stock: number;
    daily_usage: number;
    days_of_coverage: number;
    max_affordable_delay_days: number;
    will_cause_stockout: boolean;
    stockout_in_days: number;
    production_order_id: string | null;
    production_deadline: string | null;
    shortfall_quantity: number;
  };
  alternatives: Array<{
    supplier_id: string;
    supplier_name: string;
    reliability_score: number;
    quality_score: number;
    unit_price: number;
    price_diff_per_unit_formatted: string;
    standard_lead_time_days: number;
    expedite_available: boolean;
    expedited_lead_time_days: number | null;
    expedite_fee: number;
    total_cost_standard: number;
    total_cost_expedited: number | null;
    certifications: string[];
    meets_certification: boolean;
    disqualification_reason?: string;
    delivers_before_stockout: boolean;
  }>;
  approval_threshold: number;
}

export interface GroqReasoningOutput {
  llm_model: string;
  executive_summary: string;
  human_decision_brief: string;
  recommended_action: 'place_emergency_order' | 'wait_for_original_po' | 'escalate_unresolvable_stockout';
  chosen_supplier_id: string | null;
  chosen_supplier_name: string | null;
  shipping_mode: 'standard' | 'expedited' | null;
  order_quantity: number;
  estimated_cost: number;
  approval_required: boolean;
  approval_threshold: number;
}

const REASONER_SYSTEM_PROMPT = `
You are the Autonomous Supply Chain Recovery Controller Agent.
Your job is to analyze operational disruption data, evaluate inventory runway and affordable delay buffers, compare alternative suppliers across unit rates, lead times, quality, and mandatory certifications, and draft a clear decision brief for operations management.

You MUST follow these strict operational rules:
1. NEVER select a supplier that fails the required certification constraint (e.g. Automotive-Grade).
2. If the reported delay is LESS than the Days of Coverage (DOC), we can afford the delay without line stoppage; recommend waiting unless risks warrant otherwise.
3. If the reported delay EXCEEDS the Days of Coverage, a production stoppage is imminent unless an alternative order arrives before Day of Stockout.
4. Compare unit rate differences (e.g. +₹14/unit or -₹8/unit) and explain trade-offs clearly.
5. If total cost exceeds the approval threshold, flag approval_required: true.

Output strictly a JSON object with keys:
{
  "executive_summary": string (2-3 sentences summarizing the disruption, inventory runway, and line stoppage risk),
  "human_decision_brief": string (detailed briefing to human buyer comparing suppliers, rates, delivery timelines, and what decision should be approved),
  "recommended_action": "place_emergency_order" | "wait_for_original_po" | "escalate_unresolvable_stockout",
  "chosen_supplier_id": string or null,
  "chosen_supplier_name": string or null,
  "shipping_mode": "standard" | "expedited" | null,
  "order_quantity": number,
  "estimated_cost": number,
  "approval_required": boolean
}
`.trim();

/**
 * Performs deep multi-criteria reasoning and drafts executive decision briefing using Groq LLM.
 */
export async function generateGroqDisruptionBrief(
  context: ReasonerInputContext
): Promise<GroqReasoningOutput> {
  const userPrompt = `
Operational Disruption Ground-Truth Data:
Component: ${context.component_name} (${context.component_id})
Mandatory Certification: ${context.required_certification || 'None'}
Affected PO: ${context.affected_po_id || 'N/A'} (Original Supplier: ${context.original_supplier_name || 'Unknown'})
Reported Delay: ${context.reported_delay_days !== null ? context.reported_delay_days + ' days' : 'Unknown'}
Disruption Cause: ${context.disruption_cause}

Inventory & Buffer Metrics:
- Current Usable Stock: ${context.operational_metrics.current_usable_stock} units
- Daily Usage: ${context.operational_metrics.daily_usage} units/day
- Days of Coverage (DOC): ${context.operational_metrics.days_of_coverage} days
- Maximum Affordable Delay: ${context.operational_metrics.max_affordable_delay_days} days
- Imminent Stockout: ${context.operational_metrics.will_cause_stockout ? 'YES (Line shutdown will occur)' : 'NO (Buffer absorbs delay)'}
- Shortfall Quantity: ${context.operational_metrics.shortfall_quantity} units
- Affected Production Order: ${context.operational_metrics.production_order_id || 'N/A'} (Deadline: ${context.operational_metrics.production_deadline || 'N/A'})

Autonomous Budget Approval Threshold: ₹${context.approval_threshold.toLocaleString('en-IN')}

Market Alternative Suppliers:
${JSON.stringify(context.alternatives, null, 2)}

Perform Pareto trade-off reasoning and output the decision brief as JSON.
`.trim();

  const responseText = await callGroq(
    [
      { role: 'system', content: REASONER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { jsonMode: true, temperature: 0.2 }
  );

  try {
    const parsed = extractJsonFromLlm(responseText);
    const { env } = await import('../config/env.js');
    return {
      llm_model: env.GROQ_MODEL || 'llama-3.1-8b-instant',
      executive_summary: parsed.executive_summary || 'Disruption analysis completed.',
      human_decision_brief: parsed.human_decision_brief || 'Decision briefing prepared.',
      recommended_action: parsed.recommended_action || 'place_emergency_order',
      chosen_supplier_id: parsed.chosen_supplier_id || null,
      chosen_supplier_name: parsed.chosen_supplier_name || null,
      shipping_mode: parsed.shipping_mode || 'standard',
      order_quantity: Number(parsed.order_quantity) || context.operational_metrics.shortfall_quantity || 100,
      estimated_cost: Number(parsed.estimated_cost) || 0,
      approval_required: Boolean(parsed.approval_required),
      approval_threshold: context.approval_threshold,
    };
  } catch (err: any) {
    throw new Error(`Failed to parse Groq reasoning JSON: ${responseText}`);
  }
}
