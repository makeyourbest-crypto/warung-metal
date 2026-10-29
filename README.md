# Warung Metal 🤘

Aplikasi kasir warung (React + TypeScript + Vite). **Fase 1: offline penuh**, data di browser (IndexedDB via Dexie), bisa di-install sebagai PWA.

## Fitur
Kasir (keranjang, kembalian, tolak jika stok kurang) · Barang (tambah/ubah/arsip, harga modal & jual) · Stok (restok, koreksi wajib alasan, perlu belanja, riwayat) · Laporan harian (omzet, laba kotor, terlaris) · Cadangan JSON.

## Perintah
```
npm install
npm run dev        # jalankan lokal
npm test           # tes (logika + alur kasir)
npm run typecheck
npm run lint
npm run build && npm run preview
```

## Desain data
- Stok **tidak disimpan sebagai angka**: stok = jumlah semua `stock_movements` (jual −, restok +, koreksi ±).
- ID = UUID; uang = bilangan bulat Rupiah; harga disalin ke item transaksi.
- Setiap perubahan dicatat di tabel `outbox` untuk Fase 2 (sinkron ke Supabase).

## Batasan Fase 1
Data hanya di satu perangkat/browser dan belum ada login. Rajin unduh cadangan (Setelan).
