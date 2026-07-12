/**
 * Cache data sementara di memori (in-memory cache) untuk menghindari
 * fetch ulang ke Supabase setiap kali komponen di-mount.
 *
 * Cache di-reset saat halaman di-refresh (tidak persisten).
 * Diisi oleh halaman Pos.jsx saat data berhasil dimuat.
 */
const cache = {
  categories: null,    // Data kategori menu (dari tabel 'categories')
  products: null,      // Data produk/menu (dari tabel 'products')
  addons: null,        // Data add-on/topping (dari tabel 'addons')
  productAddons: null, // Mapping produk ke add-on (dari tabel 'product_addons')
  orders: null,        // Data order (jarang diisi, optional)
  completedOrders: null, // Data order selesai (jarang diisi, optional)
}

/**
 * Mereset seluruh cache data ke null.
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
}

export default cache
