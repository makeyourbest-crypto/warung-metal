import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Product } from '../db/schema'

export interface ProductRow extends Product {
  stock: number
}

/** Barang + stok (dihitung dari mutasi), otomatis ter-update saat data berubah. */
export function useProducts(includeArchived = false): ProductRow[] | undefined {
  return useLiveQuery(async () => {
    const [products, movements] = await Promise.all([db.products.toArray(), db.movements.toArray()])
    const stock = new Map<string, number>()
    for (const m of movements) stock.set(m.productId, (stock.get(m.productId) ?? 0) + m.qtyChange)
    return products
      .filter((p) => includeArchived || !p.isArchived)
      .map((p) => ({ ...p, stock: stock.get(p.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [includeArchived])
}

export type StockLevel = 'empty' | 'low' | 'ok'
export function stockLevel(p: Pick<ProductRow, 'stock' | 'minStock'>): StockLevel {
  if (p.stock <= 0) return 'empty'
  if (p.stock <= p.minStock) return 'low'
  return 'ok'
}
