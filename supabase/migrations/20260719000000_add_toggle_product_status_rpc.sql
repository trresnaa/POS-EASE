-- RPC toggle_product_status untuk mengaktifkan/menonaktifkan produk
-- Digunakan oleh semua authenticated user (owner & staff) dari halaman Master Produk.
-- Menggunakan SECURITY DEFINER agar bypass RLS yang membatasi UPDATE hanya untuk owner.
-- Pola ini konsisten dengan toggle_staff_status RPC yang sudah ada.

CREATE OR REPLACE FUNCTION toggle_product_status(
  p_product_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Pastikan user sudah terautentikasi
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.products
  SET is_active = p_is_active
  WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_product_status(uuid, boolean) TO authenticated;
