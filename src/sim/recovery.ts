import { query } from './database.js';
import { getSuppliers, SupplierCapabilityRecord } from './suppliers.js';
import { getConfigValue } from './config.js';
import { createPurchaseOrder, updatePurchaseOrderStatus } from './purchaseOrders.js';
import { logErpUpdate } from './erp.js';
import { recordAuditTrail } from '../audit/trail.js';

export interface DisruptionInput {
  component_id: string;
  reported_delay_days?: number;
  po_id?: string;
  order_quantity?: number;
}

export interface QualifiedFallback {
  supplier_id: string;
  supplier_name: string;
  reliability_score: number;
  quality_score: number;
  has_required_certification: boolean;
  certifications: string[];
  standard_lead_time_days: number;
  expedite_available: boolean;
  expedited_lead_time_days: number | null;
  unit_price: number;
  expedite_fee: number;
  total_cost_standard: number;
  total_cost_expedited: number | null;
  meets_deadline: boolean;
  requires_human_approval: boolean;
}

export interface DisqualifiedFallback {
  supplier_id: string;
  supplier_name: string;
  reason: string;
}

export interface RecoveryEvaluationResult {
  status: 'evaluated';
  disruption: {
    component_id: string;
    component_name: string;
    required_certification: string | null;
    affected_po_id: string | null;
    original_supplier: string | null;
    reported_delay_days: number | null;
    production_order_id: string | null;
    production_deadline: string | null;
  };
  operational_metrics: {
    current_usable_stock: number;
    daily_usage: number;
    safety_stock: number;
    days_of_coverage: number;
    max_affordable_delay_days: number;
    will_cause_stockout: boolean;
    stockout_in_days: number;
    shortfall_quantity: number;
  };
  fallbacks: {
    total_options_found: number;
    qualified_options: QualifiedFallback[];
    disqualified_options: DisqualifiedFallback[];
  };
  recommendation: {
    action: 'place_emergency_order' | 'wait_for_original_po' | 'escalate_unresolvable_stockout';
    chosen_supplier_id: string | null;
    chosen_supplier_name?: string;
    shipping_mode: 'standard' | 'expedited' | null;
    order_quantity: number;
    estimated_cost: number;
    expected_delivery_days: number | null;
    approval_required: boolean;
    justification: string;
  };
  audit_trail_id?: string;
}

