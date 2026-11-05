import { supabase, isSupabaseConfigured } from './supabase'
import type { Product, StockMovement } from './schema'
import { DomainError, type ProductInput } from './services'

export interface CloudProduct {
  id: string
  name: string
  category: string
  unit: string
  cost_price: number
  sell_price: number
  stock: number
  min_stock: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export function toAppProduct(p: CloudProduct): Product & { stock: number } {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    unit: p.unit,
    costPrice: Number(p.cost_price),
    sellPrice: Number(p.sell_price),
    minStock: Number(p.min_stock),
    stock: Number(p.stock),
    isArchived: p.is_archived,
    createdAt: new Date(p.created_at).getTime(),
    updatedAt: new Date(p.updated_at).getTime(),
  }
}

// 1. FETCH PRODUCTS
export async function fetchCloudProducts(): Promise<(Product & { stock: number })[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (error) throw new DomainError(`Gagal mengambil data produk: ${error.message}`)
  return (data || []).map(toAppProduct)
}

// 2. CREATE PRODUCT
export async function createCloudProduct(
  input: ProductInput,
  initialStock = 0
): Promise<Product & { stock: number }> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')

  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert({
      name: input.name,
      category: input.category,
      unit: input.unit,
      cost_price: input.costPrice,
      sell_price: input.sellPrice,
      stock: initialStock,
      min_stock: input.minStock,
      is_archived: false,
    })
    .select()
    .single()

  if (prodErr) throw new DomainError(`Gagal menambah barang: ${prodErr.message}`)

  // Catat riwayat stok awal jika ada
  if (initialStock > 0) {
    await supabase.from('stock_movements').insert({
      product_id: prodData.id,
      type: 'restock',
      qty_change: initialStock,
      reason: 'Stok awal',
    })
  }

  return toAppProduct(prodData)
}

// 3. UPDATE PRODUCT
export async function updateCloudProduct(id: string, input: ProductInput): Promise<void> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')

  const { error } = await supabase
    .from('products')
    .update({
      name: input.name,
      category: input.category,
      unit: input.unit,
      cost_price: input.costPrice,
      sell_price: input.sellPrice,
      min_stock: input.minStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new DomainError(`Gagal memperbarui barang: ${error.message}`)
}

// 4. ARCHIVE PRODUCT
export async function archiveCloudProduct(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')

  const { error } = await supabase
    .from('products')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new DomainError(`Gagal mengarsipkan barang: ${error.message}`)
}

// 5. RESTOCK PRODUCT
export async function restockCloudProduct(
  productId: string,
  qty: number,
  newCostPrice?: number
): Promise<void> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')

  // Ambil data produk saat ini
  const { data: p, error: pErr } = await supabase
    .from('products')
    .select('stock, cost_price')
    .eq('id', productId)
    .single()

  if (pErr || !p) throw new DomainError('Barang tidak ditemukan di cloud')

  const updates: Record<string, unknown> = {
    stock: p.stock + qty,
    updated_at: new Date().toISOString(),
  }
  if (newCostPrice !== undefined && newCostPrice > 0) {
    updates.cost_price = newCostPrice
  }

  const { error: updErr } = await supabase.from('products').update(updates).eq('id', productId)
  if (updErr) throw new DomainError(`Gagal restok barang: ${updErr.message}`)

  // Catat mutasi
  await supabase.from('stock_movements').insert({
    product_id: productId,
    type: 'restock',
    qty_change: qty,
    reason: 'Restok',
  })
}

// 6. ADJUST STOCK
export async function adjustCloudStock(
  productId: string,
  delta: number,
  reason: string
): Promise<void> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')

  const { data: p, error: pErr } = await supabase
    .from('products')
    .select('stock')
    .eq('id', productId)
    .single()

  if (pErr || !p) throw new DomainError('Barang tidak ditemukan di cloud')
  if (p.stock + delta < 0) {
    throw new DomainError(`Stok tidak cukup untuk dikurangi (sisa ${p.stock})`)
  }

  const { error: updErr } = await supabase
    .from('products')
    .update({ stock: p.stock + delta, updated_at: new Date().toISOString() })
    .eq('id', productId)

  if (updErr) throw new DomainError(`Gagal menyesuaikan stok: ${updErr.message}`)

  await supabase.from('stock_movements').insert({
    product_id: productId,
    type: 'adjust',
    qty_change: delta,
    reason,
  })
}

// 7. EXECUTE SALE (RPC / ATOMIC CHECKOUT)
export interface CheckoutCartItem {
  productId: string
  qty: number
}

