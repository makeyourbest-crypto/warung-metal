# Rancangan Desain: Modernisasi UI & Migrasi Cloud Database (Supabase) Warung Metal

**Tanggal:** 02 November 2026  
**Status:** Menunggu Persetujuan Pengguna  

---

## 1. Latar Belakang & Tujuan (Intent & The Why)
Aplikasi kasir **Warung Metal** saat ini sudah memiliki fungsionalitas dasar yang lengkap (katalog barang, mutasi stok, kasir hitung kembalian, dan laporan). Namun, terdapat dua kendala utama:
1. **Risiko Kehilangan Data:** Penyimpanan saat ini berbasis *browser storage* (IndexedDB). Jika browser di-reset, riwayat/cache dibersihkan, atau pengguna berganti perangkat, seluruh data transaksi dan katalog barang berisiko hilang.
2. **Tampilan UI Kaku/Kurang Menarik:** Antarmuka kasir dan dasbor saat ini masih utilitarian dan kurang modern. Pengguna menginginkan UI yang menarik, ergonomis untuk layar kasir/laptop/HP, rapi, dan memberikan impresi aplikasi Point of Sale (POS) profesional.

Tujuannya adalah mentransformasikan Warung Metal menjadi aplikasi web kasir modern dengan antarmuka yang memikat, cepat digunakan, serta didukung oleh database cloud yang permanen dan aman (**Supabase PostgreSQL**).

---

## 2. Tujuan, Batasan & Anti-Tujuan

### Goals (Tujuan Utama)
1. **Penyimpanan Permanen di Cloud:** Menggantikan IndexedDB sebagai penyimpan utama dengan **Supabase PostgreSQL**. Data tersimpan aman di cloud dan dapat diakses dari laptop kasir maupun HP pemilik warung secara *real-time*.
2. **Redesain Total Antarmuka (Modern POS UI):**
   - Layout kasir terbagi dua: grid katalog barang yang visual & interaktif di sebelah kiri, dan keranjang belanja/struk yang dinamis di sebelah kanan.
   - Tipografi angka harga yang jelas, kartu produk dengan badge stok & kategori yang estetik.
   - Desain responsif: nyaman diakses di layar laptop/tablet maupun HP.
   - Pilihan tema visual yang segar, bersih, dan profesional dengan palet warna modern.
3. **Penyediaan Skema Database Siap Pakai:** Menyediakan skrip SQL lengkap untuk tabel `products`, `sales`, `sale_items`, dan `stock_movements` yang tinggal dijalankan (1-klik run) di Supabase SQL Editor.
4. **Graceful Setup & Fallback:** Jika pengguna belum memasukkan kredensial Supabase (`.env`), aplikasi menampilkan layar panduan setup interaktif yang ramah tanpa membuat aplikasi crash.

### Non-Goals (Bukan Bagian dari Rilis Ini)
1. Integrasi otomatis payment gateway pihak ketiga (seperti integrasi API bank/Midtrans untuk QRIS dinamis). Pembayaran tetap mencakup Tunai dan pencatatan manual QRIS/Transfer.
2. Manajemen multi-cabang/warung waralaba (fokus pada 1 entitas warung dengan multi-perangkat kasir).

### Anti-Goals (Hal yang Harus Dihindari)
1. **Lag saat Transaksi:** Kasir tidak boleh terasa lambat atau ada jeda *loading* berlebihan saat menekan tombol barang. Operasi keranjang belanja harus instan di memori lokal sebelum dikirim ke database.
2. **Kompleksitas Berlebih bagi Penjaga Warung:** Form input dan alur transaksi kasir tidak boleh berbelit-belit.

---

## 3. Pendekatan yang Dipertimbangkan (Approaches)

Tiga pendekatan arsitektur telah didiskusikan:

1. **Pendekatan 1: Cloud-First Database (Supabase PostgreSQL) — DIPILIH**
   - *Mekanisme:* Seluruh data disimpan langsung di Supabase cloud database. Web frontend berinteraksi menggunakan `@supabase/supabase-js`.
   - *Kelebihan:* Data 100% aman dari laptop mati atau browser terhapus, dapat diakses dari HP pemilik, gratis, dan sangat mudah dirawat.
   - *Kelemahan:* Membutuhkan koneksi internet harian.
   - *Alasan Dipilih:* Sesuai keputusan pengguna yang memprioritaskan keamanan data absolut dan kemudahan akses multi-perangkat.

2. **Pendekatan 2: Server Backend Lokal (SQLite)**
   - *Mekanisme:* Menjalankan server Node.js lokal dengan file `warung.db` di harddisk kasir.
   - *Kelebihan:* 100% offline tanpa kuota.
   - *Kelemahan:* Pemilik tidak bisa memantau transaksi dari HP di luar warung; risiko harddisk laptop rusak.

