// ==========================================
// Agent Audit & Real-time Event Service
// ==========================================
// Persists structured events to PostgreSQL audit_logs
// and broadcasts live events over the eventBus for SSE consumers.

import { prisma } from '../db/prisma.js';
import { eventBus } from './eventBus.js';
import type { EmitEventInput, AgentRealtimeEvent } from './types.js';
import type { ActorType } from '@prisma/client';

/**
 * Record a structured audit event into PostgreSQL and broadcast over SSE.
 */
export async function recordAndEmitEvent(input: EmitEventInput): Promise<AgentRealtimeEvent> {
  const timestamp = new Date().toISOString();

  // Create clean event object for streaming (no internal chain-of-thought)
  const realtimeEvent: AgentRealtimeEvent = {
    timestamp,
    disruptionId: input.disruptionId,
    step: input.step,
    type: input.type,
    eventType: input.eventType,
    tool: input.tool,
    status: input.status,
    message: input.message,
    data: input.data
      ? {
          inputSummary: input.data.inputSummary,
          outputSummary: input.data.outputSummary,
          ruleResults: input.data.ruleResults,
          metadata: input.data.metadata,
        }
      : undefined,
  };

  // 1. Persist to PostgreSQL audit_logs table
  let persistedLogId: string | undefined;
  try {
    const log = await prisma.auditLog.create({
      data: {
        action: input.eventType,
        actorType: (input.actorType ?? 'AGENT') as ActorType,
        actorId: input.actorId ?? 'supply-chain-agent-v1',
        targetEntity: input.targetEntity ?? 'DisruptionEvent',
        targetEntityId: input.targetEntityId ?? input.disruptionId,
        previousState: undefined,
        newState: {
          step: input.step,
          type: input.type,
          tool: input.tool,
          status: input.status,
          summary: input.data?.outputSummary,
          ruleResults: input.data?.ruleResults,
        } as object,
        reasoning: input.message,
        metadata: {
          disruptionId: input.disruptionId,
          ...(input.data?.metadata ?? {}),
        } as object,
        timestamp: new Date(timestamp),
      },
    });
    persistedLogId = log.id;
    realtimeEvent.id = log.id;
  } catch (err) {
    console.error('[AUDIT_SERVICE] Warning: failed to persist audit log to DB:', err);
  }

  // 2. Publish to live eventBus for all active SSE connections
  eventBus.publish(realtimeEvent);

  return realtimeEvent;
}

/**
 * Retrieve historical events for a disruption ID (for initial SSE replay / catchup).
 */
export async function getEventsByDisruptionId(disruptionId: string): Promise<AgentRealtimeEvent[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetEntityId: disruptionId },
        { metadata: { path: ['disruptionId'], equals: disruptionId } },
      ],
    },
    orderBy: { timestamp: 'asc' },
  });

  return logs.map((log) => {
    const newState = (log.newState as Record<string, unknown>) ?? {};
    return {
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      disruptionId,
      step: (newState.step as string) ?? 'UNKNOWN',
      type: (newState.type as AgentRealtimeEvent['type']) ?? 'STATE_CHANGE',
      eventType: log.action as AgentRealtimeEvent['eventType'],
      tool: newState.tool as string | undefined,
      status: (newState.status as AgentRealtimeEvent['status']) ?? 'SUCCESS',
      message: log.reasoning ?? log.action,
      data: {
        outputSummary: newState.summary as Record<string, unknown> | string | undefined,
        ruleResults: newState.ruleResults as Record<string, unknown> | undefined,
      },
    };
  });
}
