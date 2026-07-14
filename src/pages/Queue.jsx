import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { supabase } from '../lib/supabaseClient'
import { formatRupiah } from '../lib/format'
import { useAuth } from '../app/useAuth'
import { getGmt8DateInput, getGmt8DateRange } from '../lib/date'
import dataCache from '../lib/dataCache'
import { printReceipt } from '../lib/printReceipt'


export default function Queue() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState(dataCache.orders || [])
  const [completedOrders, setCompletedOrders] = useState(dataCache.completedOrders || [])
  const [loading, setLoading] = useState(!dataCache.orders)
  const [expandedId, setExpandedId] = useState(null)
  const [expandedCompletedId, setExpandedCompletedId] = useState(null)
  const [itemsCache, setItemsCache] = useState({})
  const [paymentCache, setPaymentCache] = useState({})
  const [reprintingId, setReprintingId] = useState(null)
  const [doneIds, setDoneIds] = useState(new Set())
  const [now, setNow] = useState(new Date())
  const [alerts, setAlerts] = useState([])

  const notifiedOrdersRef = useRef(new Set())
  const channelRef = useRef(null)
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })
  const [voidModal, setVoidModal] = useState({ open: false, order: null, reason: '' })



  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast((p) => ({ ...p, show: false })), 4000)
  }



  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (orders.length === 0) {
      setAlerts([])
      return
    }

    // Filter out alerts for orders that are no longer in the active orders list
    setAlerts((prev) =>
      prev.filter((alert) => {
        const orderId = alert.id.split('-')[0]
        return orders.some((order) => order.id === orderId)
      })
    )

    orders.forEach((order) => {
      const createdAt = new Date(order.created_at)
      const elapsedMs = now - createdAt
      const elapsedMins = Math.floor(elapsedMs / 1000 / 60)
      const limitMins = 30 //ganti menit warning//

      if (elapsedMins >= limitMins) {
        const key = `${order.id}-overdue`
        const warningKey = `${order.id}-warning`
        if (!notifiedOrdersRef.current.has(key)) {
          notifiedOrdersRef.current.add(key)
          setAlerts((prev) => [
            ...prev.filter((a) => a.id !== warningKey),
            {
              id: key,
              type: 'danger',
              title: 'Antrean Terlambat!',
              message: `Pesanan ${order.order_number} belum diselesaikan selama lebih dari ${limitMins} menit. Segera update statusnya!`,
            },
          ])
        }
      } else if (elapsedMins >= 15) {
        const key = `${order.id}-warning`
        if (!notifiedOrdersRef.current.has(key)) {
          notifiedOrdersRef.current.add(key)
          setAlerts((prev) => [
            ...prev,
            {
              id: key,
              type: 'warning',
              title: 'Peringatan Antrean',
              message: `Pesanan ${order.order_number} sudah berjalan 15 menit. Mohon segera diselesaikan!`,
            },
          ])
        }
      }
    })
  }, [orders, now])

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, total, status, created_at, created_by')
      .eq('status', 'PROCESSING')
      .order('created_at', { ascending: true })
    const fetchedOrders = data || []
    dataCache.orders = fetchedOrders
    setOrders(fetchedOrders)
  }, [])

  const loadCompletedOrders = useCallback(async () => {
    const today = getGmt8DateInput()
    const { startIso } = getGmt8DateRange(today, today)
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, subtotal, tax, discount, total, status, created_at, created_by')
      .in('status', ['DONE', 'VOID'])
      .gte('created_at', startIso)
      .order('created_at', { ascending: false })
    const fetchedCompleted = data || []
    dataCache.completedOrders = fetchedCompleted
    setCompletedOrders(fetchedCompleted)
  }, [])

  const toggleExpandCompleted = async (order) => {
    if (expandedCompletedId === order.id) {
      setExpandedCompletedId(null)
      return
    }
    setExpandedCompletedId(order.id)
    
    if (!itemsCache[order.id]) {
      const { data } = await supabase
        .from('order_items')
        .select('id, qty, price, note, product:products(name)')
        .eq('order_id', order.id)
        .order('id', { ascending: true })
      setItemsCache((prev) => ({ ...prev, [order.id]: data || [] }))
    }

    if (!paymentCache[order.id]) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', order.id)
        .maybeSingle()
      
      if (data) {
        setPaymentCache((prev) => ({ ...prev, [order.id]: data }))
      } else {
        setPaymentCache((prev) => ({
          ...prev,
          [order.id]: {
            method: 'CASH',
            cash_received: order.total,
            change: 0,
          },
        }))
      }
    }
  }

  const handleReprint = async (order) => {
    setReprintingId(order.id)
    try {
      let items = itemsCache[order.id]
      if (!items) {
        const { data } = await supabase
          .from('order_items')
          .select('id, qty, price, note, product:products(name)')
          .eq('order_id', order.id)
          .order('id', { ascending: true })
        items = data || []
        setItemsCache((prev) => ({ ...prev, [order.id]: items }))
      }

      let payment = paymentCache[order.id]
      if (!payment) {
        const { data } = await supabase
          .from('payments')
          .select('*')
          .eq('order_id', order.id)
          .maybeSingle()
        payment = data || { method: 'CASH', cash_received: order.total, change: 0 }
        setPaymentCache((prev) => ({ ...prev, [order.id]: payment }))
      }

      // Fetch cashier name from created_by
      let cashierName = ''
      if (order.created_by) {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name, username')
          .eq('id', order.created_by)
          .maybeSingle()
        cashierName = userData?.full_name || userData?.username || ''
      }

      const receiptItems = items.map((item) => ({
        name: item.product?.name || 'Item',
        qty: item.qty,
        price: item.price,
        note: item.note || '',
      }))

      printReceipt(order, receiptItems, payment, cashierName)
    } catch (err) {
      console.error('Error reprinting receipt:', err)
      showToast('Gagal mencetak ulang struk.', 'danger')
    } finally {
      setReprintingId(null)
    }
  }


  useEffect(() => {
    let mounted = true
    const init = async () => {
      if (!dataCache.orders) {
        setLoading(true)
      }
      await Promise.all([loadOrders(), loadCompletedOrders()])
      if (!mounted) return
      setLoading(false)
    }
    init()

    channelRef.current = supabase
      .channel('queue-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadOrders()
          loadCompletedOrders()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
    // eslint-disable-next-line
  }, [loadOrders, loadCompletedOrders])

  const toggleExpand = async (order) => {
    if (expandedId === order.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(order.id)
    if (!itemsCache[order.id]) {
      const { data } = await supabase
        .from('order_items')
        .select('id, qty, price, note, product:products(name)')
        .eq('order_id', order.id)
        .order('id', { ascending: true })
      setItemsCache((prev) => ({ ...prev, [order.id]: data || [] }))
    }
  }

  const markDone = async (orderId) => {
    setDoneIds((prev) => new Set([...prev, orderId]))
    setTimeout(async () => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'DONE' })
        .eq('id', orderId)
      
      if (error) {
        showToast(`Gagal menyelesaikan order: ${error.message}`, 'danger')
        setDoneIds((prev) => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
      } else {
        setExpandedId(null)
        // Jalankan reload manual agar perubahan langsung instan ter-update di layar
        await Promise.all([loadOrders(), loadCompletedOrders()])
        // Bersihkan doneIds
        setDoneIds((prev) => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
      }
    }, 600)
  }

  const voidOrder = async (order) => {
    setVoidModal({ open: true, order, reason: '' })
  }

  const confirmVoid = async () => {
    const { order, reason } = voidModal
    if (!reason.trim()) {
      showToast('Alasan void tidak boleh kosong.', 'danger')
      return
    }
    setVoidModal((p) => ({ ...p, open: false }))
    const { error } = await supabase.rpc('void_pos_order', {
      p_order_id: String(order.id),
      p_reason: reason.trim(),
      p_voided_by: profile?.id == null ? null : String(profile.id),
    })
    if (error) {
      showToast(`Gagal void order: ${error.message}`, 'danger')
      return
    }
    showToast(`Order ${order.order_number} berhasil di-void.`, 'success')
    await loadOrders()
    await loadCompletedOrders()
  }

  if (loading) {
    return <div className="text-sm text-slate-400">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Antrean Pesanan</CardTitle>
          <div className="text-xs text-slate-400">Auto-refresh aktif</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.length === 0 ? (
            <div className="text-sm text-slate-400">Tidak ada antrean.</div>
          ) : (
            orders.map((order) => {
              const isDone = doneIds.has(order.id)
              const createdAt = new Date(order.created_at)
              const elapsedMs = now - createdAt
              const elapsedMins = Math.floor(elapsedMs / 1000 / 60)
              const limitMins = 30 //batas menit terlambat// 
              const isOverdue = elapsedMins >= limitMins
              const isWarning = elapsedMins >= 15 && elapsedMins < limitMins //15 menit WARNING// 

              let cardBgBorderClass = 'border-slate-200 bg-white'
              let badgeBgBorderClass = 'bg-slate-100 text-slate-600 border-slate-200'
              let timerText = ''

              if (isDone) {
                cardBgBorderClass = 'border-green-400 bg-green-50'
              } else if (isOverdue) {
                cardBgBorderClass = 'border-red-300 bg-rose-50/70 animate-pulse'
                badgeBgBorderClass = 'bg-red-100 text-red-700 border-red-200 font-semibold'
                timerText = `Terlambat ${elapsedMins - limitMins} mnt!`
              } else if (isWarning) {
                cardBgBorderClass = 'border-amber-300 bg-amber-50/50'
                badgeBgBorderClass = 'bg-amber-100 text-amber-700 border-amber-200 font-medium'
                timerText = `Konfirmasi sebelum: ${limitMins - elapsedMins} mnt`
              } else {
                timerText = `Konfirmasi sebelum: ${limitMins - elapsedMins} mnt`
              }

              return (
                <div
                  key={order.id}
                  className={`rounded-md border transition-all duration-500 ${cardBgBorderClass}`}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-3 text-left"
                      onClick={() => toggleExpand(order)}
                      disabled={isDone}
                    >
                      <div>
                        <div className={`font-medium transition-colors duration-300 ${isDone ? 'text-green-600' : ''}`}>
                          {isDone ? (
                            <span className="flex items-center gap-1.5">
                              <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {order.order_number}
                            </span>
                          ) : order.order_number}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                          <span>{createdAt.toLocaleTimeString('id-ID')}</span>
                          {!isDone && (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${badgeBgBorderClass}`}>
                              {timerText}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-auto mr-4 text-sm">{formatRupiah(order.total)}</div>
                      {!isDone && <span className="text-xs text-slate-400">{expandedId === order.id ? '▲' : '▼'}</span>}
                    </button>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => voidOrder(order)}
                        disabled={isDone}
                        className="border-rose-300 text-rose-600 hover:bg-rose-50"
                      >
                        Void
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => markDone(order.id)}
                        disabled={isDone}
                        className={`transition-all duration-300 ${isDone ? 'border-green-400 bg-green-100 text-green-700' : ''
                          }`}
                      >
                        {isDone ? '✓ Selesai' : 'Selesai'}
                      </Button>
                    </div>
                  </div>

                  {expandedId === order.id ? (
                    <div className="border-t border-slate-200 px-4 pb-3 pt-2">
                      {!itemsCache[order.id] ? (
                        <div className="text-xs text-slate-400">Loading item...</div>
                      ) : itemsCache[order.id].length === 0 ? (
                        <div className="text-xs text-slate-400">Tidak ada item.</div>
                      ) : (
                        <div className="space-y-1">
                          {itemsCache[order.id].map((item) => (
                            <div key={item.id} className="text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {item.qty}x {item.product?.name || 'Item'}
                                </span>
                                <span className="text-slate-400">{formatRupiah(item.price)}</span>
                              </div>
                              {item.note ? (
                                <div className="text-xs text-slate-500">{item.note}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Hari Ini</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {completedOrders.length === 0 ? (
            <div className="text-sm text-slate-400">Belum ada pesanan selesai.</div>
          ) : (
            completedOrders.map((order) => {
              const isExpanded = expandedCompletedId === order.id
              return (
                <div
                  key={order.id}
                  className="rounded-md border border-slate-200 bg-white"
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      type="button"
                      className="flex flex-1 items-center justify-between text-left"
                      onClick={() => toggleExpandCompleted(order)}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{order.order_number}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleTimeString('id-ID')}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mr-4">
                        <div className="text-sm font-medium text-slate-900">{formatRupiah(order.total)}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider ${
                            order.status === 'VOID'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {order.status}
                        </span>
                        <span className="text-xs text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                      {order.status !== 'VOID' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => voidOrder(order)}
                          className="border-rose-300 text-rose-600 hover:bg-rose-50"
                        >
                          Void
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200 px-4 pb-4 pt-3 bg-slate-50/50 space-y-4 rounded-b-md">
                      {/* Items */}
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Daftar Item</div>
                        {!itemsCache[order.id] ? (
                          <div className="text-xs text-slate-400">Loading item...</div>
                        ) : itemsCache[order.id].length === 0 ? (
                          <div className="text-xs text-slate-400">Tidak ada item.</div>
                        ) : (
                          <div className="space-y-2">
                            {itemsCache[order.id].map((item) => (
                              <div key={item.id} className="text-sm">
                                <div className="flex items-center justify-between text-slate-800">
                                  <span className="font-medium">
                                    {item.qty}x {item.product?.name || 'Item'}
                                  </span>
                                  <span className="text-slate-600">{formatRupiah(item.price)}</span>
                                </div>
                                {item.note ? (
                                  <div className="text-xs text-slate-500 ml-4 italic">{item.note}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Payment Detail */}
                      <div className="border-t border-slate-200/60 pt-3 text-sm space-y-1.5">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rincian Pembayaran</div>
                        <div className="flex justify-between text-slate-600">
                          <span>Subtotal</span>
                          <span>{formatRupiah(order.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>PPN (11%)</span>
                          <span>{formatRupiah(order.tax)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Diskon</span>
                          <span>{formatRupiah(order.discount)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200/80 pt-2 text-base">
                          <span>Total</span>
                          <span>{formatRupiah(order.total)}</span>
                        </div>

                        {paymentCache[order.id] ? (
                          <div className="space-y-1.5 pt-2 border-t border-dashed border-slate-200 mt-2">
                            <div className="flex justify-between text-slate-600">
                              <span>Metode</span>
                              <span className="font-semibold text-slate-800">
                                {paymentCache[order.id].method === 'QRIS' ? 'QRIS (Non-Tunai)' : 'Tunai (Cash)'}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Tunai Diterima</span>
                              <span>{formatRupiah(paymentCache[order.id].cash_received)}</span>
                            </div>
                            {paymentCache[order.id].method !== 'QRIS' && (
                              <div className="flex justify-between text-slate-600">
                                <span>Kembalian</span>
                                <span>{formatRupiah(paymentCache[order.id].change)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 pt-1">Loading info pembayaran...</div>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end pt-2 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs flex items-center gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                          onClick={() => handleReprint(order)}
                          disabled={reprintingId === order.id}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          {reprintingId === order.id ? 'Mencetak...' : 'Cetak Ulang Struk'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Toast Alerts Container (queue-wide + action feedback) */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toast.show && (
          <div className={`flex items-start gap-3 rounded-lg border p-4 shadow-lg pointer-events-auto ${
            toast.type === 'danger'   ? 'border-rose-200 bg-rose-50 text-rose-900' :
            toast.type === 'success'  ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
                                        'border-slate-200 bg-white text-slate-900'
          }`}>
            <span className={`mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full ${
              toast.type === 'danger' ? 'bg-rose-500' : toast.type === 'success' ? 'bg-emerald-500' : 'bg-slate-400'
            }`} />
            <p className="text-sm leading-relaxed">{toast.message}</p>
          </div>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex flex-col gap-1 rounded-lg border p-4 shadow-lg transition-all duration-300 pointer-events-auto ${
              alert.type === 'danger'
                ? 'border-rose-200 bg-rose-50 text-rose-950 shadow-rose-100/50'
                : 'border-amber-200 bg-amber-50 text-amber-950 shadow-amber-100/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={`flex h-2.5 w-2.5 rounded-full ${
                  alert.type === 'danger' ? 'bg-rose-500' : 'bg-amber-500'
                }`}></span>
                <span className="font-semibold text-sm">{alert.title}</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed opacity-90 mt-1">{alert.message}</p>
          </div>
        ))}
      </div>

      {/* Void Confirmation Modal */}
      {voidModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4">
              <div className="text-base font-semibold text-slate-900">Konfirmasi Void</div>
              <div className="text-sm text-slate-500 mt-1">
                Order <span className="font-medium text-slate-700">{voidModal.order?.order_number}</span> akan dibatalkan.
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Alasan Void <span className="text-rose-500">*</span></label>
            <input
              type="text"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              placeholder="Contoh: Salah pesan, pelanggan cancel..."
              value={voidModal.reason}
              onChange={(e) => setVoidModal((p) => ({ ...p, reason: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && confirmVoid()}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVoidModal({ open: false, order: null, reason: '' })}>
                Batal
              </Button>
              <Button
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={confirmVoid}
              >
                Void Order
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
