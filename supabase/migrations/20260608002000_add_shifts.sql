-- Create shifts table for cashier shift management
CREATE TABLE IF NOT EXISTS shifts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opened_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  notes       TEXT
);

-- Index for fast open-shift queries
CREATE INDEX IF NOT EXISTS shifts_opened_at_idx ON shifts (opened_at DESC);
CREATE INDEX IF NOT EXISTS shifts_closed_at_idx ON shifts (closed_at) WHERE closed_at IS NULL;

-- RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_read_authenticated"
  ON shifts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "shifts_insert_authenticated"
  ON shifts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "shifts_update_authenticated"
  ON shifts FOR UPDATE
  TO authenticated
  USING (true);
