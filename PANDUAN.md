# Panduan Warung Metal 🤘

## 1. Cara membuka aplikasi

**Pertama kali (sekali saja):**
1. Buka PowerShell, lalu jalankan:
   ```
   cd C:\Users\ADMIN\.gemini\antigravity\scratch\warung-metal
   npm install
   ```

**Setiap mau pakai:**
```
cd C:\Users\ADMIN\.gemini\antigravity\scratch\warung-metal
npm run dev
```
Lalu buka **http://localhost:5173** di browser (Chrome/Edge). Jendela PowerShell harus tetap terbuka selama aplikasi dipakai.

**Untuk dipakai harian (lebih cepat, bisa di-install):**
```
npm run build
npm run preview
```
Buka alamat yang muncul (biasanya **http://localhost:4173**).

### Install seperti aplikasi
Di Chrome/Edge, klik ikon **Install** di kolom alamat, atau menu ⋮ → *Install Warung Metal*. Setelah itu aplikasi punya ikon sendiri dan bisa dibuka tanpa internet.
> Install dan mode offline hanya jalan lewat `npm run preview` (versi build), bukan `npm run dev`.

### Buka dari HP
Aplikasi ini belum di-hosting, jadi HP belum bisa membukanya dengan mudah. Hosting (Vercel) ada di Fase 2. Data juga tersimpan per perangkat, jadi data di laptop **tidak otomatis muncul** di HP.

---

## 2. Langkah pertama setelah dibuka
1. Masuk menu **Setelan** → **Isi data contoh** untuk mencoba (8 barang warung).
2. Atau langsung isi barang sendiri lewat menu **Barang** → **＋ Tambah barang**.

## 3. Cara pakai tiap menu

### 🛒 Kasir (jualan)
1. Tap barang untuk memasukkan ke keranjang. Tap lagi untuk menambah jumlah.
2. Ubah jumlah dengan tombol **+ / −**, hapus dengan 🗑.
3. Isi **Uang bayar** (atau tap **Uang pas** / 5rb / 10rb / dst.).
4. Tap **BAYAR**. Kembalian muncul, stok otomatis berkurang.
- Barang **Habis** nggak bisa dijual. Isi stok dulu di menu Stok.
- Di HP, keranjang ada di tombol oranye di bawah layar.

### 📦 Barang (daftar & harga)
- **Tambah barang:** isi nama, satuan, harga modal, harga jual, stok minimum, dan stok awal.
- **Ubah:** ganti nama atau harga. Harga baru hanya berlaku untuk penjualan berikutnya, laporan lama tetap benar.
- **Arsip:** sembunyikan barang yang nggak dijual lagi. Riwayatnya aman, bisa dipulihkan lewat filter *Arsip*.
- Filter **Stok menipis** menampilkan barang yang hampir habis.

### 📊 Stok
- **＋ Restok:** barang masuk dari supplier. Bisa sekalian update harga modal.
- **Koreksi:** untuk barang rusak, hilang, kedaluwarsa, atau hasil hitung ulang. Pilih Kurangi/Tambah dan **wajib isi alasan**.
- **Perlu belanja:** daftar barang yang stoknya sudah di bawah batas minimum.
- **Riwayat:** catatan semua perubahan stok (jual, restok, koreksi).

### 🧾 Laporan
Pilih tanggal untuk melihat jumlah transaksi, omzet, laba kotor (harga jual − harga modal), barang terlaris, dan rincian tiap transaksi (tap untuk membuka).

### ⚙️ Setelan
- **Unduh cadangan:** simpan file `.json`. **Lakukan rutin**, misalnya tiap hari setelah warung tutup.
- **Pulihkan dari berkas:** mengembalikan data dari file cadangan. Ini **mengganti semua data** yang ada sekarang.

---

## 4. Penting! Keamanan data
- Data tersimpan **di browser perangkat ini saja**. Belum ada server atau login.
- **Jangan** hapus "data situs / cookies / cache" di browser, karena data toko ikut hilang.
- Pakai **satu browser yang sama** (misalnya selalu Chrome). Browser lain atau mode Incognito punya data terpisah.
- Selalu simpan cadangan di tempat lain (Google Drive, flashdisk).

## 5. Masalah umum
| Masalah | Solusi |
|---|---|
| `npm` tidak dikenali | Pasang Node.js dari nodejs.org, lalu buka PowerShell baru |
| Halaman tidak terbuka | Pastikan `npm run dev` masih jalan dan alamatnya benar |
| Port 5173 sudah dipakai | Tutup jendela lama, atau pakai alamat yang ditampilkan di PowerShell |
| Barang tidak bisa dijual | Stok 0 atau barang diarsip, jadi restok atau pulihkan dulu |
| Data hilang | Pulihkan dari berkas cadangan di Setelan |
