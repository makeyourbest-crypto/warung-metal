import { z } from 'zod'
import {
  db as defaultDb,
  type OutboxEntity,
  type Product,
  type Sale,
  type SaleItem,
  type StockMovement,
  type WarungDB,
} from './schema'

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

const MAX_RUPIAH = 1_000_000_000
const MAX_QTY = 1_000_000
const rupiahInt = z.number().int('Harus bilangan bulat').min(0, 'Tidak boleh negatif').max(MAX_RUPIAH, 'Angka terlalu besar')

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi').max(80, 'Nama terlalu panjang'),
  category: z.string().trim().max(40).default('Lainnya'),
  unit: z.string().trim().min(1, 'Satuan wajib diisi').max(20),
  costPrice: rupiahInt,
  sellPrice: z.number().int('Harus bilangan bulat').min(1, 'Harga jual harus lebih dari 0').max(MAX_RUPIAH, 'Angka terlalu besar'),
  minStock: rupiahInt,
})
export type ProductInput = z.input<typeof productInputSchema>

const uuid = () => crypto.randomUUID()

function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data)
  if (!r.success) throw new DomainError(r.error.issues[0]?.message ?? 'Input tidak valid')
  return r.data
}

function positiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new DomainError(`${label} harus bilangan bulat lebih dari 0`)
  if (value > MAX_QTY) throw new DomainError(`${label} terlalu besar`)
}

async function queue(db: WarungDB, entity: OutboxEntity, ids: string[]): Promise<void> {
  const now = Date.now()
  await db.outbox.bulkAdd(ids.map((entityId) => ({ entity, entityId, op: 'upsert' as const, createdAt: now })))
}

/** Stok = jumlah seluruh mutasi. */
export async function getStockMap(db: WarungDB = defaultDb): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  await db.movements.each((m) => map.set(m.productId, (map.get(m.productId) ?? 0) + m.qtyChange))
  return map
}

export async function getStock(productId: string, db: WarungDB = defaultDb): Promise<number> {
  let total = 0
  await db.movements.where('productId').equals(productId).each((m) => {
    total += m.qtyChange
  })
  return total
}

async function writeMovement(
  db: WarungDB,
  m: Omit<StockMovement, 'id' | 'createdAt'> & { createdAt?: number },
): Promise<StockMovement> {
  const movement: StockMovement = { id: uuid(), createdAt: Date.now(), ...m }
  await db.movements.add(movement)
  await queue(db, 'stock_movements', [movement.id])
  return movement
}

export async function createProduct(
  input: ProductInput,
  initialStock = 0,
  db: WarungDB = defaultDb,
): Promise<Product> {
  const data = parse(productInputSchema, input)
  if (!Number.isInteger(initialStock) || initialStock < 0 || initialStock > MAX_QTY) throw new DomainError('Stok awal tidak valid')
  const now = Date.now()
  const product: Product = { id: uuid(), ...data, isArchived: false, createdAt: now, updatedAt: now }
  await db.transaction('rw', [db.products, db.movements, db.outbox], async () => {
    await db.products.add(product)
    await queue(db, 'products', [product.id])
    if (initialStock > 0) {
      await writeMovement(db, { productId: product.id, type: 'restock', qtyChange: initialStock, reason: 'Stok awal' })
    }
  })
  return product
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  db: WarungDB = defaultDb,
): Promise<void> {
  const data = parse(productInputSchema, input)
  await db.transaction('rw', [db.products, db.outbox], async () => {
    const existing = await db.products.get(id)
    if (!existing) throw new DomainError('Barang tidak ditemukan')
    await db.products.put({ ...existing, ...data, updatedAt: Date.now() })
    await queue(db, 'products', [id])
  })
}

export async function setArchived(id: string, isArchived: boolean, db: WarungDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.products, db.outbox], async () => {
    const existing = await db.products.get(id)
    if (!existing) throw new DomainError('Barang tidak ditemukan')
    await db.products.put({ ...existing, isArchived, updatedAt: Date.now() })
    await queue(db, 'products', [id])
  })
}

export async function restock(
  productId: string,
  qty: number,
  newCostPrice?: number,
  db: WarungDB = defaultDb,
): Promise<void> {
  positiveInt(qty, 'Jumlah')
  if (newCostPrice !== undefined) parse(rupiahInt, newCostPrice)
  await db.transaction('rw', [db.products, db.movements, db.outbox], async () => {
    const p = await db.products.get(productId)
    if (!p) throw new DomainError('Barang tidak ditemukan')
    if (newCostPrice !== undefined && newCostPrice !== p.costPrice) {
      await db.products.put({ ...p, costPrice: newCostPrice, updatedAt: Date.now() })
      await queue(db, 'products', [p.id])
    }
    await writeMovement(db, { productId, type: 'restock', qtyChange: qty, reason: 'Restok' })
  })
}

