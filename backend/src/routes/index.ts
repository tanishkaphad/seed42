import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { healthRoutes } from './health.route.js';
import { demoRoutes } from './demo.route.js';
import { agentRoutes } from './agent.route.js';
import { approvalRoutes } from './approvalRoutes.js';

export async function apiRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // Register health route (/api/health)
  await fastify.register(healthRoutes);

  // Register demo routes (/api/demo/reset, /api/demo/state)
  await fastify.register(demoRoutes, { prefix: '/demo' });

  // Register agent routes (/api/agent/run, /api/agent/resume, /api/agent/stream)
  await fastify.register(agentRoutes, { prefix: '/agent' });

  // Register human approval routes (/api/approvals)
  await fastify.register(approvalRoutes, { prefix: '/approvals' });
}

