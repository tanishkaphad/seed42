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

  // Generate realistic inbound supplier response
  const { inboundBody, inboundSubject, classification } = generateSupplierResponse(
    params.supplier_id,
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

export function generateSupplierResponse(
  supplierId: string,
  poId?: string,
  requestBody?: string
): { inboundBody: string; inboundSubject: string; classification: 'confirmed' | 'delayed-with-date' | 'vague' | 'contradictory' } {
  if (supplierId === 'SUP-21') {
    return {
      inboundSubject: `RE: Status Update ${poId || ''}`,
      inboundBody:
        'Our logistics team generated a dispatch manifest, but local carrier transport was stalled. We estimate a 5 to 7 days delay before delivery arrives at your Pune plant.',
      classification: 'delayed-with-date',
    };
  }

  if (supplierId === 'SUP-42') {
    return {
      inboundSubject: `RE: Procurement Inquiry ${poId || ''}`,
      inboundBody:
        'We can fulfill emergency orders with 4 days lead time. Expedited delivery is available for urgent line-stoppage scenarios with an express freight surcharge.',
      classification: 'confirmed',
    };
  }

  if (supplierId === 'SUP-18') {
    return {
      inboundSubject: `RE: Fast Delivery ${poId || ''}`,
      inboundBody:
        'We have inventory available for 3-day turnaround at competitive rates. Note: standard consumer ISO-9001 certification applies.',
      classification: 'confirmed',
    };
  }

  return {
    inboundSubject: `RE: Inquiry ${poId || ''}`,
    inboundBody:
      'We received your message and are reviewing capacity with our warehouse team. We will follow up once allocations are confirmed.',
    classification: 'vague',
  };
}

export async function getSupplierMessages(supplierId?: string, poId?: string): Promise<SupplierMessageRecord[]> {
  let sql = `
    SELECT 
      message_id,
      supplier_id,
      po_id,
      direction,
      subject,
      body,
      message_status,
      sent_at
    FROM simulation.supplier_messages
  `;
  const params: any[] = [];

  if (supplierId && poId) {
    sql += ` WHERE supplier_id = $1 AND po_id = $2`;
    params.push(supplierId, poId);
  } else if (supplierId) {
    sql += ` WHERE supplier_id = $1`;
    params.push(supplierId);
  } else if (poId) {
    sql += ` WHERE po_id = $1`;
    params.push(poId);
  }

  sql += ` ORDER BY sent_at DESC`;

  const res = await query(sql, params);
  return res.rows;
}
