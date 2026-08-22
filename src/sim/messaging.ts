import { query } from './database.js';
import { getSupplierById } from './suppliers.js';

export interface SupplierMessageRecord {
  message_id: string;
  supplier_id: string;
  po_id?: string | null;
  direction: 'inbound' | 'outbound';
  subject: string;
  body: string;
  message_status: string;
  sent_at: string;
}

export interface SendMessageParams {
  supplier_id: string;
  po_id?: string;
  subject: string;
  body: string;
}

export interface SupplierMessageResponse {
  outbound: SupplierMessageRecord;
  inbound: SupplierMessageRecord;
  classification: 'confirmed' | 'delayed-with-date' | 'vague' | 'contradictory';
}

import { callGroq, extractJsonFromLlm } from '../llm/groq.js';

export async function sendSupplierMessage(params: SendMessageParams): Promise<SupplierMessageResponse> {
  const supplier = await getSupplierById(params.supplier_id);
  if (!supplier) {
    throw new Error(`Supplier ${params.supplier_id} not found`);
  }

  const outboundId = `MSG-OUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const outboundSql = `
    INSERT INTO simulation.supplier_messages (
      message_id,
      supplier_id,
      po_id,
      direction,
      subject,
      body,
      message_status,
      sent_at
    ) VALUES ($1, $2, $3, 'outbound', $4, $5, 'sent', CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const outRes = await query(outboundSql, [
    outboundId,
    params.supplier_id,
    params.po_id || null,
    params.subject,
    params.body,
  ]);
  const outboundMessage = outRes.rows[0];

  // Generate realistic dynamic supplier response via Groq
  const { inboundBody, inboundSubject, classification } = await generateSupplierResponse(
    supplier,
    params.po_id,
    params.body
  );

  const inboundId = `MSG-IN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const inboundSql = `
    INSERT INTO simulation.supplier_messages (
      message_id,
      supplier_id,
      po_id,
      direction,
      subject,
      body,
      message_status,
      sent_at
    ) VALUES ($1, $2, $3, 'inbound', $4, $5, 'delivered', CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const inRes = await query(inboundSql, [
    inboundId,
    params.supplier_id,
    params.po_id || null,
    inboundSubject,
    inboundBody,
  ]);
  const inboundMessage = inRes.rows[0];

  return {
    outbound: outboundMessage,
    inbound: inboundMessage,
    classification,
  };
}

// ponytail: deterministic rule-based template generation without external LLM call
export async function generateSupplierResponse(
  supplier: { supplier_id: string; supplier_name?: string; reliability_score: number; quality_score?: number },
  poId?: string,
  requestBody?: string
): Promise<{ inboundBody: string; inboundSubject: string; classification: 'confirmed' | 'delayed-with-date' | 'vague' | 'contradictory' }> {
  const score = Number(supplier.reliability_score);
  const supplierName = supplier.supplier_name || supplier.supplier_id;
  const poRef = poId ? ` for ${poId}` : '';

  if (score >= 0.90) {
    return {
      inboundSubject: `RE: Confirmation & Commitment${poRef}`,
      inboundBody: `Dear Buyer,\n\nWe confirm receipt of your inquiry${poRef}. All items have passed our quality control procedures and remain on strict delivery schedule. Dispatch is confirmed.\n\nBest regards,\n${supplierName} Fulfillment Team`,
      classification: 'confirmed',
    };
  } else if (score >= 0.70) {
    return {
      inboundSubject: `RE: Delivery Schedule Update${poRef}`,
      inboundBody: `Dear Buyer,\n\nDue to port logistics clearance and carrier re-routing, delivery${poRef} will be delayed by 4 business days. Revised estimated arrival date has been committed with our dispatch team.\n\nSincerely,\n${supplierName} Operations`,
      classification: 'delayed-with-date',
    };
  } else if (score >= 0.50) {
    return {
      inboundSubject: `RE: Inquiry Acknowledgement${poRef}`,
      inboundBody: `Hello,\n\nWe have received your message regarding${poRef}. We are currently reviewing warehouse capacity and allocation. We will follow up once information becomes available.\n\nRegards,\n${supplierName} Support`,
      classification: 'vague',
    };
  } else {
    return {
      inboundSubject: `RE: Urgent Notice${poRef}`,
      inboundBody: `Notice: Conflicting production updates have been flagged for order${poRef}. Line capacity is restricted and raw material availability is unverified.\n\n${supplierName}`,
      classification: 'contradictory',
    };
  }
}

export async function getSupplierMessages(
  supplierId?: string,
  poId?: string,
  direction?: 'inbound' | 'outbound'
): Promise<any[]> {
  let sql = `
    SELECT 
      m.message_id,
      m.supplier_id,
      s.supplier_name,
      m.po_id,
      m.direction,
      m.subject,
      m.body,
      m.message_status,
      m.sent_at
    FROM simulation.supplier_messages m
    LEFT JOIN simulation.suppliers s ON m.supplier_id = s.supplier_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (supplierId) {
    params.push(supplierId);
    sql += ` AND m.supplier_id = $${params.length}`;
  }
  if (poId) {
    params.push(poId);
    sql += ` AND m.po_id = $${params.length}`;
  }
  if (direction) {
    params.push(direction);
    sql += ` AND m.direction = $${params.length}`;
  }

  sql += ` ORDER BY m.sent_at DESC`;

  const res = await query(sql, params);
  return res.rows;
}