/** Koreksi stok (rusak, hilang, hitung ulang). `delta` boleh negatif. Alasan wajib. Stok tidak boleh jadi minus. */
export async function adjustStock(
  productId: string,
  delta: number,
  reason: string,
  db: WarungDB = defaultDb,
): Promise<void> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_QTY) throw new DomainError('Perubahan stok harus bilangan bulat selain 0')
  const why = reason.trim()
  if (!why) throw new DomainError('Alasan wajib diisi')
  await db.transaction('rw', [db.products, db.movements, db.outbox], async () => {
    if (!(await db.products.get(productId))) throw new DomainError('Barang tidak ditemukan')
    const stock = await getStock(productId, db)
    if (stock + delta < 0) throw new DomainError(`Stok tidak cukup untuk dikurangi (stok sekarang ${stock})`)
    await writeMovement(db, { productId, type: 'adjust', qtyChange: delta, reason: why })
  })
}

export interface CartLine {
  productId: string
  qty: number
}

export function calcTotal(lines: { qty: number; sellPrice: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.sellPrice, 0)
}

/**
 * Simpan transaksi dalam SATU transaksi database:
 * penjualan + item + mutasi stok + outbox. Gagal sebagian = tidak ada yang tersimpan.
 * Barang yang stoknya kurang ditolak.
 */
export async function checkout(
  cart: CartLine[],
  paid: number,
  db: WarungDB = defaultDb,
): Promise<Sale> {
  if (cart.length === 0) throw new DomainError('Keranjang kosong')
  if (!Number.isInteger(paid) || paid < 0 || paid > MAX_RUPIAH * 10) throw new DomainError('Uang bayar tidak valid')

  // Gabungkan baris dengan barang yang sama.
  const merged = new Map<string, number>()
  for (const l of cart) {
    positiveInt(l.qty, 'Jumlah')
    merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.qty)
  }

  return db.transaction('rw', [db.products, db.sales, db.saleItems, db.movements, db.outbox], async () => {
    const saleId = uuid()
    const now = Date.now()
    const items: SaleItem[] = []
    for (const [productId, qty] of merged) {
      const p = await db.products.get(productId)
      if (!p || p.isArchived) throw new DomainError('Ada barang yang tidak tersedia')
      const stock = await getStock(productId, db)
      if (stock < qty) {
        throw new DomainError(`Stok ${p.name} tidak cukup (sisa ${stock}). Isi stok dulu.`)
      }
      items.push({
        id: uuid(),
        saleId,
        productId,
        name: p.name,
        qty,
        sellPrice: p.sellPrice,
        costPrice: p.costPrice,
      })
    }
    const total = calcTotal(items)
    if (paid < total) throw new DomainError('Uang bayar kurang dari total')
    const sale: Sale = { id: saleId, createdAt: now, total, paid, change: paid - total }
    await db.sales.add(sale)
    await db.saleItems.bulkAdd(items)
    await queue(db, 'sales', [saleId])
    await queue(db, 'sale_items', items.map((i) => i.id))
    for (const i of items) {
      await writeMovement(db, {
        productId: i.productId,
        type: 'sale',
        qtyChange: -i.qty,
        reason: 'Penjualan',
        saleId,
        createdAt: now,
      })
    }
    return sale
  })
}

/* ---------- Laporan ---------- */

export interface DailySummary {
  count: number
  revenue: number
  profit: number
}

export async function summarize(from: number, to: number, db: WarungDB = defaultDb): Promise<DailySummary> {
  const sales = await db.sales.where('createdAt').between(from, to, true, false).toArray()
  const ids = new Set(sales.map((s) => s.id))
  let profit = 0
  await db.saleItems.each((i) => {
    if (ids.has(i.saleId)) profit += (i.sellPrice - i.costPrice) * i.qty
  })
  return { count: sales.length, revenue: sales.reduce((s, x) => s + x.total, 0), profit }
}

export async function topProducts(
  from: number,
  to: number,
  limit = 5,
  db: WarungDB = defaultDb,
): Promise<{ name: string; qty: number }[]> {
  const sales = await db.sales.where('createdAt').between(from, to, true, false).toArray()
  const ids = new Set(sales.map((s) => s.id))
  const acc = new Map<string, { name: string; qty: number }>()
  await db.saleItems.each((i) => {
    if (!ids.has(i.saleId)) return
    const cur = acc.get(i.productId) ?? { name: i.name, qty: 0 }
    cur.qty += i.qty
    acc.set(i.productId, cur)
  })
  return [...acc.values()].sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export function dayRange(date: Date): [number, number] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  return [start, end]
}

/* ---------- Cadangan JSON ---------- */

const BACKUP_VERSION = 1

