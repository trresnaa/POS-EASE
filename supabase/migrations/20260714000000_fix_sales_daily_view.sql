-- Fix sales_daily view:
-- Bug lama: JOIN ke order_items menyebabkan setiap order dihitung N kali
-- (N = jumlah item dalam order), sehingga total_orders dan total_sales
-- menjadi jauh lebih besar dari yang seharusnya.
--
-- Fix:
-- 1. Gunakan COUNT(DISTINCT o.id) agar tiap order dihitung sekali
-- 2. Gunakan subquery untuk hitung profit per order (bukan flat JOIN)
-- 3. Gunakan timezone Asia/Makassar (WITA = GMT+8) agar hari sesuai WIB/WITA

CREATE OR REPLACE VIEW sales_daily AS
SELECT
  date_trunc('day', o.created_at AT TIME ZONE 'Asia/Makassar') AT TIME ZONE 'Asia/Makassar' AS day,
  COUNT(DISTINCT o.id) AS total_orders,
  SUM(o.total) AS total_sales,
  SUM(
    (SELECT SUM(oi.line_total - (p.cogs * oi.qty))
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = o.id)
  ) AS total_profit
FROM orders o
WHERE o.status = 'DONE'
GROUP BY date_trunc('day', o.created_at AT TIME ZONE 'Asia/Makassar');
