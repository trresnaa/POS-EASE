import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { supabase } from '../lib/supabaseClient'
import { formatRupiah } from '../lib/format'
import { useAuth } from '../app/useAuth'
import dataCache from '../lib/dataCache'
import { printReceipt } from '../lib/printReceipt'


// Tarif PPN yang berlaku (Pajak Pertambahan Nilai 11% sesuai UU HPP 2021)
const TAX_RATE = 0.11

// Pilihan kustomisasi minuman yang tersedia di modal customization
const SUGAR_OPTIONS = ['No Sugar', 'Less Sugar', 'Normal', 'Extra']
const ICE_OPTIONS = ['Less Ice', 'Normal']
const TEMPERATURE_OPTIONS = ['Iced', 'Hot']
const MILK_OPTIONS = ['Freshmilk', 'Oatmilk']
const ADD_ON_NORMAL = 'Normal' // Nilai default add-on (tidak ada tambahan)

// Harga surcharge per jenis susu (dalam Rupiah)
const MILK_SURCHARGE = {
  Freshmilk: 2000, // Surcharge untuk Fresh Milk
  Oatmilk: 5000,   // Surcharge untuk Oat Milk (lebih mahal)
}

// Kata kunci nama produk yang secara default menggunakan susu segar (Freshmilk)
// Jika nama produk mengandung salah satu kata kunci ini, Freshmilk tidak dikenakan surcharge tambahan
const FRESHMILK_BASE_KEYWORDS = [
  'latte',
  'cappuccino',
  'mocha',
  'piccolo',
  'kopi susu',
  'macchiato',
  'milk',
  'matcha',
  'hazel choco',
  'butterscotch crumble',
  'mont blanc',
  'kopsu',
  'teh tarik',
]

