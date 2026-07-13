-- Buat RPC toggle_staff_status untuk mengaktifkan/menonaktifkan staff
-- Menggantikan penggunaan edge function 'update-staff-user' yang mengalami
-- masalah 401 Unauthorized saat dipanggil untuk operasi toggle is_active.
-- RPC ini lebih simpel, aman (SECURITY DEFINER), dan hanya bisa dijalankan owner.

CREATE OR REPLACE FUNCTION toggle_staff_status(
  p_user_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Hanya owner yang boleh mengubah status staff
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.roles r ON u.role_id = r.id
    WHERE u.auth_user_id = auth.uid() AND r.name = 'owner'
  ) THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengubah status staff.';
  END IF;

  UPDATE public.users
  SET is_active = p_is_active
  WHERE id = p_user_id;
END;
$$;
