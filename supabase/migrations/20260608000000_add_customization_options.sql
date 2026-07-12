-- Add per-product customization option columns to products table.
-- Each boolean flag controls whether that customization section appears
-- in the POS modal for the given product.
-- Default TRUE so existing products with allow_customizations=true
-- retain their current behaviour without any manual data migration.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS allow_temperature boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_sugar       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_ice         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_milk        boolean NOT NULL DEFAULT true;
