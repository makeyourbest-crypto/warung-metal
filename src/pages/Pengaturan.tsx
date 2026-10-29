import { useLiveQuery } from 'dexie-react-hooks'
import { useRef } from 'react'
import { useToast } from '../components/Toast'
import { db } from '../db/schema'
import { DomainError, exportBackup, importBackup, seedSampleData } from '../db/services'

export default function Pengaturan() {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const pending = useLiveQuery(() => db.outbox.count(), [])
  const productCount = useLiveQuery(() => db.products.count(), [])

  async function doExport() {
    const blob = new Blob([await exportBackup()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `warung-metal-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.ok('Cadangan diunduh')
  }

  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!confirm('Impor akan MENGGANTI semua data saat ini dengan isi berkas. Lanjut?')) return
    try {
      await importBackup(await f.text())
      toast.ok('Data berhasil dipulihkan')
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal impor')
    }
  }

  async function doSeed() {
    if ((productCount ?? 0) > 0 && !confirm('Sudah ada barang. Tetap tambah 8 barang contoh?')) return
    try {
      await seedSampleData()
      toast.ok('Data contoh ditambahkan')
    } catch {
      toast.error('Gagal menambah data contoh')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Pengaturan</h1>

      <section className="card space-y-2">
        <h2 className="font-bold text-white">Cadangan data</h2>
        <p className="text-sm text-steel-400">
          Data tersimpan <b>hanya di perangkat ini</b> (browser). Unduh cadangan secara rutin. Jangan hapus data situs dari browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={doExport}>⬇ Unduh cadangan</button>
          <button className="btn" onClick={() => file.current?.click()}>⬆ Pulihkan dari berkas</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={doImport} aria-label="Berkas cadangan" />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold text-white">Data contoh</h2>
        <p className="text-sm text-steel-400">Tambah 8 barang warung contoh untuk mencoba aplikasi.</p>
        <button className="btn" onClick={doSeed}>Isi data contoh</button>
      </section>

      <section className="card space-y-1">
        <h2 className="font-bold text-white">Sinkron online</h2>
        <p className="text-sm text-steel-400">
          Belum aktif (Fase 2, Supabase). {pending ?? 0} perubahan sudah dicatat dan siap dikirim nanti.
        </p>
      </section>

      <p className="text-center text-xs text-steel-400">Warung Metal v0.1 · Fase 1 (offline)</p>
    </div>
  )
}
