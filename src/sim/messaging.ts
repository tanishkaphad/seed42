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

export async function generateSupplierResponse(
  supplier: { supplier_id: string; supplier_name?: string; reliability_score: number; quality_score?: number },
  poId?: string,
  requestBody?: string
): Promise<{ inboundBody: string; inboundSubject: string; classification: 'confirmed' | 'delayed-with-date' | 'vague' | 'contradictory' }> {
  const score = Number(supplier.reliability_score);
  const supplierName = supplier.supplier_name || supplier.supplier_id;

  const systemPrompt = `
You are an autonomous supplier simulator. You are roleplaying as "${supplierName}" (Supplier ID: ${supplier.supplier_id}).
Your profile:
- Reliability Score: ${score} (1.0 = highly dependable, 0.5 = prone to vague/contradictory replies or delays)
- Quality Score: ${supplier.quality_score ?? 0.9}

Generate a realistic commercial reply to the buyer's inquiry.
Behavioral guidance based on reliability score ${score}:
- If reliability >= 0.90: You are helpful, confirm orders promptly or offer firm committed delivery timelines. Classification: "confirmed".
- If reliability 0.70 to 0.89: You report realistic logistics constraints or 3-6 day delays with a firm revised date. Classification: "delayed-with-date".
- If reliability 0.50 to 0.69: You give non-committal, vague answers ("reviewing capacity with warehouse", "will update later"). Classification: "vague".
- If reliability < 0.50: You give evasive, confusing, or contradictory answers. Classification: "contradictory".

Respond strictly with a JSON object:
{
  "inboundSubject": string (e.g. "RE: Status Update on PO-7712"),
  "inboundBody": string (realistic, natural business email response from the supplier),
  "classification": "confirmed" | "delayed-with-date" | "vague" | "contradictory"
}
`.trim();

  const userPrompt = `
Buyer Outbound Message:
- PO ID: ${poId || 'N/A'}
- Message Body:
"""
${requestBody || 'Please provide an update on order availability and delivery timeline.'}
"""

Generate the simulated supplier response as JSON.
`.trim();

  const responseText = await callGroq(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { jsonMode: true, temperature: 0.3 }
  );

  try {
    const parsed = extractJsonFromLlm(responseText);
    return {
      inboundSubject: parsed.inboundSubject || `RE: Inquiry ${poId || ''}`,
      inboundBody: parsed.inboundBody || 'Thank you for your message. We are processing your request.',
      classification: ['confirmed', 'delayed-with-date', 'vague', 'contradictory'].includes(parsed.classification)
        ? parsed.classification
        : 'vague',
    };
  } catch (err: any) {
    throw new Error(`Failed to parse Groq supplier response as JSON: ${responseText}`);
  }
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
