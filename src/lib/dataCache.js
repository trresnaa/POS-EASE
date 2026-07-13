/**
 * Cache data menggunakan sessionStorage agar tetap tersedia saat halaman di-refresh.
 * Data akan hilang saat tab browser ditutup (bukan persistent seperti localStorage).
 *
 * Pola: stale-while-revalidate — data lama ditampilkan instan,
 * lalu data baru di-fetch di background untuk memastikan keakuratan.
 */

const SESSION_KEY = 'ease_data_cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 menit — cache kedaluwarsa setelah 5 menit

/**
 * Baca cache dari sessionStorage.
 * @returns {object} cache object atau object kosong jika tidak ada / expired
 */
function readFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Cek TTL — jika sudah lebih dari 5 menit, anggap stale
    if (Date.now() - (parsed._savedAt || 0) > CACHE_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY)
      return {}
    }
    return parsed
  } catch {
    return {}
  }
}

/**
 * Tulis cache ke sessionStorage.
 * @param {object} data - data cache yang akan disimpan
 */
function writeToSession(data) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, _savedAt: Date.now() }))
  } catch {
    // sessionStorage penuh atau tidak tersedia — abaikan
  }
}

// Proxy cache: setiap set property otomatis disimpan ke sessionStorage
const _stored = readFromSession()

const cache = new Proxy(
  {
    categories: _stored.categories ?? null,
    products: _stored.products ?? null,
    addons: _stored.addons ?? null,
    productAddons: _stored.productAddons ?? null,
    orders: _stored.orders ?? null,
    completedOrders: _stored.completedOrders ?? null,
    activeShift: _stored.activeShift ?? undefined, // undefined = belum pernah di-fetch
    shiftStats: _stored.shiftStats ?? null,
  },
  {
    set(target, prop, value) {
      target[prop] = value
      // Simpan ke sessionStorage setiap kali ada data baru
      writeToSession(target)
      return true
    },
  },
)

/**
 * Mereset seluruh cache data ke null dan menghapus sessionStorage.
 * Dipanggil saat ada perubahan data master (produk, kategori, addon)
 * agar komponen fetch ulang data terbaru dari database.
 */
export function clearCache() {
  cache.categories = null
  cache.products = null
  cache.addons = null
  cache.productAddons = null
  cache.orders = null
  cache.completedOrders = null
  cache.activeShift = undefined
  cache.shiftStats = null
  sessionStorage.removeItem(SESSION_KEY)
}

export default cache
