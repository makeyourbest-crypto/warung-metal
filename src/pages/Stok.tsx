import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { useState } from 'react'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { db } from '../db/schema'
import { adjustStock, DomainError, restock } from '../db/services'
import { stockLevel, useProducts, type ProductRow } from '../hooks/useProducts'
import { formatRupiah, parseRupiah } from '../lib/money'

type Mode = 'restock' | 'adjust'

function StockForm({ product, mode, onClose }: { product: ProductRow; mode: Mode; onClose: () => void }) {
  const toast = useToast()
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState(String(product.costPrice))
  const [sign, setSign] = useState<1 | -1>(-1)
  const [reason, setReason] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseRupiah(qty)
    try {
      if (Number.isNaN(n) || n <= 0) throw new DomainError('Jumlah harus lebih dari 0')
      if (mode === 'restock') {
        const c = parseRupiah(cost)
        await restock(product.id, n, Number.isNaN(c) ? undefined : c)
        toast.ok(`Stok ${product.name} +${n}`)
      } else {
        await adjustStock(product.id, sign * n, reason)
        toast.ok(`Stok ${product.name} dikoreksi ${sign * n}`)
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal menyimpan')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-steel-400">
        {product.name} · stok sekarang <b className="text-white">{product.stock} {product.unit}</b>
      </p>
      {mode === 'adjust' && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Arah koreksi">
          <button type="button" className={`btn ${sign === -1 ? 'btn-danger' : ''}`} onClick={() => setSign(-1)}>− Kurangi</button>
          <button type="button" className={`btn ${sign === 1 ? 'btn-primary' : ''}`} onClick={() => setSign(1)}>＋ Tambah</button>
        </div>
      )}
      <div>
        <label className="label" htmlFor="sqty">Jumlah</label>
        <input id="sqty" className="input text-lg" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </div>
      {mode === 'restock' ? (
        <div>
          <label className="label" htmlFor="scost">Harga modal baru (Rp)</label>
          <input id="scost" className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="sreason">Alasan (wajib)</label>
          <input id="sreason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rusak, kedaluwarsa, hilang, hitung ulang…" />
        </div>
      )}
      <button type="submit" className="btn btn-primary w-full !min-h-12">Simpan</button>
    </form>
  )
}

const TYPE_LABEL = { sale: 'Jual', restock: 'Restok', adjust: 'Koreksi' } as const

function History() {
  const rows = useLiveQuery(async () => {
    const [moves, products] = await Promise.all([
      db.movements.orderBy('createdAt').reverse().limit(100).toArray(),
      db.products.toArray(),
    ])
    const names = new Map(products.map((p) => [p.id, p.name]))
    return moves.map((m) => ({ ...m, name: names.get(m.productId) ?? '(dihapus)' }))
  }, [])
  if (!rows) return null
  if (rows.length === 0) return <p className="card text-center text-steel-400">Belum ada riwayat.</p>
  return (
    <ul className="space-y-1">
      {rows.map((m) => (
        <li key={m.id} className="flex items-center gap-3 rounded-lg bg-steel-800 px-3 py-2 text-sm">
          <span className="w-24 shrink-0 text-xs text-steel-400">{format(m.createdAt, 'dd MMM HH:mm', { locale: localeId })}</span>
          <span className="min-w-0 flex-1 truncate text-white">{m.name}</span>
          <span className="text-xs text-steel-400">{TYPE_LABEL[m.type]}{m.type === 'adjust' && `: ${m.reason}`}</span>
          <span className={`w-12 text-right font-bold ${m.qtyChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {m.qtyChange > 0 ? '+' : ''}{m.qtyChange}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function Stok() {
  const products = useProducts()
  const [tab, setTab] = useState<'stok' | 'belanja' | 'riwayat'>('stok')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<{ p: ProductRow; mode: Mode } | null>(null)

  const all = products ?? []
  const shopping = all.filter((p) => stockLevel(p) !== 'ok')
  const list = (tab === 'belanja' ? shopping : all).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold text-white">Stok</h1>
      <div className="mb-3 grid grid-cols-3 gap-2" role="tablist">
        {(
          [
            ['stok', 'Semua'],
            ['belanja', `Perlu belanja (${shopping.length})`],
            ['riwayat', 'Riwayat'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? 'btn-primary' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'riwayat' ? (
        <History />
      ) : (
        <>
          <input className="input mb-3" type="search" aria-label="Cari barang" placeholder="Cari barang…" value={q} onChange={(e) => setQ(e.target.value)} />
          {list.length === 0 && <p className="card text-center text-steel-400">{tab === 'belanja' ? 'Semua stok aman 👍' : 'Tidak ada barang.'}</p>}
          <ul className="space-y-2">
            {list.map((p) => {
              const level = stockLevel(p)
              return (
                <li key={p.id} className="card flex flex-wrap items-center gap-3 !p-3">
                  <div className="min-w-40 flex-1">
                    <div className="font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-steel-400">min {p.minStock} · modal {formatRupiah(p.costPrice)}</div>
                  </div>
                  <div className={`text-lg font-bold ${level === 'ok' ? 'text-emerald-400' : level === 'low' ? 'text-yellow-400' : 'text-red-400'}`}>
                    {p.stock} <span className="text-xs font-normal">{p.unit}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary !min-h-9 !px-3" onClick={() => setModal({ p, mode: 'restock' })}>＋ Restok</button>
                    <button className="btn !min-h-9 !px-3" onClick={() => setModal({ p, mode: 'adjust' })}>Koreksi</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {modal && (
        <Modal title={modal.mode === 'restock' ? 'Restok barang' : 'Koreksi stok'} onClose={() => setModal(null)}>
          <StockForm product={modal.p} mode={modal.mode} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  )
}