export async function evaluateDisruption(input: DisruptionInput): Promise<RecoveryEvaluationResult> {
  const { component_id, reported_delay_days, po_id } = input;

  // 1. Fetch component details
  const compRes = await query(`SELECT * FROM simulation.components WHERE component_id = $1`, [component_id]);
  if (compRes.rows.length === 0) {
    throw new Error(`Component ${component_id} not found`);
  }
  const component = compRes.rows[0];

  // 2. Fetch inventory
  const invRes = await query(`SELECT * FROM simulation.inventory WHERE component_id = $1`, [component_id]);
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

  // 3. Fetch affected PO & production orders
  let affectedPo: any = null;
  if (po_id) {
    const poRes = await query(`SELECT * FROM simulation.purchase_orders WHERE po_id = $1`, [po_id]);
    if (poRes.rows.length > 0) affectedPo = poRes.rows[0];
  } else {
    const poRes = await query(
      `SELECT * FROM simulation.purchase_orders WHERE component_id = $1 AND status IN ('delayed', 'placed') ORDER BY created_at DESC LIMIT 1`,
      [component_id]
    );
    if (poRes.rows.length > 0) affectedPo = poRes.rows[0];
  }

  const prodRes = await query(
    `SELECT * FROM simulation.production_orders WHERE component_id = $1 ORDER BY deadline ASC LIMIT 1`,
    [component_id]
  );
  const prodOrder = prodRes.rows[0] || null;

  // 4. Calculate shortfall quantity
  let shortfallQty = 0;
  if (prodOrder) {
    const neededForProd = Number(prodOrder.units_planned) * Number(prodOrder.component_required_per_unit);
    shortfallQty = Math.max(0, neededForProd - usableStock);
  } else if (affectedPo) {
    shortfallQty = Number(affectedPo.quantity);
  } else {
    shortfallQty = Math.max(dailyUsage * 5, safetyStock);
  }
  const targetOrderQty = input.order_quantity || shortfallQty || 100;

  const delayDays = reported_delay_days ?? (affectedPo?.status === 'delayed' ? 5 : null);
  const willCauseStockout = delayDays !== null ? delayDays > daysOfCoverage : false;

  // 5. Config threshold
  const thresholdStr = await getConfigValue('approval_threshold');
  const threshold = thresholdStr ? Number(thresholdStr) : 150000;

  // 6. Query suppliers for component
  const rawSuppliers = (await getSuppliers(component_id)) as SupplierCapabilityRecord[];

  const qualified: QualifiedFallback[] = [];
  const disqualified: DisqualifiedFallback[] = [];

  for (const s of rawSuppliers) {
    const hasCert = Boolean(s.has_required_certification);
    if (!hasCert) {
      disqualified.push({
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        reason: `Missing required certification: ${component.required_certification}`,
      });
      continue;
    }

    const unitPrice = Number(s.unit_price);
    const stdLeadTime = Number(s.lead_time_days);
    const expediteAvail = Boolean(s.expedite_available);
    const expediteFee = Number(s.expedite_fee) || 0;
    const expLeadTime = expediteAvail ? Math.max(1, Math.floor(stdLeadTime / 2)) : null;

    const stdCost = Number((targetOrderQty * unitPrice).toFixed(2));
    const expCost = expediteAvail ? Number((stdCost + expediteFee).toFixed(2)) : null;

    const meetsDeadline = stdLeadTime <= daysOfCoverage || (expLeadTime !== null && expLeadTime <= daysOfCoverage);
    const requiresApproval = stdCost > threshold || (expCost !== null && expCost > threshold);

    qualified.push({
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      reliability_score: Number(s.reliability_score),
      quality_score: Number(s.quality_score),
      has_required_certification: true,
      certifications: s.certifications || [],
      standard_lead_time_days: stdLeadTime,
      expedite_available: expediteAvail,
      expedited_lead_time_days: expLeadTime,
      unit_price: unitPrice,
      expedite_fee: expediteFee,
      total_cost_standard: stdCost,
      total_cost_expedited: expCost,
      meets_deadline: meetsDeadline,
      requires_human_approval: requiresApproval,
    });
  }

  // 7. Optimal Pareto selection
  let recommendationAction: 'place_emergency_order' | 'wait_for_original_po' | 'escalate_unresolvable_stockout' = 'place_emergency_order';
  let chosenSupplier: QualifiedFallback | null = null;
  let shippingMode: 'standard' | 'expedited' | null = null;
  let estimatedCost = 0;
  let expectedDeliveryDays: number | null = null;
  let justification = '';

  if (!willCauseStockout && delayDays !== null) {
    recommendationAction = 'wait_for_original_po';
    justification = `Reported delay (${delayDays} days) is within the maximum affordable buffer (${daysOfCoverage} days DOC). No emergency procurement required.`;
  } else if (qualified.length === 0) {
    recommendationAction = 'escalate_unresolvable_stockout';
    justification = `No suppliers meet the required ${component.required_certification} certification. Immediate human escalation required.`;
  } else {
    // Sort qualified suppliers by:
    // 1. Meets deadline
    // 2. Reliability score >= 0.80
    // 3. Lowest total cost
    const sorted = [...qualified].sort((a, b) => {
      if (a.meets_deadline !== b.meets_deadline) return a.meets_deadline ? -1 : 1;
      if ((a.reliability_score >= 0.8) !== (b.reliability_score >= 0.8)) {
        return a.reliability_score >= 0.8 ? -1 : 1;
      }
      return a.total_cost_standard - b.total_cost_standard;
    });

    chosenSupplier = sorted[0];

    // Determine shipping mode
    if (chosenSupplier.standard_lead_time_days <= daysOfCoverage) {
      shippingMode = 'standard';
      estimatedCost = chosenSupplier.total_cost_standard;
      expectedDeliveryDays = chosenSupplier.standard_lead_time_days;
    } else if (chosenSupplier.expedite_available && chosenSupplier.expedited_lead_time_days !== null && chosenSupplier.expedited_lead_time_days <= daysOfCoverage) {
      shippingMode = 'expedited';
      estimatedCost = chosenSupplier.total_cost_expedited!;
      expectedDeliveryDays = chosenSupplier.expedited_lead_time_days;
    } else {
      // Best effort fastest
      shippingMode = chosenSupplier.expedite_available ? 'expedited' : 'standard';
      estimatedCost = shippingMode === 'expedited' ? chosenSupplier.total_cost_expedited! : chosenSupplier.total_cost_standard;
      expectedDeliveryDays = shippingMode === 'expedited' ? chosenSupplier.expedited_lead_time_days : chosenSupplier.standard_lead_time_days;
    }

    const costApprovalNote = estimatedCost > threshold
      ? ` Cost (₹${estimatedCost.toLocaleString('en-IN')}) exceeds autonomous threshold (₹${threshold.toLocaleString('en-IN')}) — human escalation flagged.`
      : ` Cost (₹${estimatedCost.toLocaleString('en-IN')}) is within autonomous threshold (₹${threshold.toLocaleString('en-IN')}).`;

    justification = `${chosenSupplier.supplier_name} (${chosenSupplier.supplier_id}) selected: holds required ${component.required_certification || 'standard'} certification, delivers in ${expectedDeliveryDays} days via ${shippingMode} freight before line stockout (${daysOfCoverage} days coverage).${costApprovalNote}`;
  }

  return {
    status: 'evaluated',
    disruption: {
      component_id,
      component_name: component.name,
      required_certification: component.required_certification,
      affected_po_id: affectedPo?.po_id || null,
      original_supplier: affectedPo?.supplier_id || null,
      reported_delay_days: delayDays,
      production_order_id: prodOrder?.production_order_id || null,
      production_deadline: prodOrder?.deadline || null,
    },
    operational_metrics: {
      current_usable_stock: usableStock,
      daily_usage: dailyUsage,
      safety_stock: safetyStock,
      days_of_coverage: daysOfCoverage,
      max_affordable_delay_days: maxAffordableDelay,
      will_cause_stockout: willCauseStockout,
      stockout_in_days: daysOfCoverage,
      shortfall_quantity: shortfallQty,
    },
    fallbacks: {
      total_options_found: rawSuppliers.length,
      qualified_options: qualified,
      disqualified_options: disqualified,
    },
    recommendation: {
      action: recommendationAction,
      chosen_supplier_id: chosenSupplier?.supplier_id || null,
      chosen_supplier_name: chosenSupplier?.supplier_name,
      shipping_mode: shippingMode,
      order_quantity: targetOrderQty,
      estimated_cost: estimatedCost,
      expected_delivery_days: expectedDeliveryDays,
      approval_required: estimatedCost > threshold,
      justification,
    },
  };
}

