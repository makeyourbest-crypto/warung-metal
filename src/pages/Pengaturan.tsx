import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { db } from '../db/schema'
import { DomainError, exportBackup, getStockMap, importBackup, seedSampleData } from '../db/services'
import { isSupabaseConfigured, supabase } from '../db/supabase'
import { 
  fetchCloudMovements, 
  fetchCloudProducts, 
  fetchCloudSalesReport, 
  seedCloudSampleProducts 
} from '../db/supabase-services'
import { 
  downloadMovementsCsv, 
  downloadProductsCsv, 
  downloadSalesCsv 
} from '../lib/csv-export'
import { 
  Settings, 
  Database, 
  Cloud, 
  Download, 
  Upload, 
  ShieldCheck,
  FileSpreadsheet,
  Package,
  Receipt,
  Sparkles,
  RefreshCw
} from 'lucide-react'

export default function Pengaturan() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const productCount = useLiveQuery(() => db.products.count(), [])
  
  const [migrating, setMigrating] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [exportingProducts, setExportingProducts] = useState(false)
  const [exportingSales, setExportingSales] = useState(false)
  const [exportingMovements, setExportingMovements] = useState(false)

  // 1-Click Seed Katalog Warung Lengkap (Kemarin)
  async function handleSeedCatalog() {
    if (!confirm('Muat paket katalog barang lengkap (Bensin, Beras, Minyak, Rokok, Indomie, Aqua, dll.)?')) return

    setSeeding(true)
    try {
      if (isSupabaseConfigured) {
        const count = await seedCloudSampleProducts()
        toast.success(`Katalog warung lengkap berhasil diunggah ke Supabase Cloud (${count} produk)!`)
      } else {
        await seedSampleData(db)
        toast.success('Katalog warung lengkap berhasil dimuat ke database lokal!')
      }
    } catch (err: any) {
      toast.error(err instanceof DomainError ? err.message : `Gagal memuat katalog: ${err.message}`)
    } finally {
      setSeeding(false)
    }
  }

  // Unduh CSV Stok Barang
  async function handleExportProductsCsv() {
    setExportingProducts(true)
    try {
      if (isSupabaseConfigured) {
        const prods = await fetchCloudProducts()
        if (prods.length === 0) {
          toast.error('Belum ada data barang untuk diekspor. Silakan muat katalog terlebih dahulu.')
          return
        }
        downloadProductsCsv(prods)
      } else {
        const [prods, stockMap] = await Promise.all([
          db.products.where('isArchived').equals(0).toArray(),
          getStockMap(db),
        ])
        if (prods.length === 0) {
          toast.error('Belum ada data barang lokal untuk diekspor.')
          return
        }
        const mapped = prods.map((p) => ({ ...p, stock: stockMap.get(p.id) ?? 0 }))
        downloadProductsCsv(mapped)
      }
      toast.success('Data stok barang berhasil diunduh (.csv)!')
    } catch (err: any) {
      toast.error(`Gagal ekspor stok: ${err.message}`)
    } finally {
      setExportingProducts(false)
    }
  }

  // Unduh CSV Laporan Penjualan
  async function handleExportSalesCsv() {
    setExportingSales(true)
    try {
      if (isSupabaseConfigured) {
        const rep = await fetchCloudSalesReport(365)
        if (rep.sales.length === 0) {
          toast.error('Belum ada riwayat transaksi kasir untuk diekspor.')
          return
        }
        downloadSalesCsv(rep.sales)
      } else {
        const [sales, items, products] = await Promise.all([
          db.sales.toArray(),
          db.saleItems.toArray(),
          db.products.toArray(),
        ])
        if (sales.length === 0) {
          toast.error('Belum ada riwayat transaksi kasir lokal.')
          return
        }
        const prodMap = new Map(products.map((p) => [p.id, p.name]))
        const salesWithItems = sales.map((s) => ({
          ...s,
          items: items
            .filter((i) => i.saleId === s.id)
            .map((i) => ({ name: prodMap.get(i.productId) ?? 'Barang', qty: i.qty, sellPrice: i.sellPrice })),
        }))
        downloadSalesCsv(salesWithItems)
      }
      toast.success('Laporan penjualan berhasil diunduh (.csv)!')
    } catch (err: any) {
      toast.error(`Gagal ekspor penjualan: ${err.message}`)
    } finally {
      setExportingSales(false)
    }
  }

  // Unduh CSV Mutasi Stok
  async function handleExportMovementsCsv() {
    setExportingMovements(true)
    try {
      if (isSupabaseConfigured) {
        const movements = await fetchCloudMovements()
        if (movements.length === 0) {
          toast.error('Belum ada riwayat mutasi stok untuk diekspor.')
          return
        }
        downloadMovementsCsv(movements)
      } else {
        const [movements, products] = await Promise.all([
          db.movements.toArray(),
          db.products.toArray(),
        ])
        if (movements.length === 0) {
          toast.error('Belum ada riwayat mutasi stok lokal.')
          return
        }
        const prodMap = new Map(products.map((p) => [p.id, p.name]))
        const mapped = movements.map((m) => ({
          ...m,
          productName: prodMap.get(m.productId) ?? 'Barang',
        }))
        downloadMovementsCsv(mapped)
      }
      toast.success('Riwayat mutasi stok berhasil diunduh (.csv)!')
    } catch (err: any) {
      toast.error(`Gagal ekspor mutasi: ${err.message}`)
    } finally {
      setExportingMovements(false)
    }
  }

  // Cadangan JSON
  async function handleExportBackup() {
    try {
      const json = await exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `warung-metal-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Cadangan data berhasil diunduh!')
    } catch {
      toast.error('Gagal mengunduh cadangan')
    }
  }

  // Restore Cadangan JSON
  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!confirm('Impor akan menimpa seluruh data lokal saat ini. Lanjutkan?')) return

    try {
      await importBackup(await f.text())
      toast.success('Data lokal berhasil dipulihkan!')
    } catch (err) {
      toast.error(err instanceof DomainError ? err.message : 'Gagal memulihkan cadangan')
    }
  }

  // 1-Click Migration dari data lokal browser ke Supabase
  async function handleMigrateToCloud() {
    if (!isSupabaseConfigured) {
      toast.error('Konfigurasikan Supabase terlebih dahulu di file .env')
      return
    }

    setMigrating(true)
    try {
      const [prods, movements] = await Promise.all([
        db.products.toArray(),
        db.movements.toArray(),
      ])

      if (prods.length === 0) {
        toast.error('Tidak ada data produk lokal untuk dimigrasikan')
        return
      }

      const stockMap = new Map<string, number>()
      for (const m of movements) {
        stockMap.set(m.productId, (stockMap.get(m.productId) ?? 0) + m.qtyChange)
      }

      const cloudProdsPayload = prods.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        cost_price: p.costPrice,
        sell_price: p.sellPrice,
        stock: stockMap.get(p.id) ?? 0,
        min_stock: p.minStock,
        is_archived: p.isArchived,
      }))

      const { error: pErr } = await supabase.from('products').upsert(cloudProdsPayload)
      if (pErr) throw new DomainError(pErr.message)

      toast.success(`Berhasil memigrasikan ${prods.length} barang ke Supabase Cloud!`)
    } catch (err: any) {
      toast.error(`Gagal migrasi: ${err.message}`)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 max-w-4xl mx-auto w-full pb-24 space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-400" />
          <span>Pengaturan Sistem Warung Metal</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Kelola database cloud, ekspor data CSV, pemulihan katalog, dan cadangan data
        </p>
      </div>

      {/* Cloud Connection Status Card (Tanpa URL Terbuka - Privasi Aman) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
              isSupabaseConfigured 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}>
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Database Cloud (Supabase PostgreSQL)</span>
              </h2>
              <p className="text-xs text-slate-400">
                {isSupabaseConfigured ? 'Penyimpanan online aktif & terhubung secara otomatis' : 'Saat ini berjalan dalam mode browser lokal'}
              </p>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
            isSupabaseConfigured
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span>{isSupabaseConfigured ? 'Database Terhubung' : 'Lokal / Offline'}</span>
          </span>
        </div>

        {isSupabaseConfigured ? (
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>Status Koneksi:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Database Terhubung & Sinkronisasi Aktif
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-slate-800/80">
              <span>Keamanan & Proteksi:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Row Level Security & Enkripsi Kunci Aman
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-200 space-y-2">
            <p className="font-bold">Mode Database Lokal:</p>
            <p className="text-[11px] text-amber-300/80">
              Aplikasi saat ini berjalan menggunakan memori browser. Data aman tersimpan di perangkat ini.
            </p>
          </div>
        )}

        {/* 1-Click Migration Action if local data exists */}
        {isSupabaseConfigured && (productCount ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white">Migrasikan Data Lokal Lama</p>
              <p className="text-[11px] text-slate-400">
                Ditemukan {productCount} barang di memori lokal browser Anda.
              </p>
            </div>
            <button
              onClick={handleMigrateToCloud}
              disabled={migrating}
              className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{migrating ? 'Memindahkan Data...' : 'Unggah ke Supabase Cloud ☁️'}</span>
            </button>
          </div>
        )}
      </section>

      {/* 📦 Muat Katalog Warung Lengkap (Data Kemarin) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Katalog Warung Kemarin (Isi Cepat)</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tekan tombol ini untuk langsung mengisi paket katalog barang lengkap warung (Bensin Pertalite, Beras Ramos, Minyak Bimoli, Rokok Surya & Sampoerna, Indomie, Kopi, Aqua, Telur, Gas LPG, dll.) dengan stok siap pakai.
            </p>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleSeedCatalog}
            disabled={seeding}
            className="w-full sm:w-auto py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition shadow-lg cursor-pointer disabled:opacity-50"
          >
            {seeding ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Sedang Mengisi Katalog Warung...</span>
              </>
            ) : (
              <>
                <Package className="w-4 h-4 text-slate-950" />
                <span>Muat Katalog Warung Lengkap 📦</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* 📊 Tarik Data Warung (.CSV) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>Tarik Data Warung (.CSV)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Unduh data warung ke format berkas Excel/CSV untuk rekap buku, laporan pajak, atau audit fisik stok.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Export Stok & Aset */}
          <button
            onClick={handleExportProductsCsv}
            disabled={exportingProducts}
            className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left transition flex flex-col justify-between gap-3 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Stok & Nilai Aset</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Sisa stok fisik, harga beli/jual, & total modal</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold pt-1 border-t border-slate-850">
              <Download className="w-3.5 h-3.5" />
              <span>{exportingProducts ? 'Mengunduh...' : 'Unduh CSV'}</span>
            </div>
          </button>

          {/* Export Penjualan Kasir */}
          <button
            onClick={handleExportSalesCsv}
            disabled={exportingSales}
            className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left transition flex flex-col justify-between gap-3 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Laporan Penjualan</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Daftar nota, omzet, metode bayar (Tunai/QRIS)</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold pt-1 border-t border-slate-850">
              <Download className="w-3.5 h-3.5" />
              <span>{exportingSales ? 'Mengunduh...' : 'Unduh CSV'}</span>
            </div>
          </button>

          {/* Export Riwayat Mutasi Stok */}
          <button
            onClick={handleExportMovementsCsv}
            disabled={exportingMovements}
            className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/40 text-left transition flex flex-col justify-between gap-3 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Riwayat Mutasi Stok</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Log barang keluar, restok, & koreksi selisih</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold pt-1 border-t border-slate-850">
              <Download className="w-3.5 h-3.5" />
              <span>{exportingMovements ? 'Mengunduh...' : 'Unduh CSV'}</span>
            </div>
          </button>
        </div>
      </section>

      {/* Cadangan & Ekspor JSON (Proteksi File Ganda) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-400" />
          <span>Cadangan Berkas (Backup & Restore JSON)</span>
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Simpan salinan data lengkap warung Anda dalam bentuk file <code className="text-emerald-400">.json</code> ke laptop/flashdisk sebagai proteksi ganda.
        </p>

        <div className="pt-2 flex flex-wrap gap-2.5">
          <button
            onClick={handleExportBackup}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Cadangan JSON</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Pulihkan dari Berkas</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportBackup}
          />
        </div>
      </section>

      {/* Info Aplikasi */}
      <section className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-500">
        <p className="font-bold text-slate-400">Warung Metal 🤘 POS v2.0</p>
        <p className="text-[11px] mt-0.5">Sistem Kasir & Manajemen Stok Terintegrasi Cloud Supabase</p>
      </section>

    </div>
  )
}