3. **Pendekatan 3: Hybrid Offline-First Sync**
   - *Mekanisme:* Simpan lokal terlebih dahulu, lalu ada engine sinkronisasi dua arah ke cloud saat online.
   - *Kelebihan:* Tahan mati internet sekaligus ter-backup ke cloud.
   - *Kelemahan:* Arsitektur penyelesaian konflik data (*conflict resolution*) sangat rumit untuk tahap saat ini.

---

## 4. Rincian Teknis & Rencana Arsitektur

### A. Skema Database Supabase (PostgreSQL)
Tabel dibuat relasional dengan foreign key dan timestamp otomatis:
- `products`: `id (uuid, PK)`, `name`, `category`, `unit`, `cost_price (numeric)`, `sell_price (numeric)`, `stock (integer, default 0)`, `min_stock (integer, default 5)`, `is_archived (boolean, default false)`, `created_at`, `updated_at`.
- `sales`: `id (uuid, PK)`, `total (numeric)`, `paid (numeric)`, `change (numeric)`, `payment_method (text: cash/qris)`, `created_at`.
- `sale_items`: `id (uuid, PK)`, `sale_id (uuid, FK sales)`, `product_id (uuid, FK products)`, `name (text)`, `qty (integer)`, `sell_price (numeric)`, `cost_price (numeric)`.
- `stock_movements`: `id (uuid, PK)`, `product_id (uuid, FK products)`, `type (text: sale/restock/adjust)`, `qty_change (integer)`, `reason (text)`, `sale_id (uuid, optional)`, `created_at`.

### B. Transaksi Atomik & Integritas Data (Builder Decision)
- Untuk mencegah selisih stok jika internet terputus di tengah proses bayar, disediakan fungsi PostgreSQL `checkout_sale(...)` (RPC). Seluruh proses pencatatan penjualan, item nota, pemotongan stok, dan mutasi berjalan dalam 1 transaksi ACID database yang aman.
- Tabel `products` dan `sales` diikutsertakan ke `supabase_realtime` sehingga HP pemilik otomatis ter-update saat kasir memproses transaksi tanpa perlu reload manual.
- Disediakan tombol 1-klik di menu Pengaturan: *"Migrasi Data Lokal ke Cloud"* jika pengguna ingin mengunggah data uji coba sebelumnya ke Supabase.

### D. Autentikasi Pengguna & Keamanan (User Decision)
- **Sistem Login Berbasis Supabase Auth:** Aplikasi dilindungi dengan sistem autentikasi (Email & Password).
- **Proteksi Akses:** Seluruh rute aplikasi kasir, stok, laporan, dan pengaturan hanya dapat diakses setelah pengguna berhasil masuk (login).
- **Halaman Login Modern:** Dilengkapi halaman login dengan desain minimalis, input email & password, pesan error yang informatif, dan tombol logout di navigasi utama.
- **Row Level Security (RLS):** Skrip SQL Supabase menyertakan kebijakan RLS sehingga data hanya dapat dibaca dan dimutasi oleh pengguna terautentikasi.

### E. Konfigurasi Lingkungan (`.env`)
```env
VITE_SUPABASE_URL=https://xyzcompany.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
```

### C. Redesain Visual & Antarmuka UI
1. **Layout Kasir Modern (Split View):**
   - **Kiri (Katalog & Pencarian):** Bar pencarian instan, filter pil kategori (Minuman, Rokok, Sembako, dll.), kartu produk dengan tampilan visual elegan, indikator sisa stok dengan warna jelas (merah jika menipis).
   - **Kanan (Ringkasan Keranjang / Nota):** Panel nota kasir modern, tombol +/- kuantitas yang responsif, rincian subtotal, tombol bayar berukuran besar, modal hitung uang tunai & kembalian dengan kalkulator pecahan uang instan (Rp 10.000, 20.000, 50.000, 100.000, atau Uang Pas).
2. **Dashboard Laporan & Inventaris:**
   - Kartu metrik pendapatan (Omzet Hari Ini, Laba Bersih, Total Transaksi, Barang Menipis).
   - Tabel riwayat transaksi dengan fitur cetak/lihat struk nota digital.
   - Manajemen katalog barang yang rapi dan mudah menambah barang baru.

---

## 5. Keputusan yang Diserahkan ke Builder
- Pemilihan icon library (menggunakan `lucide-react` untuk ikon yang konsisten dan modern).
- Struktur service query di `src/db/supabase.ts` dan `src/db/services.ts`.
- Manajemen state keranjang kasir (menggunakan React context/custom hook agar reaktif dan cepat).
- Desain komponen UI (menggunakan Tailwind utility classes dengan palet warna emerald/slate modern).
