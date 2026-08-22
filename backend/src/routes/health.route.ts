import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { HealthResponse } from '../types/index.js';

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'supply-chain-agent',
    });
  });
}
