import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

async function startHttp() {
  const app = Fastify();
  const transports = new Map<string, StreamableHTTPServerTransport>();
  app.all('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'];
    let transport = typeof sessionId === 'string' ? transports.get(sessionId) : undefined;
    if (!transport) {
      if (typeof sessionId === 'string') return reply.code(404).send({ error: 'Unknown MCP session' });
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, transport!); } });
      await createMcpServer().connect(transport);
    }
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
  await app.listen({ port: Number(process.env.MCP_PORT || 3333), host: '0.0.0.0' });
}

if (process.argv.includes('--http')) await startHttp();
else await createMcpServer().connect(new StdioServerTransport());
