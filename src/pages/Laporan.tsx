import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { db } from '../db/schema'
import { dayRange, summarize, topProducts } from '../db/services'
import { fetchCloudSalesReport } from '../db/supabase-services'
import { isSupabaseConfigured } from '../db/supabase'
import { formatRupiah } from '../lib/money'
import { useLiveQuery } from 'dexie-react-hooks'
import { 
  BarChart3, 
  DollarSign, 
  TrendingUp, 
  ShoppingBag, 
  Receipt
} from 'lucide-react'

export default function Laporan() {
  const [rangeMode, setRangeMode] = useState<'today' | '7days' | '30days'>('today')
  const [cloudData, setCloudData] = useState<any | null>(null)

  const loadCloudReport = async () => {
    if (!isSupabaseConfigured) return
    try {
      const days = rangeMode === 'today' ? 1 : rangeMode === '7days' ? 7 : 30
      const rep = await fetchCloudSalesReport(days)
      setCloudData(rep)
    } catch (e) {
      console.error('Failed to load cloud sales report:', e)
    }
  }

  useEffect(() => {
    if (isSupabaseConfigured) {
      loadCloudReport()
    }
  }, [rangeMode])

  // Local Dexie Fallback
  const localData = useLiveQuery(async () => {
    if (isSupabaseConfigured) return null
    const days = rangeMode === 'today' ? 0 : rangeMode === '7days' ? 6 : 29
    const fromTime = Date.now() - days * 86400000
    const [from] = dayRange(new Date(fromTime))
    const [, to] = dayRange(new Date())

    const [summary, top, sales] = await Promise.all([
      summarize(from, to),
      topProducts(from, to, 5),
      db.sales.where('createdAt').between(from, to, true, false).reverse().toArray(),
    ])
    const items = await db.saleItems.where('saleId').anyOf(sales.map((s) => s.id)).toArray()
    return { summary, top, sales, items }
  }, [rangeMode])

  const report = isSupabaseConfigured
    ? {
        revenue: cloudData?.totalRevenue ?? 0,
        profit: cloudData?.totalProfit ?? 0,
        count: cloudData?.count ?? 0,
        sales: cloudData?.sales ?? [],
      }
    : {
        revenue: localData?.summary.revenue ?? 0,
        profit: localData?.summary.profit ?? 0,
        count: localData?.summary.count ?? 0,
        sales: localData?.sales ?? [],
      }

  const averageBasket = report.count > 0 ? Math.round(report.revenue / report.count) : 0

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 max-w-7xl mx-auto w-full pb-24">
      
      {/* Title & Date Range Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" />
            <span>Laporan Penjualan & Omzet</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pantau arus kas pendapatan, estimasi keuntungan, dan barang terlaris warung
          </p>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 self-start sm:self-auto">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: '7days', label: '7 Hari' },
            { id: '30days', label: '30 Hari Terakhir' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setRangeMode(id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                rangeMode === id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* Omzet */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Total Omzet</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-emerald-400 font-mono tracking-tight">
            {formatRupiah(report.revenue)}
          </p>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span>Arus kas bruto warung</span>
          </div>
        </div>

        {/* Laba Bersih */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Estimasi Laba</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-amber-400 font-mono tracking-tight">
            {formatRupiah(report.profit)}
          </p>
          <div className="mt-2 text-[10px] text-slate-500">
            Margin dari harga jual - modal
          </div>
        </div>

        {/* Transaksi */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Total Transaksi</span>
            <ShoppingBag className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-white font-mono tracking-tight">
            {report.count} <span className="text-xs font-normal text-slate-400">nota</span>
          </p>
          <div className="mt-2 text-[10px] text-slate-500">
            Total struk kasir dicatat
          </div>
        </div>

        {/* Rata-rata per Nota */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>Rata-rata Nota</span>
            <Receipt className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-200 font-mono tracking-tight">
            {formatRupiah(averageBasket)}
          </p>
          <div className="mt-2 text-[10px] text-slate-500">
            Rerata belanja per pembeli
          </div>
        </div>
      </div>

      {/* Recent Sales Transaction List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Daftar Transaksi Selesai</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono font-medium">
            {report.sales.length} transaksi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[10px]">
              <tr>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">ID Transaksi</th>
                <th className="py-3 px-4">Metode</th>
                <th className="py-3 px-4 text-right">Total Tagihan</th>
                <th className="py-3 px-4 text-right">Uang Bayar</th>
                <th className="py-3 px-4 text-right">Kembalian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {report.sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <p className="text-2xl mb-1">🛒</p>
                    <p className="text-xs font-semibold text-slate-400">Belum ada transaksi di periode ini</p>
                  </td>
                </tr>
              ) : (
                report.sales.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-850/50 transition">
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {format(new Date(s.created_at || s.createdAt), 'dd MMM, HH:mm', { locale: localeId })}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-200">
                      #{s.id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700/50 text-[10px]">
                        {s.payment_method === 'qris' ? '📱 QRIS' : '💵 Tunai'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {formatRupiah(s.total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {formatRupiah(s.paid)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-400">
                      {formatRupiah(s.change)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
