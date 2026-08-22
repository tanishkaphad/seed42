import { query } from '../sim/database.js';

export interface AuditTrailRecord {
  audit_id: string;
  disruption_id: string;
  detected_disruption: string;
  data_sources_checked: any[];
  messages_sent: any[];
  messages_received: any[];
  alternatives_considered: any[];
  calculations: Record<string, any>;
  decision: string;
  decision_reason: string;
  erp_updates: any[];
  escalations: any[];
  remaining_risks: any[];
  created_at: string;
}

export async function recordAuditTrail(data: {
  disruption_id: string;
  detected_disruption: string;
  data_sources_checked?: any[];
  messages_sent?: any[];
  messages_received?: any[];
  alternatives_considered?: any[];
  calculations?: Record<string, any>;
  decision: string;
  decision_reason: string;
  erp_updates?: any[];
  escalations?: any[];
  remaining_risks?: any[];
}): Promise<AuditTrailRecord> {
  const auditId = `AUD-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;

  const sql = `
    INSERT INTO simulation.audit_trail (
      audit_id,
      disruption_id,
      detected_disruption,
      data_sources_checked,
      messages_sent,
      messages_received,
      alternatives_considered,
      calculations,
      decision,
      decision_reason,
      erp_updates,
      escalations,
      remaining_risks,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
    RETURNING *;
  `;

  const res = await query(sql, [
    auditId,
    data.disruption_id,
    data.detected_disruption,
    JSON.stringify(data.data_sources_checked || []),
    JSON.stringify(data.messages_sent || []),
    JSON.stringify(data.messages_received || []),
    JSON.stringify(data.alternatives_considered || []),
    JSON.stringify(data.calculations || {}),
    data.decision,
    data.decision_reason,
    JSON.stringify(data.erp_updates || []),
    JSON.stringify(data.escalations || []),
    JSON.stringify(data.remaining_risks || []),
  ]);

  return res.rows[0];
}

export async function getAuditTrail(disruptionId?: string): Promise<AuditTrailRecord[]> {
  let sql = `
    SELECT 
      audit_id,
      disruption_id,
      detected_disruption,
      data_sources_checked,
      messages_sent,
      messages_received,
      alternatives_considered,
      calculations,
      decision,
      decision_reason,
      erp_updates,
      escalations,
      remaining_risks,
      created_at
    FROM simulation.audit_trail
  `;
  const params: any[] = [];

  if (disruptionId) {
    sql += ` WHERE disruption_id = $1`;
    params.push(disruptionId);
  }

  sql += ` ORDER BY created_at DESC;`;

  const res = await query(sql, params);
  return res.rows;
}
