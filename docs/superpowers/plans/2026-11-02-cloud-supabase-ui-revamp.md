# Rencana Implementasi (Revisi): Modernisasi UI POS & Integrasi Cloud Database (Supabase) dengan Autentikasi

> **Status:** Menunggu Persetujuan Pengguna (Review)  
> **Tujuan:** Mengubah Warung Metal menjadi aplikasi POS kasir modern dengan UI elegan, aman dari risiko kehilangan data browser melalui migrasi ke Cloud PostgreSQL (Supabase), dilindungi sistem login akun kasir, katalog barang fleksibel bebas template, dan pembayaran Tunai + QRIS.

---

## 1. Goal Description
Aplikasi kasir Warung Metal saat ini masih menggunakan penyimpanan lokal browser (IndexedDB) yang berisiko data hilang. Rencana ini mentransformasikan aplikasi secara menyeluruh menjadi:
1. **Cloud Database (Supabase PostgreSQL):** Data katalog barang, mutasi stok, dan transaksi tersimpan aman di cloud dan dapat dipantau dari perangkat mana saja (HP/laptop).
2. **Sistem Login & Proteksi Keamanan (Supabase Auth):** Kasir dan pemilik warung harus login menggunakan email/password untuk mengakses sistem kasir dan laporan.
3. **Redesain Antarmuka Modern POS (Sesuai Feedback Pengguna):**
   - **Header Minimalis & Estetik:** Bersih dari embel-embel tag versi maupun status koneksi yang mengganggu estetika. Cukup logo dan nama **WARUNG METAL 🤘** yang elegan.
   - **Filter Kategori Realistis Warung:** Disesuaikan khusus untuk kebutuhan warung riil: **Semua**, **Bensin**, **Sembako**, dan **Rokok**.
   - **Katalog Barang Bebas (No Template Lock):** Pengguna memiliki kebebasan penuh menambah, mengubah, dan menghapus barang dengan nama bebas, harga beli/jual bebas, stok bebas, dan satuan bebas.
   - **Metode Pembayaran Ganda (Tunai & QRIS):** Modal pembayaran mendukung pilihan Tunai (lengkap dengan pecahan uang instan & hitung kembalian otomatis) dan QRIS (verifikasi transfer).
4. **Transaksi Atomik (ACID):** Prosedur PostgreSQL RPC `checkout_sale` untuk menjamin pemotongan stok dan pencatatan nota tidak akan selisih jika koneksi internet terganggu.

---

## 2. User Review Required

