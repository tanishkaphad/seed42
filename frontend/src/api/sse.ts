// =========================================================
// Server-Sent Events (SSE) Client
// =========================================================

import type { AgentRealtimeEvent } from '../types';

export function connectDisruptionSSE(
  disruptionId: string,
  onEvent: (event: AgentRealtimeEvent) => void,
  onConnected?: (data: unknown) => void,
  onError?: (err: Event) => void
): () => void {
  const url = `/api/agent/events/${encodeURIComponent(disruptionId)}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('connected', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      if (onConnected) onConnected(data);
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener('agent:event', (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as AgentRealtimeEvent;
      onEvent(event);
    } catch (err) {
      console.error('[SSE] Failed to parse agent event:', err);
    }
  });

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  // Return cleanup unsubscribe function
  return () => {
    eventSource.close();
  };
}