export async function executeCloudCheckout(
  items: CheckoutCartItem[],
  paid: number,
  paymentMethod: 'cash' | 'qris' = 'cash'
): Promise<{ saleId: string; total: number; change: number }> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')
  if (!items || items.length === 0) throw new DomainError('Keranjang belanja kosong')

  // Ambil detail produk dari cloud
  const productIds = items.map((i) => i.productId)
  const { data: productsData, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds)

  if (prodErr || !productsData) throw new DomainError('Gagal mengambil data produk transaksi')

  const prodMap = new Map(productsData.map((p) => [p.id, p]))

  let total = 0
  const saleId = crypto.randomUUID()
  const saleItemsPayload: unknown[] = []
  const movementsPayload: unknown[] = []

  for (const item of items) {
    const p = prodMap.get(item.productId)
    if (!p) throw new DomainError(`Barang tidak ditemukan (ID: ${item.productId})`)
    if (p.is_archived) throw new DomainError(`Barang ${p.name} telah diarsipkan`)
    if (p.stock < item.qty) {
      throw new DomainError(`Stok ${p.name} tidak cukup (sisa ${p.stock}, dibeli ${item.qty})`)
    }

    const subtotal = Number(p.sell_price) * item.qty
    total += subtotal

    saleItemsPayload.push({
      id: crypto.randomUUID(),
      sale_id: saleId,
      product_id: p.id,
      name: p.name,
      qty: item.qty,
      sell_price: p.sell_price,
      cost_price: p.cost_price,
    })

    movementsPayload.push({
      id: crypto.randomUUID(),
      product_id: p.id,
      type: 'sale',
      qty_change: -item.qty,
      reason: 'Penjualan Kasir',
      sale_id: saleId,
    })
  }

  if (paymentMethod === 'cash' && paid < total) {
    throw new DomainError(`Uang bayar kurang (total: Rp ${total.toLocaleString('id-ID')})`)
  }

  const change = paymentMethod === 'cash' ? paid - total : 0

  const salePayload = {
    id: saleId,
    total,
    paid: paymentMethod === 'cash' ? paid : total,
    change,
    payment_method: paymentMethod,
    created_at: new Date().toISOString(),
  }

  // Panggil RPC checkout_sale
  const { error: rpcErr } = await supabase.rpc('checkout_sale', {
    p_sale: salePayload,
    p_items: saleItemsPayload,
    p_movements: movementsPayload,
  })

  if (rpcErr) {
    // Jika RPC belum dieksekusi di database Supabase pengguna, jalankan fallback multi-query
    console.warn('RPC checkout_sale tidak ditemukan, menggunakan fallback queries:', rpcErr.message)
    await fallbackCheckout(salePayload, saleItemsPayload, movementsPayload, items, prodMap)
  }

  return { saleId, total, change }
}

async function fallbackCheckout(
  salePayload: Record<string, unknown>,
  saleItemsPayload: unknown[],
  movementsPayload: unknown[],
  items: CheckoutCartItem[],
  prodMap: Map<string, CloudProduct>
) {
  const { error: sErr } = await supabase.from('sales').insert(salePayload as any)
  if (sErr) throw new DomainError(`Gagal mencatat transaksi: ${sErr.message}`)

  await supabase.from('sale_items').insert(saleItemsPayload as any)
  await supabase.from('stock_movements').insert(movementsPayload as any)

  for (const item of items) {
    const p = prodMap.get(item.productId)
    if (p) {
      await supabase
        .from('products')
        .update({ stock: p.stock - item.qty, updated_at: new Date().toISOString() })
        .eq('id', p.id)
    }
  }
}

// 8. FETCH REPORT & MOVEMENTS
export async function fetchCloudMovements(): Promise<StockMovement[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new DomainError(`Gagal mengambil riwayat mutasi: ${error.message}`)
  return (data || []).map((m) => ({
    id: m.id,
    productId: m.product_id,
    type: m.type,
    qtyChange: m.qty_change,
    reason: m.reason,
    saleId: m.sale_id,
    createdAt: new Date(m.created_at).getTime(),
    productName: m.products?.name,
  })) as StockMovement[]
}

export async function fetchCloudMovementsByDateRange(startDateIso: string, endDateIso: string): Promise<StockMovement[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, products(name)')
    .gte('created_at', startDateIso)
    .lte('created_at', endDateIso)
    .order('created_at', { ascending: false })

  if (error) throw new DomainError(`Gagal mengambil riwayat mutasi: ${error.message}`)
  return (data || []).map((m) => ({
    id: m.id,
    productId: m.product_id,
    type: m.type,
    qtyChange: m.qty_change,
    reason: m.reason,
    saleId: m.sale_id,
    createdAt: new Date(m.created_at).getTime(),
    productName: m.products?.name,
  })) as StockMovement[]
}

