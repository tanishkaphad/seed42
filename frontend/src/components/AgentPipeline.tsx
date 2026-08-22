'use client';

import React from 'react';
import {
  Radar,
  Calculator,
  FileCheck,
  Search,
  Layers,
  Scale,
  UserCheck,
  Zap,
  CheckCircle2,
  Flag,
} from 'lucide-react';
import type { AgentStep } from '../types';

interface AgentPipelineProps {
  currentStep: AgentStep | null;
  completedSteps: AgentStep[];
  isRunning: boolean;
}

interface StepMeta {
  id: AgentStep;
  name: string;
  sub: string;
  icon: React.ReactNode;
}

const STEPS: StepMeta[] = [
  { id: 'DETECT', name: 'Detect', sub: 'Signal Ingest', icon: <Radar size={15} /> },
  { id: 'IMPACT_ANALYSIS', name: 'Impact', sub: 'Burn Rate & Risk', icon: <Calculator size={15} /> },
  { id: 'VERIFY', name: 'Verify', sub: 'Carrier Manifest', icon: <FileCheck size={15} /> },
  { id: 'SOURCE', name: 'Source', sub: 'Alt Suppliers', icon: <Search size={15} /> },
  { id: 'PLAN', name: 'Plan', sub: 'Candidate Plans', icon: <Layers size={15} /> },
  { id: 'CONSTRAINT_CHECK', name: 'Engine Check', sub: 'ISO-9001 & Lead', icon: <Scale size={15} /> },
  { id: 'APPROVAL_GATE', name: 'Governance', sub: '$150k Threshold', icon: <UserCheck size={15} /> },
  { id: 'EXECUTE', name: 'Execute PO', sub: 'Simulated ERP', icon: <Zap size={15} /> },
  { id: 'VERIFY_OUTCOME', name: 'Verify Outcome', sub: 'Post-Run Stock', icon: <CheckCircle2 size={15} /> },
  { id: 'COMPLETE', name: 'Mitigated', sub: 'Audit Sealed', icon: <Flag size={15} /> },
];

export const AgentPipeline: React.FC<AgentPipelineProps> = ({
  currentStep,
  completedSteps,
  isRunning,
}) => {
  return (
    <div className="glass-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>LangGraph.js Autonomous Decision Pipeline</h2>
          <span className="badge badge-cyan mono">10-NODE STATE MACHINE</span>
        </div>
        {isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>
            <span className="live-dot emerald" />
            <span className="mono">ACTIVE INFERENCE & EXECUTION</span>
          </div>
        )}
      </div>

      {/* Horizontal Pipeline Steps */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(10, 1fr)',
          gap: '0.5rem',
          position: 'relative',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
        }}
      >
        {STEPS.map((step, idx) => {
          const isCurrent = currentStep === step.id;
          const isDone = completedSteps.includes(step.id);

          let borderColor = 'var(--bg-glass-border)';
          let bgColor = 'var(--bg-tertiary)';
          let iconColor = 'var(--text-muted)';

          if (isCurrent) {
            borderColor = 'var(--accent-cyan)';
            bgColor = 'rgba(6, 182, 212, 0.15)';
            iconColor = 'var(--accent-cyan)';
          } else if (isDone) {
            borderColor = 'var(--status-emerald)';
            bgColor = 'rgba(16, 185, 129, 0.1)';
            iconColor = 'var(--status-emerald)';
          }

          return (
            <div
              key={step.id}
              style={{
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
                transition: 'all 0.3s ease',
                boxShadow: isCurrent ? 'var(--shadow-cyan-glow)' : 'none',
                minWidth: '105px',
              }}
            >
              {/* Step Index Number */}
              <div
                className="mono"
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: isCurrent ? 'var(--accent-cyan)' : isDone ? 'var(--status-emerald)' : 'var(--text-muted)',
                  marginBottom: '0.35rem',
                }}
              >
                0{idx + 1}
              </div>

              {/* Step Icon */}
              <div
                style={{
                  color: iconColor,
                  marginBottom: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {step.icon}
              </div>

              {/* Step Name */}
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: isCurrent ? '#ffffff' : isDone ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: '100%',
                }}
              >
                {step.name}
              </div>

              {/* Sub-label */}
              <div
                style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.15rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: '100%',
                }}
              >
                {step.sub}
              </div>

              {/* Active Pulse Animation Indicator */}
              {isCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    width: '20px',
                    height: '2px',
                    background: 'var(--accent-cyan)',
                    boxShadow: '0 0 8px var(--accent-cyan)',
                    borderRadius: '2px',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
