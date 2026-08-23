import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { apiRoutes } from './routes.js';
import crypto, { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../mcp/server.js';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = crypto;
}
export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  app.register(cors, { origin: true });
  app.register(apiRoutes);

  app.get('/', async () => ({
    service: 'seed42-api',
    ui: 'http://localhost:3001',
    health: '/health',
  }));

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected simulation error occurred',
      statusCode,
    });
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();
  app.all('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    let transport = typeof sessionId === 'string' ? transports.get(sessionId) : undefined;
    if (!transport) {
      if (typeof sessionId === 'string') return reply.code(404).send({ error: 'Unknown MCP session' });
      transport = new StreamableHTTPServerTransport({ 
        sessionIdGenerator: () => randomUUID(), 
        onsessioninitialized: (id) => { transports.set(id, transport!); } 
      });
      await createMcpServer().connect(transport);
    }
    reply.hijack();
    await transport.handleRequest(request.raw as any, reply.raw as any, request.body as any);
  });

  return app;
}
