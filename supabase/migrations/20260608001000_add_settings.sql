-- Create settings table for store configuration (editable via UI)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Seed default values
INSERT INTO settings (key, value) VALUES
  ('store_name',    'EASE COFFEE'),
  ('store_handle',  '@easecoffee.bali'),
  ('store_tagline', 'Your daily cup, made with care'),
  ('store_ig',      '@easecoffee.bali'),
  ('store_tiktok',  '@easecoffee.bali'),
  ('tax_rate',      '0.11')
ON CONFLICT (key) DO NOTHING;

-- RLS: all authenticated users can read; only owner role can write
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_read_all"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "settings_write_owner"
  ON settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'owner'
    )
  );
