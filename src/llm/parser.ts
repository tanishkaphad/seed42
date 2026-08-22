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

/**
 * Parses raw email / message content using Groq LLM.
 * Throws GroqAPIError if Groq is unconfigured or fails.
 */
export async function parseInboundEmailWithGroq(
  emailBody: string,
  subject: string = '',
  fromEmail: string = ''
): Promise<ParsedEmailSignal> {
  const userPrompt = `
Inbound Email Received:
- From: ${fromEmail || 'Unknown'}
- Subject: ${subject || 'No subject'}
- Content:
"""
${emailBody}
"""

Extract the structured disruption parameters as JSON.
`.trim();

  const responseText = await callGroq(
    [
      { role: 'system', content: PARSER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { jsonMode: true, temperature: 0.1 }
  );

  try {
    const parsed = extractJsonFromLlm(responseText);
    return {
      affected_po_id: parsed.affected_po_id || null,
      component_id: parsed.component_id || null,
      reported_delay_days: typeof parsed.reported_delay_days === 'number' ? parsed.reported_delay_days : null,
      disruption_cause: parsed.disruption_cause || 'Unspecified cause',
      classification: ['confirmed', 'delayed-with-date', 'vague', 'contradictory'].includes(parsed.classification)
        ? parsed.classification
        : 'vague',
      summary: parsed.summary || 'Supplier message received.',
    };
  } catch (err: any) {
    throw new Error(`Failed to parse Groq response as JSON: ${responseText}`);
  }
}
