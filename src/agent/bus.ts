export type LiveAgentEvent = {
  run_id?: string;
  agent: string;
  message: string;
  at: string;
};

const listeners = new Set<(event: LiveAgentEvent) => void>();

export function publishAgentEvent(event: Omit<LiveAgentEvent, 'at'> & { at?: string }) {
  const full: LiveAgentEvent = { ...event, at: event.at || new Date().toISOString() };
  for (const listener of listeners) listener(full);
}

export function subscribeAgentEvents(listener: (event: LiveAgentEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
