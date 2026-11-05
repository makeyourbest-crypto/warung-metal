import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/Toast'
import { db } from '../db/schema'
import { DomainError, exportBackup, getStockMap, importBackup } from '../db/services'
import { isSupabaseConfigured } from '../db/supabase'
import { 
  fetchCloudMovements, 
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
  Database
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

  // State data penjualan bulanan untuk diekspor
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [monthlySales, setMonthlySales] = useState<any[]>([])

  // State loading untuk tombol ekspor
  const [exportingMonthSales, setExportingMonthSales] = useState(false)
  const [exportingProducts, setExportingProducts] = useState(false)
  const [exportingMovements, setExportingMovements] = useState(false)

  // Ambil data penjualan berdasarkan bulan yang dipilih
  useEffect(() => {
    if (!selectedMonthOption) return
    let isCancelled = false

    async function loadMonthlySales() {
      setLoadingMonth(true)
      try {
        const { year, month } = selectedMonthOption
        const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0)
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999)

        if (isSupabaseConfigured) {
          const res = await fetchCloudSalesByDateRange(
            startOfMonth.toISOString(),
            endOfMonth.toISOString()
          )
          if (!isCancelled) {
            setMonthlySales(res.sales || [])
          }
        } else {
          // Fallback database lokal (Dexie)
          const fromTime = startOfMonth.getTime()
          const toTime = endOfMonth.getTime()

          const sales = await db.sales
            .where('createdAt')
            .between(fromTime, toTime, true, true)
            .toArray()

          const saleIds = sales.map((s) => s.id)
          const items = await db.saleItems.where('saleId').anyOf(saleIds).toArray()
          const products = await db.products.toArray()
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

          if (!isCancelled) {
            setMonthlySales(mappedSales)
          }
        }
      } catch (err: any) {
        console.error('Gagal memuat data penjualan bulanan:', err)
      } finally {
        if (!isCancelled) setLoadingMonth(false)
      }
    }

    loadMonthlySales()

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
      toast.error(`Gagal mengunduh laporan bulanan: ${err.message}`)
    } finally {
      setExportingMonthSales(false)
    }
  }

  // 2. Unduh CSV Stok & Nilai Modal Barang
  async function handleExportProductsCsv() {
    setExportingProducts(true)
    try {
      if (isSupabaseConfigured) {
        const prods = await fetchCloudProducts()
        if (prods.length === 0) {
          toast.error('Belum ada data barang untuk diekspor.')
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

  // 3. Unduh CSV Mutasi Stok
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
      
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
          <span>Pusat Tarik Data Warung</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Unduh laporan penjualan bulanan, stok barang fisik, dan mutasi kasir ke format .CSV untuk pembukuan Excel
        </p>
      </div>

      {/* Modul 1: Tarik Laporan Penjualan Per Bulan */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-xl">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Laporan Penjualan Kasir (Bulanan)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Rekap nota transaksi lengkap: tanggal/jam, metode bayar (Tunai/QRIS), total belanja, dan rincian barang.
              </p>
            </div>
          </div>
        </div>

        {/* Action Panel: Pilihan Bulan & Tombol Tarik CSV */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Pilih Periode:</span>
              <select
                value={selectedMonthValue}
                onChange={(e) => setSelectedMonthValue(e.target.value)}
                className="bg-slate-900 text-white text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-800 outline-none cursor-pointer hover:border-emerald-500/40 transition"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-slate-500 hidden md:inline">
              ({loadingMonth ? 'Memeriksa data...' : `${monthlySales.length} transaksi`})
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

      {/* Modul 2 & 3: Tarik Stok Barang & Riwayat Mutasi Stok (2 Cards Grid) */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>Tarik Data Katalog & Riwayat Stok (.CSV)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Unduh data inventaris warung untuk audit fisik stok barang atau rekap nilai modal.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Card 1: Stok & Nilai Aset Modal */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Stok & Nilai Aset Modal Warung</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Katalog seluruh barang, satuan, sisa stok fisik terbaru, harga modal, harga jual, margin keuntungan, dan total rupiah modal aset warung.
              </p>
            </div>
            <button
              onClick={handleExportProductsCsv}
              disabled={exportingProducts}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-emerald-500/40 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingProducts ? 'Mengunduh...' : 'Unduh Data Stok (.CSV)'}</span>
            </button>
          </div>

          {/* Card 2: Riwayat Mutasi Stok */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Riwayat Keluar-Masuk Mutasi Stok</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Log riwayat mutasi stok lengkap secara kronologis: pengurangan akibat penjualan kasir, penambahan restok dari supplier, dan koreksi selisih.
              </p>
            </div>
            <button
              onClick={handleExportMovementsCsv}
              disabled={exportingMovements}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-emerald-500/40 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingMovements ? 'Mengunduh...' : 'Unduh Mutasi Stok (.CSV)'}</span>
            </button>
          </div>
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
