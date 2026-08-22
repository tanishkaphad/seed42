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

// ponytail: fast deterministic multi-criteria decision brief generator replacing external LLM calls
export async function generateGroqDisruptionBrief(
  context: ReasonerInputContext
): Promise<GroqReasoningOutput> {
  const { operational_metrics, alternatives, approval_threshold, component_name, component_id } = context;
  const shortfall = operational_metrics.shortfall_quantity || 100;
  const doc = operational_metrics.days_of_coverage;
  const delay = context.reported_delay_days;

  // 1. If delay <= DOC, buffer absorbs it
  if (delay !== null && delay <= doc && !operational_metrics.will_cause_stockout) {
    return {
      llm_model: 'deterministic-rules-engine',
      executive_summary: `The reported delay of ${delay} days on ${component_name} (${component_id}) is fully absorbed by the current inventory runway of ${doc} days of coverage.`,
      human_decision_brief: `Current stock (${operational_metrics.current_usable_stock} units) exceeds immediate consumption requirements during the delay period. No emergency purchase is required. Monitoring supplier dispatch status.`,
      recommended_action: 'wait_for_original_po',
      chosen_supplier_id: null,
      chosen_supplier_name: context.original_supplier_name || 'Original Supplier',
      shipping_mode: null,
      order_quantity: 0,
      estimated_cost: 0,
      approval_required: false,
      approval_threshold,
    };
  }

  // 2. Filter qualified alternatives that meet required certification
  const certified = alternatives.filter(a => a.meets_certification);
  if (certified.length === 0) {
    return {
      llm_model: 'deterministic-rules-engine',
      executive_summary: `Critical disruption detected on ${component_name}. No market suppliers meet the mandatory ${context.required_certification || 'compliance'} certification.`,
      human_decision_brief: `Stockout in ${doc} days will cause production shutdown. All candidate suppliers were disqualified due to certification non-compliance. Immediate buyer escalation required.`,
      recommended_action: 'escalate_unresolvable_stockout',
      chosen_supplier_id: null,
      chosen_supplier_name: null,
      shipping_mode: null,
      order_quantity: shortfall,
      estimated_cost: 0,
      approval_required: true,
      approval_threshold,
    };
  }

  // 3. Find options that deliver before stockout (prefer standard if fast enough, else expedited)
  let bestOption: any = null;
  let bestMode: 'standard' | 'expedited' = 'standard';
  let bestCost = Infinity;

  for (const sup of certified) {
    if (sup.standard_lead_time_days <= doc) {
      const cost = sup.total_cost_standard;
      if (cost < bestCost) {
        bestCost = cost;
        bestOption = sup;
        bestMode = 'standard';
      }
    } else if (sup.expedite_available && sup.expedited_lead_time_days !== null && sup.expedited_lead_time_days <= doc) {
      const cost = sup.total_cost_expedited || sup.total_cost_standard + sup.expedite_fee;
      if (cost < bestCost) {
        bestCost = cost;
        bestOption = sup;
        bestMode = 'expedited';
      }
    }
  }

  // If none deliver before stockout, pick fastest certified
  if (!bestOption) {
    certified.sort((a, b) => {
      const aLead = a.expedite_available && a.expedited_lead_time_days ? a.expedited_lead_time_days : a.standard_lead_time_days;
      const bLead = b.expedite_available && b.expedited_lead_time_days ? b.expedited_lead_time_days : b.standard_lead_time_days;
      return aLead - bLead;
    });
    bestOption = certified[0];
    bestMode = bestOption.expedite_available ? 'expedited' : 'standard';
    bestCost = bestMode === 'expedited' ? (bestOption.total_cost_expedited || bestOption.total_cost_standard) : bestOption.total_cost_standard;
  }

  const approvalReq = bestCost > approval_threshold;
  const leadTime = bestMode === 'expedited' ? bestOption.expedited_lead_time_days : bestOption.standard_lead_time_days;

  return {
    llm_model: 'deterministic-rules-engine',
    executive_summary: `Disruption on ${component_name} (${component_id}) threatens stockout in ${doc} days. Recommending emergency order of ${shortfall} units with ${bestOption.supplier_name}.`,
    human_decision_brief: `Selected ${bestOption.supplier_name} via ${bestMode} shipping (${leadTime} days lead time) to prevent line stoppage. Unit price: ₹${bestOption.unit_price} (${bestOption.price_diff_per_unit_formatted}). Total cost: ₹${bestCost.toLocaleString('en-IN')}.${approvalReq ? ` Requires human approval as cost exceeds ₹${approval_threshold.toLocaleString('en-IN')} threshold.` : ' Auto-approved under threshold.'}`,
    recommended_action: 'place_emergency_order',
    chosen_supplier_id: bestOption.supplier_id,
    chosen_supplier_name: bestOption.supplier_name,
    shipping_mode: bestMode,
    order_quantity: shortfall,
    estimated_cost: bestCost,
    approval_required: approvalReq,
    approval_threshold,
  };
}

