import { formatRupiah } from './format'

// Konfigurasi identitas toko yang ditampilkan di struk
const s = {
  store_name: 'EASE COFFEE',
  store_handle: '@easecoffee.bali',
  store_tagline: 'Your daily cup, made with care',
  store_ig: '@easecoffee.bali',
  store_tiktok: '@easecoffee.bali',
}

/**
 * Mencetak struk transaksi ke printer thermal (lebar 80mm) melalui popup browser.
 *
 * Alur kerja:
 * 1. Membuka window popup baru
 * 2. Menulis HTML struk lengkap (header toko, item, subtotal, PPN, total, pembayaran)
 * 3. Memicu dialog print browser secara otomatis
 * 4. Menutup popup setelah user selesai print (event onafterprint)
 *
 * Struk menampilkan:
 * - Nomor order, tanggal, dan nama kasir
 * - Daftar item dengan qty, harga satuan, dan total per item
 * - Subtotal (sebelum PPN), PPN 11%, diskon (jika ada), dan TOTAL
 * - Metode pembayaran (Tunai/QRIS), jumlah bayar, dan kembalian
 *
 * @param {Object} order           - Data order dari Supabase
 * @param {string} order.order_number - Nomor order (e.g. "ORD-1234567890")
 * @param {string} order.created_at   - Timestamp pembuatan order (ISO string)
 * @param {number} order.subtotal     - Harga sebelum PPN
 * @param {number} order.tax          - Jumlah PPN yang dikenakan
 * @param {number} order.discount     - Jumlah diskon (0 jika tidak ada)
 * @param {number} order.total        - Total yang harus dibayar
 *
 * @param {Array<Object>} items    - Array item pesanan
 * @param {string} items[].name   - Nama produk
 * @param {number} items[].qty    - Jumlah
 * @param {number} items[].price  - Harga satuan (sudah termasuk extraCost)
 * @param {string} items[].note   - Catatan kustomisasi (sugar, ice, milk, add-on)
 *
 * @param {Object} payment              - Data pembayaran
 * @param {string} payment.method       - Metode bayar: "CASH" atau "QRIS"
 * @param {number} payment.cash_received - Uang yang diterima dari pelanggan
 * @param {number} payment.change        - Kembalian (0 untuk QRIS)
 *
 * @param {string} [cashierName='']  - Nama kasir yang memproses transaksi
 */
