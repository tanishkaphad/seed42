import { callGroq, extractJsonFromLlm } from './groq.js';

export interface ParsedEmailSignal {
  affected_po_id: string | null;
  component_id: string | null;
  reported_delay_days: number | null;
  disruption_cause: string;
  classification: 'confirmed' | 'delayed-with-date' | 'vague' | 'contradictory';
  summary: string;
  sender_supplier_id?: string | null;
}

const PARSER_SYSTEM_PROMPT = `
You are an expert AI Supply Chain Inbound Message Intelligence Agent.
Your job is to read free-form inbound emails and messages sent from suppliers or logistics providers, parse the underlying operational signal, and extract structured parameters.

You must respond ONLY with a valid JSON object with the following exact keys:
{
  "affected_po_id": string or null (e.g. "PO-7712" if mentioned),
  "component_id": string or null (e.g. "COMP-104" if mentioned or inferred),
  "reported_delay_days": number or null (e.g. 5 if a 5-day delay is stated, null if on time or unclear),
  "disruption_cause": string (brief explanation like "Port congestion at Chennai", "Material shortage", "QC hold", or "None"),
  "classification": string (strictly one of: "confirmed", "delayed-with-date", "vague", "contradictory"),
  "summary": string (1-sentence concise description of the supplier's message)
}
`.trim();

// ponytail: fast deterministic regex/heuristic parser replacing external LLM calls
export async function parseInboundEmailWithGroq(
  emailBody: string,
  subject: string = '',
  fromEmail: string = ''
): Promise<ParsedEmailSignal> {
  const text = `${subject} ${emailBody}`;
  
  // Extract PO ID (e.g. PO-7712)
  const poMatch = text.match(/PO[-_\s]?(\d+)/i);
  const poId = poMatch ? `PO-${poMatch[1]}` : null;

  // Extract Component ID (e.g. COMP-104)
  const compMatch = text.match(/COMP[-_\s]?(\d+)/i);
  const compId = compMatch ? `COMP-${compMatch[1]}` : null;

  // Extract delay days (e.g. "delayed by 5 days", "5-day delay", "5 days")
  let delayDays: number | null = null;
  const delayMatch =
    text.match(/delayed\s*(?:by)?\s*(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*[- ]day(?:s)?\s*delay/i) ||
    text.match(/delay\s*(?:of)?\s*(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*days?\s*late/i);
  if (delayMatch) {
    delayDays = parseInt(delayMatch[1], 10);
  }

  // Extract disruption cause
  let cause = 'Direct supplier operational update';
  if (/port\s*congestion/i.test(text)) cause = 'Port congestion & maritime backlog';
  else if (/customs/i.test(text)) cause = 'Customs border clearance hold';
  else if (/material\s*shortage|raw\s*material/i.test(text)) cause = 'Raw material allocation shortage';
  else if (/quality|qc|inspection/i.test(text)) cause = 'Quality control hold';
  else if (/weather|cyclone|typhoon|storm/i.test(text)) cause = 'Severe weather disruption';
  else if (/strike|labor|labour/i.test(text)) cause = 'Labor strike / workforce shortage';
  else if (delayDays) cause = `Supplier logistics delay of ${delayDays} days`;

  // Determine classification
  let classification: 'confirmed' | 'delayed-with-date' | 'vague' | 'contradictory' = 'vague';
  if (/contradict|conflict|confusing|uncertain|discrepan/i.test(text)) {
    classification = 'contradictory';
  } else if (delayDays !== null && delayDays > 0) {
    classification = 'delayed-with-date';
  } else if (/confirm|on schedule|dispatched|shipped|on track|ready for pickup/i.test(text)) {
    classification = 'confirmed';
  }

  const summary = delayDays
    ? `Supplier reported ${delayDays}-day delay for ${poId || compId || 'order'} due to ${cause}.`
    : `Inbound communication regarding ${poId || compId || 'order status'}: ${classification}.`;

  return {
    affected_po_id: poId,
    component_id: compId,
    reported_delay_days: delayDays,
    disruption_cause: cause,
    classification,
    summary,
    sender_supplier_id: fromEmail || null,
  };
}

