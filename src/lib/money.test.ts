import { describe, expect, it } from 'vitest'
import { formatRupiah, parseRupiah } from './money'

describe('money', () => {
  it('memformat Rupiah', () => {
    expect(formatRupiah(3500)).toBe('Rp 3.500')
    expect(formatRupiah(0)).toBe('Rp 0')
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000')
  })
  it('mem-parse input', () => {
    expect(parseRupiah('Rp 3.500')).toBe(3500)
    expect(parseRupiah('12000')).toBe(12000)
    expect(parseRupiah('')).toBeNaN()
    expect(parseRupiah('abc')).toBeNaN()
  })
})
