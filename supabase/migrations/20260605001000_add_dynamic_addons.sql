-- Add allow_customizations to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS allow_customizations boolean NOT NULL DEFAULT false;

-- Create addons table
CREATE TABLE IF NOT EXISTS public.addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create product_addons mapping table
CREATE TABLE IF NOT EXISTS public.product_addons (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, addon_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
-- Allow anyone (public/kasir) to view addons and their mapping
CREATE POLICY addons_select ON public.addons FOR SELECT TO public USING (true);
CREATE POLICY product_addons_select ON public.product_addons FOR SELECT TO public USING (true);

-- Allow only owners to insert, update, or delete addons and mapping
CREATE POLICY addons_owner_all ON public.addons FOR ALL TO public USING (is_owner()) WITH CHECK (is_owner());
CREATE POLICY product_addons_owner_all ON public.product_addons FOR ALL TO public USING (is_owner()) WITH CHECK (is_owner());

-- Insert initial standard addons
INSERT INTO public.addons (name, price) VALUES
  ('Espresso Shot', 4000),
  ('Caramel Sauce', 5000),
  ('Vanilla Syrup', 5000)
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price;

-- Automatically set allow_customizations = true for all existing beverage products (non-Food)
UPDATE public.products 
SET allow_customizations = true 
WHERE category_id IN (SELECT id FROM public.categories WHERE name ILIKE 'espresso based' OR name ILIKE 'beverage' OR name NOT ILIKE 'food');

-- Automatically link all existing beverage products to the default 3 addons
INSERT INTO public.product_addons (product_id, addon_id)
SELECT p.id, a.id
FROM public.products p
CROSS JOIN public.addons a
WHERE p.allow_customizations = true
ON CONFLICT DO NOTHING;
