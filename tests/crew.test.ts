import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';
import { runShortageCrew, watchShortages } from '../src/agent/crew.js';
import { getAgentEvents } from '../src/sim/agentStore.js';

describe('shortage crew', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('watcher flags COMP-104 under the coverage threshold', async () => {
    const shortages = await watchShortages(7);
    expect(shortages.some((x) => x.component_id === 'COMP-104')).toBe(true);
  });

  it('runs watcher, sourcer, mailer, treasurer against a shortage', async () => {
    const result = await runShortageCrew('COMP-104');
    expect(result.run_id).toMatch(/^RUN-/);
    expect(['completed', 'waiting_approval']).toContain(result.status);
    const events = await getAgentEvents(result.run_id);
    const agents = events.map((e: { agent: string }) => e.agent);
    expect(agents).toEqual(expect.arrayContaining(['watcher', 'sourcer', 'mailer', 'treasurer']));
  });
});
