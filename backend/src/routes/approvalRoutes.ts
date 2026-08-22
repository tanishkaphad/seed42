// ==========================================
// Approval Routes — Human-in-the-Loop
// ==========================================
// Exposes endpoints for human operators to inspect,
// approve, or reject high-cost / high-risk recovery plans.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listApprovals,
  getApprovalById,
  approveRequest,
  rejectRequest,
} from '../services/approvalService.js';

const ApprovalActionBodySchema = z.object({
  userId: z.string().optional(),
  userName: z.string().optional(),
  notes: z.string().optional(),
});

export async function approvalRoutes(fastify: FastifyInstance) {
  // ---- GET /api/approvals ----
  // List all approval requests (optional query param: ?status=PENDING)
  fastify.get('/', async (request, reply) => {
    const query = request.query as { status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' };
    try {
      const approvals = await listApprovals(query?.status ? { status: query.status } : undefined);
      return reply.status(200).send({
        success: true,
        count: approvals.length,
        approvals,
      });
    } catch (err) {
      request.log.error(err, 'Failed to list approvals');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // ---- GET /api/approvals/:id ----
  // Get a single approval request with full context payload
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const approval = await getApprovalById(id);
      if (!approval) {
        return reply.status(404).send({
          success: false,
          error: `Approval request "${id}" not found.`,
        });
      }
      return reply.status(200).send({
        success: true,
        approval,
      });
    } catch (err) {
      request.log.error(err, 'Failed to get approval');
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  // ---- POST /api/approvals/:id/approve ----
  // Explicitly approve a plan and trigger execution
  fastify.post('/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ApprovalActionBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request payload',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await approveRequest(id, parsed.data);
      return reply.status(200).send({
        success: true,
        result,
      });
    } catch (err) {
      request.log.error(err, 'Failed to approve request');
      const message = err instanceof Error ? err.message : 'Unknown error';
      const statusCode = message.includes('not found') ? 404 : message.includes('already') ? 400 : 500;
      return reply.status(statusCode).send({ success: false, error: message });
    }
  });

  // ---- POST /api/approvals/:id/reject ----
  // Explicitly reject a plan
  fastify.post('/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ApprovalActionBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request payload',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await rejectRequest(id, parsed.data);
      return reply.status(200).send({
        success: true,
        result,
      });
    } catch (err) {
      request.log.error(err, 'Failed to reject request');
      const message = err instanceof Error ? err.message : 'Unknown error';
      const statusCode = message.includes('not found') ? 404 : message.includes('already') ? 400 : 500;
      return reply.status(statusCode).send({ success: false, error: message });
    }
  });
}
