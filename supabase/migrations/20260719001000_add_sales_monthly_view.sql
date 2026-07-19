-- View sales_monthly: agregasi penjualan per bulan
-- Struktur mirip sales_daily, tapi di-group per bulan.
-- Digunakan untuk fitur toggle tren Harian/Bulanan di Dashboard owner.

CREATE OR REPLACE VIEW sales_monthly AS
SELECT
  date_trunc('month', o.created_at AT TIME ZONE 'Asia/Makassar')
    AT TIME ZONE 'Asia/Makassar' AS month,
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
GROUP BY date_trunc('month', o.created_at AT TIME ZONE 'Asia/Makassar');
