// ==========================================
// In-Memory Real-time EventBus
// ==========================================
// Dispatches structured agent events to SSE subscribers
// filtering by disruptionId.

import { EventEmitter } from 'node:events';
import type { AgentRealtimeEvent } from './types.js';

class DisruptionEventBus extends EventEmitter {
  private static instance: DisruptionEventBus;

  private constructor() {
    super();
    // Allow high number of SSE listeners for demo/presentation
    this.setMaxListeners(100);
  }

  public static getInstance(): DisruptionEventBus {
    if (!DisruptionEventBus.instance) {
      DisruptionEventBus.instance = new DisruptionEventBus();
    }
    return DisruptionEventBus.instance;
  }

  /**
   * Broadcast an event to both disruption-specific and global listeners.
   */
  public publish(event: AgentRealtimeEvent): void {
    // 1. Topic per disruption ID
    this.emit(`disruption:${event.disruptionId}`, event);
    // 2. Global wildcard topic
    this.emit('agent:event', event);
  }

  /**
   * Subscribe to events for a specific disruption ID.
   */
  public subscribe(
    disruptionId: string,
    listener: (event: AgentRealtimeEvent) => void
  ): () => void {
    const topic = `disruption:${disruptionId}`;
    this.on(topic, listener);

    // Return cleanup unsubscribe function
    return () => {
      this.off(topic, listener);
    };
  }

  /**
   * Subscribe to all agent events across the system.
   */
  public subscribeAll(listener: (event: AgentRealtimeEvent) => void): () => void {
    this.on('agent:event', listener);
    return () => {
      this.off('agent:event', listener);
    };
  }
}

export const eventBus = DisruptionEventBus.getInstance();
