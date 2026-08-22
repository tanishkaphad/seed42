import { z } from 'zod';

export interface NormalizeResult<T> {
  valid: T[];
  errors: { row: number; error: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const boolStr = z.preprocess(v => String(v).toLowerCase() === 'true', z.boolean());
const numStr = (s: z.ZodTypeAny) => z.preprocess(v => (v === '' ? undefined : Number(v)), s);
const optStr = z.string().transform(v => v === '' ? null : v).nullable();

/** Pipe-separated certifications → string array for PostgreSQL TEXT[] */
function parseCerts(raw: string): string[] {
  if (!raw || raw.trim() === '') return [];
  return raw.split('|').map(c => c.trim()).filter(Boolean);
}

// ── Schemas ────────────────────────────────────────────────────────────────

const componentSchema = z.object({
  component_id: z.string().regex(/^COMP-\d{3}$/, 'Must match COMP-NNN'),
  name: z.string().min(1),
  description: z.string().default(''),
  unit_of_measure: z.string().default('units'),
  criticality: z.enum(['low', 'medium', 'high', 'critical']),
  required_certification: optStr,
});

const supplierSchema = z.object({
  supplier_id: z.string().regex(/^SUP-\d+$/, 'Must match SUP-NN'),
  supplier_name: z.string().min(1),
  email: z.string().email(),
  reliability_score: numStr(z.number().min(0).max(1)),
  quality_score: numStr(z.number().min(0).max(1)),
  active: boolStr,
});

const supplierComponentSchema = z.object({
  supplier_component_id: z.string().min(1),
  supplier_id: z.string().min(1),
  component_id: z.string().min(1),
  unit_price: numStr(z.number().nonnegative()),
  lead_time_days: numStr(z.number().int().nonnegative()),
  available_quantity: numStr(z.number().int().nonnegative()),
  minimum_order_quantity: numStr(z.number().int().nonnegative()),
  certifications: z.string().transform(parseCerts),
  expedite_available: boolStr,
  expedite_fee: numStr(z.number().nonnegative()),
});

const inventorySchema = z.object({
  inventory_id: z.string().min(1),
  component_id: z.string().min(1),
  warehouse: z.string().min(1),
  current_stock: numStr(z.number().int().nonnegative()),
  usable_stock: numStr(z.number().int().nonnegative()),
  daily_usage: numStr(z.number().int().nonnegative()),
  safety_stock: numStr(z.number().int().nonnegative()),
});

const productionOrderSchema = z.object({
  production_order_id: z.string().regex(/^PROD-\d+$/, 'Must match PROD-NNN'),
  product: z.string().min(1),
  component_id: z.string().min(1),
  units_planned: numStr(z.number().int().positive()),
  component_required_per_unit: numStr(z.number().int().positive()),
  deadline: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.string().default('scheduled'),
});

const purchaseOrderSchema = z.object({
  po_id: z.string().regex(/^PO-\d+$/, 'Must match PO-NNNN'),
  component_id: z.string().min(1),
  supplier_id: z.string().min(1),
  quantity: numStr(z.number().int().positive()),
  expected_delivery: z.string().min(1),
  status: z.string().default('placed'),
  unit_price: numStr(z.number().nonnegative()),
  total_value: numStr(z.number().nonnegative()),
  approval_threshold: numStr(z.number().nonnegative()).optional(),
});

const supplierMessageSchema = z.object({
  message_id: z.string().min(1),
  supplier_id: z.string().min(1),
  po_id: optStr,
  direction: z.enum(['inbound', 'outbound']),
  subject: z.string().min(1),
  body: z.string().min(1),
  message_status: z.string().default('delivered'),
});

const disruptionSchema = z.object({
  disruption_id: z.string().regex(/^DIS-\d+$/, 'Must match DIS-NNN'),
  disruption_type: z.string().min(1),
  component_id: z.string().min(1),
  po_id: optStr,
  production_order_id: optStr,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1),
  active: boolStr,
  detected: boolStr,
});

const simulationEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  event_time: numStr(z.number().int().nonnegative()),
  description: z.string().min(1),
  payload: z.string().transform(v => {
    try { return JSON.parse(v); } catch { return {}; }
  }),
  executed: boolStr,
});

const shipmentTrackingSchema = z.object({
  tracking_id: z.string().min(1),
  po_id: z.string().min(1),
  supplier_claim: z.string().min(1),
  tracking_status: z.string().min(1),
  last_movement: optStr,
});

const configSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  description: z.string().default(''),
});

const contradictionRuleSchema = z.object({
  supplier_claim: z.string().min(1),
  tracking_status: z.string().min(1),
  description: z.string().min(1),
});

// ── Generic normalizer ──────────────────────────────────────────────────────

function normalize<T>(
  schema: z.ZodType<T, any, any>,
  rows: Record<string, string>[]
): NormalizeResult<T> {
  const valid: T[] = [];
  const errors: { row: number; error: string }[] = [];

  rows.forEach((raw, i) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        row: i + 2, // +2: 1-indexed + skip header
        error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
    }
  });

  return { valid, errors };
}

// ── Exports ────────────────────────────────────────────────────────────────

export const normalizers = {
  components: (rows: Record<string, string>[]) => normalize(componentSchema, rows),
  suppliers: (rows: Record<string, string>[]) => normalize(supplierSchema, rows),
  supplier_components: (rows: Record<string, string>[]) => normalize(supplierComponentSchema, rows),
  inventory: (rows: Record<string, string>[]) => normalize(inventorySchema, rows),
  production_orders: (rows: Record<string, string>[]) => normalize(productionOrderSchema, rows),
  purchase_orders: (rows: Record<string, string>[]) => normalize(purchaseOrderSchema, rows),
  shipment_tracking: (rows: Record<string, string>[]) => normalize(shipmentTrackingSchema, rows),
  supplier_messages: (rows: Record<string, string>[]) => normalize(supplierMessageSchema, rows),
  disruptions: (rows: Record<string, string>[]) => normalize(disruptionSchema, rows),
  simulation_events: (rows: Record<string, string>[]) => normalize(simulationEventSchema, rows),
  config: (rows: Record<string, string>[]) => normalize(configSchema, rows),
  contradiction_rules: (rows: Record<string, string>[]) => normalize(contradictionRuleSchema, rows),
};

export type EntityType = keyof typeof normalizers;
