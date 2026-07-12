-- Fix RLS policy pada tabel login_logs
-- Masalah: staf kasir tidak bisa insert login log karena tidak ada RLS policy untuk INSERT
-- Solusi: tambahkan policy INSERT untuk semua authenticated user (semua role)
--         dan batasi SELECT hanya untuk owner saja

-- Pastikan RLS aktif
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada (agar tidak konflik)
DROP POLICY IF EXISTS "login_logs_insert_self" ON login_logs;
DROP POLICY IF EXISTS "login_logs_read_owner" ON login_logs;
DROP POLICY IF EXISTS "login_logs_insert" ON login_logs;
DROP POLICY IF EXISTS "login_logs_select" ON login_logs;

-- Izinkan semua user terautentikasi (owner maupun kasir) untuk mencatat login mereka sendiri
-- user_id harus milik user yang sedang login (auth.uid() cocok dengan auth_user_id di tabel users)
CREATE POLICY "login_logs_insert_self"
  ON login_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Hanya owner yang bisa membaca semua log aktivitas login
CREATE POLICY "login_logs_read_owner"
  ON login_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.auth_user_id = auth.uid()
        AND r.name = 'owner'
    )
  );
