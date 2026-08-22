const SIM = process.env.API_ORIGIN || 'http://localhost:3000';

export async function sim(path: string, init?: RequestInit) {
  const r = await fetch(`${SIM}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || `Sim ${path} failed`);
  return data;
}
