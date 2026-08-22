// ==========================================
// Agent Real-time Events & Audit System Tests
// ==========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock Prisma ----
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'audit-event-123',
        ...data,
        timestamp: data.timestamp ?? new Date(),
      })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '../src/db/prisma.js';
import { eventBus } from '../src/audit/eventBus.js';
import { recordAndEmitEvent, getEventsByDisruptionId } from '../src/audit/auditService.js';
import { buildApp } from '../src/app.js';
import type { AgentRealtimeEvent } from '../src/audit/types.js';

describe('EventBus & Real-time Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to disruption-specific events and receives published events', async () => {
    const receivedEvents: AgentRealtimeEvent[] = [];

    const unsubscribe = eventBus.subscribe('disr-test-1', (event) => {
      receivedEvents.push(event);
    });

    const emitted = await recordAndEmitEvent({
      disruptionId: 'disr-test-1',
      step: 'VERIFY',
      type: 'TOOL_CALL',
      eventType: 'SUPPLIER_VERIFICATION',
      tool: 'verifyTracking',
      status: 'WARNING',
      message: 'Supplier claim contradicted by tracking data',
      data: {
        outputSummary: {
          hasContradiction: true,
          supplierClaim: 'Shipment dispatched',
          carrierStatus: 'NO_LABEL_CREATED',
        },
      },
    });

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].eventType).toBe('SUPPLIER_VERIFICATION');
    expect(receivedEvents[0].disruptionId).toBe('disr-test-1');
    expect(receivedEvents[0].status).toBe('WARNING');
    expect(emitted.id).toBe('audit-event-123');
    expect(prisma.auditLog.create).toHaveBeenCalled();

    unsubscribe();
  });

  it('does not receive events published for a different disruptionId', async () => {
    const receivedEvents: AgentRealtimeEvent[] = [];

    const unsubscribe = eventBus.subscribe('disr-test-A', (event) => {
      receivedEvents.push(event);
    });

    await recordAndEmitEvent({
      disruptionId: 'disr-test-B',
      step: 'DETECT',
      type: 'STATE_CHANGE',
      eventType: 'DISRUPTION_DETECTED',
      status: 'WARNING',
      message: 'Disruption on PO: PO-9999',
    });

    expect(receivedEvents).toHaveLength(0);
    unsubscribe();
  });

  it('retrieves historical events for replay from PostgreSQL', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'audit-hist-1',
        action: 'DISRUPTION_DETECTED',
        actorType: 'AGENT',
        actorId: 'supply-chain-agent-v1',
        targetEntity: 'DisruptionEvent',
        targetEntityId: 'disr-replay-1',
        previousState: null,
        newState: {
          step: 'DETECT',
          type: 'STATE_CHANGE',
          status: 'WARNING',
          summary: 'Disruption detected',
        },
        reasoning: 'Critical delay reported',
        metadata: { disruptionId: 'disr-replay-1' },
        timestamp: new Date('2026-08-22T10:00:00Z'),
      } as never,
    ]);

    const history = await getEventsByDisruptionId('disr-replay-1');
    expect(history).toHaveLength(1);
    expect(history[0].eventType).toBe('DISRUPTION_DETECTED');
    expect(history[0].disruptionId).toBe('disr-replay-1');
  });
});

describe('SSE Agent Events Endpoint (GET /api/agent/events/:disruptionId)', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects to SSE endpoint and receives initial connected event', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/agent/events/disr-sse-123?replayOnly=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.body).toContain('event: connected');
    expect(response.body).toContain('disr-sse-123');
  });

  it('replays historical events in SSE payload', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      {
        id: 'audit-sse-hist-1',
        action: 'INVENTORY_CHECK',
        actorType: 'AGENT',
        actorId: 'supply-chain-agent-v1',
        targetEntity: 'DisruptionEvent',
        targetEntityId: 'disr-sse-history',
        previousState: null,
        newState: {
          step: 'IMPACT_ANALYSIS',
          type: 'TOOL_CALL',
          tool: 'checkInventory',
          status: 'SUCCESS',
          summary: { quantity: 420, daysOfCoverage: 4.2 },
        },
        reasoning: 'Inventory check complete',
        metadata: { disruptionId: 'disr-sse-history' },
        timestamp: new Date('2026-08-22T10:05:00Z'),
      } as never,
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/agent/events/disr-sse-history?replayOnly=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: agent:event');
    expect(response.body).toContain('INVENTORY_CHECK');
  });
});
