import { buildApp } from './app.js';
import { env } from './config/env.js';

async function startServer() {
  const app = buildApp();

  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    app.log.info(`🚀 Supply Chain Disruption Control Agent Backend running at ${address}`);
    app.log.info(`🩺 Health check available at ${address}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await app.close();
        app.log.info('Server closed successfully.');
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'Error during server shutdown');
        process.exit(1);
      }
    });
  }
}

startServer();

