import { query } from './database.js';
import { env } from '../config/env.js';
import { getConfigValue } from './config.js';

export interface ApprovalRecord {
  approval_id: string;
  action_type: string;
  estimated_cost: number;
  approval_threshold: number;
  approval_required: boolean;
  approval_status: 'auto_approved' | 'pending_human_approval' | 'approved' | 'rejected';
  reason: string;
  created_at: string;
}

export async function checkApproval(data: {
  action_type: string;
  estimated_cost: number;
  approval_threshold?: number;
  reason?: string;
}): Promise<ApprovalRecord> {
  const configVal = await getConfigValue('approval_threshold');
  const fallback = configVal ? Number(configVal) : env.DEFAULT_APPROVAL_THRESHOLD;
  const threshold = data.approval_threshold ?? fallback;
  const approvalRequired = data.estimated_cost > threshold;
  const approvalId = `APP-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;

  const approvalStatus = approvalRequired ? 'pending_human_approval' : 'auto_approved';
  const reason =
    data.reason ||
    (approvalRequired
      ? `Estimated cost ${data.estimated_cost} exceeds autonomous purchase threshold of ${threshold}`
      : `Estimated cost ${data.estimated_cost} is within autonomous purchase threshold of ${threshold}`);

  const sql = `
    INSERT INTO simulation.approvals (
      approval_id,
      action_type,
      estimated_cost,
      approval_threshold,
      approval_required,
      approval_status,
      reason,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    RETURNING *;
  `;
  const res = await query(sql, [
    approvalId,
    data.action_type,
    data.estimated_cost,
    threshold,
    approvalRequired,
    approvalStatus,
    reason,
  ]);

  return {
    ...res.rows[0],
    estimated_cost: Number(res.rows[0].estimated_cost),
    approval_threshold: Number(res.rows[0].approval_threshold),
  };
}

export async function getApprovals(): Promise<ApprovalRecord[]> {
  const sql = `
    SELECT 
      approval_id,
      action_type,
      estimated_cost::float,
      approval_threshold::float,
      approval_required,
      approval_status,
      reason,
      created_at
    FROM simulation.approvals
    ORDER BY created_at DESC;
  `;
  const res = await query(sql);
  return res.rows;
}

// ponytail: direct update query avoids complex ORM abstractions
export async function updateApprovalStatus(
  approvalId: string,
  status: 'approved' | 'rejected',
  notes?: string
): Promise<ApprovalRecord | null> {
  const sql = `
    UPDATE simulation.approvals
    SET approval_status = $1,
        reason = CASE WHEN $2::text IS NOT NULL AND $2::text != '' THEN reason || ' | Note: ' || $2 ELSE reason END
    WHERE approval_id = $3
    RETURNING approval_id, action_type, estimated_cost::float, approval_threshold::float, approval_required, approval_status, reason, created_at;
  `;
  const res = await query(sql, [status, notes || null, approvalId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}

