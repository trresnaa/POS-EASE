/**
 * Memformat angka menjadi format mata uang Rupiah Indonesia (IDR).
 * Contoh: 25000 => "Rp 25.000"
 *
 * @param {number} value - Nilai angka yang akan diformat
 * @returns {string} String mata uang dalam format Rupiah
 */
export const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
