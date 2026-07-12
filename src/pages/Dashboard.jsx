import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { supabase } from '../lib/supabaseClient'
import { formatRupiah } from '../lib/format'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDaysToDateInput, getGmt8DateInput, getGmt8DateRange } from '../lib/date'

export default function Dashboard() {
  const [dailySales, setDailySales] = useState([])
  const [hourlySales, setHourlySales] = useState([])
  const [metrics, setMetrics] = useState({ omzet: 0, profit: 0, orders: 0 })
  const [topProducts, setTopProducts] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [detailOrder, setDetailOrder] = useState(null)
  const [detailItems, setDetailItems] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [voidLogs, setVoidLogs] = useState([])
  const [loginLogs, setLoginLogs] = useState([])
  const [paymentBreakdown, setPaymentBreakdown] = useState({ cash: 0, qris: 0 })
  const [shifts, setShifts] = useState([])
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }))
    }, 4000)
  }
  const today = getGmt8DateInput()
  const [range, setRange] = useState({
    from: addDaysToDateInput(today, -6),
    to: today,
  })

  useEffect(() => {
    const { startIso, endIso } = getGmt8DateRange(range.from, range.to)

    supabase
      .from('sales_daily')
      .select('*')
      .gte('day', startIso)
      .lte('day', endIso)
      .order('day', { ascending: true })
      .then(({ data }) => {
        const mapped =
          data?.map((row) => ({
            day: new Date(row.day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
            total_sales: Number(row.total_sales || 0),
            total_profit: Number(row.total_profit || 0),
            total_orders: Number(row.total_orders || 0),
          })) ?? []
        setDailySales(mapped)
        const omzet = mapped.reduce((sum, row) => sum + row.total_sales, 0)
        const profit = mapped.reduce((sum, row) => sum + row.total_profit, 0)
        const orders = mapped.reduce((sum, row) => sum + row.total_orders, 0)
        setMetrics({ omzet, profit, orders })
      })

    const hoursAgo = new Date()
    hoursAgo.setHours(hoursAgo.getHours() - 23)
    supabase
      .from('sales_hourly')
      .select('*')
      .gte('hour', hoursAgo.toISOString())
      .order('hour', { ascending: true })
      .then(({ data }) => {
        const mapped =
          data?.map((row) => ({
            hour: new Date(row.hour).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            total_sales: Number(row.total_sales || 0),
          })) ?? []
        setHourlySales(mapped)
      })

    supabase
      .rpc('report_products_by_period', {
        p_start: startIso,
        p_end: endIso,
        p_limit: 5,
        p_ascending: false,
      })
      .then(({ data }) => setTopProducts(data || []))

    supabase
      .from('orders')
      .select('id, order_number, total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setRecentOrders(data || []))

    supabase
      .from('void_logs')
      .select('id, reason, created_at, order:orders(order_number), user:users(full_name, username)')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setVoidLogs(data || []))

    supabase
      .from('login_logs')
      .select('id, event, created_at, user:users(full_name, username)')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setLoginLogs(data || []))

    supabase
      .from('shifts')
      .select('id, opened_at, closed_at, notes, opened_by_user:users!shifts_opened_by_fkey(full_name, username), closed_by_user:users!shifts_closed_by_fkey(full_name, username)')
      .gte('opened_at', startIso)
      .lte('opened_at', endIso)
      .order('opened_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setShifts(data || []))

    supabase
      .from('payments')
      .select('method, order:orders(total, status)')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .then(({ data }) => {
        let cash = 0
        let qris = 0
        data?.forEach((pay) => {
          if (pay.order?.status !== 'VOID') {
            const amount = Number(pay.order?.total || 0)
            if (pay.method === 'QRIS') {
              qris += amount
            } else {
              cash += amount
            }
          }
        })
        setPaymentBreakdown({ cash, qris })
      })
  }, [range.from, range.to])

  const hourlyMax = useMemo(() => {
    return Math.max(...hourlySales.map((item) => item.total_sales), 0)
  }, [hourlySales])

  const averageOrder = metrics.orders ? Math.round(metrics.omzet / metrics.orders) : 0

  const voidAnalytics = useMemo(() => {
    if (voidLogs.length === 0) return { total: 0, topReason: '-', topStaff: '-' }

    const reasons = {}
    const staff = {}
    voidLogs.forEach((log) => {
      const reasonStr = log.reason || 'Tidak ada alasan'
      reasons[reasonStr] = (reasons[reasonStr] || 0) + 1
      const staffName = log.user?.full_name || log.user?.username || 'Staff'
      staff[staffName] = (staff[staffName] || 0) + 1
    })

    let topReason = '-'
    let maxReasonCount = 0
    Object.entries(reasons).forEach(([r, count]) => {
      if (count > maxReasonCount) {
        maxReasonCount = count
        topReason = `${r} (${count}x)`
      }
    })

    let topStaff = '-'
    let maxStaffCount = 0
    Object.entries(staff).forEach(([s, count]) => {
      if (count > maxStaffCount) {
        maxStaffCount = count
        topStaff = `${s} (${count}x)`
      }
    })

    return {
      total: voidLogs.length,
      topReason,
      topStaff,
    }
  }, [voidLogs])

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

  const exportDashboardCsv = async () => {
    const { startIso, endIso } = getGmt8DateRange(range.from, range.to)

    const { data } = await supabase
      .from('orders')
      .select('order_number, total, status, created_at, payments(method)')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })

    const rows = data || []
    if (rows.length === 0) {
      showToast('Tidak ada data transaksi untuk diexport.', 'warning')
      return
    }

    const successfulRows = rows.filter((row) => row.status !== 'VOID')
    const totalAmount = successfulRows.reduce((sum, row) => sum + Number(row.total || 0), 0)
    const totalProfit = dailySales.reduce((sum, row) => sum + Number(row.total_profit || 0), 0)
    const successfulAvgOrder = successfulRows.length ? Math.round(totalAmount / successfulRows.length) : 0
    const exportTime = new Date().toLocaleString('id-ID')

    const csv = [
      ['RINGKASAN EKSPOR DASHBOARD - EASE COFFEE'],
      ['Periode Laporan', `${range.from} s/d ${range.to}`],
      ['Waktu Ekspor', exportTime],
      [],
      ['METRIK KEUANGAN UTAMA (Hanya Transaksi Berhasil)'],
      ['Total Omzet (Revenue)', 'Total Keuntungan (Gross Profit)', 'Total Transaksi Berhasil', 'Rata-rata Transaksi (AOV)', 'Total Tunai (Cash)', 'Total Non-Tunai (QRIS)'],
      [formatRupiah(totalAmount), formatRupiah(totalProfit), successfulRows.length, formatRupiah(successfulAvgOrder), formatRupiah(paymentBreakdown.cash), formatRupiah(paymentBreakdown.qris)],
      [],
      ['DETAIL TRANSAKSI PENJUALAN'],
      ['Order Number', 'Tanggal & Waktu', 'Status', 'Metode Pembayaran', 'Total Pembayaran'],
      ...rows.map((row) => [
        row.order_number,
        new Date(row.created_at).toLocaleString('id-ID'),
        row.status,
        row.payments?.[0]?.method || 'CASH',
        row.status === 'VOID' ? formatRupiah(0) : formatRupiah(row.total),
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
    link.setAttribute('download', `dashboard_report_${range.from}_${range.to}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }


  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Dashboard</div>
          <div className="text-sm text-slate-500">Ringkasan performa penjualan.</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={range.from}
            onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
          />
          <span className="text-slate-500">-</span>
          <input
            type="date"
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={range.to}
            onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
          />
          <Button
            variant="outline"
            className="border-slate-200 bg-white text-slate-700"
            onClick={exportDashboardCsv}
          >
            Export
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'Total Revenue', value: formatRupiah(metrics.omzet) },
              { title: 'Total Profit', value: formatRupiah(metrics.profit) },
              { title: 'Total Orders', value: metrics.orders },
              { title: 'Avg Order', value: formatRupiah(averageOrder) },
              { title: 'Tunai (Cash)', value: formatRupiah(paymentBreakdown.cash) },
              { title: 'Non-Tunai (QRIS)', value: formatRupiah(paymentBreakdown.qris) },
            ].map((metric) => (
              <Card key={metric.title} className="border-slate-200 bg-white text-slate-900 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">{metric.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{metric.value}</CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Tren Penjualan Harian</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailySales}>
                    <XAxis dataKey="day" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
                      formatter={(value) => formatRupiah(value)}
                    />
                    <Line type="monotone" dataKey="total_sales" stroke="#0f172a" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Top Menu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {topProducts.length === 0 ? (
                  <div className="text-slate-500">Belum ada data.</div>
                ) : (
                  topProducts.map((item, index) => (
                    <div key={item.product_id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {index + 1}. {item.name}
                        </div>
                        <div className="text-xs text-slate-500">Qty: {item.total_qty}</div>
                      </div>
                      <div className="text-sm">{formatRupiah(item.total_sales)}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Transaksi Terbaru</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200">
                      <TableHead>Order</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id} className="border-slate-200">
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell className="text-slate-500">
                          {new Date(order.created_at).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.status === 'DONE'
                                ? 'success'
                                : order.status === 'VOID'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {order.status === 'VOID' ? (
                            <span className="text-slate-400">
                              <span className="line-through mr-1.5">{formatRupiah(order.total)}</span>
                              <span>{formatRupiah(0)}</span>
                            </span>
                          ) : (
                            formatRupiah(order.total)
                          )}
                        </TableCell>

                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Jam Sibuk</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlySales}>
                    <XAxis dataKey="hour" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" domain={[0, hourlyMax]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}
                      formatter={(value) => formatRupiah(value)}
                    />
                    <Line type="monotone" dataKey="total_sales" stroke="#0f172a" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activities">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-rose-500"></span>
                  Audit Keamanan & Kontrol Internal (Void Prevention)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Void Transaksi</div>
                    <div className="text-lg font-bold mt-1 text-slate-800">{voidAnalytics.total} kali</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Alasan Terbanyak</div>
                    <div className="text-sm font-bold mt-1.5 text-slate-800 truncate">{voidAnalytics.topReason}</div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Kasir Paling Sering Void</div>
                    <div className="text-sm font-bold mt-1.5 text-slate-800 truncate">{voidAnalytics.topStaff}</div>
                  </div>
                </div>

                {voidAnalytics.total > 0 && (
                  <div className="mt-3 p-2.5 bg-rose-50/50 border border-rose-100 rounded-md text-xs text-rose-800 flex items-start gap-2">
                    <svg className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <span className="font-semibold">Catatan Audit:</span> Pengawas wajib memastikan setiap transaksi void diverifikasi untuk mencegah kasir membawa pulang uang tunai dari pesanan yang dibatalkan sepihak.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Transaksi Terbaru</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{order.order_number}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleString('id-ID')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          order.status === 'DONE' ? 'success' : order.status === 'VOID' ? 'danger' : 'warning'
                        }
                      >
                        {order.status}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => openOrderDetail(order)}>
                        Detail
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Riwayat Void</CardTitle>
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
                        <div className="font-medium">
                          {log.order?.order_number || '-'} 
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            Kasir: {log.user?.full_name || log.user?.username || 'Staff'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">Alasan: {log.reason}</div>
                      </div>
                      <div className="text-xs text-slate-500 shrink-0">
                        {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Log Aktivitas Login</CardTitle>
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
                      <div className="text-xs text-slate-500 shrink-0">
                        {new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle>Riwayat Shift Kasir</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {shifts.length === 0 ? (
                  <div className="text-slate-500">Tidak ada riwayat shift pada periode ini.</div>
                ) : (
                  shifts.map((s) => {
                    const openTime = new Date(s.opened_at).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    const closeTime = s.closed_at
                      ? new Date(s.closed_at).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Aktif'
                    return (
                      <div
                        key={s.id}
                        className="rounded-md border border-slate-200 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-slate-800">
                            Kasir: {s.opened_by_user?.full_name || s.opened_by_user?.username || 'Staff'}
                          </div>
                          <Badge
                            variant={s.closed_at ? 'success' : 'warning'}
                          >
                            {s.closed_at ? 'Selesai' : 'Aktif'}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500">
                          <div>Buka: {openTime}</div>
                          {s.closed_at && (
                            <div>
                              Tutup: {closeTime} (oleh {s.closed_by_user?.full_name || s.closed_by_user?.username || 'Staff'})
                            </div>
                          )}
                        </div>
                        {s.notes && (
                          <div className="bg-slate-50 rounded px-2.5 py-1.5 text-xs text-slate-600 mt-1 italic border border-slate-100">
                            Catatan: {s.notes}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {detailOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-4">
              <div className="text-lg font-semibold text-slate-900">Detail Pesanan</div>
              <div className="text-sm text-slate-600">{detailOrder.order_number}</div>
              <div className="text-xs text-slate-500">
                {new Date(detailOrder.created_at).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {loadingDetail ? (
                <div className="text-slate-500">Loading item...</div>
              ) : detailItems.length === 0 ? (
                <div className="text-slate-500">Tidak ada item.</div>
              ) : (
                detailItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{item.product?.name || 'Menu'}</div>
                        <div className="text-xs text-slate-500">
                          Qty {item.qty} x {formatRupiah(item.price)}
                        </div>
                        {item.note ? (
                          <div className="text-xs text-slate-500">Catatan: {item.note}</div>
                        ) : null}
                      </div>
                      <div className="text-sm font-medium">{formatRupiah(item.line_total)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={closeOrderDetail}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
