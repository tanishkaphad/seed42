import { query } from '../sim/database.js';
import { getSuppliers, SupplierCapabilityRecord } from '../sim/suppliers.js';
import { getConfigValue } from '../sim/config.js';
import { parseInboundEmailWithGroq, ParsedEmailSignal } from '../llm/parser.js';
import { generateGroqDisruptionBrief, GroqReasoningOutput } from '../llm/reasoner.js';

export interface ProcessEmailInput {
  email_body: string;
  subject?: string;
  from_email?: string;
  po_id?: string;
  component_id?: string;
  reported_delay_days?: number;
}

export interface DisruptionReportOutput {
  status: 'success';
  inbound_signal: {
    source: 'email' | 'direct';
    raw_subject: string;
    extracted_data: ParsedEmailSignal & { component_name?: string };
  };
  inventory_and_buffer_analysis: {
    current_usable_stock: number;
    daily_usage_rate: number;
    safety_stock: number;
    days_of_coverage: number;
    max_affordable_delay_days: number;
    will_cause_production_shutdown: boolean;
    estimated_stockout_in_days: number;
    production_order_affected: string | null;
    production_deadline: string | null;
    shortfall_quantity: number;
  };
  market_supplier_comparison: {
    baseline_supplier: {
      supplier_id: string | null;
      supplier_name: string | null;
      unit_price: number | null;
      status: string;
    };
    alternative_options: Array<{
      supplier_id: string;
      supplier_name: string;
      reliability_score: number;
      quality_score: number;
      unit_price: number;
      price_difference_per_unit: string;
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
  };
  groq_reasoning_and_recommendation: GroqReasoningOutput;
  audit_trail_id?: string;
}

/**
 * End-to-end Autonomous Controller:
 * Inbound Email -> Groq Extraction -> Live DB Slack Calculation -> Multi-Supplier Market Audit -> Groq Reasoning -> Structured JSON.
 */
export async function processDisruptionFlow(
  input: ProcessEmailInput
): Promise<DisruptionReportOutput> {
  // Step 1: Parse inbound email or extract signal
  let signal: ParsedEmailSignal;
  if (input.email_body && input.email_body.trim() !== '') {
    signal = await parseInboundEmailWithGroq(input.email_body, input.subject, input.from_email);
  } else {
    signal = {
      affected_po_id: input.po_id || null,
      component_id: input.component_id || null,
      rfq_id: null,
      quoted_unit_price: null,
      quoted_quantity: null,
      stated_delivery_days: null,
      deal_intent: 'unclear',
      reported_delay_days: input.reported_delay_days ?? null,
      disruption_cause: 'Direct operational alert',
      classification: input.reported_delay_days ? 'delayed-with-date' : 'vague',
      summary: 'Direct disruption evaluation request',
    };
  }

  // Override with explicit inputs if provided
  if (input.po_id) signal.affected_po_id = input.po_id;
  if (input.component_id) signal.component_id = input.component_id;
  if (typeof input.reported_delay_days === 'number') signal.reported_delay_days = input.reported_delay_days;

  // Step 2: Resolve affected Purchase Order and Component from DB
  let affectedPo: any = null;
  let componentId = signal.component_id;

  if (signal.affected_po_id) {
    const poRes = await query(
      `SELECT * FROM simulation.purchase_orders WHERE po_id = $1`,
      [signal.affected_po_id]
    );
    if (poRes.rows.length > 0) {
      affectedPo = poRes.rows[0];
      if (!componentId) componentId = affectedPo.component_id;
    }
  }

  if (!componentId) {
    // Default fallback to first delayed PO or default critical component
    const defaultPo = await query(
      `SELECT * FROM simulation.purchase_orders WHERE status = 'delayed' ORDER BY created_at DESC LIMIT 1`
    );
    if (defaultPo.rows.length > 0) {
      affectedPo = defaultPo.rows[0];
      componentId = affectedPo.component_id;
    }
  }

  const targetCompId: string = componentId || 'COMP-104';

  // Step 3: Fetch Component details
  const compRes = await query(`SELECT * FROM simulation.components WHERE component_id = $1`, [targetCompId]);
  const component = compRes.rows[0] || {
    component_id: targetCompId,
    name: 'Unknown Component',
    required_certification: null,
  };

  // Step 4: Fetch Inventory & Operational metrics
  const invRes = await query(`SELECT * FROM simulation.inventory WHERE component_id = $1`, [targetCompId]);
  const inventory = invRes.rows[0] || {
    usable_stock: 0,
    daily_usage: 1,
    safety_stock: 0,
    current_stock: 0,
  };

  const usableStock = Number(inventory.usable_stock);
  const dailyUsage = Number(inventory.daily_usage) || 1;
  const safetyStock = Number(inventory.safety_stock) || 0;
  const daysOfCoverage = dailyUsage > 0 ? Number((usableStock / dailyUsage).toFixed(2)) : 999;
  const maxAffordableDelay = daysOfCoverage;

  // Step 5: Fetch Production Order and Shortfall
  const prodRes = await query(
    `SELECT * FROM simulation.production_orders WHERE component_id = $1 ORDER BY deadline ASC LIMIT 1`,
    [targetCompId]
  );
  const prodOrder = prodRes.rows[0] || null;

  let shortfallQty = 0;
  if (prodOrder) {
    const needed = Number(prodOrder.units_planned) * Number(prodOrder.component_required_per_unit);
    shortfallQty = Math.max(0, needed - usableStock);
  } else if (affectedPo) {
    shortfallQty = Number(affectedPo.quantity);
  } else {
    shortfallQty = Math.max(dailyUsage * 5, safetyStock);
  }

  const delayDays = signal.reported_delay_days ?? (affectedPo?.status === 'delayed' ? 5 : null);
  const willCauseShutdown = delayDays !== null ? delayDays > daysOfCoverage : false;

  // Step 6: Fetch Baseline Supplier Info
  let baselineSupplierName: string | null = null;
  let baselineUnitPrice: number | null = affectedPo ? Number(affectedPo.unit_price) : null;

  if (affectedPo?.supplier_id) {
    const supRes = await query(`SELECT supplier_name FROM simulation.suppliers WHERE supplier_id = $1`, [
      affectedPo.supplier_id,
    ]);
    if (supRes.rows.length > 0) baselineSupplierName = supRes.rows[0].supplier_name;
  }

  // Step 7: Query Market Alternatives & Compare Rates
  const rawAlternatives = (await getSuppliers(targetCompId)) as SupplierCapabilityRecord[];
  const baselineRate = baselineUnitPrice || (rawAlternatives.length > 0 ? Number(rawAlternatives[0].unit_price) : 100);

  const alternativeOptions = rawAlternatives.map(s => {
    const unitPrice = Number(s.unit_price);
    const diff = unitPrice - baselineRate;
    const diffPct = ((diff / baselineRate) * 100).toFixed(1);
    const diffStr = diff === 0
      ? 'Same as baseline (₹0.00)'
      : diff > 0
      ? `+₹${diff.toFixed(2)} (+${diffPct}%)`
      : `-₹${Math.abs(diff).toFixed(2)} (${diffPct}%)`;

    const stdLead = Number(s.lead_time_days);
    const expediteAvail = Boolean(s.expedite_available);
    const expediteFee = Number(s.expedite_fee) || 0;
    const expLead = expediteAvail ? Math.max(1, Math.floor(stdLead / 2)) : null;

    const stdCost = Number((shortfallQty * unitPrice).toFixed(2));
    const expCost = expediteAvail ? Number((stdCost + expediteFee).toFixed(2)) : null;

    const hasCert = Boolean(s.has_required_certification);
    const deliversBeforeStockout = stdLead <= daysOfCoverage || (expLead !== null && expLead <= daysOfCoverage);

    return {
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      reliability_score: Number(s.reliability_score),
      quality_score: Number(s.quality_score),
      unit_price: unitPrice,
      price_diff_per_unit_formatted: diffStr,
      price_difference_per_unit: diffStr,
      standard_lead_time_days: stdLead,
      expedite_available: expediteAvail,
      expedited_lead_time_days: expLead,
      expedite_fee: expediteFee,
      total_cost_standard: stdCost,
      total_cost_expedited: expCost,
      certifications: s.certifications || [],
      meets_certification: hasCert,
      disqualification_reason: !hasCert
        ? `Lacks required ${component.required_certification || 'standard'} certification`
        : undefined,
      delivers_before_stockout: deliversBeforeStockout,
    };
  });

  // Step 8: Config Threshold
  const thresholdStr = await getConfigValue('approval_threshold');
  const threshold = thresholdStr ? Number(thresholdStr) : 150000;

  // Step 9: Groq Autonomous Reasoning & Decision Briefing
  const groqReasoning = await generateGroqDisruptionBrief({
    component_id: targetCompId,
    component_name: component.name,
    required_certification: component.required_certification,
    affected_po_id: affectedPo?.po_id || null,
    original_supplier_name: baselineSupplierName,
    reported_delay_days: delayDays,
    disruption_cause: signal.disruption_cause,
    operational_metrics: {
      current_usable_stock: usableStock,
      daily_usage: dailyUsage,
      days_of_coverage: daysOfCoverage,
      max_affordable_delay_days: maxAffordableDelay,
      will_cause_stockout: willCauseShutdown,
      stockout_in_days: daysOfCoverage,
      production_order_id: prodOrder?.production_order_id || null,
      production_deadline: prodOrder?.deadline || null,
      shortfall_quantity: shortfallQty,
    },
    alternatives: alternativeOptions,
    approval_threshold: threshold,
  });

  // Step 10: Assemble Structured JSON Payload
  return {
    status: 'success',
    inbound_signal: {
      source: input.email_body ? 'email' : 'direct',
      raw_subject: input.subject || 'Supplier Disruption Notification',
      extracted_data: {
        ...signal,
        component_name: component.name,
      },
    },
    inventory_and_buffer_analysis: {
      current_usable_stock: usableStock,
      daily_usage_rate: dailyUsage,
      safety_stock: safetyStock,
      days_of_coverage: daysOfCoverage,
      max_affordable_delay_days: maxAffordableDelay,
      will_cause_production_shutdown: willCauseShutdown,
      estimated_stockout_in_days: daysOfCoverage,
      production_order_affected: prodOrder?.production_order_id || null,
      production_deadline: prodOrder?.deadline || null,
      shortfall_quantity: shortfallQty,
    },
    market_supplier_comparison: {
      baseline_supplier: {
        supplier_id: affectedPo?.supplier_id || null,
        supplier_name: baselineSupplierName,
        unit_price: baselineUnitPrice,
        status: delayDays ? `delayed_by_${delayDays}_days` : 'on_time',
      },
      alternative_options: alternativeOptions,
    },
    groq_reasoning_and_recommendation: groqReasoning,
  };
}
