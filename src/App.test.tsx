import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { db } from './db/schema'
import { createProduct, getStock } from './db/services'

beforeEach(async () => {
  await Promise.all([db.products.clear(), db.sales.clear(), db.saleItems.clear(), db.movements.clear(), db.outbox.clear()])
})
afterEach(cleanup)

const base = { category: 'Makanan', unit: 'pcs', costPrice: 2000, sellPrice: 3500, minStock: 2 }

describe('alur kasir', () => {
  it('jual barang: keranjang, bayar, kembalian, stok berkurang', async () => {
    const p = await createProduct({ ...base, name: 'Indomie Goreng' }, 5, db)
    const user = userEvent.setup()
    render(<MemoryRouter><App /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /Indomie Goreng/ }))
    await user.click(screen.getByRole('button', { name: 'Tambah Indomie Goreng' }))
    expect(screen.getByLabelText('Jumlah Indomie Goreng')).toHaveTextContent('2')

    await user.click(screen.getByRole('button', { name: 'PROSES PEMBAYARAN' }))
    await user.type(screen.getByLabelText('Uang bayar'), '10000')
    await user.click(screen.getByRole('button', { name: /Selesaikan Transaksi/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Rp 3.000')).toBeInTheDocument() // kembalian 10.000 - 7.000
    await waitFor(async () => expect(await getStock(p.id, db)).toBe(3))
  })

  it('barang habis tidak bisa ditambahkan dan stok tidak bisa dilampaui', async () => {
    await createProduct({ ...base, name: 'Kosong' }, 0, db)
    await createProduct({ ...base, name: 'Sisa Satu' }, 1, db)
    const user = userEvent.setup()
    render(<MemoryRouter><App /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: /Kosong/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Sisa Satu/ }))
    await user.click(screen.getByRole('button', { name: 'Tambah Sisa Satu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('hanya 1')
    expect(screen.getByLabelText('Jumlah Sisa Satu')).toHaveTextContent('1')
  })
})