export async function exportBackup(db: WarungDB = defaultDb): Promise<string> {
  const data = {
    app: 'warung-metal',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    products: await db.products.toArray(),
    sales: await db.sales.toArray(),
    saleItems: await db.saleItems.toArray(),
    movements: await db.movements.toArray(),
  }
  return JSON.stringify(data)
}

const backupSchema = z.object({
  app: z.literal('warung-metal'),
  version: z.literal(BACKUP_VERSION),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      unit: z.string(),
      costPrice: z.number().int(),
      sellPrice: z.number().int(),
      minStock: z.number().int(),
      isArchived: z.boolean(),
      createdAt: z.number(),
      updatedAt: z.number(),
    }),
  ),
  sales: z.array(
    z.object({ id: z.string(), createdAt: z.number(), total: z.number(), paid: z.number(), change: z.number() }),
  ),
  saleItems: z.array(
    z.object({
      id: z.string(),
      saleId: z.string(),
      productId: z.string(),
      name: z.string(),
      qty: z.number().int(),
      sellPrice: z.number().int(),
      costPrice: z.number().int(),
    }),
  ),
  movements: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      type: z.enum(['sale', 'restock', 'adjust']),
      qtyChange: z.number().int(),
      reason: z.string(),
      saleId: z.string().optional(),
      createdAt: z.number(),
    }),
  ),
})

/** Mengganti SELURUH data dengan isi berkas cadangan (divalidasi dulu; gagal = data lama utuh). */
export async function importBackup(json: string, db: WarungDB = defaultDb): Promise<void> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new DomainError('Berkas bukan JSON yang valid')
  }
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) throw new DomainError('Berkas cadangan tidak valid atau bukan dari Warung Metal')
  const d = parsed.data
  const productIds = new Set(d.products.map((p) => p.id))
  const saleIds = new Set(d.sales.map((s) => s.id))
  const stock = new Map<string, number>()
  for (const m of d.movements) stock.set(m.productId, (stock.get(m.productId) ?? 0) + m.qtyChange)
  if (
    d.movements.some((m) => !productIds.has(m.productId)) ||
    d.saleItems.some((i) => !productIds.has(i.productId) || !saleIds.has(i.saleId)) ||
    [...stock.values()].some((v) => v < 0)
  ) {
    throw new DomainError('Isi cadangan tidak konsisten (referensi hilang atau stok minus)')
  }
  await db.transaction('rw', [db.products, db.sales, db.saleItems, db.movements, db.outbox], async () => {
    await Promise.all([db.products.clear(), db.sales.clear(), db.saleItems.clear(), db.movements.clear(), db.outbox.clear()])
    await db.products.bulkAdd(d.products)
    await db.sales.bulkAdd(d.sales)
    await db.saleItems.bulkAdd(d.saleItems)
    await db.movements.bulkAdd(d.movements)
    await queue(db, 'products', d.products.map((x) => x.id))
    await queue(db, 'sales', d.sales.map((x) => x.id))
    await queue(db, 'sale_items', d.saleItems.map((x) => x.id))
    await queue(db, 'stock_movements', d.movements.map((x) => x.id))
  })
}

export const SAMPLE_PRODUCTS: (ProductInput & { stock: number })[] = [
  { name: 'Indomie Goreng', category: 'Makanan', unit: 'bungkus', costPrice: 2800, sellPrice: 3500, minStock: 10, stock: 40 },
  { name: 'Kopi Kapal Api Saset', category: 'Minuman', unit: 'saset', costPrice: 1200, sellPrice: 1500, minStock: 20, stock: 60 },
  { name: 'Aqua 600ml', category: 'Minuman', unit: 'botol', costPrice: 2800, sellPrice: 4000, minStock: 12, stock: 24 },
  { name: 'Gula Pasir 1kg', category: 'Sembako', unit: 'kg', costPrice: 15000, sellPrice: 17000, minStock: 5, stock: 10 },
  { name: 'Beras 5kg', category: 'Sembako', unit: 'karung', costPrice: 65000, sellPrice: 72000, minStock: 3, stock: 6 },
  { name: 'Minyak Goreng 1L', category: 'Sembako', unit: 'liter', costPrice: 16000, sellPrice: 18000, minStock: 5, stock: 12 },
  { name: 'Rokok Kretek 12', category: 'Rokok', unit: 'bungkus', costPrice: 22000, sellPrice: 25000, minStock: 10, stock: 30 },
  { name: 'Teh Botol 450ml', category: 'Minuman', unit: 'botol', costPrice: 3500, sellPrice: 5000, minStock: 10, stock: 18 },
]

export async function seedSampleData(db: WarungDB = defaultDb): Promise<void> {
  for (const { stock, ...p } of SAMPLE_PRODUCTS) await createProduct(p, stock, db)
}
