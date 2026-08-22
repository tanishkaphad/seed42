import { buildServer } from './api/server.js';
import { env } from './config/env.js';
import { initSimulationWorker } from './queues/simulationQueue.js';

async function start() {
  const app = buildServer();

  // Initialize background BullMQ queue worker
  initSimulationWorker();

  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    console.log(`Supply Chain Simulation Server running at ${address}`);
    console.log(`Health endpoint: ${address}/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
