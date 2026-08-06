CREATE TABLE IF NOT EXISTS lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('stay_eat_do','taxi')),
  target_name text NOT NULL,
  category    text,
  type        text,          -- whatsapp | call | link
  ref         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_kind    ON lead_events (kind);
CREATE INDEX IF NOT EXISTS idx_lead_events_target  ON lead_events (target_name);
CREATE INDEX IF NOT EXISTS idx_lead_events_created ON lead_events (created_at DESC);

ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;

-- Public may only INSERT a lead event (no reading others' data).
-- Admin reads via the service-role key, which bypasses RLS.
CREATE POLICY lead_events_anon_insert ON lead_events
  FOR INSERT TO anon WITH CHECK (kind IN ('stay_eat_do','taxi'));