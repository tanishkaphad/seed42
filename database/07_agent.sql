-- Crew run log, step events, and simulated payments after approval.

CREATE TABLE IF NOT EXISTS simulation.agent_runs (
  run_id VARCHAR PRIMARY KEY,
  status VARCHAR NOT NULL,
  component_id VARCHAR,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulation.agent_events (
  event_id VARCHAR PRIMARY KEY,
  run_id VARCHAR NOT NULL REFERENCES simulation.agent_runs(run_id) ON DELETE CASCADE,
  agent VARCHAR NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulation.payments (
  payment_id VARCHAR PRIMARY KEY,
  run_id VARCHAR,
  po_id VARCHAR,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
