import { useCallback, useEffect, useState } from 'react'
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
  const [loginLogs, setLoginLogs] = useState([])
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })

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
      { data: loginData },
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

      supabase
        .from('login_logs')
        .select('id, event, created_at, user:users(full_name, username)')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    setOrders(orderData || [])
    setTopProducts(topData || [])
    setBottomProducts(bottomData || [])
    setVoidLogs(voidData || [])
    setLoginLogs(loginData || [])
  }, [from, to])

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
      ]),
      [],
      ['6. LOG AKTIVITAS LOGIN'],
      ['Nama Pengguna', 'Tindakan (Event)', 'Waktu Aktivitas'],
      ...loginLogs.map((log) => [
        log.user?.full_name || log.user?.username || 'Staff',
        log.event,
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
          <CardTitle>Transaksi Periode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {orders.length === 0 ? (
            <div className="text-slate-400">Tidak ada transaksi.</div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
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
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 5 Menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {topProducts.length === 0 ? (
            <div className="text-slate-500">Belum ada data.</div>
          ) : (
            topProducts.map((product, index) => (
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
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menu Paling Tidak Laku</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {bottomProducts.length === 0 ? (
            <div className="text-slate-500">Belum ada data.</div>
          ) : (
            bottomProducts.map((product, index) => (
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
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Void Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {voidLogs.length === 0 ? (
            <div className="text-slate-500">Tidak ada void pada periode ini.</div>
          ) : (
            voidLogs.map((log) => (
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
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loginLogs.length === 0 ? (
            <div className="text-slate-500">Tidak ada log pada periode ini.</div>
          ) : (
            loginLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
              >
                <div>
                  <div className="font-medium">
                    {log.user?.full_name || log.user?.username || 'Staff'}
                  </div>
                  <div className="text-xs text-slate-500">{log.event}</div>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(log.created_at).toLocaleString('id-ID')}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
