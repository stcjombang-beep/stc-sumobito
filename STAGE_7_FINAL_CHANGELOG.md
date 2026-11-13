# STC SUMOBITO — STAGE 7 FINAL
## Business Ledger & Cross-Collection Integrity

Tanggal: 2026-11-13
Basis: `STC_SUMOBITO_TAHAP_6_FINAL.zip`
Versi aplikasi: `2.2.0`

### Tujuan
Stage 7 memperkuat integritas bisnis lintas koleksi tanpa mengubah model autentikasi OWNER/CABANG dan tanpa mengarang saldo stok yang tidak tersedia pada model data lama.

### 7A — Deterministic Business Event Identity
- Menambahkan `stcStage7EventIdentity()`.
- Dokumen Stage 6 memakai `_stcBusinessKey` yang sudah ada.
- Dokumen legacy diberi identitas audit deterministik berbasis koleksi + ID + atribut transaksi.

### 7B — Derived Movement Ledger
- Membentuk ledger turunan dari `mutasi` dan `returns`.
- Arah pergerakan mengikuti `tokoAsal → tokoTujuan`.
- Qty harus numerik dan > 0.
- Lokasi asal/tujuan wajib berbeda.

### 7C — Cross-Collection Reference Integrity
- Memeriksa referensi `kode` transaksi terhadap master `barang`.
- Menandai transaksi yang mengarah ke kode barang yang tidak ditemukan.
- Tidak otomatis menghapus atau mengubah data bermasalah.

### 7D — Duplicate Identity Detection
- Mendeteksi `_stcBusinessKey`/legacy identity yang muncul lebih dari sekali.
- Mendeteksi `_stcOpId` yang dipakai ulang lintas dokumen.
- Hasil masuk ke repair plan, bukan auto-delete.

### 7E — Movement Reconciliation
- Menghitung total pergerakan per kode dan net per rute dua arah.
- Menampilkan arus keluar, arus masuk dari rute balik, dan net movement.
- Tidak mengklaim hasil sebagai stok akhir karena saldo awal stok tidak tersedia secara eksplisit.

### 7F — Sales & Order Scope Safety
- `orders.stok` tetap diperlakukan sebagai teks operasional, bukan master stok.
- `penjualan` tidak dimasukkan ke saldo stok per lokasi karena dokumen penjualan saat ini tidak menyimpan lokasi/cabang.
- Sistem menandai penjualan sebagai `UNSCOPED_LOCATION` untuk audit, bukan menebak lokasi.

### 7G — Repair Boundary
- `stcStage7RepairPlan()` hanya membuat rencana perbaikan.
- `stcStage7CanRepair()` memastikan sesi OWNER valid sebelum tahap perbaikan nyata dikembangkan.
- Tidak ada self-healing destruktif pada Stage 7.

### 7H — Runtime Observability
Debug API:
- `STC_DEBUG.stage7.summary()`
- `STC_DEBUG.stage7.audit()`
- `STC_DEBUG.stage7.movementLedger()`
- `STC_DEBUG.stage7.canRepair()`
- `STC_DEBUG.stage7.repairPlan(code, details)`

### Backup & Restore
- Backup schema dinaikkan ke v7.
- `backupType`: `client-export-integrity-v7`.
- SHA-256 integrity tetap digunakan.
- Restore menerima schema hingga Stage 7.

### Firestore Rules
Tidak ada perluasan permission. Stage 6 envelope tetap menjadi batas integritas write.

### Auth Model — Dipertahankan
- OWNER: UID `5ZQ0VcSeK6XqaYr3ZVmC60eUcO43` + provider password.
- CABANG: Firebase Anonymous Authentication.
- Tidak ada `deviceAccess`, device approval, registrasi UID cabang, atau persetujuan cabang oleh OWNER.

### Validasi Teknis
- `node --check inline.js` PASS.
- `node --check sw.js` PASS.
- `index.html` dan `inline.js` diverifikasi IDENTIK pada main application script.
- Struktur main `<script>` tanpa closing tag dipertahankan sesuai basis Stage 6; tidak diubah secara spekulatif.
