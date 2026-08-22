import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRoutes } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../public');

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

  // ponytail: serve static frontend dashboard from public/ using standard Node fs
  app.get('/', async (request, reply) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      reply.type('text/html; charset=utf-8');
      return fs.readFileSync(indexPath, 'utf-8');
    }
    return { service: 'seed42-dashboard', message: 'Ready' };
  });

  app.get('/styles.css', async (request, reply) => {
    const filePath = path.join(publicDir, 'styles.css');
    if (fs.existsSync(filePath)) {
      reply.type('text/css; charset=utf-8');
      return fs.readFileSync(filePath, 'utf-8');
    }
    reply.status(404).send('Not found');
  });

  app.get('/app.js', async (request, reply) => {
    const filePath = path.join(publicDir, 'app.js');
    if (fs.existsSync(filePath)) {
      reply.type('application/javascript; charset=utf-8');
      return fs.readFileSync(filePath, 'utf-8');
    }
    reply.status(404).send('Not found');
  });

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

