'use client';

import React from 'react';
import { Check, X, ShieldAlert, Clock, DollarSign, Box } from 'lucide-react';
import type { SupplierItem } from '../types';

interface SupplierMatrixProps {
  suppliers: SupplierItem[];
}

export const SupplierMatrix: React.FC<SupplierMatrixProps> = ({ suppliers }) => {
  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Supplier Compliance & Constraint Matrix</h2>
          <span className="badge badge-cyan mono">DETERMINISTIC VETTING</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Rule: ISO-9001 Mandatory · Capacity &ge; Shortfall
        </span>
      </div>

      <div className="grid-4">
        {suppliers.map((sup) => {
          const isSup18 = sup.code === 'SUP-18';
          const isSup21 = sup.code === 'SUP-21';
          const isSup37 = sup.code === 'SUP-37';
          const isSup42 = sup.code === 'SUP-42';

          let borderAccent = 'var(--bg-glass-border)';
          let badge = <span className="badge badge-emerald">Eligible</span>;

          if (isSup18) {
            borderAccent = 'rgba(239, 68, 68, 0.4)';
            badge = <span className="badge badge-crimson">No ISO-9001</span>;
          } else if (isSup21) {
            borderAccent = 'rgba(245, 158, 11, 0.3)';
            badge = <span className="badge badge-amber">Disrupted (0 Cap)</span>;
          } else if (isSup37) {
            borderAccent = 'rgba(16, 185, 129, 0.5)';
            badge = <span className="badge badge-emerald">Recommended</span>;
          } else if (isSup42) {
            borderAccent = 'rgba(6, 182, 212, 0.4)';
            badge = <span className="badge badge-cyan">Expedited ($$$)</span>;
          }

          return (
            <div
              key={sup.code}
              style={{
                background: 'var(--bg-tertiary)',
                border: `1px solid ${borderAccent}`,
                borderRadius: 'var(--radius-md)',
                padding: '1.1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Header */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {sup.code}
                  </span>
                  {badge}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                  {sup.name}
                </div>

                {/* Attributes Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {sup.iso9001Certified ? <Check size={14} color="var(--status-emerald)" /> : <X size={14} color="var(--status-crimson)" />}
                      ISO-9001:
                    </span>
                    <span className="mono" style={{ color: sup.iso9001Certified ? 'var(--status-emerald)' : 'var(--status-crimson)', fontWeight: 600 }}>
                      {sup.iso9001Certified ? 'CERTIFIED' : 'FAILED'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Clock size={14} /> Lead Time:
                    </span>
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{sup.leadTimeDaysAvg} days</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Box size={14} /> Capacity:
                    </span>
                    <span className="mono" style={{ color: sup.availableCapacity === 0 ? 'var(--status-crimson)' : 'var(--text-primary)' }}>
                      {sup.availableCapacity} units
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <DollarSign size={14} /> Unit Price:
                    </span>
                    <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      ${sup.unitPrice}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Note / Reason */}
              <div
                style={{
                  marginTop: '0.9rem',
                  paddingTop: '0.65rem',
                  borderTop: '1px solid var(--bg-glass-border)',
                  fontSize: '0.725rem',
                  color: sup.ineligibilityReason ? 'var(--status-crimson)' : 'var(--text-muted)',
                }}
              >
                {sup.ineligibilityReason ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <ShieldAlert size={12} /> {sup.ineligibilityReason}
                  </span>
                ) : isSup37 ? (
                  'Optimal speed & cost within budget.'
                ) : (
                  'Fastest lead time, premium emergency cost.'
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
