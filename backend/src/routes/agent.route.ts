// ==========================================
// Agent Route — POST /api/agent/run
// ==========================================
// Runs the agent and returns the full result as JSON.
// For real-time streaming, the frontend should use SSE via /api/agent/stream.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runDisruptionAgent } from '../agent/agent.js';

const DisruptionTriggerSchema = z.object({
  purchaseOrderId: z.string().min(1),
  supplierId: z.string().min(1),
  componentId: z.string().min(1),
  claimedDelayDays: z.number().int().nonnegative(),
  disruptionEventId: z.string().optional(),
});

const ResumeApprovalSchema = z.object({
  purchaseOrderId: z.string().min(1),
  supplierId: z.string().min(1),
  componentId: z.string().min(1),
  claimedDelayDays: z.number().int().nonnegative(),
  humanApprovalId: z.string().min(1),
});

export async function agentRoutes(fastify: FastifyInstance) {
  // ---- POST /api/agent/run ----
  // Runs the full disruption response agent.
  fastify.post('/run', async (request, reply) => {
    const parsed = DisruptionTriggerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid disruption trigger',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await runDisruptionAgent(parsed.data);
      return reply.status(200).send({ success: true, result });
    } catch (err) {
      request.log.error(err, 'Agent run failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // ---- POST /api/agent/resume ----
  // Resumes a workflow after human approval has been granted.
  fastify.post('/resume', async (request, reply) => {
    const parsed = ResumeApprovalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid resume payload',
        details: parsed.error.flatten(),
      });
    }

    try {
      const { humanApprovalId, ...trigger } = parsed.data;
      const result = await runDisruptionAgent(trigger, humanApprovalId);
      return reply.status(200).send({ success: true, result });
    } catch (err) {
      request.log.error(err, 'Agent resume failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // ---- GET /api/agent/events/:disruptionId ----
  // SSE endpoint: live event stream for Next.js frontend by disruptionId
  fastify.get('/events/:disruptionId', async (request, reply) => {
    const { disruptionId } = request.params as { disruptionId: string };

    if (!disruptionId) {
      return reply.status(400).send({ error: 'disruptionId is required' });
    }

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    // 1. Send connection established handshake
    sendEvent('connected', {
      disruptionId,
      connectedAt: new Date().toISOString(),
      message: `SSE stream active for disruption: ${disruptionId}`,
    });

    // 2. Replay historical events from PostgreSQL
    try {
      const { getEventsByDisruptionId } = await import('../audit/auditService.js');
      const history = await getEventsByDisruptionId(disruptionId);
      for (const event of history) {
        sendEvent('agent:event', event);
      }
    } catch (err) {
      request.log.warn({ err }, 'Failed to replay historical audit events');
    }

    const { replayOnly } = request.query as { replayOnly?: string };
    if (replayOnly === 'true') {
      reply.raw.end();
      return;
    }

    // 3. Subscribe to live events from the EventBus
    const { eventBus } = await import('../audit/eventBus.js');
    const unsubscribe = eventBus.subscribe(disruptionId, (event) => {
      sendEvent('agent:event', event);
    });

    // 4. Handle client disconnect / close
    request.raw.on('close', () => {
      unsubscribe();
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    });
  });
}

