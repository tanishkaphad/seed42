'use client';

import React, { useState } from 'react';
import { AlertOctagon, CheckCircle, XCircle } from 'lucide-react';
import type { ApprovalRequest } from '../types';

interface ApprovalModalProps {
  approval: ApprovalRequest;
  onApprove: (id: string, notes: string) => Promise<void>;
  onReject: (id: string, notes: string) => Promise<void>;
  onClose: () => void;
  isProcessing: boolean;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  approval,
  onApprove,
  onReject,
  onClose,
  isProcessing,
}) => {
  const [approverNotes, setApproverNotes] = useState<string>(
    'Emergency authorization approved by Operations Manager to prevent factory line shutdown.'
  );

  const payload = approval.payload;
  const cost = payload.recoveryCost ?? 168000;
  const limit = payload.autonomousLimit ?? 150000;
  const overage = Math.max(0, cost - limit);

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ padding: '1.75rem' }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertOctagon size={22} color="var(--status-crimson)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Human-in-the-Loop Governance Gate</h3>
              <p style={{ color: 'var(--status-crimson)', fontSize: '0.8rem', fontWeight: 600 }}>
                Budget Limit Exceeded · High-Value Procurement Action
              </p>
            </div>
          </div>
          <span className="badge badge-crimson mono">ID: {approval.id.slice(0, 8)}</span>
        </div>

        {/* Financial Risk & Overage Ribbon */}
        <div
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Proposed Cost</div>
            <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--status-crimson)' }}>
              ${cost.toLocaleString()}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Autonomous Limit</div>
            <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
              ${limit.toLocaleString()}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Escalation Overage</div>
            <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--status-amber)' }}>
              +${overage.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Context Summary Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--bg-glass-border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '0.25rem' }}>
              Factory Line Risk:
            </div>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>
              {payload.productionRisk?.componentSku} inventory (420 units) depletes in 4.2 days. Line PROD-882 faces imminent shutdown without 280 units within 4 days.
            </p>
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--bg-glass-border)' }}>
            <div style={{ fontWeight: 700, color: 'var(--status-amber)', marginBottom: '0.25rem' }}>
              Recommended Recovery Plan:
            </div>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>
              {payload.recoveryPlan?.description ?? 'Expedited recovery order'} ({payload.recoveryPlan?.totalQuantity} units, {payload.recoveryPlan?.fastestDeliveryDays}-day arrival).
            </p>
          </div>
        </div>

        {/* Approver Notes Input */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Approver Audit Note:
          </label>
          <textarea
            value={approverNotes}
            onChange={(e) => setApproverNotes(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--bg-glass-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8rem',
              resize: 'none',
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="btn btn-secondary"
          >
            Cancel
          </button>

          <button
            onClick={() => onReject(approval.id, approverNotes)}
            disabled={isProcessing}
            className="btn btn-danger"
          >
            <XCircle size={16} />
            <span>Reject Plan</span>
          </button>

          <button
            onClick={() => onApprove(approval.id, approverNotes)}
            disabled={isProcessing}
            className="btn btn-success"
          >
            <CheckCircle size={16} />
            <span>{isProcessing ? 'Executing...' : 'Approve & Execute PO'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
