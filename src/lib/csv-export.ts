/**
 * Utilitas Ekspor Data Warung Metal ke Berkas .CSV
 * Dilengkapi UTF-8 BOM (\uFEFF) agar kompatibel 100% dengan Microsoft Excel di Windows,
 * Google Sheets, dan Numbers tanpa karakter rusak.
 */

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""'
  const str = String(val).trim()
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return `"${str}"`
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number | undefined | null)[][]): void {
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface ProductItem {
  name: string
  category: string
  unit: string
  costPrice: number
  sellPrice: number
  stock?: number
  minStock?: number
}

export function downloadProductsCsv(products: ProductItem[], customFilename?: string): void {
  const headers = [
    'Nama Barang',
    'Kategori',
    'Satuan',
    'Harga Modal (Rp)',
    'Harga Jual (Rp)',
    'Margin Keuntungan (Rp)',
    'Sisa Stok',
    'Batas Minimum Stok',
    'Total Nilai Modal Stok (Rp)',
  ]

  const rows = products.map((p) => {
    const stock = p.stock ?? 0
    const margin = p.sellPrice - p.costPrice
    const totalAsset = stock * p.costPrice
    return [
      p.name,
      p.category,
      p.unit,
      p.costPrice,
      p.sellPrice,
      margin,
      stock,
      p.minStock ?? 0,
      totalAsset,
    ]
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  exportToCsv(customFilename || `warung-metal-stok-barang-${dateStr}`, headers, rows)
}

interface SalesItemExport {
  id: string
  total: number
  paid: number
  change: number
  paymentMethod?: string
  payment_method?: string
  createdAt?: number | string
  created_at?: string
  items?: Array<{ name: string; qty: number; sellPrice?: number; sell_price?: number }>
  sale_items?: Array<{ product_name?: string; qty: number; sell_price: number }>
}

export function downloadSalesCsv(sales: SalesItemExport[], customFilename?: string): void {
  const headers = [
    'ID Nota',
    'Tanggal & Waktu',
    'Metode Pembayaran',
    'Total Belanja (Rp)',
    'Nominal Bayar (Rp)',
    'Kembalian (Rp)',
    'Ringkasan Barang',
  ]

  const rows = sales.map((s) => {
    const rawDate = s.createdAt || s.created_at || Date.now()
    const dateFormatted = new Date(rawDate).toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const isQris = s.payment_method === 'qris' || s.paymentMethod === 'qris'
    const method = isQris ? 'QRIS' : 'Tunai'

    // Ringkasan item
    let itemsSummary = ''
    if (s.items && s.items.length > 0) {
      itemsSummary = s.items.map((i) => `${i.name} (${i.qty}x)`).join('; ')
    } else if (s.sale_items && s.sale_items.length > 0) {
      itemsSummary = s.sale_items.map((i) => `${i.product_name ?? 'Barang'} (${i.qty}x)`).join('; ')
    }

    return [
      s.id.slice(0, 8).toUpperCase(),
      dateFormatted,
      method,
      s.total,
      s.paid,
      s.change,
      itemsSummary || '-',
    ]
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  exportToCsv(customFilename || `warung-metal-laporan-penjualan-${dateStr}`, headers, rows)
}

interface MovementItemExport {
  createdAt?: number | string
  created_at?: string
  productName?: string
  type: string
  qtyChange?: number
  qty_change?: number
  reason: string
}

export function downloadMovementsCsv(movements: MovementItemExport[], customFilename?: string): void {
  const headers = [
    'Tanggal & Waktu',
    'Nama Barang',
    'Jenis Mutasi',
    'Jumlah Perubahan',
    'Keterangan / Alasan',
  ]

  const rows = movements.map((m) => {
    const rawDate = m.createdAt || m.created_at || Date.now()
    const dateFormatted = new Date(rawDate).toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const typeLabel =
      m.type === 'sale'
        ? 'Penjualan Kasir'
        : m.type === 'restock'
        ? 'Restok Barang'
        : 'Koreksi Stok'

    const change = m.qtyChange ?? m.qty_change ?? 0
    const changeFormatted = change > 0 ? `+${change}` : `${change}`

    return [
      dateFormatted,
      m.productName || 'Barang',
      typeLabel,
      changeFormatted,
      m.reason,
    ]
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  exportToCsv(customFilename || `warung-metal-mutasi-stok-${dateStr}`, headers, rows)
}
