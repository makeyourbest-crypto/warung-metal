import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Product } from '../db/schema'
import { isSupabaseConfigured, supabase } from '../db/supabase'
import { fetchCloudProducts } from '../db/supabase-services'

export interface ProductRow extends Product {
  stock: number
}

export type StockLevel = 'empty' | 'low' | 'ok'
export function stockLevel(p: Pick<ProductRow, 'stock' | 'minStock'>): StockLevel {
  if (p.stock <= 0) return 'empty'
  if (p.stock <= p.minStock) return 'low'
  return 'ok'
}

/** Barang + stok: Menggunakan Supabase Cloud jika dikonfigurasi, atau Dexie lokal jika offline. */
export function useProducts(includeArchived = false): {
  products: ProductRow[] | undefined
  loading: boolean
  reload: () => Promise<void>
} {
  const isCloud = isSupabaseConfigured && import.meta.env.MODE !== 'test'
  const [cloudProducts, setCloudProducts] = useState<ProductRow[] | undefined>(undefined)
  const [cloudLoading, setCloudLoading] = useState(isCloud)

  const reloadCloud = async () => {
    if (!isCloud) return
    try {
      const data = await fetchCloudProducts()
      setCloudProducts(data)
    } catch (e) {
      console.error('Error fetching products from cloud:', e)
    } finally {
      setCloudLoading(false)
    }
  }

  useEffect(() => {
    if (!isCloud) return
    reloadCloud()

    // Realtime channel listener untuk update multi-device
    const channel = supabase
      .channel('public:products')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          reloadCloud()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Dexie fallback
  const localProducts = useLiveQuery(async () => {
    if (isCloud) return undefined
    const [products, movements] = await Promise.all([db.products.toArray(), db.movements.toArray()])
    const stock = new Map<string, number>()
    for (const m of movements) stock.set(m.productId, (stock.get(m.productId) ?? 0) + m.qtyChange)
    return products
      .filter((p) => includeArchived || !p.isArchived)
      .map((p) => ({ ...p, stock: stock.get(p.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [includeArchived])

  if (isCloud) {
    return {
      products: cloudProducts,
      loading: cloudLoading,
      reload: reloadCloud,
    }
  }

  return {
    products: localProducts,
    loading: localProducts === undefined,
    reload: async () => {},
  }
}
