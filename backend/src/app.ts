import fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { apiRoutes } from './routes/index.js';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino/file',
              options: { destination: 1 }, // stdout
            }
          : undefined,
    },
  });

  // 1. CORS Setup
  const allowedOrigins =
    env.CORS_ORIGIN === '*'
      ? true
      : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

  app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // 2. Global Error Handler
  app.setErrorHandler((error: Error | FastifyError | unknown, request, reply) => {
    request.log.error(error);

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(400).send({
        status: 'error',
        message: 'Validation failed',
        error: {
          code: 'VALIDATION_ERROR',
          details: error.flatten(),
        },
      });
    }

    const fastifyErr = error as Partial<FastifyError> & { message?: string; code?: string };

    // Handle Fastify schema validation errors
    if (fastifyErr.validation) {
      return reply.status(400).send({
        status: 'error',
        message: fastifyErr.message || 'Validation error',
        error: {
          code: 'SCHEMA_VALIDATION_ERROR',
          details: fastifyErr.validation,
        },
      });
    }

    // Handle HTTP status errors or internal errors
    const statusCode =
      typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode >= 400
        ? fastifyErr.statusCode
        : 500;
    const message =
      statusCode === 500 && env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : fastifyErr.message || 'Internal Server Error';

    return reply.status(statusCode).send({
      status: 'error',
      message,
      error: {
        code: fastifyErr.code || 'INTERNAL_SERVER_ERROR',
      },
    });
  });

  // 3. Register API routes under /api prefix
  app.register(apiRoutes, { prefix: '/api' });

  return app;
}

