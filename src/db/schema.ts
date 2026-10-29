import Dexie, { type EntityTable } from 'dexie'

/**
 * Semua ID adalah UUID dan semua uang adalah bilangan bulat Rupiah.
 * Stok TIDAK disimpan sebagai angka: stok = jumlah semua `StockMovement`.
 * Setiap perubahan juga dicatat di `outbox` agar Fase 2 (Supabase) tinggal mengirimnya.
 */
export interface Product {
  id: string
  name: string
  category: string
  unit: string
  costPrice: number
  sellPrice: number
  minStock: number
  isArchived: boolean
  createdAt: number
  updatedAt: number
}

export interface Sale {
  id: string
  createdAt: number
  total: number
  paid: number
  change: number
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  name: string
  qty: number
  /** Salinan harga saat transaksi, agar laporan lama tidak berubah. */
  sellPrice: number
  costPrice: number
}

export type MovementType = 'sale' | 'restock' | 'adjust'

export interface StockMovement {
  id: string
  productId: string
  type: MovementType
  /** Positif = stok masuk, negatif = stok keluar. */
  qtyChange: number
  reason: string
  saleId?: string
  createdAt: number
}

export type OutboxEntity = 'products' | 'sales' | 'sale_items' | 'stock_movements'

export interface OutboxItem {
  seq?: number
  entity: OutboxEntity
  entityId: string
  op: 'upsert'
  createdAt: number
}

export class WarungDB extends Dexie {
  products!: EntityTable<Product, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleItems!: EntityTable<SaleItem, 'id'>
  movements!: EntityTable<StockMovement, 'id'>
  outbox!: EntityTable<OutboxItem, 'seq'>

  constructor(name = 'warung-metal') {
    super(name)
    this.version(1).stores({
      products: 'id, name, category, isArchived',
      sales: 'id, createdAt',
      saleItems: 'id, saleId, productId',
      movements: 'id, productId, createdAt, type',
      outbox: '++seq, entity',
    })
  }
}

export const db = new WarungDB()
