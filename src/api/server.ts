import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { apiRoutes } from './routes.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  // Enable CORS
  app.register(cors, {
    origin: true,
  });

  // Register API routes
  app.register(apiRoutes);

  // Global Error Handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected simulation error occurred',
      statusCode,
    });
  });

  return app;
}