export async function printReceipt(order, items, payment, cashierName = '') {
  const receiptWindow = window.open('', 'PRINT', 'height=700,width=340')
  if (!receiptWindow) return

  // Bangun baris-baris tabel item pesanan
  const rows = items
    .map((item) => {
      const name = item.product?.name || item.name || 'Item'
      const note = item.note || ''
      const lineTotal = item.qty * item.price
      return `
        <tr>
          <td class="item-name">
            <div class="name">${name}</div>
            ${note ? `<div class="note">${note}</div>` : ''}
          </td>
          <td class="item-qty">${item.qty}&times;</td>
          <td class="item-price">${formatRupiah(item.price)}</td>
          <td class="item-total">${formatRupiah(lineTotal)}</td>
        </tr>`
    })
    .join('')

  // Format tanggal order ke locale Indonesia
  const dateStr = new Date(order.created_at).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Baris media sosial toko di footer struk
  const socialLine = [s.store_ig && `IG: ${s.store_ig}`, s.store_tiktok && `TikTok: ${s.store_tiktok}`]
    .filter(Boolean).join('  |  ')

  receiptWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Struk - ${order.order_number}</title>
  <style>
    @page { margin: 4mm 6mm; size: 80mm auto; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #111; background: #fff; width: 100%; }
    @media screen { body { width: 302px; margin: 0 auto; padding: 8px 0; } }
    .header { text-align: center; padding: 6px 0 4px; }
    .brand { font-size: 18px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; }
    .sub-brand { font-size: 10px; color: #555; margin-top: 1px; }
    .tagline { font-size: 9px; color: #777; margin-top: 2px; font-style: italic; }
    .div-solid { border-top: 1.5px solid #000; margin: 5px 0; }
    .div-dash  { border-top: 1px dashed #999; margin: 4px 0; }
    .meta { font-size: 10px; margin: 4px 0; }
    .meta .order-no { font-weight: bold; font-size: 11px; }
    .meta .dt { color: #555; }
    .meta .kasir { color: #555; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .item-name  { width: 50%; }
    .item-name .name { font-weight: 600; }
    .item-name .note { font-size: 9px; color: #666; padding-left: 4px; margin-top: 1px; }
    .item-qty   { width: 10%; text-align: center; }
    .item-price { width: 20%; text-align: right; color: #444; }
    .item-total { width: 20%; text-align: right; font-weight: 600; }
    .totals td { padding: 1.5px 0; font-size: 11px; }
    .totals .label { color: #444; }
    .totals .val { text-align: right; }
    .totals .grand td { font-weight: bold; font-size: 13px; }
    .totals .discount .val { color: #c00; }
    .payment td { padding: 1.5px 0; }
    .payment .method { font-weight: bold; }
    .payment .val { text-align: right; }
    .payment .kembalian td { font-weight: bold; font-size: 12px; }
    .footer { text-align: center; margin-top: 6px; }
    .footer .thanks { font-size: 13px; font-weight: bold; letter-spacing: 1px; }
    .footer .info { font-size: 9px; color: #666; margin-top: 3px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">${s.store_name}</div>
    ${s.store_handle ? `<div class="sub-brand">${s.store_handle}</div>` : ''}
    ${s.store_tagline ? `<div class="tagline">${s.store_tagline}</div>` : ''}
  </div>
  <div class="div-solid"></div>
  <div class="meta">
    <div class="order-no">#${order.order_number}</div>
    <div class="dt">${dateStr}</div>
    ${cashierName ? `<div class="kasir">Kasir: ${cashierName}</div>` : ''}
  </div>
  <div class="div-dash"></div>
  <table>
    <thead>
      <tr>
        <td style="font-size:9px;color:#777;">ITEM</td>
        <td style="font-size:9px;color:#777;text-align:center;">QTY</td>
        <td style="font-size:9px;color:#777;text-align:right;">HARGA</td>
        <td style="font-size:9px;color:#777;text-align:right;">TOTAL</td>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="div-solid"></div>
  <table class="totals">
    <tr><td class="label">Subtotal</td><td class="val">${formatRupiah(order.subtotal)}</td></tr>
    <tr><td class="label">PPN (11%)</td><td class="val">${formatRupiah(order.tax)}</td></tr>
    ${order.discount > 0 ? `<tr class="discount"><td class="label">Diskon</td><td class="val">- ${formatRupiah(order.discount)}</td></tr>` : ''}
    <tr class="grand"><td>TOTAL</td><td class="val">${formatRupiah(order.total)}</td></tr>
  </table>
  <div class="div-dash"></div>
  <table class="payment">
    <tr>
      <td class="method">${payment.method === 'QRIS' ? 'QRIS' : 'Tunai'}</td>
      <td class="val">${formatRupiah(payment.cash_received)}</td>
    </tr>
    ${payment.method !== 'QRIS' ? `<tr class="kembalian"><td>Kembalian</td><td class="val">${formatRupiah(payment.change)}</td></tr>` : ''}
  </table>
  <div class="div-solid"></div>
  <div class="footer">
    <div class="thanks">Terima Kasih!</div>
    <div class="info">
      Simpan struk ini sebagai bukti pembayaran.${socialLine ? `<br>${socialLine}` : ''}
    </div>
  </div>
</body>
</html>`)

  receiptWindow.document.close()
  receiptWindow.onload = () => {
    receiptWindow.focus()
    receiptWindow.print()
    receiptWindow.onafterprint = () => receiptWindow.close()
  }
}