> [!IMPORTANT]
> **Kebutuhan Akun Supabase (Gratis):**
> Pengguna perlu membuat project gratis di [supabase.com](https://supabase.com). Setelah project dibuat, pengguna cukup menyalin **Project URL** dan **Anon Key** ke file `.env`, lalu menjalankan skrip SQL yang telah disiapkan di menu *SQL Editor* Supabase.
> 
> Selama kredensial belum diisi, aplikasi akan menampilkan panduan interaktif yang memandu langkah pengisian tanpa membuat aplikasi crash.

> [!NOTE]
> **Katalog Barang Bersih:**
> Tidak ada pemaksaan template barang bawaan. Pengguna bisa langsung memasukkan daftar barang asli warung mereka lewat tombol "Tambah Barang" di menu Katalog.

---

## 3. Open Questions & Alignment
- **Status Koneksi & Versi:** Dihapus dari UI atas permintaan pengguna agar tampilan tetap bersih dan estetik.
- **Kategori:** Difokuskan ke `Bensin`, `Sembako`, dan `Rokok`.
- **Fleksibilitas Data:** Input form produk bersifat dinamis tanpa data statis wajib.
- **Pembayaran:** Tunai (kalkulator kembalian instan) dan QRIS.

---

## 4. Proposed Changes

### A. Dependensi & Konfigurasi Lingkungan
- Memasang `@supabase/supabase-js` untuk komunikasi database & autentikasi cloud.
- Memasang `lucide-react` untuk ikon-ikon modern POS.
- Menyediakan template `.env.example` dan `.env`.

---

### B. Database & Skema Cloud (Supabase)

#### [NEW] `src/db/schema.sql`
Skrip SQL DDL siap jalankan di Supabase SQL Editor:
- Tabel `products` (`id`, `name`, `category`, `unit`, `cost_price`, `sell_price`, `stock`, `min_stock`, `is_archived`, `created_at`, `updated_at`).
- Tabel `sales` (`id`, `total`, `paid`, `change`, `payment_method`, `created_at`).
- Tabel `sale_items` (`id`, `sale_id`, `product_id`, `name`, `qty`, `sell_price`, `cost_price`).
- Tabel `stock_movements` (`id`, `product_id`, `type`, `qty_change`, `reason`, `sale_id`, `created_at`).
- Fungsi RPC `checkout_sale(p_sale, p_items, p_movements)` yang membungkus transaksi dalam blok `BEGIN ... COMMIT` PostgreSQL.
- Enable `supabase_realtime` untuk tabel `products` dan `sales`.
- Kebijakan Row Level Security (RLS) untuk pengguna terautentikasi.

#### [NEW] `src/db/supabase.ts`
Inisialisasi `createClient` dari `@supabase/supabase-js` membaca `import.meta.env.VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.

#### [MODIFY] `src/db/services.ts`
Menyesuaikan seluruh fungsi CRUD bisnis agar mengeksekusi query ke Supabase:
- `getProducts()`, `createProduct()`, `updateProduct()`, `archiveProduct()`.
- `executeSale()` memanggil RPC `checkout_sale`.
- `getStockMovements()`, `adjustStock()`, `restockProduct()`.
- `getSalesReport()`, `getDashboardMetrics()`.

---

### C. Autentikasi & Navigasi

#### [NEW] `src/context/AuthContext.tsx`
Context provider untuk mengelola session Supabase, listener `onAuthStateChange`, fungsi `signIn`, `signUp`, dan `signOut`.

#### [NEW] `src/pages/LoginPage.tsx`
Halaman autentikasi bersih dan elegan:
- Form input email & password dengan validasi.
- Tab untuk beralih antara Masuk (Login) dan Buat Akun Kasir Pertama.
- Notifikasi error yang jelas.

#### [NEW] `src/components/ProtectedRoute.tsx`
Guard komponen yang mengalihkan pengunjung yang belum login ke `/login`.

#### [NEW] `src/components/Navbar.tsx`
Header minimalis dan rapi:
- Logo dan brand: **WARUNG METAL 🤘** (tanpa badge versi/koneksi).
- Tab navigasi: **Kasir**, **Katalog Barang**, **Riwayat Stok**, **Laporan Laba/Rugi**, **Pengaturan**.
- Profil user dan tombol Keluar.

---

### D. Redesain Total Halaman Antarmuka (Modern POS UI)

#### [MODIFY] `src/pages/Kasir.tsx`
- **Katalog Kasir (Kiri):**
  - Search bar responsif.
  - Filter kategori pil: **Semua**, **⛽ Bensin**, **🍚 Sembako**, **🚬 Rokok**.
  - Kartu produk estetik dengan nama jelas, badge sisa stok, dan harga kontras tinggi.
- **Panel Nota / Keranjang Kasir (Kanan):**
  - Struk digital interaktif dengan tombol stepper kuantitas (`+` / `-`).
  - Total belanja tebal dan jelas.
  - Tombol aksi utama "⚡ PROSES PEMBAYARAN (F2)".
- **Modal Pembayaran Fleksibel:**
  - Tab pilihan metode: **💵 Tunai / Cash** vs **📱 QRIS / Transfer**.
  - Untuk Tunai: tombol pecahan cepat (Uang Pas, 20k, 50k, 100k) dan hitung kembalian otomatis.
  - Untuk QRIS: panduan konfirmasi transfer sebelum selesaikan transaksi.

#### [MODIFY] `src/pages/Barang.tsx`
- Manajemen barang bebas (nama, kategori dropdown/custom, satuan bebas: botol/bungkus/kg/renteng, harga beli, harga jual, stok awal).
- Tombol aksi cepat untuk restok barang atau edit harga kapan saja.

#### [MODIFY] `src/pages/Stok.tsx`
- Riwayat mutasi stok (masuk, keluar, penjualan kasir) dengan filter tanggal dan kategori.

#### [MODIFY] `src/pages/Laporan.tsx`
- Kartu ringkasan omzet, estimasi profit, total transaksi, dan barang paling laku.

#### [MODIFY] `src/pages/Pengaturan.tsx`
- Formulir konfigurasi Supabase URL & Anon Key.
- Tombol test koneksi dan panduan menjalankan skrip SQL.

#### [MODIFY] `src/App.tsx`
- Mengintegrasikan `AuthProvider` dan `ProtectedRoute` pada seluruh rute.

---

## 5. Verification Plan

### Automated Tests
1. Uji fungsi kalkulasi uang dan logika stok:
   ```powershell
   npm run test
   ```
2. Typecheck TypeScript:
   ```powershell
   npm run typecheck
   ```
3. Build produksi:
   ```powershell
   npm run build
   ```

### Manual Verification
1. **Alur Autentikasi:** Coba login/logout dan verifikasi rute terproteksi.
2. **Katalog Bebas:** Tambah barang dengan nama, harga, dan kategori kustom.
3. **Filter Kategori:** Uji filter Bensin, Sembako, dan Rokok.
4. **Alur Checkout Kasir:** Uji pembayaran Tunai (tombol pecahan uang & kembalian) dan pembayaran QRIS.
