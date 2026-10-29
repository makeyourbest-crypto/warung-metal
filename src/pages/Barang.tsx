import { useState } from 'react'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { createProduct, DomainError, setArchived, updateProduct } from '../db/services'
import { stockLevel, useProducts, type ProductRow } from '../hooks/useProducts'
import { formatRupiah, parseRupiah } from '../lib/money'

const UNITS = ['pcs', 'bungkus', 'saset', 'botol', 'kg', 'liter', 'karung', 'renteng', 'dus']

interface FormState {
  name: string
  category: string
  unit: string
  costPrice: string
  sellPrice: string
  minStock: string
  stock: string
}
const empty: FormState = { name: '', category: '', unit: 'pcs', costPrice: '', sellPrice: '', minStock: '5', stock: '0' }

function ProductForm({ edit, onClose }: { edit?: ProductRow; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<FormState>(
    edit
      ? {
          name: edit.name,
          category: edit.category,
          unit: edit.unit,
          costPrice: String(edit.costPrice),
          sellPrice: String(edit.sellPrice),
          minStock: String(edit.minStock),
          stock: '0',
        }
      : empty,
  )
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value })
  const num = (s: string) => (s.trim() === '' ? Number.NaN : parseRupiah(s))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      name: f.name,
      category: f.category.trim() || 'Lainnya',
      unit: f.unit,
      costPrice: num(f.costPrice),
      sellPrice: num(f.sellPrice),
      minStock: num(f.minStock),
    }
    try {
      if (Number.isNaN(input.costPrice) || Number.isNaN(input.sellPrice) || Number.isNaN(input.minStock)) {
        throw new DomainError('Harga modal, harga jual, dan stok minimum wajib diisi angka')
      }
      if (edit) await updateProduct(edit.id, input)
      else await createProduct(input, num(f.stock) || 0)
      toast.ok(edit ? 'Barang diperbarui' : 'Barang ditambahkan')
      onClose()
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal menyimpan')
    }
  }

  const margin = num(f.sellPrice) - num(f.costPrice)
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="pname">Nama barang</label>
        <input id="pname" className="input" value={f.name} onChange={set('name')} required maxLength={80} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pcat">Kategori</label>
          <input id="pcat" className="input" value={f.category} onChange={set('category')} placeholder="Sembako" />
        </div>
        <div>
          <label className="label" htmlFor="punit">Satuan</label>
          <select id="punit" className="input" value={f.unit} onChange={set('unit')}>
            {[...new Set([...UNITS, f.unit])].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pcost">Harga modal (Rp)</label>
          <input id="pcost" className="input" inputMode="numeric" value={f.costPrice} onChange={set('costPrice')} />
        </div>
        <div>
          <label className="label" htmlFor="psell">Harga jual (Rp)</label>
          <input id="psell" className="input" inputMode="numeric" value={f.sellPrice} onChange={set('sellPrice')} />
        </div>
        <div>
          <label className="label" htmlFor="pmin">Stok minimum</label>
          <input id="pmin" className="input" inputMode="numeric" value={f.minStock} onChange={set('minStock')} />
        </div>
        {!edit && (
          <div>
            <label className="label" htmlFor="pstock">Stok awal</label>
            <input id="pstock" className="input" inputMode="numeric" value={f.stock} onChange={set('stock')} />
          </div>
        )}
      </div>
      {!Number.isNaN(margin) && f.sellPrice && f.costPrice && (
        <p className={`text-sm ${margin < 0 ? 'text-red-400' : 'text-steel-400'}`}>
          Untung per {f.unit}: {formatRupiah(margin)} {margin < 0 && '(rugi!)'}
        </p>
      )}
      {edit && <p className="text-xs text-steel-400">Untuk mengubah stok, pakai menu Stok (restok atau koreksi).</p>}
      <button type="submit" className="btn btn-primary w-full !min-h-12">
        Simpan
      </button>
    </form>
  )
}

export default function Barang() {
  const [showArchived, setShowArchived] = useState(false)
  const products = useProducts(showArchived)
  const toast = useToast()
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [modal, setModal] = useState<{ edit?: ProductRow } | null>(null)

  const rows = (products ?? []).filter(
    (p) =>
      (showArchived ? p.isArchived : !p.isArchived) &&
      (p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.category.toLowerCase().includes(q.trim().toLowerCase())) &&
      (!lowOnly || stockLevel(p) !== 'ok'),
  )

  async function toggleArchive(p: ProductRow) {
    if (!p.isArchived && !confirm(`Arsipkan "${p.name}"? Barang tidak muncul di kasir, riwayat tetap aman.`)) return
    try {
      await setArchived(p.id, !p.isArchived)
      toast.ok(p.isArchived ? 'Barang dipulihkan' : 'Barang diarsipkan')
    } catch {
      toast.error('Gagal mengubah barang')
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold text-white">Barang</h1>
        <button className="btn btn-primary" onClick={() => setModal({})}>＋ Tambah barang</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input !w-auto min-w-0 flex-1" type="search" placeholder="Cari nama / kategori…" aria-label="Cari barang" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="btn cursor-pointer">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Stok menipis
        </label>
        <label className="btn cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arsip
        </label>
      </div>

      {products && rows.length === 0 && <p className="card text-center text-steel-400">Tidak ada barang.</p>}
      <ul className="space-y-2">
        {rows.map((p) => {
          const level = stockLevel(p)
          return (
            <li key={p.id} className="card flex flex-wrap items-center gap-3 !p-3">
              <div className="min-w-40 flex-1">
                <div className="font-semibold text-white">{p.name}</div>
                <div className="text-xs text-steel-400">
                  {p.category} · modal {formatRupiah(p.costPrice)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-ember">{formatRupiah(p.sellPrice)}</div>
                <div className={`text-xs font-semibold ${level === 'ok' ? 'text-emerald-400' : level === 'low' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {level === 'empty' ? 'Habis' : `${p.stock} ${p.unit}`}{level === 'low' && ' · menipis'}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn !min-h-9 !px-3" onClick={() => setModal({ edit: p })}>Ubah</button>
                <button className="btn !min-h-9 !px-3" onClick={() => toggleArchive(p)}>{p.isArchived ? 'Pulihkan' : 'Arsip'}</button>
              </div>
            </li>
          )
        })}
      </ul>

      {modal && (
        <Modal title={modal.edit ? 'Ubah barang' : 'Tambah barang'} onClose={() => setModal(null)}>
          <ProductForm edit={modal.edit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  )
}
