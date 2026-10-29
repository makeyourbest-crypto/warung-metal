import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { checkout, DomainError } from '../db/services'
import type { Sale } from '../db/schema'
import { useMedia } from '../hooks/useMedia'
import { stockLevel, useProducts } from '../hooks/useProducts'
import { formatRupiah, parseRupiah } from '../lib/money'

const QUICK = [5000, 10000, 20000, 50000, 100000]

export default function Kasir() {
  const products = useProducts()
  const desktop = useMedia('(min-width: 1024px)')
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [paidText, setPaidText] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Sale | null>(null)

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products])
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: byId.get(id), qty }))
    .filter((l): l is { p: NonNullable<typeof l.p>; qty: number } => !!l.p && l.qty > 0)
  const total = lines.reduce((s, l) => s + l.qty * l.p.sellPrice, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const paid = parseRupiah(paidText)
  const change = Number.isNaN(paid) ? 0 : paid - total
  const canPay = lines.length > 0 && !Number.isNaN(paid) && paid >= total && !busy

  const visible = (products ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))

  function add(id: string) {
    const p = byId.get(id)
    if (!p) return
    const cur = cart[id] ?? 0
    if (cur + 1 > p.stock) {
      toast.error(p.stock <= 0 ? `${p.name} habis. Isi stok dulu.` : `Stok ${p.name} hanya ${p.stock}`)
      return
    }
    setCart({ ...cart, [id]: cur + 1 })
  }
  function dec(id: string) {
    const next = { ...cart, [id]: (cart[id] ?? 0) - 1 }
    if (next[id] <= 0) delete next[id]
    setCart(next)
  }
  function remove(id: string) {
    const next = { ...cart }
    delete next[id]
    setCart(next)
  }

  async function pay() {
    setBusy(true)
    try {
      const sale = await checkout(
        lines.map((l) => ({ productId: l.p.id, qty: l.qty })),
        paid,
      )
      setDone(sale)
      setCart({})
      setPaidText('')
      setCartOpen(false)
    } catch (e) {
      toast.error(e instanceof DomainError ? e.message : 'Gagal menyimpan transaksi')
    } finally {
      setBusy(false)
    }
  }

  const cartPanel = (
    <div className="flex h-full flex-col">
      <h2 className="mb-3 text-lg font-bold text-white">Keranjang</h2>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {lines.length === 0 && <p className="py-8 text-center text-steel-400">Belum ada barang. Tap barang untuk menambah.</p>}
        {lines.map(({ p, qty }) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg bg-steel-900 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-white">{p.name}</div>
              <div className="text-xs text-steel-400">
                {formatRupiah(p.sellPrice)} × {qty} = {formatRupiah(p.sellPrice * qty)}
              </div>
            </div>
            <button className="btn !px-3" onClick={() => dec(p.id)} aria-label={`Kurangi ${p.name}`}>
              −
            </button>
            <span className="w-8 text-center font-bold text-white" aria-label={`Jumlah ${p.name}`}>
              {qty}
            </span>
            <button className="btn !px-3" onClick={() => add(p.id)} aria-label={`Tambah ${p.name}`}>
              +
            </button>
            <button className="btn !px-2 text-red-400" onClick={() => remove(p.id)} aria-label={`Hapus ${p.name}`}>
              🗑
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-3 border-t border-steel-700 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-steel-400">Total</span>
          <span className="text-3xl font-extrabold text-ember">{formatRupiah(total)}</span>
        </div>
        <div>
          <label className="label" htmlFor="bayar">
            Uang bayar
          </label>
          <input
            id="bayar"
            className="input text-lg"
            inputMode="numeric"
            placeholder="0"
            value={paidText === '' ? '' : formatRupiah(parseRupiah(paidText) || 0)}
            onChange={(e) => setPaidText(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn !min-h-9 !px-3" disabled={total === 0} onClick={() => setPaidText(String(total))}>
              Uang pas
            </button>
            {QUICK.map((v) => (
              <button key={v} className="btn !min-h-9 !px-3" onClick={() => setPaidText(String(v))}>
                {v / 1000}rb
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-steel-400">{change < 0 ? 'Kurang' : 'Kembalian'}</span>
          <span className={`text-xl font-bold ${change < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatRupiah(Math.abs(change))}
          </span>
        </div>
        <button className="btn btn-primary w-full !min-h-14 text-lg" disabled={!canPay} onClick={pay}>
          {busy ? 'Menyimpan…' : 'BAYAR'}
        </button>
        {lines.length > 0 && (
          <button className="btn w-full" onClick={() => setCart({})}>
            Kosongkan
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[1fr_380px] lg:gap-4">
      <section className="flex min-h-0 flex-col pb-24 lg:pb-0">
        <input
          className="input mb-3"
          type="search"
          placeholder="Cari barang…"
          aria-label="Cari barang"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {products && products.length === 0 && (
          <div className="card text-center">
            <p className="mb-2 text-white">Belum ada barang.</p>
            <p className="text-sm text-steel-400">Tambah di menu Barang, atau isi data contoh di Pengaturan.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => {
            const level = stockLevel(p)
            const empty = level === 'empty'
            return (
              <button
                key={p.id}
                onClick={() => add(p.id)}
                disabled={empty}
                className={`flex min-h-24 flex-col justify-between rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                  empty
                    ? 'cursor-not-allowed border-steel-700 bg-steel-900 opacity-50'
                    : 'border-steel-600 bg-steel-800 hover:border-ember'
                }`}
              >
                <span className="font-semibold text-white">{p.name}</span>
                <span>
                  <span className="block font-bold text-ember">{formatRupiah(p.sellPrice)}</span>
                  <span
                    className={`text-xs ${level === 'ok' ? 'text-steel-400' : level === 'low' ? 'text-yellow-400' : 'text-red-400'}`}
                  >
                    {empty ? 'Habis' : `Stok ${p.stock} ${p.unit}`}
                    {level === 'low' && ' ⚠'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {products && products.length > 0 && visible.length === 0 && (
          <p className="py-8 text-center text-steel-400">Barang “{q}” tidak ditemukan.</p>
        )}
      </section>

      {desktop ? (
        <aside className="card min-h-0">{cartPanel}</aside>
      ) : (
        <div className="fixed inset-x-0 bottom-16 z-20 p-3">
          <button className="btn btn-primary w-full !min-h-14 justify-between text-base" onClick={() => setCartOpen(true)}>
            <span>🛒 {count} barang</span>
            <span>{formatRupiah(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && !desktop && (
        <Modal title="Bayar" onClose={() => setCartOpen(false)}>
          <div className="h-[70vh]">{cartPanel}</div>
        </Modal>
      )}

      {done && (
        <Modal title="Transaksi berhasil ✅" onClose={() => setDone(null)}>
          <div className="space-y-2 text-center">
            <div className="text-steel-400">Total {formatRupiah(done.total)}</div>
            <div className="text-steel-400">Bayar {formatRupiah(done.paid)}</div>
            <div className="text-sm text-steel-400">Kembalian</div>
            <div className="text-4xl font-extrabold text-emerald-400">{formatRupiah(done.change)}</div>
            <button className="btn btn-primary mt-4 w-full !min-h-12" onClick={() => setDone(null)}>
              Transaksi baru
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
