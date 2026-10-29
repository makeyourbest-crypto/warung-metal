const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

/** Format bilangan bulat Rupiah, contoh: 3500 -> "Rp 3.500". */
export function formatRupiah(value: number): string {
  return rupiah.format(value).replace(/\u00a0/g, ' ')
}

/** Ubah input teks ("3.500", "Rp 3500") menjadi bilangan bulat; NaN jika kosong. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, '')
  return digits === '' ? Number.NaN : Number.parseInt(digits, 10)
}
