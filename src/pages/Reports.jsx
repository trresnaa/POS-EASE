import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { supabase } from '../lib/supabaseClient'
import { formatRupiah } from '../lib/format'
import { getGmt8DateInput, getGmt8DateRange } from '../lib/date'

/**
 * Menghitung rentang tanggal untuk "Minggu Ini" (Senin s/d hari ini).
 * Menggunakan logika kalender ISO: minggu dimulai hari Senin.
 *
 * @returns {{ from: string, to: string }} Rentang tanggal format "YYYY-MM-DD"
 */
function getWeekRange() {
  const today = getGmt8DateInput()
  const d = new Date(today)
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day // Hitung mundur ke Senin
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)
  const from = monday.toISOString().slice(0, 10)
  return { from, to: today }
}

/**
 * Menghitung rentang tanggal untuk "Bulan Ini" (tanggal 1 s/d hari ini).
 *
 * @returns {{ from: string, to: string }} Rentang tanggal format "YYYY-MM-DD"
 */
function getMonthRange() {
  const today = getGmt8DateInput()
  const from = today.slice(0, 8) + '01' // Ambil tahun-bulan lalu set tanggal ke 01
  return { from, to: today }
}

export default function Reports() {
  const today = getGmt8DateInput()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [orders, setOrders] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [bottomProducts, setBottomProducts] = useState([])
  const [voidLogs, setVoidLogs] = useState([])
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })
  
  // States untuk search & detail modal
  const [searchQuery, setSearchQuery] = useState('')
  const [detailOrder, setDetailOrder] = useState(null)
  const [detailItems, setDetailItems] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Tampilkan notifikasi toast sementara selama 4 detik
  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }))
    }, 4000)
  }

  /**
   * Memuat semua data laporan dari Supabase secara paralel (Promise.all).
   *
   * Data yang di-fetch:
   * 1. Semua order dalam rentang tanggal (termasuk VOID)
   * 2. Top 5 produk terlaris (via RPC `report_products_by_period`)
   * 3. Bottom 5 produk paling tidak laku (via RPC yang sama)
   * 4. Void logs dalam periode
   * 5. Login logs dalam periode
   *
   * Dipanggil otomatis saat from/to berubah (via useEffect) dan saat tombol Terapkan diklik.
   */
  const load = useCallback(async () => {
    const { startIso, endIso } = getGmt8DateRange(from, to)

    const [
      { data: orderData },
      { data: topData },
      { data: bottomData },
      { data: voidData },
    ] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total, created_at, status, payments(method)')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false }),

      supabase.rpc('report_products_by_period', {
        p_start: startIso,
        p_end: endIso,
        p_limit: 5,
        p_ascending: false,
      }),

      supabase.rpc('report_products_by_period', {
        p_start: startIso,
        p_end: endIso,
        p_limit: 5,
        p_ascending: true,
      }),

      supabase
        .from('void_logs')
        .select('id, reason, created_at, order:orders(order_number)')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    setOrders(orderData || [])
    setTopProducts(topData || [])
    setBottomProducts(bottomData || [])
    setVoidLogs(voidData || [])
  }, [from, to])

  const openOrderDetail = async (order) => {
    setDetailOrder(order)
    setLoadingDetail(true)
    const { data } = await supabase
      .from('order_items')
      .select('id, qty, price, line_total, note, product:products(name)')
      .eq('order_id', order.id)
      .order('id', { ascending: true })
    setDetailItems(data || [])
    setLoadingDetail(false)
  }

  const closeOrderDetail = () => {
    setDetailOrder(null)
    setDetailItems([])
    setLoadingDetail(false)
  }

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders
    return orders.filter((order) =>
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase().trim())
    )
  }, [orders, searchQuery])

  useEffect(() => {
    // eslint-disable-next-line
    load()
  }, [load])

  /**
   * Menerapkan preset rentang tanggal ke state filter laporan.
   * Mengubah nilai 'from' dan 'to' sesuai preset yang dipilih.
   *
   * @param {'week'|'month'} preset - Preset yang dipilih ('week' = minggu ini, 'month' = bulan ini)
   */
  const applyPreset = (preset) => {
    const range = preset === 'week' ? getWeekRange() : getMonthRange()
    setFrom(range.from)
    setTo(range.to)
  }

  /**
   * Menggenerate dan mengunduh laporan lengkap dalam format CSV.
   *
   * Laporan mencakup 6 bagian:
   * 1. Ringkasan utama (total omzet & jumlah transaksi berhasil)
   * 2. Detail transaksi penjualan (semua order dalam periode)
   * 3. Top 5 menu terlaris
   * 4. 5 menu paling tidak laku
   * 5. Audit void log
   * 6. Log aktivitas login staff
   *
   * Format CSV menggunakan separator titik koma (;) dan encoding UTF-8 BOM
   * agar compatible dengan Microsoft Excel bahasa Indonesia.
   */
  const exportOrdersCsv = () => {
    if (orders.length === 0) {
      showToast('Tidak ada data transaksi untuk diexport.', 'warning')
      return
    }
    const exportTime = new Date().toLocaleString('id-ID')
    const successfulOrders = orders.filter((order) => order.status !== 'VOID')
    const totalAmount = successfulOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)

    const csv = [
      ['LAPORAN KINERJA BISNIS PERIODIK - EASE COFFEE'],
      ['Periode Laporan', `${from} s/d ${to}`],
      ['Waktu Ekspor', exportTime],
      [],
      ['1. RINGKASAN UTAMA (Hanya Transaksi Berhasil)'],
      ['Total Omzet (Revenue)', 'Total Transaksi Berhasil (Orders)'],
      [formatRupiah(totalAmount), successfulOrders.length],
      [],
      ['2. DETAIL TRANSAKSI PENJUALAN'],
      ['Order Number', 'Tanggal & Waktu', 'Status', 'Metode Pembayaran', 'Total Pembayaran'],
      ...orders.map((order) => [
        order.order_number,
        new Date(order.created_at).toLocaleString('id-ID'),
        order.status,
        order.payments?.[0]?.method || 'CASH',
        order.status === 'VOID' ? formatRupiah(0) : formatRupiah(order.total),
      ]),

      [],
      ['3. TOP 5 MENU TERLARIS'],
      ['No', 'Nama Menu', 'Jumlah Terjual', 'Total Penjualan'],
      ...topProducts.map((p, i) => [
        i + 1,
        p.name,
        p.total_qty,
        formatRupiah(p.total_sales),
      ]),
      [],
      ['4. 5 MENU PALING TIDAK LAKU'],
      ['No', 'Nama Menu', 'Jumlah Terjual', 'Total Penjualan'],
      ...bottomProducts.map((p, i) => [
        i + 1,
        p.name,
        p.total_qty,
        formatRupiah(p.total_sales),
      ]),
      [],
      ['5. AUDIT KEAMANAN (LOG VOID)'],
      ['Order Number', 'Alasan Void', 'Waktu Pembatalan'],
      ...voidLogs.map((log) => [
        log.order?.order_number || '-',
        log.reason,
        new Date(log.created_at).toLocaleString('id-ID'),
      ])
    ]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`)
          .join(';'),
      )
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `laporan_lengkap_penjualan_${from}_${to}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Laporan Penjualan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-2">
              <div className="text-sm">Dari</div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm">Sampai</div>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={load}>Terapkan</Button>
            <Button variant="outline" onClick={exportOrdersCsv}>
              Export CSV
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => applyPreset('week')}>
              Minggu Ini
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset('month')}>
              Bulan Ini
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Transaksi Periode</CardTitle>
              {orders.length > 0 && (
                <span className="text-xs text-slate-500 font-normal">
                  {filteredOrders.length !== orders.length 
                    ? `Menampilkan ${filteredOrders.length} dari ${orders.length} transaksi` 
                    : `${orders.length} transaksi`}
                </span>
              )}
            </div>
            <Input
              placeholder="Cari nomor order..."
              className="max-w-xs h-9 bg-white border-slate-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="text-sm p-0">
          {filteredOrders.length === 0 ? (
            <div className="text-slate-400 px-6 pb-6">Tidak ada transaksi ditemukan.</div>
          ) : (
            <div
              className="space-y-2 overflow-y-auto px-6 pb-6"
              style={{ maxHeight: '520px' }}
            >
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => openOrderDetail(order)}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors active:bg-slate-100"
                >
                  <div>
                    <div className="font-medium">{order.order_number}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {order.status === 'VOID' ? (
                        <span className="text-slate-400">
                          <span className="line-through mr-1.5">{formatRupiah(order.total)}</span>
                          <span>{formatRupiah(0)}</span>
                        </span>
                      ) : (
                        formatRupiah(order.total)
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {order.payments?.[0]?.method || 'CASH'} - {order.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Top 5 Menu</CardTitle>
            {topProducts.length > 0 && (
              <span className="text-sm text-slate-500 font-normal">{topProducts.length} menu</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm p-0">
          {topProducts.length === 0 ? (
            <div className="text-slate-500 px-6 pb-6">Belum ada data.</div>
          ) : (
            <div className="space-y-2 overflow-y-auto px-6 pb-6" style={{ maxHeight: '360px' }}>
              {topProducts.map((product, index) => (
                <div
                  key={product.product_id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">
                      {index + 1}. {product.name}
                    </div>
                    <div className="text-xs text-slate-500">Qty: {product.total_qty}</div>
                  </div>
                  <div className="text-sm">{formatRupiah(product.total_sales)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Menu Paling Tidak Laku</CardTitle>
            {bottomProducts.length > 0 && (
              <span className="text-sm text-slate-500 font-normal">{bottomProducts.length} menu</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm p-0">
          {bottomProducts.length === 0 ? (
            <div className="text-slate-500 px-6 pb-6">Belum ada data.</div>
          ) : (
            <div className="space-y-2 overflow-y-auto px-6 pb-6" style={{ maxHeight: '360px' }}>
              {bottomProducts.map((product, index) => (
                <div
                  key={product.product_id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">
                      {index + 1}. {product.name}
                    </div>
                    <div className="text-xs text-slate-500">Qty: {product.total_qty}</div>
                  </div>
                  <div className="text-sm">{formatRupiah(product.total_sales)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Void Logs</CardTitle>
            {voidLogs.length > 0 && (
              <span className="text-sm text-slate-500 font-normal">{voidLogs.length} log</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm p-0">
          {voidLogs.length === 0 ? (
            <div className="text-slate-500 px-6 pb-6">Tidak ada void pada periode ini.</div>
          ) : (
            <div className="space-y-2 overflow-y-auto px-6 pb-6" style={{ maxHeight: '360px' }}>
              {voidLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{log.order?.order_number || '-'}</div>
                    <div className="text-xs text-slate-500">{log.reason}</div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Detail Pesanan */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg border border-slate-100">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">Detail Pesanan</div>
                <div className="text-sm font-semibold text-slate-500 mt-0.5">{detailOrder.order_number}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {new Date(detailOrder.created_at).toLocaleString('id-ID')}
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  detailOrder.status === 'DONE' ? 'bg-green-100 text-green-800' :
                  detailOrder.status === 'VOID' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {detailOrder.status}
                </span>
                <div className="text-xs text-slate-500 mt-1">
                  Metode: {detailOrder.payments?.[0]?.method || 'CASH'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {loadingDetail ? (
                <div className="text-center py-6 text-slate-500">Memuat item...</div>
              ) : detailItems.length === 0 ? (
                <div className="text-center py-6 text-slate-500">Tidak ada item ditemukan.</div>
              ) : (
                detailItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 px-4 py-3 bg-slate-50/50">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{item.product?.name || 'Menu'}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Qty: {item.qty} &times; {formatRupiah(item.price)}
                        </div>
                        {item.note && (
                          <div className="text-xs text-slate-500 mt-1 bg-white border border-slate-100 rounded px-2 py-1 italic">
                            Catatan: {item.note}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-bold text-slate-900">{formatRupiah(item.line_total)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Total Transaksi</div>
                <div className="text-lg font-extrabold text-slate-900">{formatRupiah(detailOrder.total)}</div>
              </div>
              <Button variant="outline" onClick={closeOrderDetail} className="border-slate-200">
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast.show && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-sm text-white shadow-lg ${
          toast.type === 'danger' ? 'bg-red-500' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-green-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
