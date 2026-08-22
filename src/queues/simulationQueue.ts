import { Queue, Worker, Job } from 'bullmq';
import { env } from '../config/env.js';
import { advanceSimulationTime } from '../sim/events.js';

let simulationQueue: Queue | null = null;
let simulationWorker: Worker | null = null;

export function getSimulationQueue(): Queue | null {
  if (!simulationQueue) {
    try {
      const redisUrl = new URL(env.REDIS_URL);
      simulationQueue = new Queue('simulation-events', {
        connection: {
          host: redisUrl.hostname || '127.0.0.1',
          port: Number(redisUrl.port) || 6379,
          maxRetriesPerRequest: null,
          lazyConnect: true,
        },
      });
      // Handle connection error gracefully
      simulationQueue.on('error', (err) => {
        // Redis not connected; fallback to synchronous execution
      });
    } catch (e) {
      console.warn('[BullMQ] Redis unavailable; background queue operating in fallback mode.');
    }
  }
  return simulationQueue;
}

export function initSimulationWorker(): Worker | null {
  if (!simulationWorker) {
    try {
      const redisUrl = new URL(env.REDIS_URL);
      simulationWorker = new Worker(
        'simulation-events',
        async (job: Job) => {
          if (job.name === 'advance-time') {
            const steps = job.data.steps || 1;
            return await advanceSimulationTime(steps);
          }
        },
        {
          connection: {
            host: redisUrl.hostname || '127.0.0.1',
            port: Number(redisUrl.port) || 6379,
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
        }
      );

      simulationWorker.on('error', () => {});
    } catch (e) {
      // Redis offline
    }
  }
  return simulationWorker;
}

export async function queueTimeAdvance(steps: number): Promise<void> {
  const q = getSimulationQueue();
  if (q) {
    try {
      await q.add('advance-time', { steps });
      return;
    } catch (e) {
      // Fallback
    }
  }
  // If queue failed or Redis unreachable, advance directly
  await advanceSimulationTime(steps);
}