export async function executeRecoveryPlan(evaluation: RecoveryEvaluationResult): Promise<{
  success: boolean;
  po_created?: any;
  audit_id: string;
  message: string;
}> {
  const { recommendation, disruption, operational_metrics } = evaluation;

  // 1. Mark existing PO delayed if present
  if (disruption.affected_po_id) {
    await updatePurchaseOrderStatus(
      disruption.affected_po_id,
      'delayed',
      `Auto-marked delayed following disruption evaluation (${disruption.reported_delay_days} days reported delay)`
    );
  }

  let createdPo: any = null;

  // 2. Create emergency purchase order if recommended
  if (recommendation.action === 'place_emergency_order' && recommendation.chosen_supplier_id) {
    const deliveryDays = recommendation.expected_delivery_days || 5;
    const targetDate = new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const unitPrice = Number((recommendation.estimated_cost / recommendation.order_quantity).toFixed(2));

    createdPo = await createPurchaseOrder({
      component_id: disruption.component_id,
      supplier_id: recommendation.chosen_supplier_id,
      quantity: recommendation.order_quantity,
      unit_price: unitPrice,
      expected_delivery: targetDate,
      approval_threshold: await getConfigValue('approval_threshold').then(v => v ? Number(v) : 150000),
    });

    await logErpUpdate(
      'purchase_order',
      createdPo.po_id,
      'create_emergency_po',
      {},
      createdPo,
      `Emergency PO placed with ${recommendation.chosen_supplier_name} (${recommendation.shipping_mode} freight) to prevent line stoppage.`
    );
  }

  // 3. Record full audit trail
  const audit = await recordAuditTrail({
    disruption_id: disruption.affected_po_id ? `DIS-${disruption.affected_po_id}` : `DIS-${disruption.component_id}`,
    detected_disruption: `Disruption on ${disruption.component_name} (${disruption.component_id}) with ${disruption.reported_delay_days || 'unspecified'} days delay.`,
    data_sources_checked: ['inventory', 'production_orders', 'purchase_orders', 'supplier_components'],
    messages_sent: [],
    messages_received: disruption.reported_delay_days
      ? [{ from: disruption.original_supplier || 'supplier', body: `Reported delay of ${disruption.reported_delay_days} days` }]
      : [],
    alternatives_considered: evaluation.fallbacks.qualified_options.map(q => ({
      supplier: q.supplier_id,
      supplier_name: q.supplier_name,
      cost: q.total_cost_standard,
      lead_time: q.standard_lead_time_days,
      meets_deadline: q.meets_deadline,
    })),
    calculations: {
      days_of_coverage: operational_metrics.days_of_coverage,
      max_affordable_delay_days: operational_metrics.max_affordable_delay_days,
      shortfall_quantity: operational_metrics.shortfall_quantity,
      stockout_risk: operational_metrics.will_cause_stockout,
    },
    decision: recommendation.justification,
    decision_reason: `Action: ${recommendation.action}, Supplier: ${recommendation.chosen_supplier_id}, Cost: ₹${recommendation.estimated_cost}`,
    erp_updates: createdPo ? [`Emergency PO ${createdPo.po_id} created`] : [],
    escalations: recommendation.approval_required ? ['Autonomous budget threshold exceeded - human approval logged'] : [],
    remaining_risks: [
      recommendation.shipping_mode === 'expedited' ? 'Expedited transit carrier delay risk' : 'Standard transit buffer variance',
    ],
  });

  return {
    success: true,
    po_created: createdPo,
    audit_id: audit.audit_id,
    message: `Recovery plan executed successfully. Decision logged in audit trail ${audit.audit_id}.`,
  };
}