export async function fetchCloudSalesReport(rangeDays = 30) {
  if (!isSupabaseConfigured) return { totalRevenue: 0, totalProfit: 0, count: 0, sales: [] }
  const fromDate = new Date(Date.now() - rangeDays * 86400000).toISOString()

  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .gte('created_at', fromDate)
    .order('created_at', { ascending: false })

  if (sErr) throw new DomainError(`Gagal mengambil laporan penjualan: ${sErr.message}`)

  let totalRevenue = 0
  let totalProfit = 0

  for (const s of sales || []) {
    totalRevenue += Number(s.total)
    for (const item of s.sale_items || []) {
      const profitPerItem = (Number(item.sell_price) - Number(item.cost_price)) * item.qty
      totalProfit += profitPerItem
    }
  }

  return {
    totalRevenue,
    totalProfit,
    count: (sales || []).length,
    sales: sales || [],
  }
}

export async function fetchCloudSalesByDateRange(startDateIso: string, endDateIso: string) {
  if (!isSupabaseConfigured) return { totalRevenue: 0, totalProfit: 0, count: 0, sales: [] }

  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .gte('created_at', startDateIso)
    .lte('created_at', endDateIso)
    .order('created_at', { ascending: false })

  if (sErr) throw new DomainError(`Gagal mengambil laporan penjualan: ${sErr.message}`)

  let totalRevenue = 0
  let totalProfit = 0

  for (const s of sales || []) {
    totalRevenue += Number(s.total)
    for (const item of s.sale_items || []) {
      const profitPerItem = (Number(item.sell_price) - Number(item.cost_price)) * item.qty
      totalProfit += profitPerItem
    }
  }

  return {
    totalRevenue,
    totalProfit,
    count: (sales || []).length,
    sales: sales || [],
  }
}

// 9. SEED CLOUD WARUNG SAMPLE PRODUCTS
export const CLOUD_WARUNG_CATALOG = [
  { name: 'Bensin Pertalite', category: 'Bensin', unit: 'liter', cost_price: 9500, sell_price: 10000, stock: 60, min_stock: 15 },
  { name: 'Beras Ramos 5kg', category: 'Sembako', unit: 'karung', cost_price: 65000, sell_price: 72000, stock: 12, min_stock: 3 },
  { name: 'Minyak Goreng Bimoli 2L', category: 'Sembako', unit: 'pouch', cost_price: 34000, sell_price: 38000, stock: 16, min_stock: 5 },
  { name: 'Rokok Surya 16', category: 'Rokok', unit: 'bungkus', cost_price: 32000, sell_price: 35000, stock: 40, min_stock: 10 },
  { name: 'Rokok Sampoerna Mild', category: 'Rokok', unit: 'bungkus', cost_price: 31000, sell_price: 34000, stock: 35, min_stock: 10 },
  { name: 'Indomie Goreng Spesial', category: 'Makanan', unit: 'bungkus', cost_price: 2900, sell_price: 3500, stock: 80, min_stock: 20 },
  { name: 'Kopi Kapal Api Saset', category: 'Minuman', unit: 'saset', cost_price: 1200, sell_price: 1500, stock: 100, min_stock: 25 },
  { name: 'Aqua Botol 600ml', category: 'Minuman', unit: 'botol', cost_price: 2800, sell_price: 4000, stock: 48, min_stock: 12 },
  { name: 'Telur Ayam Negeri 1kg', category: 'Sembako', unit: 'kg', cost_price: 26000, sell_price: 29000, stock: 25, min_stock: 5 },
  { name: 'Gas Elpiji 3kg (Melon)', category: 'Sembako', unit: 'tabung', cost_price: 19000, sell_price: 22000, stock: 15, min_stock: 4 },
  { name: 'Gula Pasir Gulaku 1kg', category: 'Sembako', unit: 'kg', cost_price: 16000, sell_price: 18000, stock: 20, min_stock: 5 },
  { name: 'Teh Pucuk Harum 350ml', category: 'Minuman', unit: 'botol', cost_price: 3000, sell_price: 4000, stock: 36, min_stock: 10 },
]

export async function seedCloudSampleProducts(): Promise<number> {
  if (!isSupabaseConfigured) throw new DomainError('Supabase belum dikonfigurasi')

  const items = CLOUD_WARUNG_CATALOG.map((item) => ({
    name: item.name,
    category: item.category,
    unit: item.unit,
    cost_price: item.cost_price,
    sell_price: item.sell_price,
    stock: item.stock,
    min_stock: item.min_stock,
    is_archived: false,
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from('products')
    .insert(items)
    .select('id, name, stock')

  if (insertErr) throw new DomainError(`Gagal mengisi katalog Supabase: ${insertErr.message}`)

  // Tambahkan catatan mutasi stok awal
  if (inserted && inserted.length > 0) {
    const movements = inserted.map((p) => ({
      product_id: p.id,
      type: 'restock',
      qty_change: p.stock,
      reason: 'Stok awal katalog warung',
    }))
    await supabase.from('stock_movements').insert(movements)
  }

  return inserted?.length ?? items.length
}

