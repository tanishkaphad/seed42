import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronRight, Trash2, ArrowDown } from 'lucide-react';
import type { AgentRealtimeEvent } from '../types';

interface EventStreamTerminalProps {
  events: AgentRealtimeEvent[];
  onClearEvents: () => void;
  sseConnected?: boolean;
}

export const EventStreamTerminal: React.FC<EventStreamTerminalProps> = ({
  events,
  onClearEvents,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const filteredEvents = events.filter((e) => {
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'GOVERNANCE') return e.type === 'GOVERNANCE' || e.eventType.includes('APPROVAL');
    if (selectedFilter === 'TOOL_CALL') return e.type === 'TOOL_CALL';
    if (selectedFilter === 'ALERTS') return e.status === 'WARNING' || e.status === 'BLOCKED';
    return true;
  });

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '480px' }}>
      {/* Terminal Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--bg-glass-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Terminal size={18} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Real-Time Audit Ledger Stream</h2>
          <span className="badge badge-cyan mono">SSE BROADCAST</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            ({events.length} events logged)
          </span>
        </div>

        {/* Filter & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '0.2rem' }}>
            {['ALL', 'TOOL_CALL', 'GOVERNANCE', 'ALERTS'].map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                style={{
                  background: selectedFilter === filter ? 'var(--accent-cyan)' : 'transparent',
                  color: selectedFilter === filter ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {filter}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Toggle Auto-scroll"
          >
            <ArrowDown size={13} color={autoScroll ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
            <span>{autoScroll ? 'Scroll: On' : 'Scroll: Off'}</span>
          </button>

          <button
            onClick={onClearEvents}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            title="Clear terminal output"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(3, 7, 18, 0.75)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          border: '1px solid rgba(148, 163, 184, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {filteredEvents.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              gap: '0.5rem',
            }}
          >
            <Terminal size={28} opacity={0.4} />
            <p>Awaiting live agent events... Click "Trigger Agent" above to start.</p>
          </div>
        ) : (
          filteredEvents.map((evt, idx) => {
            const isExpanded = !!expandedIndices[idx];
            let statusColor = 'var(--status-emerald)';
            if (evt.status === 'WARNING') statusColor = 'var(--status-amber)';
            if (evt.status === 'BLOCKED' || evt.status === 'FAILED') statusColor = 'var(--status-crimson)';

            return (
              <div
                key={idx}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.08)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.55rem 0.75rem',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Event Summary Line */}
                <div
                  onClick={() => toggleExpand(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>

                    <span
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        background: 'rgba(255,255,255,0.06)',
                        color: statusColor,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                      }}
                    >
                      {evt.eventType}
                    </span>

                    {evt.tool && (
                      <span style={{ color: 'var(--accent-cyan)', fontSize: '0.725rem' }}>
                        [{evt.tool}]
                      </span>
                    )}

                    <span
                      style={{
                        color: 'var(--text-primary)',
                        fontSize: '0.775rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {evt.message}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>

                {/* Expanded Payload Data */}
                {isExpanded && evt.data && (
                  <div
                    style={{
                      marginTop: '0.65rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid rgba(148, 163, 184, 0.1)',
                      fontSize: '0.725rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <pre style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
                      {JSON.stringify(evt.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
