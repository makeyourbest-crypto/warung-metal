import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { WarungDB } from './schema'
import {
  DomainError,
  adjustStock,
  checkout,
  createProduct,
  dayRange,
  exportBackup,
  getStock,
  getStockMap,
  importBackup,
  restock,
  seedSampleData,
  setArchived,
  summarize,
  topProducts,
  updateProduct,
} from './services'

let db: WarungDB
let n = 0

const base = { category: 'Makanan', unit: 'pcs', costPrice: 2000, sellPrice: 3000, minStock: 2 }

beforeEach(async () => {
  db = new WarungDB(`test-${++n}`)
  await db.open()
})

describe('produk', () => {
  it('membuat barang dengan stok awal sebagai mutasi + outbox', async () => {
    const p = await createProduct({ ...base, name: 'Indomie' }, 10, db)
    expect(await getStock(p.id, db)).toBe(10)
    expect(await db.outbox.count()).toBe(2) // product + movement
  })

  it('menolak input tidak valid', async () => {
    await expect(createProduct({ ...base, name: ' ' }, 0, db)).rejects.toThrow(DomainError)
    await expect(createProduct({ ...base, name: 'x', sellPrice: 0 }, 0, db)).rejects.toThrow('lebih dari 0')
    await expect(createProduct({ ...base, name: 'x', sellPrice: 10.5 }, 0, db)).rejects.toThrow(DomainError)
    await expect(createProduct({ ...base, name: 'x' }, -1, db)).rejects.toThrow(DomainError)
  })

  it('menolak angka tak masuk akal (overflow)', async () => {
    await expect(createProduct({ ...base, name: 'x', sellPrice: 2_000_000_000 }, 0, db)).rejects.toThrow('terlalu besar')
    const p = await createProduct({ ...base, name: 'y' }, 1, db)
    await expect(restock(p.id, 10_000_000, undefined, db)).rejects.toThrow('terlalu besar')
  })

  it('update dan arsip', async () => {
    const p = await createProduct({ ...base, name: 'A' }, 1, db)
    await updateProduct(p.id, { ...base, name: 'B', sellPrice: 4000 }, db)
    expect((await db.products.get(p.id))?.name).toBe('B')
    await setArchived(p.id, true, db)
    expect((await db.products.get(p.id))?.isArchived).toBe(true)
    await expect(updateProduct('nope', { ...base, name: 'B' }, db)).rejects.toThrow('tidak ditemukan')
  })
})

describe('restok & koreksi', () => {
  it('restok menambah stok dan bisa update harga modal', async () => {
    const p = await createProduct({ ...base, name: 'A' }, 1, db)
    await restock(p.id, 5, 2500, db)
    expect(await getStock(p.id, db)).toBe(6)
    expect((await db.products.get(p.id))?.costPrice).toBe(2500)
  })

  it('restok menolak jumlah <= 0 / pecahan', async () => {
    const p = await createProduct({ ...base, name: 'A' }, 1, db)
    await expect(restock(p.id, 0, undefined, db)).rejects.toThrow(DomainError)
    await expect(restock(p.id, 1.5, undefined, db)).rejects.toThrow(DomainError)
  })

  it('koreksi wajib alasan dan tidak boleh membuat stok minus', async () => {
    const p = await createProduct({ ...base, name: 'A' }, 3, db)
    await expect(adjustStock(p.id, -1, '  ', db)).rejects.toThrow('Alasan')
    await expect(adjustStock(p.id, -4, 'rusak', db)).rejects.toThrow('tidak cukup')
    await adjustStock(p.id, -2, 'rusak', db)
    expect(await getStock(p.id, db)).toBe(1)
  })
})

