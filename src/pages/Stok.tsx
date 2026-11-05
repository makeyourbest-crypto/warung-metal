import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { db, type StockMovement } from '../db/schema'
import { adjustStock, DomainError } from '../db/services'
import { fetchCloudMovements, adjustCloudStock } from '../db/supabase-services'
import { isSupabaseConfigured } from '../db/supabase'
import { useProducts, type ProductRow } from '../hooks/useProducts'
import { useLiveQuery } from 'dexie-react-hooks'
import { 
  ArrowLeftRight, 
  ArrowDownLeft, 
  ArrowUpRight, 
  SlidersHorizontal, 
  AlertCircle,
  RefreshCw
} from 'lucide-react'

interface ExtendedMovement extends StockMovement {
  productName?: string
}

export default function Stok() {
  const { products, reload: reloadProducts } = useProducts()
  const toast = useToast()

  const [activeFilter, setActiveFilter] = useState<'all' | 'restock' | 'sale' | 'adjust'>('all')
  const [adjustTarget, setAdjustTarget] = useState<ProductRow | null>(null)
  const [adjustSign, setAdjustSign] = useState<1 | -1>(-1)
  const [adjustQty, setAdjustQty] = useState('1')
  const [adjustReason, setAdjustReason] = useState('Barang rusak / bocor')
  const [busy, setBusy] = useState(false)

  // Cloud movements state
  const [cloudMovements, setCloudMovements] = useState<ExtendedMovement[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const loadMovements = async () => {
    if (!isSupabaseConfigured) return
    try {
      setLoading(true)
      const data = await fetchCloudMovements()
      setCloudMovements(data as ExtendedMovement[])
    } catch (e) {
      console.error('Failed to load cloud movements:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSupabaseConfigured) {
      loadMovements()
    }
  }, [])

  // Local movements fallback
  const localMovements = useLiveQuery(async () => {
    if (isSupabaseConfigured) return []
    const [mvts, prods] = await Promise.all([
      db.movements.reverse().limit(100).toArray(),
      db.products.toArray(),
    ])
    const nameMap = new Map(prods.map((p) => [p.id, p.name]))
    return mvts.map((m) => ({
      ...m,
      productName: nameMap.get(m.productId) ?? 'Barang Dihapus',
    }))
  }, [])

  const movements: ExtendedMovement[] = isSupabaseConfigured
    ? cloudMovements
    : localMovements ?? []

  const filteredMovements = useMemo(() => {
    if (activeFilter === 'all') return movements
    return movements.filter((m) => m.type === activeFilter)
  }, [movements, activeFilter])

  // Low stock warning list
  const lowStockProducts = useMemo(() => {
    return (products ?? []).filter((p) => p.stock <= p.minStock)
  }, [products])

  // Submit manual adjustment
  async function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!adjustTarget) return

    const qtyNum = Number(adjustQty)
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      toast.error('Jumlah penyesuaian harus bilangan bulat lebih dari 0')
      return
    }

    setBusy(true)
    const finalDelta = adjustSign * qtyNum

    try {
      if (isSupabaseConfigured) {
        await adjustCloudStock(adjustTarget.id, finalDelta, adjustReason)
        await Promise.all([loadMovements(), reloadProducts()])
      } else {
        await adjustStock(adjustTarget.id, finalDelta, adjustReason)
      }

      toast.success(
        `Stok ${adjustTarget.name} berhasil disesuaikan (${finalDelta > 0 ? '+' : ''}${finalDelta})`
      )
      setAdjustTarget(null)
      setAdjustQty('1')
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal menyesuaikan stok')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 max-w-7xl mx-auto w-full pb-24">
      
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-emerald-400" />
            <span>Riwayat & Mutasi Stok</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pantau arus barang masuk, barang terjual di kasir, dan penyesuaian inventaris
          </p>
        </div>

        {isSupabaseConfigured && (
          <button
            onClick={loadMovements}
            disabled={loading}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan Mutasi</span>
          </button>
        )}
      </div>

      {/* Low Stock Warning Banner if any */}
      {lowStockProducts.length > 0 && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold mb-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Perhatian: {lowStockProducts.length} Barang Perlu Segera Direstok!</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => setAdjustTarget(p)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/30 text-[11px] text-slate-200 hover:border-amber-400 transition flex items-center gap-2 cursor-pointer"
              >
                <span className="font-bold">{p.name}</span>
                <span className="text-amber-400 font-mono">
                  Sisa: {p.stock} {p.unit}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'all', label: 'Semua Mutasi' },
            { id: 'sale', label: 'Penjualan Kasir' },
            { id: 'restock', label: 'Barang Masuk (Restok)' },
            { id: 'adjust', label: 'Koreksi Manual' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                activeFilter === id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[10px]">
              <tr>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4">Tipe Mutasi</th>
                <th className="py-3 px-4 text-center">Perubahan Stok</th>
                <th className="py-3 px-4">Keterangan / Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <p className="text-2xl mb-1">📋</p>
                    <p className="text-xs font-semibold text-slate-400">Belum ada riwayat mutasi stok</p>
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isPositive = m.qtyChange > 0
                  return (
                    <tr key={m.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {format(new Date(m.createdAt), 'dd MMM yyyy, HH:mm', { locale: localeId })}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {m.productName || 'Barang'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            m.type === 'restock'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : m.type === 'sale'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {m.type === 'restock' && <ArrowDownLeft className="w-3 h-3" />}
                          {m.type === 'sale' && <ArrowUpRight className="w-3 h-3" />}
                          {m.type === 'adjust' && <SlidersHorizontal className="w-3 h-3" />}
                          <span>
                            {m.type === 'restock'
                              ? 'Restok'
                              : m.type === 'sale'
                              ? 'Penjualan'
                              : 'Koreksi'}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-black text-sm">
                        <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                          {isPositive ? `+${m.qtyChange}` : m.qtyChange}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-[11px]">
                        {m.reason || '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL KOREKSI STOK */}
      {adjustTarget && (
        <Modal
          open={!!adjustTarget}
          onClose={() => setAdjustTarget(null)}
          title={`Koreksi Stok: ${adjustTarget.name}`}
        >
          <form onSubmit={handleAdjustSubmit} className="p-4 sm:p-5 space-y-4">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Sisa Stok Fisik Saat Ini:</span>
              <span className="text-white font-bold font-mono">
                {adjustTarget.stock} {adjustTarget.unit}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Jenis Penyesuaian
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustSign(-1)}
                  className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    adjustSign === -1
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>− Kurangi Stok</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustSign(1)}
                  className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    adjustSign === 1
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>＋ Tambah Stok</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Jumlah ({adjustTarget.unit})
              </label>
              <input
                type="number"
                min="1"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="1"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Alasan Penyesuaian <span className="text-rose-400">*</span>
              </label>
              <select
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Barang rusak / bocor">Barang rusak / bocor</option>
                <option value="Barang kadaluarsa">Barang kadaluarsa</option>
                <option value="Selisih hitung fisik (Stock Opname)">Selisih hitung fisik (Stock Opname)</option>
                <option value="Dipakai pribadi / tester">Dipakai pribadi / tester</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-lg transition cursor-pointer"
              >
                {busy ? 'Menyimpan...' : 'Simpan Koreksi ✓'}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  )
}
