import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { checkout, DomainError } from '../db/services'
import { executeCloudCheckout } from '../db/supabase-services'
import { isSupabaseConfigured } from '../db/supabase'
import type { Sale } from '../db/schema'
import { useMedia } from '../hooks/useMedia'
import { stockLevel, useProducts } from '../hooks/useProducts'
import { formatRupiah, parseRupiah } from '../lib/money'
import { 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  X, 
  Receipt, 
  Zap, 
  CheckCircle2, 
  Smartphone, 
  Banknote, 
  RotateCcw,
  ShoppingBag
} from 'lucide-react'

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000]

export default function Kasir() {
  const { products, reload } = useProducts()
  const desktop = useMedia('(min-width: 1024px)')
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Semua')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [paidText, setPaidText] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris'>('cash')
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products])
  
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: byId.get(id), qty }))
    .filter((l): l is { p: NonNullable<typeof l.p>; qty: number } => !!l.p && l.qty > 0)

  const total = lines.reduce((s, l) => s + l.qty * l.p.sellPrice, 0)
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  const paid = parseRupiah(paidText)
  const change = Number.isNaN(paid) ? 0 : paid - total
  const canPay = lines.length > 0 && !busy && (paymentMethod === 'qris' || (!Number.isNaN(paid) && paid >= total))

  // Filter products by search and category
  const visibleProducts = useMemo(() => {
    return (products ?? []).filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchCat =
        activeCategory === 'Semua' ||
        p.category.toLowerCase() === activeCategory.toLowerCase()
      return matchSearch && matchCat
    })
  }, [products, search, activeCategory])

  function addToCart(id: string) {
    const p = byId.get(id)
    if (!p) return
    const currentQty = cart[id] ?? 0
    if (currentQty + 1 > p.stock) {
      toast.error(p.stock <= 0 ? `Stok ${p.name} habis!` : `Stok ${p.name} hanya ${p.stock}`)
      return
    }
    setCart({ ...cart, [id]: currentQty + 1 })
  }

  function decrementQty(id: string) {
    const next = { ...cart, [id]: (cart[id] ?? 0) - 1 }
    if (next[id] <= 0) delete next[id]
    setCart(next)
  }

  function removeFromCart(id: string) {
    const next = { ...cart }
    delete next[id]
    setCart(next)
  }

  function clearCart() {
    setCart({})
    setPaidText('')
  }

  function openPayment() {
    if (lines.length === 0) return
    setPaidText('')
    setPaymentMethod('cash')
    setPaymentModalOpen(true)
  }

  function handleSetUangPas() {
    setPaidText(total.toString())
  }

  function handleSetQuickAmount(amount: number) {
    setPaidText(amount.toString())
  }

  async function handleCheckout() {
    if (!canPay) return
    setBusy(true)

    try {
      const itemsPayload = lines.map((l) => ({ productId: l.p.id, qty: l.qty }))
      let saleRecord: Sale
      const isCloud = isSupabaseConfigured && import.meta.env.MODE !== 'test'

      if (isCloud) {
        const result = await executeCloudCheckout(
          itemsPayload,
          paymentMethod === 'cash' ? paid : total,
          paymentMethod
        )
        saleRecord = {
          id: result.saleId,
          total: result.total,
          paid: paymentMethod === 'cash' ? paid : total,
          change: result.change,
          createdAt: Date.now(),
        }
        await reload()
      } else {
        saleRecord = await checkout(itemsPayload, paymentMethod === 'cash' ? paid : total)
      }

      setLastSale(saleRecord)
      setCart({})
      setPaidText('')
      setPaymentModalOpen(false)
      setMobileCartOpen(false)
      toast.success('Transaksi kasir berhasil dicatat!')
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : 'Gagal memproses transaksi kasir')
    } finally {
      setBusy(false)
    }
  }

  // Visual icon helper
  function getCategoryIcon(cat: string) {
    const lower = cat.toLowerCase()
    if (lower.includes('bensin') || lower.includes('bbm') || lower.includes('oli')) return '⛽'
    if (lower.includes('rokok') || lower.includes('korek')) return '🚬'
    if (lower.includes('sembako') || lower.includes('beras') || lower.includes('gula') || lower.includes('minyak')) return '🍚'
    return '📦'
  }

  // CART PANEL COMPONENT
  const cartContent = (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      {/* Cart Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div>
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Nota Penjualan</span>
          </h2>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {lines.length > 0 ? `${itemCount} item terpilih` : 'Keranjang kosong'}
          </p>
        </div>
        {lines.length > 0 && (
          <button
            onClick={clearCart}
            className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-1 rounded-lg transition font-medium flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Kosongkan</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-800/40">
        {lines.length === 0 ? (
          <div className="py-24 text-center text-slate-500">
            <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-30 text-slate-400" />
            <p className="text-xs font-semibold text-slate-400">Keranjang Masih Kosong</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Klik kartu barang di katalog untuk menambahkan ke nota
            </p>
          </div>
        ) : (
          lines.map(({ p, qty }) => {
            const subtotal = p.sellPrice * qty
            return (
              <div key={p.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-200 truncate">{p.name}</h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {formatRupiah(p.sellPrice)} × {qty} ={' '}
                    <span className="text-emerald-400 font-bold">{formatRupiah(subtotal)}</span>
                  </p>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => decrementQty(p.id)}
                    aria-label={`Kurangi ${p.name}`}
                    className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center transition cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span aria-label={`Jumlah ${p.name}`} className="text-xs font-bold font-mono px-2 text-white">
                    {qty}
                  </span>
                  <button
                    onClick={() => addToCart(p.id)}
                    aria-label={`Tambah ${p.name}`}
                    className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <button
                  onClick={() => removeFromCart(p.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                  title="Hapus baris"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Cart Summary & Checkout */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/90 space-y-3 shadow-2xl">
        <div className="space-y-1 text-xs text-slate-400">
          <div className="flex justify-between">
            <span>Total Item</span>
            <span className="text-slate-200 font-bold font-mono">{itemCount} pcs</span>
          </div>
          <div className="flex justify-between">
            <span>Metode</span>
            <span className="text-emerald-400 font-medium">Tunai & QRIS</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-baseline justify-between">
          <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
            TOTAL BELANJA
          </span>
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {formatRupiah(total)}
          </span>
        </div>

        <button
          onClick={openPayment}
          disabled={lines.length === 0}
          aria-label="PROSES PEMBAYARAN"
          className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>PROSES PEMBAYARAN</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-60px)] overflow-hidden bg-slate-950 selection:bg-emerald-500 selection:text-white">
      
      {/* LEFT COLUMN: PRODUCT CATALOG */}
      <section className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
        
        {/* Search & Categories Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/60 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama barang atau barcode... (Ketik langsung)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition shadow-inner"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs bg-slate-800 px-1.5 py-0.5 rounded cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Kategori: Semua, Bensin, Sembako, Rokok */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'Semua', label: 'Semua', icon: '🛒' },
              { id: 'Bensin', label: 'Bensin', icon: '⛽' },
              { id: 'Sembako', label: 'Sembako', icon: '🍚' },
              { id: 'Rokok', label: 'Rokok', icon: '🚬' },
            ].map(({ id, label, icon }) => {
              const isSelected = activeCategory === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveCategory(id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5 pb-20 lg:pb-4">
          {visibleProducts.length === 0 ? (
            <div className="col-span-full py-20 text-center text-slate-500">
              <p className="text-3xl mb-2">📦</p>
              <p className="text-xs font-semibold text-slate-400">Tidak ada barang yang cocok</p>
              <p className="text-[11px] text-slate-600 mt-1">Coba ganti kata kunci atau filter kategori</p>
            </div>
          ) : (
            visibleProducts.map((p) => {
              const level = stockLevel(p)
              const inCartQty = cart[p.id] ?? 0
              const isOutOfStock = p.stock <= 0

              let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700/60'
              if (level === 'empty') badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              else if (level === 'low') badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30'

              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`${p.name} - ${formatRupiah(p.sellPrice)}`}
                  disabled={isOutOfStock}
                  onClick={() => addToCart(p.id)}
                  className={`group relative text-left bg-slate-900 border rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between transition-all duration-150 select-none ${
                    isOutOfStock
                      ? 'opacity-60 border-slate-800 cursor-not-allowed'
                      : 'border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 cursor-pointer active:scale-[0.97]'
                  }`}
                >
                  {inCartQty > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-950 font-mono">
                      {inCartQty}
                    </span>
                  )}

                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xl sm:text-2xl">{getCategoryIcon(p.category)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                        {p.stock} {p.unit}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition line-clamp-2 leading-snug">
                      {p.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{p.category}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {formatRupiah(p.sellPrice)}
                    </span>
                    <span className="text-[10px] text-slate-400 group-hover:text-white bg-slate-800 group-hover:bg-emerald-600 rounded-lg w-5 h-5 flex items-center justify-center transition">
                      +
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Mobile Floating Cart Trigger */}
        {!desktop && lines.length > 0 && (
          <div className="fixed bottom-16 left-4 right-4 z-30">
            <button
              onClick={() => setMobileCartOpen(true)}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-between shadow-2xl shadow-emerald-500/40"
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                <span>{itemCount} Barang di Nota</span>
              </div>
              <span className="text-sm font-mono">{formatRupiah(total)} →</span>
            </button>
          </div>
        )}
      </section>

      {/* RIGHT COLUMN: CART PANEL (Desktop) */}
      {desktop && (
        <aside className="w-[380px] xl:w-[420px] flex flex-col h-full shrink-0">
          {cartContent}
        </aside>
      )}

      {/* MOBILE CART MODAL */}
      {!desktop && mobileCartOpen && (
        <Modal open={mobileCartOpen} onClose={() => setMobileCartOpen(false)} title="Nota Belanja">
          <div className="h-[75vh] flex flex-col">{cartContent}</div>
        </Modal>
      )}

      {/* PAYMENT MODAL (TUNAI & QRIS) */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                <span>Pembayaran Transaksi</span>
              </h3>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white w-7 h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Tunai / Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('qris')}
                  className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    paymentMethod === 'qris'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>QRIS / Transfer</span>
                </button>
              </div>

              {/* Tagihan Display */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Total Tagihan Belanja
                </p>
                <p className="text-3xl font-black text-emerald-400 font-mono">
                  {formatRupiah(total)}
                </p>
              </div>

              {paymentMethod === 'cash' ? (
                <>
                  {/* Uang Diterima Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="uang-bayar-input">
                      Uang Diterima dari Pembeli (Rp)
                    </label>
                    <input
                      id="uang-bayar-input"
                      aria-label="Uang bayar"
                      type="text"
                      autoFocus
                      inputMode="numeric"
                      value={paidText ? formatRupiah(parseRupiah(paidText)) : ''}
                      onChange={(e) => setPaidText(e.target.value.replace(/\D/g, ''))}
                      placeholder="Contoh: 50.000"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Preset Buttons */}
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">
                      Pecahan Uang Cepat:
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      <button
                        type="button"
                        onClick={handleSetUangPas}
                        className="py-2 px-1 bg-slate-800 hover:bg-emerald-600/30 hover:border-emerald-500 border border-slate-700 rounded-lg text-[11px] font-bold text-slate-200 transition cursor-pointer"
                      >
                        Pas
                      </button>
                      {QUICK_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => handleSetQuickAmount(amt)}
                          className="py-2 px-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] font-bold text-slate-300 font-mono transition cursor-pointer"
                        >
                          {amt >= 1000 ? `${amt / 1000}k` : amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Kembalian Display */}
                  <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Kembalian:</span>
                    <span
                      className={`text-lg font-black font-mono ${
                        change >= 0 ? 'text-amber-400' : 'text-rose-400'
                      }`}
                    >
                      {change >= 0 ? formatRupiah(change) : `Kurang ${formatRupiah(Math.abs(change))}`}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  <div className="w-14 h-14 bg-slate-800 rounded-2xl mx-auto flex items-center justify-center text-2xl">
                    📱
                  </div>
                  <h4 className="text-xs font-bold text-white">Pembeli Scan QRIS Statis Warung</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                    Pastikan notifikasi uang masuk pada aplikasi bank/e-wallet telah terverifikasi sebelum menyelesaikan transaksi.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="flex-1 py-3 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!canPay}
                onClick={handleCheckout}
                className="flex-1 py-3 text-xs font-extrabold rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {busy ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Selesaikan Transaksi</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* STRUK / RECEIPT SUCCESS MODAL */}
      {lastSale && (
        <Modal open={!!lastSale} onClose={() => setLastSale(null)} title="Transaksi Selesai">
          <div className="p-4 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Pembayaran Sukses!</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Nota #{lastSale.id.slice(0, 8)}</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Total Belanja:</span>
                <span className="text-white font-bold">{formatRupiah(lastSale.total)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Uang Diterima:</span>
                <span className="text-white">{formatRupiah(lastSale.paid)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800 text-amber-400 font-bold">
                <span>Kembalian:</span>
                <span>{formatRupiah(lastSale.change)}</span>
              </div>
            </div>

            <button
              onClick={() => setLastSale(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition cursor-pointer"
            >
              Tutup & Transaksi Baru
            </button>
          </div>
        </Modal>
      )}

    </div>
  )
}