describe('checkout', () => {
  it('menyimpan penjualan, memotong stok, menghitung kembalian', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 10, db)
    const b = await createProduct({ ...base, name: 'B', sellPrice: 5000 }, 5, db)
    const sale = await checkout(
      [
        { productId: a.id, qty: 2 },
        { productId: b.id, qty: 1 },
      ],
      20000,
      db,
    )
    expect(sale.total).toBe(11000)
    expect(sale.change).toBe(9000)
    expect(await getStock(a.id, db)).toBe(8)
    expect(await getStock(b.id, db)).toBe(4)
    expect(await db.saleItems.count()).toBe(2)
  })

  it('menolak jika stok kurang dan tidak menyimpan apa pun', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 10, db)
    const b = await createProduct({ ...base, name: 'B' }, 1, db)
    await expect(
      checkout(
        [
          { productId: a.id, qty: 2 },
          { productId: b.id, qty: 2 },
        ],
        100000,
        db,
      ),
    ).rejects.toThrow('Isi stok dulu')
    expect(await getStock(a.id, db)).toBe(10)
    expect(await db.sales.count()).toBe(0)
  })

  it('menggabungkan baris yang sama saat memeriksa stok', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 3, db)
    await expect(
      checkout(
        [
          { productId: a.id, qty: 2 },
          { productId: a.id, qty: 2 },
        ],
        100000,
        db,
      ),
    ).rejects.toThrow('tidak cukup')
  })

  it('menolak uang kurang, keranjang kosong, qty tidak valid, barang diarsip', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 10, db)
    await expect(checkout([{ productId: a.id, qty: 1 }], 2999, db)).rejects.toThrow('kurang')
    await expect(checkout([], 0, db)).rejects.toThrow('kosong')
    await expect(checkout([{ productId: a.id, qty: 0 }], 5000, db)).rejects.toThrow(DomainError)
    await setArchived(a.id, true, db)
    await expect(checkout([{ productId: a.id, qty: 1 }], 5000, db)).rejects.toThrow('tidak tersedia')
    expect(await getStock(a.id, db)).toBe(10)
  })

  it('dua checkout bersamaan untuk stok terakhir: hanya satu berhasil', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 1, db)
    const results = await Promise.allSettled([
      checkout([{ productId: a.id, qty: 1 }], 3000, db),
      checkout([{ productId: a.id, qty: 1 }], 3000, db),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await getStock(a.id, db)).toBe(0)
  })

  it('harga lama di transaksi tidak berubah saat harga barang diubah', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 5, db)
    await checkout([{ productId: a.id, qty: 1 }], 3000, db)
    await updateProduct(a.id, { ...base, name: 'A', sellPrice: 9000 }, db)
    const [item] = await db.saleItems.toArray()
    expect(item.sellPrice).toBe(3000)
  })
})

describe('laporan', () => {
  it('omzet, laba, dan terlaris', async () => {
    const a = await createProduct({ ...base, name: 'A' }, 10, db) // laba 1000
    const b = await createProduct({ ...base, name: 'B', costPrice: 1000, sellPrice: 1500 }, 10, db) // laba 500
    await checkout([{ productId: a.id, qty: 2 }, { productId: b.id, qty: 5 }], 20000, db)
    const [from, to] = dayRange(new Date())
    const s = await summarize(from, to, db)
    expect(s).toEqual({ count: 1, revenue: 6000 + 7500, profit: 2000 + 2500 })
    const top = await topProducts(from, to, 5, db)
    expect(top[0]).toEqual({ name: 'B', qty: 5 })
    const [pf, pt] = dayRange(new Date(Date.now() - 2 * 86400000))
    expect((await summarize(pf, pt, db)).count).toBe(0)
  })
})

describe('cadangan', () => {
  it('ekspor lalu impor memulihkan data persis', async () => {
    await seedSampleData(db)
    const [p] = await db.products.toArray()
    await checkout([{ productId: p.id, qty: 3 }], p.sellPrice * 3 + 10000, db)
    const json = await exportBackup(db)
    const stockBefore = [...(await getStockMap(db)).entries()].sort()

    const other = new WarungDB(`test-${++n}`)
    await other.open()
    await importBackup(json, other)
    expect([...(await getStockMap(other)).entries()].sort()).toEqual(stockBefore)
    expect(await other.sales.count()).toBe(1)
  })

  it('menolak cadangan yang tidak konsisten', async () => {
    await seedSampleData(db)
    const data = JSON.parse(await exportBackup(db))
    data.movements[0].productId = 'tidak-ada'
    await expect(importBackup(JSON.stringify(data), db)).rejects.toThrow('tidak konsisten')
    expect(await db.products.count()).toBe(8)
  })

  it('menolak berkas rusak dan data lama tetap utuh', async () => {
    await seedSampleData(db)
    await expect(importBackup('bukan json', db)).rejects.toThrow('JSON')
    await expect(importBackup('{"app":"lain"}', db)).rejects.toThrow('tidak valid')
    expect(await db.products.count()).toBe(8)
  })
})
