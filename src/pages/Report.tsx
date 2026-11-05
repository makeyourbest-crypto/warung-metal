import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { db } from '../db/schema'
import { DomainError, exportBackup, getStockMap, importBackup } from '../db/services'
import { isSupabaseConfigured } from '../db/supabase'
import { 
  fetchCloudMovementsByDateRange, 
  fetchCloudProducts, 
  fetchCloudSalesByDateRange 
} from '../db/supabase-services'
import { 
  downloadMovementsCsv, 
  downloadProductsCsv, 
  downloadSalesCsv 
} from '../lib/csv-export'
import { 
  FileSpreadsheet, 
  Receipt, 
  Download, 
  Upload, 
  Package, 
  RefreshCw, 
  Calendar,
  Database,
  CheckCircle2
} from 'lucide-react'

interface MonthOption {
  year: number
  month: number // 0-indexed (0 = Jan, 11 = Des)
  label: string
  value: string
}

export default function Report() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  // Buat daftar 12 bulan terakhir secara dinamis
  const monthOptions: MonthOption[] = useMemo(() => {
    const list: MonthOption[] = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = d.getMonth()
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      const value = `${year}-${String(month + 1).padStart(2, '0')}`
      list.push({ year, month, label, value })
    }
    return list
  }, [])

  const [selectedMonthValue, setSelectedMonthValue] = useState<string>(
    monthOptions[0]?.value ?? ''
  )

  const selectedMonthOption = useMemo(() => {
    return monthOptions.find((m) => m.value === selectedMonthValue) || monthOptions[0]
  }, [selectedMonthValue, monthOptions])

  // State data penjualan & mutasi bulanan
  const [loadingPeriod, setLoadingPeriod] = useState(false)
  const [monthlySales, setMonthlySales] = useState<any[]>([])
  const [monthlyMovements, setMonthlyMovements] = useState<any[]>([])

  // State loading tombol ekspor
  const [exportingMonthSales, setExportingMonthSales] = useState(false)
  const [exportingMovements, setExportingMovements] = useState(false)
  const [exportingProducts, setExportingProducts] = useState(false)

  // Ambil data penjualan & mutasi berdasarkan bulan yang dipilih
  useEffect(() => {
    if (!selectedMonthOption) return
    let isCancelled = false

    async function loadPeriodData() {
      setLoadingPeriod(true)
      try {
        const { year, month } = selectedMonthOption
        const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0)
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999)

        if (isSupabaseConfigured) {
          // Ambil dari Supabase Cloud
          const [salesRes, movsRes] = await Promise.all([
            fetchCloudSalesByDateRange(startOfMonth.toISOString(), endOfMonth.toISOString()),
            fetchCloudMovementsByDateRange(startOfMonth.toISOString(), endOfMonth.toISOString()),
          ])

          if (!isCancelled) {
            setMonthlySales(salesRes.sales || [])
            setMonthlyMovements(movsRes || [])
          }
        } else {
          // Fallback Database Lokal (Dexie)
          const fromTime = startOfMonth.getTime()
          const toTime = endOfMonth.getTime()

          const [sales, movements, products] = await Promise.all([
            db.sales.where('createdAt').between(fromTime, toTime, true, true).toArray(),
            db.movements.where('createdAt').between(fromTime, toTime, true, true).toArray(),
            db.products.toArray(),
          ])

          const saleIds = sales.map((s) => s.id)
          const items = await db.saleItems.where('saleId').anyOf(saleIds).toArray()
          const prodMap = new Map(products.map((p) => [p.id, p.name]))

          const mappedSales = sales.map((s) => ({
            ...s,
            items: items
              .filter((i) => i.saleId === s.id)
              .map((i) => ({
                name: prodMap.get(i.productId) ?? 'Barang',
                qty: i.qty,
                sellPrice: i.sellPrice,
              })),
          }))

          const mappedMovements = movements.map((m) => ({
            ...m,
            productName: prodMap.get(m.productId) ?? 'Barang',
          }))

          if (!isCancelled) {
            setMonthlySales(mappedSales)
            setMonthlyMovements(mappedMovements)
          }
        }
      } catch (err: any) {
        console.error('Gagal memuat data periode bulanan:', err)
      } finally {
        if (!isCancelled) setLoadingPeriod(false)
      }
    }

    loadPeriodData()

    return () => {
      isCancelled = true
    }
  }, [selectedMonthOption])

  // 1. Unduh CSV Laporan Penjualan Bulan Terpilih
  async function handleExportMonthlySalesCsv() {
    if (monthlySales.length === 0) {
      toast.error(`Tidak ada transaksi kasir pada bulan ${selectedMonthOption.label}`)
      return
    }

    setExportingMonthSales(true)
    try {
      const cleanMonthLabel = selectedMonthOption.label.toLowerCase().replace(/\s+/g, '-')
      downloadSalesCsv(monthlySales, `warung-metal-laporan-penjualan-${cleanMonthLabel}.csv`)
      toast.success(`Laporan penjualan ${selectedMonthOption.label} berhasil diunduh (.csv)!`)
    } catch (err: any) {
      toast.error(`Gagal mengunduh penjualan: ${err.message}`)
    } finally {
      setExportingMonthSales(false)
    }
  }

  // 2. Unduh CSV Riwayat Mutasi Stok Bulan Terpilih
  async function handleExportMovementsCsv() {
    if (monthlyMovements.length === 0) {
      toast.error(`Tidak ada riwayat mutasi stok pada bulan ${selectedMonthOption.label}`)
      return
    }

    setExportingMovements(true)
    try {
      const cleanMonthLabel = selectedMonthOption.label.toLowerCase().replace(/\s+/g, '-')
      downloadMovementsCsv(monthlyMovements, `warung-metal-mutasi-stok-${cleanMonthLabel}.csv`)
      toast.success(`Riwayat mutasi stok ${selectedMonthOption.label} berhasil diunduh (.csv)!`)
    } catch (err: any) {
      toast.error(`Gagal mengunduh mutasi stok: ${err.message}`)
    } finally {
      setExportingMovements(false)
    }
  }

  // 3. Unduh CSV Stok Fisik & Nilai Modal Terkini (Real-Time)
  async function handleExportProductsCsv() {
    setExportingProducts(true)
    try {
      const dateStr = new Date().toISOString().slice(0, 10)

      if (isSupabaseConfigured) {
        const prods = await fetchCloudProducts()
        if (prods.length === 0) {
          toast.error('Belum ada data barang untuk diekspor.')
          return
        }
        downloadProductsCsv(prods, `warung-metal-stok-fisik-terkini-${dateStr}.csv`)
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
        downloadProductsCsv(mapped, `warung-metal-stok-fisik-terkini-${dateStr}.csv`)
      }
      toast.success('Data stok fisik terkini berhasil diunduh (.csv)!')
    } catch (err: any) {
      toast.error(`Gagal ekspor stok: ${err.message}`)
    } finally {
      setExportingProducts(false)
    }
  }

  // 4. Cadangan JSON (Backup Mandiri)
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

  // 5. Restore Cadangan JSON
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

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 max-w-5xl mx-auto w-full pb-24 space-y-6">
      
      {/* Header & Filter Periode Utama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            <span>Pusat Tarik Data Warung</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Ekspor laporan penjualan bulanan, riwayat mutasi stok per periode, dan nilai modal warung (.CSV)
          </p>
        </div>

        {/* Global Period Selector */}
        <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 p-2 rounded-2xl shadow-sm self-start sm:self-auto">
          <Calendar className="w-4 h-4 text-emerald-400 ml-1 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-semibold">Pilih Periode:</span>
            <select
              value={selectedMonthValue}
              onChange={(e) => setSelectedMonthValue(e.target.value)}
              className="bg-slate-950 text-white text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-800 outline-none cursor-pointer hover:border-emerald-500/50 focus:border-emerald-500 transition"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Modul 1: Tarik Laporan Penjualan (Bulanan) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Laporan Penjualan Kasir ({selectedMonthOption.label})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Rekap seluruh nota kasir: tanggal/jam, metode bayar (Tunai/QRIS), total tagihan, uang bayar, kembalian, dan rincian belanjaan.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>
              {loadingPeriod
                ? 'Memeriksa transaksi...'
                : `${monthlySales.length} transaksi kasir tercatat pada ${selectedMonthOption.label}`}
            </span>
          </div>

          <button
            onClick={handleExportMonthlySalesCsv}
            disabled={exportingMonthSales || monthlySales.length === 0}
            className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>
              {exportingMonthSales
                ? 'Mengunduh...'
                : `Unduh Penjualan ${selectedMonthOption.label} (.CSV)`}
            </span>
          </button>
        </div>
      </section>

      {/* Modul 2: Tarik Riwayat Mutasi Stok (Bulanan) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Riwayat Keluar-Masuk Mutasi Stok ({selectedMonthOption.label})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Catatan mutasi stok kronologis pada bulan {selectedMonthOption.label}: pengurangan dari penjualan kasir, penambahan restok supplier, dan koreksi stok fisik.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>
              {loadingPeriod
                ? 'Memeriksa mutasi...'
                : `${monthlyMovements.length} log mutasi stok tercatat pada ${selectedMonthOption.label}`}
            </span>
          </div>

          <button
            onClick={handleExportMovementsCsv}
            disabled={exportingMovements || monthlyMovements.length === 0}
            className="py-2.5 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
          >
            <Download className="w-4 h-4 text-slate-950" />
            <span>
              {exportingMovements
                ? 'Mengunduh...'
                : `Unduh Mutasi Stok ${selectedMonthOption.label} (.CSV)`}
            </span>
          </button>
        </div>
      </section>

      {/* Modul 3: Tarik Stok Fisik & Nilai Modal Aset (Real-Time Terkini) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Stok Fisik & Nilai Modal Aset Warung
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Real-Time Saat Ini
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Katalog lengkap, sisa stok di rak detik ini, harga modal, harga jual, margin, dan total rupiah modal aset warung (ideal untuk audit stok opname toko).
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>Data stok fisik terhubung langsung dengan kondisi inventaris rak warung</span>
          </div>

          <button
            onClick={handleExportProductsCsv}
            disabled={exportingProducts}
            className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>{exportingProducts ? 'Mengunduh...' : 'Unduh Stok Fisik Terkini (.CSV)'}</span>
          </button>
        </div>
      </section>

      {/* Modul 4: Cadangan Berkas Mandiri (Backup & Restore JSON) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-400" />
          <span>Cadangan Berkas (Backup & Restore JSON)</span>
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Simpan salinan data lengkap warung Anda dalam bentuk berkas <code className="text-emerald-400">.json</code> ke laptop atau flashdisk sebagai proteksi ganda.
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

      {/* Footer Info */}
      <section className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-500">
        <p className="font-bold text-slate-400">Warung Metal 🤘 POS v2.0</p>
        <p className="text-[11px] mt-0.5">Sistem Kasir & Manajemen Stok Terpadu</p>
      </section>

    </div>
  )
}
