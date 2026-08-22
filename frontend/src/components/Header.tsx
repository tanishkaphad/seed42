'use client';

import React from 'react';
import { Play, RotateCcw, ShieldCheck, Activity, Radio } from 'lucide-react';

interface HeaderProps {
  backendOnline: boolean;
  isRunning: boolean;
  isResetting: boolean;
  onTriggerAgent: () => void;
  onResetScenario: () => void;
  sseConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  backendOnline,
  isRunning,
  isResetting,
  onTriggerAgent,
  onResetScenario,
  sseConnected,
}) => {
  return (
    <header className="glass-card" style={{ padding: '1.25rem 1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Brand & System Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.25)',
            }}
          >
            <ShieldCheck size={26} color="var(--accent-cyan)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Supply Chain Disruption Control Center</h1>
              <span className="badge badge-cyan mono">AUTONOMOUS v1.0</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', marginTop: '0.15rem' }}>
              Deterministic Constraint Engine · LangGraph.js Agent · Human-in-the-Loop Governance
            </p>
          </div>
        </div>

        {/* Telemetry & Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Live Status Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', paddingRight: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span className={`live-dot ${backendOnline ? 'emerald' : 'crimson'}`} />
              <span>Backend API</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Radio size={14} color={sseConnected ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
              <span>{sseConnected ? 'SSE Live' : 'SSE Idle'}</span>
            </div>
          </div>

          {/* Reset Scenario Button */}
          <button
            onClick={onResetScenario}
            disabled={isResetting || isRunning}
            className="btn btn-secondary"
            title="Reset database to initial PO-7712 disruption state"
          >
            <RotateCcw size={15} className={isResetting ? 'spin' : ''} />
            <span>{isResetting ? 'Resetting...' : 'Reset Demo'}</span>
          </button>

          {/* Trigger Agent Run Button */}
          <button
            onClick={onTriggerAgent}
            disabled={isRunning || !backendOnline}
            className="btn btn-primary"
            title="Execute 10-step autonomous LangGraph resolution"
          >
            {isRunning ? (
              <>
                <Activity size={16} className="spin" />
                <span>Agent Active...</span>
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" />
                <span>Trigger Agent (PO-7712)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
