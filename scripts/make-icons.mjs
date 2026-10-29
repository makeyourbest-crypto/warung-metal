// Membuat ikon PWA (PNG polos: latar baja gelap + huruf "W" oranye) tanpa dependensi.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c, crc = ~0
  for (const b of buf) {
    c = (crc ^ b) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size) {
  const bg = [0x11, 0x13, 0x15], fg = [0xff, 0x7a, 0x1a]
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const inW = (x, y) => {
    // huruf W dari 4 batang diagonal, area aman 20%-80%
    const u = (x / size - 0.2) / 0.6, v = (y / size - 0.25) / 0.5
    if (u < 0 || u > 1 || v < 0 || v > 1) return false
    const t = 0.09
    const stroke = (x0, x1) => Math.abs(u - (x0 + (x1 - x0) * v)) < t
    return stroke(0, 0.25) || stroke(0.5, 0.25) || stroke(0.5, 0.75) || stroke(1, 0.75)
  }
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const c = inW(x, y) ? fg : bg
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
for (const s of [192, 512]) writeFileSync(`public/pwa-${s}.png`, png(s))
writeFileSync('public/apple-touch-icon.png', png(180))
console.log('ikon dibuat')