export default function Pos() {
  const { profile } = useAuth()
  const [toast, setToast] = useState(null)
  // Tampilkan notifikasi toast sementara selama 3 detik
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Shift states & functions
  const [activeShift, setActiveShift] = useState(dataCache.activeShift ?? null)
  const [shiftStats, setShiftStats] = useState(dataCache.shiftStats ?? { count: 0, revenue: 0 })
  const [loadingShift, setLoadingShift] = useState(!dataCache.activeShift && dataCache.activeShift !== false)
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false)
  const [closeShiftNotes, setCloseShiftNotes] = useState('')

  /**
   * Memuat data shift kasir yang sedang aktif (belum ditutup).
   * Sekaligus menghitung statistik shift:
   * - Jumlah transaksi berhasil (count) sejak shift dibuka
   * - Total omzet (revenue) dari semua order non-VOID sejak shift dibuka
   *
   * Di-subscribe ke realtime channel Supabase agar otomatis update
   * saat ada order baru atau perubahan status shift.
   */
  const loadActiveShift = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*, opened_by_user:users!shifts_opened_by_fkey(full_name, username)')
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setActiveShift(data)
        // Fetch jumlah order dan total omzet sejak shift dibuka (exclude VOID)
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('total')
          .gte('created_at', data.opened_at)
          .neq('status', 'VOID')

        if (ordersError) throw ordersError

        const count = ordersData?.length || 0
        const revenue = (ordersData || []).reduce((sum, o) => sum + (o.total || 0), 0)
        const stats = { count, revenue }
        setShiftStats(stats)
        // Simpan ke cache
        dataCache.activeShift = data
        dataCache.shiftStats = stats
      } else {
        setActiveShift(null)
        setShiftStats({ count: 0, revenue: 0 })
        // Simpan null ke cache (false sebagai sentinel agar loadingShift tidak true lagi)
        dataCache.activeShift = false
        dataCache.shiftStats = { count: 0, revenue: 0 }
      }
    } catch (err) {
      console.error('Error loading active shift:', err)
    } finally {
      setLoadingShift(false)
    }
  }, [])

  /**
   * Membuka shift kasir baru.
   * Mencatat waktu buka dan ID kasir yang membuka ke tabel 'shifts'.
   * Hanya bisa dipanggil jika user sudah login (profile.id tersedia).
   */
  const handleOpenShift = async () => {
    if (!profile?.id) return
    try {
      const { error } = await supabase
        .from('shifts')
        .insert({
          opened_by: profile.id,
          opened_at: new Date().toISOString(),
        })

      if (error) throw error

      showToast('Shift berhasil dibuka!', 'success')
      await loadActiveShift()
    } catch (err) {
      console.error('Error opening shift:', err)
      showToast('Gagal membuka shift.', 'error')
    }
  }

  /**
   * Menutup shift kasir yang sedang aktif.
   * Mencatat waktu tutup, ID kasir yang menutup, dan catatan opsional ke tabel 'shifts'.
   * Dipanggil setelah user mengkonfirmasi di modal tutup shift.
   */
  const handleCloseShift = async () => {
    if (!profile?.id || !activeShift) return
    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          closed_by: profile.id,
          closed_at: new Date().toISOString(),
          notes: closeShiftNotes.trim() || null,
        })
        .eq('id', activeShift.id)

      if (error) throw error

      showToast('Shift berhasil ditutup!', 'success')
      setShowCloseShiftModal(false)
      setCloseShiftNotes('')
      await loadActiveShift()
    } catch (err) {
      console.error('Error closing shift:', err)
      showToast('Gagal menutup shift.', 'error')
    }
  }
  const [loading, setLoading] = useState(!dataCache.products)
  const [categories, setCategories] = useState(dataCache.categories || [])

  const [products, setProducts] = useState(dataCache.products || [])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ease_pos_cart')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const cartSaveTimer = useRef(null)
  const [discount, setDiscount] = useState(0)
  const [cashReceived, setCashReceived] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [submitting, setSubmitting] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedSugar, setSelectedSugar] = useState('Normal')
  const [selectedIce, setSelectedIce] = useState('Normal')
  const [selectedTemperature, setSelectedTemperature] = useState('Hot')
  const [selectedMilk, setSelectedMilk] = useState('Freshmilk')
  const [selectedAddOns, setSelectedAddOns] = useState([])
  const [addons, setAddons] = useState(dataCache.addons || [])
  const [productAddons, setProductAddons] = useState(dataCache.productAddons || [])

  // Auto-save cart ke sessionStorage setiap kali isi cart berubah
  useEffect(() => {
    clearTimeout(cartSaveTimer.current)
    cartSaveTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem('ease_pos_cart', JSON.stringify(cart))
      } catch { /* ignore */ }
    }, 300) // debounce 300ms agar tidak terlalu sering write
  }, [cart])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!dataCache.products) {
        setLoading(true)
      }
      const [{ data: catData }, { data: prodData }, { data: addonData }, { data: mappingData }] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('addons').select('*').order('name'),
        supabase.from('product_addons').select('*'),
      ])
      if (!mounted) return

      const fetchedCategories = catData || []
      const fetchedProducts = prodData || []
      const fetchedAddons = addonData || []
      const fetchedProductAddons = mappingData || []

      dataCache.categories = fetchedCategories
      dataCache.products = fetchedProducts
      dataCache.addons = fetchedAddons
      dataCache.productAddons = fetchedProductAddons

      setCategories(fetchedCategories)
      setProducts(fetchedProducts)
      setAddons(fetchedAddons)
      setProductAddons(fetchedProductAddons)
      setLoading(false)
    }
    load()
    loadActiveShift()

    const channel = supabase
      .channel('pos-shifts-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadActiveShift()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          loadActiveShift()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [loadActiveShift])

  /**
   * Mengambil harga surcharge (biaya tambahan) untuk suatu add-on berdasarkan nama.
   * Mencari di daftar addons yang sudah di-fetch dari database.
   *
   * @param {string} addonName - Nama add-on (e.g. 'Whipped Cream', 'Boba')
   * @returns {number} Harga surcharge dalam Rupiah (0 jika tidak ditemukan)
   */
  const getAddonSurcharge = (addonName) => {
    const found = addons.find((a) => a.name === addonName)
    return found ? Number(found.price) : 0
  }





  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchName = product.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory = categoryId === 'all' || product.category_id === categoryId
      return matchName && matchCategory
    })
  }, [products, search, categoryId])

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  /** Cek apakah produk adalah varian oatmilk fixed (nama mengandung 'oatmilk'). */
  const hasFixedOatmilk = (product) => product.name.toLowerCase().includes('oatmilk')

  /**
   * Cek apakah produk berbasis susu segar (Freshmilk) berdasarkan nama produk.
   * Digunakan untuk menentukan apakah Freshmilk sudah termasuk dalam harga dasar.
   *
   * @param {Object} product - Objek produk dari database
   * @returns {boolean} true jika produk menggunakan Freshmilk sebagai bahan dasar
   */
  const hasFreshmilkBase = (product) => {
    const name = product.name.toLowerCase()
    return FRESHMILK_BASE_KEYWORDS.some((keyword) => name.includes(keyword))
  }

  /**
   * Menentukan pilihan susu default untuk produk saat modal kustomisasi dibuka.
   *
   * @param {Object} product - Objek produk dari database
   * @returns {'Oatmilk'|'Freshmilk'} Jenis susu default
   */
  const getDefaultMilkOption = (product) => {
    if (hasFixedOatmilk(product)) return 'Oatmilk'
    if (hasFreshmilkBase(product)) return 'Freshmilk'
    return 'Freshmilk'
  }

  /**
   * Menghitung biaya tambahan (surcharge) yang dikenakan berdasarkan pilihan susu user.
   *
   * Logika:
   * - Jika produk berbasis Freshmilk (sudah include di harga): ganti ke Oatmilk = selisih harga saja
   * - Jika produk tidak berbasis Freshmilk: surcharge penuh sesuai jenis susu
   *
   * @param {Object} product    - Objek produk dari database
   * @param {string} milkOption - Pilihan susu user: 'Freshmilk' atau 'Oatmilk'
   * @returns {number} Surcharge dalam Rupiah (0 jika tidak ada tambahan)
   */
  const getMilkSurchargeForOption = (product, milkOption) => {
    const defaultMilk = getDefaultMilkOption(product)
    if (defaultMilk === 'Freshmilk') {
      // Produk sudah include Freshmilk (gratis).
      // Upgrade ke Oatmilk dikenakan surcharge penuh Oatmilk.
      if (milkOption === 'Oatmilk') return MILK_SURCHARGE.Oatmilk
      return 0 // Freshmilk tetap gratis
    }
    // Produk tidak berbasis susu: surcharge penuh sesuai pilihan
    return MILK_SURCHARGE[milkOption] || 0
  }

  /**
   * Kalkulasi total pembayaran secara reaktif menggunakan useMemo.
   *
   * Alur perhitungan:
   * 1. totalBeforeDiscount = jumlah (qty × unitPrice) semua item di cart
   * 2. discountAmount      = totalBeforeDiscount × (diskonPersen / 100)
   * 3. total               = totalBeforeDiscount - discountAmount  ← yang dibayar customer
   * 4. subtotal            = total / (1 + TAX_RATE)  ← harga sebelum PPN (DPP)
   * 5. tax (PPN 11%)       = total - subtotal  ← pajak yang dikandung dalam harga
   * 6. change (kembalian)  = cashReceived - total (0 untuk QRIS)
   *
   * Catatan: Harga produk sudah INCLUSIVE PPN — PPN dihitung dari dalam (tax-inclusive),
   * bukan ditambahkan di atas harga.
   *
   * @returns {{ subtotal, tax, total, change, discountAmount, discountPct }}
   */
  const cartTotals = useMemo(() => {
    const totalBeforeDiscount = cart.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
    const discountPct = Math.min(100, Math.max(0, Number(discount || 0)))
    const discountAmount = (totalBeforeDiscount * discountPct) / 100
    const total = totalBeforeDiscount - discountAmount
    const subtotal = total / (1 + TAX_RATE)  // DPP (Dasar Pengenaan Pajak)
    const tax = total - subtotal              // PPN = 11% dari DPP
    const change = paymentMethod === 'QRIS' ? 0 : Number(cashReceived || 0) - total
    return { subtotal, tax, total, change, discountAmount, discountPct }
  }, [cart, discount, cashReceived, paymentMethod])

  /** Cek apakah produk masih aktif dan tersedia untuk dijual. */
  const isProductActive = (product) => product.is_active !== false

  /**
   * Menambahkan produk ke keranjang belanja (cart).
   * Jika produk dengan cartKey yang sama sudah ada, qty-nya bertambah 1.
   * CartKey dibentuk dari: `productId::note::unitPrice` untuk membedakan
   * item yang sama namun dengan kustomisasi berbeda.
   *
   * @param {Object} product      - Objek produk dari database
   * @param {Object} payload      - Data kustomisasi
   * @param {string} payload.note      - Catatan kustomisasi (sugar, ice, milk, add-on)
   * @param {number} payload.extraCost - Biaya tambahan dari milk surcharge + add-on
   */
  const addToCart = (product, payload) => {
    if (!isProductActive(product)) return
    const note = payload?.note || ''
    const extraCost = Number(payload?.extraCost || 0)
    const unitPrice = Number(product.price || 0) + extraCost
    const cartKey = `${product.id}::${note}::${unitPrice}`
    setCart((prev) => {
      const exists = prev.find((item) => item.cartKey === cartKey)
      if (exists) {
        // Item sudah ada di cart — tambahkan qty
        return prev.map((item) =>
          item.cartKey === cartKey ? { ...item, qty: item.qty + 1 } : item,
        )
      }
      // Item baru — tambahkan ke cart
      return [...prev, { cartKey, product, qty: 1, note, extraCost, unitPrice }]
    })
  }

  /**
   * Mengupdate properti item di keranjang (misal: qty).
   *
   * @param {string} cartKey - Identifier unik item di cart
   * @param {Object} patch   - Properti yang ingin diupdate (e.g. { qty: 3 })
   */
  const updateCartItem = (cartKey, patch) => {
    setCart((prev) =>
      prev.map((item) => (item.cartKey === cartKey ? { ...item, ...patch } : item)),
    )
  }

  /**
   * Menghapus item dari keranjang belanja berdasarkan cartKey.
   *
   * @param {string} cartKey - Identifier unik item di cart yang akan dihapus
   */
  const removeCartItem = (cartKey) => {
    setCart((prev) => prev.filter((item) => item.cartKey !== cartKey))
  }

  /**
   * Membuka modal kustomisasi minuman untuk produk yang dipilih.
   * Jika produk tidak mengizinkan kustomisasi, langsung tambah ke cart.
   * Reset semua state kustomisasi ke nilai default setiap kali modal dibuka.
   *
   * @param {Object} product - Produk yang diklik di menu
   */
  const openCustomization = (product) => {
    if (!isProductActive(product)) return
    if (product.allow_customizations !== true) {
      // Produk tidak punya kustomisasi — langsung masuk cart
      addToCart(product, { note: '', extraCost: 0 })
      return
    }
    setSelectedProduct(product)
    setSelectedSugar('Normal')
    setSelectedIce('Normal')
    setSelectedTemperature('Hot')
    setSelectedMilk(getDefaultMilkOption(product))
    setSelectedAddOns([])
  }

  /**
   * Menutup modal kustomisasi dan mereset semua pilihan kustomisasi ke nilai default.
   */
  const closeCustomization = () => {
    setSelectedProduct(null)
    setSelectedSugar('Normal')
    setSelectedIce('Normal')
    setSelectedTemperature('Hot')
    setSelectedMilk('Freshmilk')
    setSelectedAddOns([])
  }

  /**
   * Toggle pilihan add-on di modal kustomisasi.
   * Jika 'Normal' dipilih, semua add-on yang aktif akan di-reset.
   * Jika add-on sudah dipilih, maka di-deselect; jika belum, ditambahkan.
   *
   * @param {string} value - Nama add-on yang di-toggle
   */
  const toggleAddOn = (value) => {
    if (value === ADD_ON_NORMAL) {
      setSelectedAddOns([]) // Reset semua add-on
      return
    }
    setSelectedAddOns((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    )
  }

  /**
   * Mengkonfirmasi pilihan kustomisasi dan menambahkan produk ke cart.
   *
   * Membangun string catatan (note) dari semua pilihan kustomisasi yang aktif:
   * - Temperature, Sugar, Ice, Milk
   * - Add-on yang dipilih
   *
   * Menghitung extraCost dari:
   * - Milk surcharge (jika upgrade susu)
   * - Add-on surcharge (harga tambahan per add-on)
   *
   * Note digunakan sebagai pembeda item di cart (cartKey) dan dicetak di struk.
   */
  const confirmCustomization = () => {
    if (!selectedProduct) return
    const noteParts = []
    let extraCost = 0

    if (selectedProduct.allow_temperature !== false) {
      noteParts.push(`Temperature: ${selectedTemperature}`)
    }
    if (selectedProduct.allow_sugar !== false) {
      noteParts.push(`Sugar: ${selectedSugar}`)
    }
    if (selectedProduct.allow_ice !== false && selectedTemperature !== 'Hot') {
      noteParts.push(`Ice: ${selectedIce}`)
    }
    if (selectedProduct.allow_milk !== false && !hasFixedOatmilk(selectedProduct)) {
      noteParts.push(`Milk: ${selectedMilk}`)
      extraCost += getMilkSurchargeForOption(selectedProduct, selectedMilk) // Tambah surcharge susu
    }
    if (selectedAddOns.length > 0) {
      noteParts.push(`Add on: ${selectedAddOns.join(', ')}`)
      extraCost += selectedAddOns.reduce((sum, addOnName) => sum + getAddonSurcharge(addOnName), 0) // Tambah surcharge add-on
    }
    const note = noteParts.join(', ')
    addToCart(selectedProduct, { note, extraCost })
    closeCustomization()
  }

  /**
   * Mereset seluruh state checkout ke kondisi awal.
   * Dipanggil setelah order berhasil disubmit dan struk dicetak.
   */
  const resetCheckout = () => {
    setCart([])
    setDiscount(0)
    setCashReceived(0)
    setPaymentMethod('CASH')
    sessionStorage.removeItem('ease_pos_cart') // Hapus cart setelah order selesai
  }

  /**
   * Memproses dan menyimpan transaksi ke database Supabase.
   *
   * Alur:
   * 1. Validasi: user login, cart tidak kosong, shift aktif, uang cukup (CASH)
   * 2. Panggil RPC `submit_pos_order` — stored procedure di Supabase yang
   *    secara atomik menyimpan order + order_items + payment dalam satu transaksi
   * 3. Jika pembayaran QRIS, update metode pembayaran di tabel 'payments'
   * 4. Cetak struk via printReceipt()
   * 5. Reset checkout
   *
   * @async
   */
  const submitOrder = async () => {
    if (!profile?.id || cart.length === 0) return
    if (!activeShift) {
      showToast('Transaksi tidak dapat diproses karena shift kasir belum dibuka!', 'error')
      return
    }
    const total = cartTotals.total

    if (paymentMethod === 'CASH' && Number(cashReceived || 0) < total) {
      showToast('Jumlah uang tunai yang diterima kurang dari total tagihan!', 'error')
      return
    }

    setSubmitting(true)
    const orderNumber = `ORD-${Date.now()}`
    const subtotal = cartTotals.subtotal
    const tax = cartTotals.tax

    const orderItemsPayload = cart.map((item) => ({
      product_id: String(item.product.id),
      qty: item.qty,
      price: item.unitPrice,
      line_total: item.qty * item.unitPrice,
      note: item.note || null,
    }))
    const paymentPayload = {
      method: paymentMethod,
      cash_received: paymentMethod === 'QRIS' ? total : Number(cashReceived || 0),
      change: paymentMethod === 'QRIS' ? 0 : cartTotals.change,
    }

    const { data, error } = await supabase.rpc('submit_pos_order', {
      p_order_number: orderNumber,
      p_created_by: String(profile.id),
      p_items: orderItemsPayload,
      p_subtotal: subtotal,
      p_tax: tax,
      p_discount: cartTotals.discountAmount,
      p_total: total,
      p_cash_received: paymentPayload.cash_received,
      p_change: paymentPayload.change,
    })

    if (error || !data?.order) {
      showToast(`Gagal membuat order: ${error?.message || 'response kosong dari server'}`, 'error')
      setSubmitting(false)
      return
    }

    const order = data.order

    // Update payment method to QRIS if selected
    if (paymentMethod === 'QRIS') {
      const { error: updateError } = await supabase
        .from('payments')
        .update({ method: 'QRIS' })
        .eq('order_id', order.id)
      if (updateError) {
        console.error('Gagal update metode pembayaran:', updateError.message)
      }
    }

    const cashierName = profile?.full_name || profile?.username || ''
    const receiptItems = cart.map((item) => ({
      name: item.product.name,
      qty: item.qty,
      price: item.unitPrice,
      note: item.note || '',
    }))
    printReceipt(order, receiptItems, paymentPayload, cashierName)
    resetCheckout()
    setSubmitting(false)
  }


  if (loading) {
    return <div className="text-sm text-slate-400">Loading...</div>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      {/* Shift Banner & Action */}
      {loadingShift ? (
        <div className="text-xs text-slate-400 col-span-full">Loading shift info...</div>
      ) : activeShift ? (
        <Card className="border border-emerald-200 bg-emerald-50/50 shadow-sm col-span-full">
          <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <span className="relative flex h-3.5 w-3.5 mt-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">Shift Aktif Kasir</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Kasir: <strong className="text-slate-950">{activeShift.opened_by_user?.full_name || activeShift.opened_by_user?.username || 'Tidak diketahui'}</strong>
                  {' • '} Buka sejak: <strong className="text-slate-950">{new Date(activeShift.opened_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</strong>
                </p>
                <div className="flex gap-4 mt-2">
                  <div className="bg-white/80 rounded px-2.5 py-1 border border-emerald-100 text-xs">
                    <span className="text-slate-500">Transaksi:</span>{' '}
                    <strong className="text-slate-800">{shiftStats.count}</strong>
                  </div>
                  <div className="bg-white/80 rounded px-2.5 py-1 border border-emerald-100 text-xs">
                    <span className="text-slate-500">Omzet:</span>{' '}
                    <strong className="text-emerald-700 font-semibold">{formatRupiah(shiftStats.revenue)}</strong>
                  </div>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-rose-200 bg-white hover:bg-rose-50 text-rose-600 self-start md:self-center font-medium"
              onClick={() => {
                setCloseShiftNotes('')
                setShowCloseShiftModal(true)
              }}
            >
              Tutup Shift
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-amber-200 bg-amber-50/50 shadow-sm col-span-full">
          <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-3.5 w-3.5 mt-0.5 rounded-full bg-amber-500"></span>
              <div>
                <h3 className="font-semibold text-slate-900">Belum Ada Shift Kasir Aktif</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Buka shift kasir terlebih dahulu untuk mencatat transaksi dan memantau omzet penjualan hari ini.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-500 text-white self-start md:self-center"
              onClick={handleOpenShift}
            >
              Buka Shift
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                placeholder="Cari menu..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="all">Semua kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const active = isProductActive(product)
                const isBtnDisabled = !active
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={isBtnDisabled}
                    onClick={() => openCustomization(product)}
                    className={`rounded-lg border p-3 text-left ${
                      !isBtnDisabled
                        ? 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                        : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60'
                    }`}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className={`mb-2 h-24 w-full rounded-md object-cover ${active ? '' : 'grayscale'}`}
                      />
                    ) : null}
                    <div className="font-medium">{product.name}</div>
                    <div className="text-xs">{formatRupiah(product.price)}</div>
                    {!active ? (
                      <div className="mt-1 text-xs font-medium text-slate-500">Habis / Nonaktif</div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>


      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cart</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cart.length === 0 ? (
                <div className="text-sm text-slate-400">Cart kosong.</div>
              ) : (
                cart.map((item) => (
                  <div key={item.cartKey} className="rounded-md border border-slate-800 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-xs text-slate-400">
                          {formatRupiah(item.unitPrice)}
                        </div>
                        {item.note ? <div className="text-xs text-slate-500">{item.note}</div> : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeCartItem(item.cartKey)}
                      >
                        Hapus
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateCartItem(item.cartKey, {
                            qty: Math.max(1, item.qty - 1),
                          })
                        }
                        disabled={item.qty <= 1}
                      >
                        -
                      </Button>
                      <div className="h-9 min-w-14 rounded-md border border-slate-200 px-3 text-center text-sm leading-9 text-slate-900">
                        {item.qty}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateCartItem(item.cartKey, {
                            qty: item.qty + 1,
                          })
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatRupiah(cartTotals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>PPN (11%)</span>
              <span>{formatRupiah(cartTotals.tax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Diskon (%)</span>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={discount === 0 ? '' : discount.toString()}
                placeholder="0"
                onChange={(event) => {
                  const raw = event.target.value.replace(/\D/g, '')
                  const val = raw === '' ? 0 : Math.min(100, parseInt(raw, 10))
                  setDiscount(val)
                }}
              />
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatRupiah(cartTotals.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Metode Pembayaran</span>
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value)
                  setCashReceived(0)
                }}
              >
                <option value="CASH">Tunai (Cash)</option>
                <option value="QRIS">Non-Tunai (QRIS)</option>
              </select>
            </div>
            {paymentMethod === 'CASH' && (
              <>
                <div className="flex items-center justify-between">
                  <span>Tunai</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={cashReceived === 0 ? '' : cashReceived.toString()}
                    placeholder="0"
                    onChange={(event) => {
                      const raw = event.target.value.replace(/\D/g, '')
                      setCashReceived(raw === '' ? 0 : parseInt(raw, 10))
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Pas', value: cartTotals.total },
                    { label: '20rb', value: 20000 },
                    { label: '50rb', value: 50000 },
                    { label: '100rb', value: 100000 },
                    { label: '200rb', value: 200000 },
                  ].map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setCashReceived(value)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span>Kembalian</span>
                  <span>{formatRupiah(cartTotals.change)}</span>
                </div>
              </>
            )}
            <Button
              className="w-full"
              onClick={submitOrder}
              disabled={submitting || cart.length === 0 || !activeShift}
            >
              {submitting ? 'Memproses...' : 'Bayar & Cetak'}
            </Button>
            {!activeShift && (
              <div className="text-center text-rose-500 font-semibold text-xs mt-1.5 animate-pulse">
                [Harap buka shift kasir terlebih dahulu untuk melakukan transaksi]
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-4">
              <div className="text-lg font-semibold text-slate-900">{selectedProduct.name}</div>
              <div className="text-xs text-slate-500">Pilih penyesuaian untuk customer.</div>
            </div>
            <div className="space-y-4">
              {selectedProduct.allow_temperature !== false && (
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">Temperature</div>
                  <div className="flex flex-wrap gap-2">
                    {TEMPERATURE_OPTIONS.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={selectedTemperature === option ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSelectedTemperature(option)
                          if (option === 'Hot') setSelectedIce('Normal')
                        }}
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {selectedProduct.allow_sugar !== false && (
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">Sugar</div>
                  <div className="flex flex-wrap gap-2">
                    {SUGAR_OPTIONS.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={selectedSugar === option ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedSugar(option)}
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {selectedProduct.allow_ice !== false && selectedTemperature !== 'Hot' && (
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">Ice</div>
                  <div className="flex flex-wrap gap-2">
                    {ICE_OPTIONS.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={selectedIce === option ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedIce(option)}
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {selectedProduct.allow_milk !== false && !hasFixedOatmilk(selectedProduct) && (
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">Milk</div>
                  <div className="flex flex-wrap gap-2">
                    {MILK_OPTIONS.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={selectedMilk === option ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedMilk(option)}
                      >
                        {option}
                        {MILK_SURCHARGE[option] > 0 && option !== 'Freshmilk' && (
                          <span className="ml-1 opacity-70">(+Rp {MILK_SURCHARGE[option].toLocaleString('id-ID')})</span>
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">Add on</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={selectedAddOns.length === 0 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleAddOn(ADD_ON_NORMAL)}
                  >
                    {ADD_ON_NORMAL}
                  </Button>
                  {addons
                    .filter((addon) =>
                      productAddons.some(
                        (pa) => pa.product_id === selectedProduct.id && pa.addon_id === addon.id
                      )
                    )
                    .map((addon) => (
                      <Button
                        key={addon.id}
                        type="button"
                        variant={selectedAddOns.includes(addon.name) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleAddOn(addon.name)}
                      >
                        {addon.name} (+{formatRupiah(addon.price)})
                      </Button>
                    ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeCustomization}>
                Batal
              </Button>
              <Button type="button" onClick={confirmCustomization}>
                Tambah ke cart
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tutup Shift Modal */}
      {showCloseShiftModal && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Tutup Shift Kasir</h3>
              <p className="text-xs text-slate-500">Tinjau ringkasan transaksi sebelum menutup shift.</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 text-sm space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Waktu Buka:</span>
                <span className="font-medium text-slate-900">
                  {new Date(activeShift.opened_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dibuka Oleh:</span>
                <span className="font-medium text-slate-900">
                  {activeShift.opened_by_user?.full_name || activeShift.opened_by_user?.username || 'Tidak diketahui'}
                </span>
              </div>
              <div className="border-t border-slate-200/60 my-2"></div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Transaksi:</span>
                <span className="font-bold text-slate-900">{shiftStats.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Omzet:</span>
                <span className="font-bold text-emerald-600">{formatRupiah(shiftStats.revenue)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shift-notes" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Catatan Shift (Opsional)</label>
              <textarea
                id="shift-notes"
                rows="3"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="Masukkan catatan seperti selisih uang kas, serah terima, dll..."
                value={closeShiftNotes}
                onChange={(e) => setCloseShiftNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
              >
                Batal
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={handleCloseShift}
              >
                Konfirmasi Tutup Shift
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-sm text-white shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )

}
