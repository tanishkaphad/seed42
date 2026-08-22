import { query } from './database.js';

export interface SupplierRecord {
  supplier_id: string;
  supplier_name: string;
  email: string;
  reliability_score: number;
  quality_score: number;
  active: boolean;
  created_at: string;
}

export interface SupplierCapabilityRecord extends SupplierRecord {
  supplier_component_id: string;
  component_id: string;
  unit_price: number;
  lead_time_days: number;
  available_quantity: number;
  minimum_order_quantity: number;
  certifications: string[];
  expedite_available: boolean;
  expedite_fee: number;
  has_required_certification?: boolean;
}

export async function getSuppliers(componentId?: string): Promise<SupplierCapabilityRecord[] | SupplierRecord[]> {
  if (componentId) {
    const sql = `
      SELECT 
        s.supplier_id,
        s.supplier_name,
        s.email,
        s.reliability_score::float,
        s.quality_score::float,
        s.active,
        sc.supplier_component_id,
        sc.component_id,
        sc.unit_price::float,
        sc.lead_time_days,
        sc.available_quantity,
        sc.minimum_order_quantity,
        sc.certifications,
        sc.expedite_available,
        sc.expedite_fee::float,
        c.required_certification,
        (c.required_certification IS NULL OR c.required_certification = ANY(sc.certifications)) AS has_required_certification
      FROM simulation.suppliers s
      JOIN simulation.supplier_components sc ON s.supplier_id = sc.supplier_id
      JOIN simulation.components c ON sc.component_id = c.component_id
      WHERE sc.component_id = $1 AND s.active = TRUE
      ORDER BY sc.unit_price ASC;
    `;
    const res = await query(sql, [componentId]);
    return res.rows;
  }

  const sql = `
    SELECT 
      supplier_id,
      supplier_name,
      email,
      reliability_score::float,
      quality_score::float,
      active,
      created_at
    FROM simulation.suppliers
    WHERE active = TRUE
    ORDER BY supplier_id ASC;
  `;
  const res = await query(sql);
  return res.rows;
}

export async function getSupplierById(supplierId: string): Promise<SupplierRecord | null> {
  const sql = `
    SELECT 
      supplier_id,
      supplier_name,
      email,
      reliability_score::float,
      quality_score::float,
      active,
      created_at
    FROM simulation.suppliers
    WHERE supplier_id = $1;
  `;
  const res = await query(sql, [supplierId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}

export async function getSupplierByEmail(email: string): Promise<SupplierRecord | null> {
  const res = await query(
    `SELECT supplier_id, supplier_name, email, reliability_score::float, quality_score::float, active, created_at
     FROM simulation.suppliers WHERE lower(email) = lower($1) LIMIT 1`,
    [email.trim()]
  );
  return res.rows[0] || null;
}

export async function createSupplier(data: {
  supplier_name: string;
  email: string;
  reliability_score?: number;
  quality_score?: number;
}): Promise<SupplierRecord> {
  const existing = await getSupplierByEmail(data.email);
  if (existing) {
    throw new Error(`A contact with email ${data.email} already exists (${existing.supplier_id})`);
  }
  const supplierId = `SUP-USR-${Date.now().toString().slice(-6)}`;
  const res = await query(
    `INSERT INTO simulation.suppliers (supplier_id, supplier_name, email, reliability_score, quality_score, active)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING supplier_id, supplier_name, email, reliability_score::float, quality_score::float, active, created_at`,
    [supplierId, data.supplier_name.trim(), data.email.trim(), data.reliability_score ?? 0.8, data.quality_score ?? 0.8]
  );
  return res.rows[0];
}

export async function updateSupplierContact(
  supplierId: string,
  data: { supplier_name?: string; email?: string; active?: boolean }
): Promise<SupplierRecord | null> {
  const existing = await getSupplierById(supplierId);
  if (!existing) return null;
  const res = await query(
    `UPDATE simulation.suppliers SET
      supplier_name = COALESCE($1, supplier_name),
      email = COALESCE($2, email),
      active = COALESCE($3, active)
     WHERE supplier_id = $4
     RETURNING supplier_id, supplier_name, email, reliability_score::float, quality_score::float, active, created_at`,
    [data.supplier_name || null, data.email || null, data.active ?? null, supplierId]
  );
  return res.rows[0] || null;
}

export async function getSupplierCapability(supplierId: string, componentId: string): Promise<SupplierCapabilityRecord | null> {
  const sql = `
    SELECT 
      s.supplier_id,
      s.supplier_name,
      s.email,
      s.reliability_score::float,
      s.quality_score::float,
      s.active,
      sc.supplier_component_id,
      sc.component_id,
      sc.unit_price::float,
      sc.lead_time_days,
      sc.available_quantity,
      sc.minimum_order_quantity,
      sc.certifications,
      sc.expedite_available,
      sc.expedite_fee::float,
      c.required_certification,
      (c.required_certification = ANY(sc.certifications)) AS has_required_certification
    FROM simulation.suppliers s
    JOIN simulation.supplier_components sc ON s.supplier_id = sc.supplier_id
    JOIN simulation.components c ON sc.component_id = c.component_id
    WHERE s.supplier_id = $1 AND sc.component_id = $2;
  `;
  const res = await query(sql, [supplierId, componentId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}
