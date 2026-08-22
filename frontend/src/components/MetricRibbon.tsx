'use client';

import React from 'react';
import { Boxes, Factory, ShieldAlert } from 'lucide-react';
import type { DemoStateResponse } from '../types';

interface MetricRibbonProps {
  demoState: DemoStateResponse | null;
}

export const MetricRibbon: React.FC<MetricRibbonProps> = ({ demoState }) => {
  const scenario = demoState?.scenario;
  const comp = scenario?.component;
  const prod = scenario?.productionOrder;

  return (
    <div className="grid-4">
      {/* Metric 1: Disruption Status */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Active Disruption
          </span>
          <span className="badge badge-crimson">
            <span className="live-dot crimson" style={{ width: '6px', height: '6px' }} />
            CRITICAL
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--status-crimson)' }}>
            PO-7712
          </span>
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            (SUP-21)
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Supplier claims +5 day delay on micro-controllers
        </p>
      </div>

      {/* Metric 2: Inventory Coverage */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Inventory Coverage
          </span>
          <Boxes size={18} color="var(--accent-cyan)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
            {comp ? `${comp.daysOfCoverage}d` : '4.2d'}
          </span>
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {comp ? `(${comp.currentStock} units)` : '(420 units)'}
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Burn rate: {comp?.dailyBurnRate ?? 100} units/day (Safety stock: 200)
        </p>
      </div>

      {/* Metric 3: Production Deficit & Line Risk */}
      <div className="glass-card" style={{ padding: '1.25rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Production Deficit
          </span>
          <Factory size={18} color="var(--status-amber)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--status-amber)' }}>
            -{prod ? prod.deficitUnits : 280} units
          </span>
          <span className="badge badge-amber mono" style={{ fontSize: '0.7rem' }}>
            {prod ? `${prod.deadlineDays}d deadline` : '4d deadline'}
          </span>
        </div>
        <p style={{ color: 'var(--status-crimson)', fontSize: '0.8rem', fontWeight: 500 }}>
          ⚠️ PROD-882 factory line stoppage in 4 days
        </p>
      </div>

      {/* Metric 4: Multi-Signal Contradiction Detected */}
      <div
        className="glass-card"
        style={{
          padding: '1.25rem',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
          borderColor: 'rgba(239, 68, 68, 0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--status-crimson)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Signal Mismatch
          </span>
          <ShieldAlert size={18} color="var(--status-crimson)" />
        </div>
        <div style={{ marginBottom: '0.35rem' }}>
          <span className="badge badge-crimson mono" style={{ fontSize: '0.75rem' }}>
            NO_LABEL_CREATED
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Supplier says <span style={{ color: '#fff' }}>"Dispatched"</span> vs. Carrier manifest <span style={{ color: '#fff' }}>"No cargo"</span>
        </p>
      </div>
    </div>
  );
};
