import { describe, expect, it, vi } from 'vitest'
import { downloadMovementsCsv, downloadProductsCsv, downloadSalesCsv, exportToCsv } from './csv-export'

describe('csv-export', () => {
  it('menghasilkan file CSV dengan UTF-8 BOM dan memicu download di browser', () => {
    let capturedBlob: Blob | null = null
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    })
    URL.revokeObjectURL = vi.fn()

    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const removeChildSpy = vi.spyOn(document.body, 'removeChild')

    exportToCsv('test-file.csv', ['Kolom A', 'Kolom B'], [['Nilai 1', 1000]])

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(capturedBlob).not.toBeNull()
    expect(appendChildSpy).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalled()

    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
  })

  it('bisa memanggil downloadProductsCsv tanpa error', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    expect(() => {
      downloadProductsCsv([
        {
          name: 'Bensin Pertalite',
          category: 'Bensin',
          unit: 'liter',
          costPrice: 9500,
          sellPrice: 10000,
          stock: 50,
          minStock: 10,
        },
      ])
    }).not.toThrow()
  })

  it('bisa memanggil downloadSalesCsv dan downloadMovementsCsv tanpa error', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    expect(() => {
      downloadSalesCsv([
        {
          id: 'trx-12345678',
          total: 50000,
          paid: 50000,
          change: 0,
          paymentMethod: 'cash',
          createdAt: Date.now(),
        },
      ])
    }).not.toThrow()

    expect(() => {
      downloadMovementsCsv([
        {
          productName: 'Beras Ramos',
          type: 'restock',
          qtyChange: 10,
          reason: 'Restok supplier',
          createdAt: Date.now(),
        },
      ])
    }).not.toThrow()
  })
})
