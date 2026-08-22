import { query } from './database.js';

// ponytail: single-process in-memory cache, 60s TTL. Upgrade to Redis if multi-instance.
let cache: Record<string, string> | null = null;
let cacheTs = 0;
const TTL_MS = 60_000;

async function loadCache(): Promise<Record<string, string>> {
  const res = await query(`SELECT key, value FROM simulation.config`);
  cache = Object.fromEntries(res.rows.map((r: any) => [r.key, r.value]));
  cacheTs = Date.now();
  return cache || {};
}

export async function getConfigValue(key: string): Promise<string | null> {
  if (!cache || Date.now() - cacheTs > TTL_MS) await loadCache();
  return cache![key] ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO simulation.config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
  cache = null; // invalidate
}

export async function getAllConfig(): Promise<Record<string, string>> {
  if (!cache || Date.now() - cacheTs > TTL_MS) await loadCache();
  return { ...cache! };
}
