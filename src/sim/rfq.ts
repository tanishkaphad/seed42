import { query } from './database.js';
import { getSuppliers, SupplierCapabilityRecord } from './suppliers.js';

export interface RfqRecord {
  rfq_id: string;
  component_id: string;
  requested_quantity: number;
  required_delivery_date: string;
  status: string;
  created_at: string;
}

export interface RfqQuoteRecord {
  quote_id: string;
  rfq_id: string;
  supplier_id: string;
  supplier_name: string;
  quantity_available: number;
  unit_price: number;
  delivery_days: number;
  expedite_available: boolean;
  expedite_fee: number;
  certifications: string[];
  has_required_certification: boolean;
  quote_valid_hours: number;
  total_standard_cost: number;
  total_expedited_cost: number;
  accepted: boolean;
  created_at: string;
}

export interface CreateRfqResponse {
  rfq: RfqRecord;
  quotes: RfqQuoteRecord[];
}

export async function createRfq(data: {
  component_id: string;
  requested_quantity: number;
  required_delivery_date: string;
}): Promise<CreateRfqResponse> {
  if (data.requested_quantity <= 0) {
    throw new Error('Requested quantity must be greater than 0');
  }

  const rfqId = `RFQ-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;

  const rfqSql = `
    INSERT INTO simulation.rfqs (
      rfq_id,
      component_id,
      requested_quantity,
      required_delivery_date,
      status,
      created_at
    ) VALUES ($1, $2, $3, $4, 'open', CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const rfqRes = await query(rfqSql, [
    rfqId,
    data.component_id,
    data.requested_quantity,
    data.required_delivery_date,
  ]);
  const rfq = rfqRes.rows[0];

  // Fetch all suppliers that supply this component
  const capabilities = (await getSuppliers(data.component_id)) as SupplierCapabilityRecord[];
  const quotes: RfqQuoteRecord[] = [];

  for (const cap of capabilities) {
    // Generate quote matching MOQ and capacity
    const quoteId = `QUO-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
    const quantityAvailable = Math.min(cap.available_quantity, data.requested_quantity);
    const unitPrice = Number(cap.unit_price);
    const expediteFee = Number(cap.expedite_fee);
    const totalStandardCost = data.requested_quantity * unitPrice;
    const totalExpeditedCost = totalStandardCost + (cap.expedite_available ? expediteFee : 0);

    const quoteSql = `
      INSERT INTO simulation.rfq_quotes (
        quote_id,
        rfq_id,
        supplier_id,
        quantity_available,
        unit_price,
        delivery_days,
        expedite_available,
        expedite_fee,
        quote_valid_hours,
        accepted,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 24, FALSE, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const quoteRes = await query(quoteSql, [
      quoteId,
      rfqId,
      cap.supplier_id,
      quantityAvailable,
      unitPrice,
      cap.lead_time_days,
      cap.expedite_available,
      expediteFee,
    ]);

    quotes.push({
      ...quoteRes.rows[0],
      unit_price: unitPrice,
      expedite_fee: expediteFee,
      supplier_name: cap.supplier_name,
      certifications: cap.certifications,
      has_required_certification: cap.has_required_certification ?? false,
      total_standard_cost: totalStandardCost,
      total_expedited_cost: totalExpeditedCost,
    });
  }

  return { rfq, quotes };
}

export async function getRfqQuotes(rfqId: string): Promise<RfqQuoteRecord[]> {
  const sql = `
    SELECT 
      rq.quote_id,
      rq.rfq_id,
      rq.supplier_id,
      s.supplier_name,
      rq.quantity_available,
      rq.unit_price::float,
      rq.delivery_days,
      rq.expedite_available,
      rq.expedite_fee::float,
      sc.certifications,
      (c.required_certification = ANY(sc.certifications)) AS has_required_certification,
      rq.quote_valid_hours,
      (rq.quantity_available * rq.unit_price::float) AS total_standard_cost,
      (rq.quantity_available * rq.unit_price::float + rq.expedite_fee::float) AS total_expedited_cost,
      rq.accepted,
      rq.created_at
    FROM simulation.rfq_quotes rq
    JOIN simulation.rfqs r ON rq.rfq_id = r.rfq_id
    JOIN simulation.suppliers s ON rq.supplier_id = s.supplier_id
    JOIN simulation.components c ON r.component_id = c.component_id
    JOIN simulation.supplier_components sc ON (s.supplier_id = sc.supplier_id AND c.component_id = sc.component_id)
    WHERE rq.rfq_id = $1
    ORDER BY rq.unit_price ASC;
  `;
  const res = await query(sql, [rfqId]);
  return res.rows;
}

// ponytail: single joined query to retrieve all received quotations
export async function getAllQuotes(): Promise<RfqQuoteRecord[]> {
  const sql = `
    SELECT 
      rq.quote_id,
      rq.rfq_id,
      r.component_id,
      c.name AS component_name,
      rq.supplier_id,
      s.supplier_name,
      rq.quantity_available,
      rq.unit_price::float,
      rq.delivery_days,
      rq.expedite_available,
      rq.expedite_fee::float,
      sc.certifications,
      (c.required_certification IS NULL OR c.required_certification = ANY(sc.certifications)) AS has_required_certification,
      rq.quote_valid_hours,
      (rq.quantity_available * rq.unit_price::float) AS total_standard_cost,
      (rq.quantity_available * rq.unit_price::float + rq.expedite_fee::float) AS total_expedited_cost,
      rq.accepted,
      rq.created_at
    FROM simulation.rfq_quotes rq
    JOIN simulation.rfqs r ON rq.rfq_id = r.rfq_id
    JOIN simulation.suppliers s ON rq.supplier_id = s.supplier_id
    JOIN simulation.components c ON r.component_id = c.component_id
    LEFT JOIN simulation.supplier_components sc ON (s.supplier_id = sc.supplier_id AND c.component_id = sc.component_id)
    ORDER BY rq.created_at DESC;
  `;
  const res = await query(sql);
  return res.rows;
}

export async function getAllRfqs(): Promise<any[]> {
  const sql = `
    SELECT 
      r.rfq_id,
      r.component_id,
      c.name AS component_name,
      r.requested_quantity,
      r.required_delivery_date,
      r.status,
      r.created_at,
      COUNT(q.quote_id)::int AS quote_count
    FROM simulation.rfqs r
    JOIN simulation.components c ON r.component_id = c.component_id
    LEFT JOIN simulation.rfq_quotes q ON r.rfq_id = q.rfq_id
    GROUP BY r.rfq_id, r.component_id, c.name, r.requested_quantity, r.required_delivery_date, r.status, r.created_at
    ORDER BY r.created_at DESC;
  `;
  const res = await query(sql);
  return res.rows;
}

export async function acceptQuote(quoteId: string): Promise<any> {
  const sql = `
    UPDATE simulation.rfq_quotes
    SET accepted = TRUE
    WHERE quote_id = $1
    RETURNING *;
  `;
  const res = await query(sql, [quoteId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}

export async function insertStandaloneQuote(data: {
  supplier_id: string;
  component_id: string;
  unit_price: number;
  quantity: number;
  delivery_days: number;
  rfq_id?: string | null;
}) {
  let rfqId = data.rfq_id;
  if (!rfqId) {
    rfqId = `RFQ-AUTO-${Date.now().toString().slice(-4)}`;
    await query(`
      INSERT INTO simulation.rfqs (rfq_id, component_id, requested_quantity, required_delivery_date, status, created_at)
      VALUES ($1, $2, $3, CURRENT_DATE + interval '7 days', 'open', CURRENT_TIMESTAMP)
    `, [rfqId, data.component_id, data.quantity]);
  }
  
  const quoteId = `QT-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
  await query(`
    INSERT INTO simulation.rfq_quotes (
      quote_id, rfq_id, supplier_id, quantity_available, unit_price, delivery_days, expedite_available, expedite_fee
    ) VALUES ($1, $2, $3, $4, $5, $6, false, 0)
  `, [quoteId, rfqId, data.supplier_id, data.quantity, data.unit_price, data.delivery_days]);
  
  return { rfq_id: rfqId, quote_id: quoteId };
}
