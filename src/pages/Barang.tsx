import { useCallback, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { 
  createProduct, 
  updateProduct, 
  setArchived, 
  restock, 
  DomainError 
} from '../db/services'
import {
  createCloudProduct,
  updateCloudProduct,
  archiveCloudProduct,
  restockCloudProduct,
} from '../db/supabase-services'
import { isSupabaseConfigured } from '../db/supabase'
import { stockLevel, useProducts, type ProductRow } from '../hooks/useProducts'
import { formatRupiah, parseRupiah } from '../lib/money'
import { 
  Plus, 
  Search, 
  PackagePlus, 
  Edit3, 
  Archive, 
  X,
  TrendingUp
} from 'lucide-react'

interface FormState {
  name: string
  category: string
  unit: string
  costPrice: string
  sellPrice: string
  minStock: string
  stock: string
}

const emptyForm: FormState = {
  name: '',
  category: 'Bensin',
  unit: 'pcs',
  costPrice: '',
  sellPrice: '',
  minStock: '5',
  stock: '0',
}

export default function Barang() {
  const { products, reload } = useProducts(true)
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState('Semua')
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [restockProduct, setRestockProduct] = useState<ProductRow | null>(null)
  const [restockQty, setRestockQty] = useState('10')
  const [restockNewCost, setRestockNewCost] = useState('')
  const [busy, setBusy] = useState(false)

  // Form State
  const [form, setForm] = useState<FormState>(emptyForm)

  const openAddModal = () => {
    setEditingProduct(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const handleCloseForm = useCallback(() => {
    setFormOpen(false)
  }, [])

  const handleCloseRestock = useCallback(() => {
    setRestockProduct(null)
  }, [])

  const openEditModal = (p: ProductRow) => {
    setEditingProduct(p)
    setForm({
      name: p.name,
      category: p.category,
      unit: p.unit,
      costPrice: String(p.costPrice),
      sellPrice: String(p.sellPrice),
      minStock: String(p.minStock),
      stock: String(p.stock),
    })
    setFormOpen(true)
  }

  const filteredProducts = useMemo(() => {
    return (products ?? []).filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchCat =
        selectedCat === 'Semua' || p.category.toLowerCase() === selectedCat.toLowerCase()
      return matchSearch && matchCat
    })
  }, [products, search, selectedCat])

  // Handle Submit Form Barang
  async function handleSubmitProduct(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)

    const costNum = parseRupiah(form.costPrice)
    const sellNum = parseRupiah(form.sellPrice)
    const minStockNum = Number(form.minStock) || 5
    const initialStockNum = Number(form.stock) || 0

    const input = {
      name: form.name.trim(),
      category: form.category.trim() || 'Lainnya',
      unit: form.unit.trim() || 'pcs',
      costPrice: Number.isNaN(costNum) ? 0 : costNum,
      sellPrice: Number.isNaN(sellNum) ? 0 : sellNum,
      minStock: minStockNum,
    }

    try {
      if (input.sellPrice <= 0) {
        throw new DomainError('Harga jual harus lebih dari 0')
      }

      if (isSupabaseConfigured) {
        if (editingProduct) {
          await updateCloudProduct(editingProduct.id, input)
        } else {
          await createCloudProduct(input, initialStockNum)
        }
        await reload()
      } else {
        if (editingProduct) {
          await updateProduct(editingProduct.id, input)
        } else {
          await createProduct(input, initialStockNum)
        }
      }

      toast.success(editingProduct ? 'Barang berhasil diubah!' : 'Barang baru berhasil ditambahkan!')
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal menyimpan barang')
    } finally {
      setBusy(false)
    }
  }

  // Handle Archive / Delete
  async function handleArchive(id: string, name: string) {
    if (!confirm(`Yakin ingin mengarsipkan barang "${name}"?`)) return
    try {
      if (isSupabaseConfigured) {
        await archiveCloudProduct(id)
        await reload()
      } else {
        await setArchived(id, true)
      }
      toast.success(`Barang "${name}" berhasil diarsipkan`)
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal mengarsipkan barang')
    }
  }

  // Handle Restock
  async function handleRestockSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!restockProduct) return
    const qtyNum = Number(restockQty)
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      toast.error('Jumlah restok harus bilangan bulat positif')
      return
    }

    const newCostNum = restockNewCost ? parseRupiah(restockNewCost) : undefined
    setBusy(true)

    try {
      if (isSupabaseConfigured) {
        await restockCloudProduct(restockProduct.id, qtyNum, newCostNum)
        await reload()
      } else {
        await restock(restockProduct.id, qtyNum, newCostNum)
      }
      toast.success(`Stok ${restockProduct.name} berhasil ditambah +${qtyNum}!`)
      setRestockProduct(null)
      setRestockQty('10')
      setRestockNewCost('')
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal restok barang')
    } finally {
      setBusy(false)
    }
  }

  const profitMargin = (parseRupiah(form.sellPrice) || 0) - (parseRupiah(form.costPrice) || 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 max-w-7xl mx-auto w-full pb-24">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>📦</span> Katalog Barang Warung
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Kelola daftar barang, ubah harga jual, atau tambah stok barang masuk
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Tambah Barang Baru</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama barang di katalog..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['Semua', 'Bensin', 'Sembako', 'Rokok', 'Lainnya'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCat === cat
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[10px]">
              <tr>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-right">Harga Beli</th>
                <th className="py-3 px-4 text-right">Harga Jual</th>
                <th className="py-3 px-4 text-center">Sisa Stok</th>
                <th className="py-3 px-4 text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <p className="text-2xl mb-1">📦</p>
                    <p className="text-xs font-semibold text-slate-400">Belum ada barang di kategori ini</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Klik tombol Tambah Barang Baru di atas</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const level = stockLevel(p)
                  let badge = 'bg-slate-800 text-slate-300 border-slate-700/60'
                  if (level === 'empty') badge = 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  else if (level === 'low') badge = 'bg-amber-500/10 text-amber-400 border-amber-500/30'

                  return (
                    <tr key={p.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-white text-xs sm:text-sm">{p.name}</p>
                        <p className="text-[10px] text-slate-500">Satuan: {p.unit}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium border border-slate-700/50 text-[10px]">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {formatRupiah(p.costPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {formatRupiah(p.sellPrice)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold font-mono border text-[11px] ${badge}`}>
                          {p.stock} {p.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setRestockProduct(p)
                              setRestockQty('10')
                              setRestockNewCost(String(p.costPrice))
                            }}
                            title="Restok barang masuk"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 hover:text-white transition font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Restok</span>
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            title="Edit data barang"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleArchive(p.id, p.name)}
                            title="Arsipkan barang"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM TAMBAH / EDIT BARANG */}
      {formOpen && (
        <Modal
          open={formOpen}
          onClose={handleCloseForm}
          title={editingProduct ? 'Ubah Rincian Barang' : 'Tambah Barang Baru'}
        >
          <form onSubmit={handleSubmitProduct} className="p-4 sm:p-5 space-y-4">
            {/* Nama Barang */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5">
                Nama Barang <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Bensin Pertalite 1L, Surya 16, Indomie Goreng..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Kategori Bebas + Saran Cepat */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-200">
                  Kategori Barang
                </label>
                <span className="text-[10px] text-slate-400">Bisa ketik bebas atau klik saran:</span>
              </div>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ketik kategori bebas (misal: Bensin, Sembako, Rokok, Minuman...)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Bensin', 'Sembako', 'Rokok', 'Minuman', 'Snack', 'Lainnya'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm({ ...form, category: cat })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                      form.category === cat
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Satuan Bebas + Saran Cepat */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-200">
                  Satuan Barang
                </label>
                <span className="text-[10px] text-slate-400">Bisa ketik bebas atau klik:</span>
              </div>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="pcs / botol / bungkus / kg / liter / porsi / cup..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['pcs', 'bungkus', 'botol', 'kg', 'liter', 'saset', 'renteng', 'dus'].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setForm({ ...form, unit: u })}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      form.unit === u
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Harga Modal & Harga Jual */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Harga Modal / Beli (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={form.costPrice}
                    onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Harga Jual ke Pembeli (Rp) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.sellPrice}
                    onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-emerald-400 font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Profit Margin Indicator */}
            {profitMargin !== 0 && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Keuntungan per {form.unit || 'barang'}:
                </span>
                <span className={`font-mono font-bold ${profitMargin > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatRupiah(profitMargin)}
                </span>
              </div>
            )}

            {/* Stok Sekarang & Peringatan Stok Menipis */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  {editingProduct ? 'Stok di Warung Sekarang' : 'Jumlah Stok Awal'}
                </label>
                <input
                  type="number"
                  disabled={!!editingProduct}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="0"
                  className="w-full bg-slate-950 disabled:bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Tanda Merah Jika Sisa Stok:
                </label>
                <input
                  type="number"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                  placeholder="5"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-lg transition cursor-pointer"
              >
                {busy ? 'Menyimpan...' : editingProduct ? 'Simpan Perubahan' : 'Tambah ke Katalog'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL RESTOK BARANG */}
      {restockProduct && (
        <Modal
          open={!!restockProduct}
          onClose={handleCloseRestock}
          title={`Restok: ${restockProduct.name}`}
        >
          <form onSubmit={handleRestockSubmit} className="p-4 sm:p-5 space-y-4">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Sisa Stok Saat Ini:</span>
              <span className="text-white font-bold font-mono">
                {restockProduct.stock} {restockProduct.unit}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Jumlah Barang Masuk ({restockProduct.unit})
              </label>
              <input
                type="number"
                min="1"
                required
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="10"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Perbarui Harga Modal Baru (Opsional)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={restockNewCost}
                onChange={(e) => setRestockNewCost(e.target.value.replace(/\D/g, ''))}
                placeholder={formatRupiah(restockProduct.costPrice)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setRestockProduct(null)}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-lg transition cursor-pointer"
              >
                {busy ? 'Menyimpan...' : 'Konfirmasi Restok ✓'}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  )
}
