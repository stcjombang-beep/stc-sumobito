# STC SUMOBITO — FIX STABLE (Tahap 1–5)

## Perubahan pada paket ini

1. **Security hardening**
   - Audit log append-only; `uid` wajib sama dengan UID sesi yang menulis.
   - Peran audit diputuskan oleh Firestore Rules dari provider/UID, bukan dipercaya dari nilai klien.
   - Field transaksi dibatasi dengan allowlist; kuantitas mutasi/return harus berbentuk angka positif dengan batas maksimum 1.000.000.000.
   - Aturan akses OWNER dan Anonymous Authentication CABANG tetap sesuai pilihan A.
2. **Transaction integrity**
   - Nomor MUT/RET otomatis dialokasikan lewat Firestore transaction dan dokumen `sequence_counters` agar perangkat bersamaan tidak mendapat nomor otomatis yang sama.
   - Nomor yang tampil sebelum item pertama disimpan hanyalah pratinjau; nomor final diamankan saat simpan.
3. **Backup & recovery**
   - Backup cloud mencakup koleksi operasional dan audit log (audit log disertakan sebagai arsip, tidak ditulis ulang saat restore), dilengkapi SHA-256 dan metadata waktu awal/akhir pembacaan.
   - Restore memverifikasi checksum bila tersedia; backup versi lama tetap dapat dipulihkan setelah konfirmasi.
   - Backup lintas koleksi tetap bersifat best-effort, bukan snapshot atomik Firestore.
   - Restore tetap merge dan dilakukan dalam beberapa batch; kegagalan di tengah proses masih dapat menghasilkan restore parsial. Snapshot sebelum restore tetap disediakan.
4. **Cache & offline safety**
   - Cache lokal dipisahkan berdasarkan UID sesi, kedaluwarsa setelah 8 jam, dan dibersihkan saat UID berubah.
   - Data penjualan, angsuran, dan audit tidak disimpan dalam localStorage.
   - Cache Service Worker diberi versi baru; hanya cache dengan prefix aplikasi ini yang dibersihkan.
5. **Regression/static checks**
   - Pemeriksaan sintaks JavaScript, struktur HTML, ID duplikat, dan isi ZIP dilakukan sebelum paket dibuat.

## Batasan keamanan pilihan A

Anonymous Authentication tidak mengidentifikasi cabang atau perangkat secara terverifikasi. Karena itu semua sesi anonim pada Firebase project yang sama memiliki hak CABANG yang sama dan dapat membaca data operasional yang diizinkan oleh Rules. `createdByUid` hanya membatasi penghapusan order ke UID anonim yang membuatnya; bukan bukti nama cabang. Untuk isolasi cabang yang kuat dibutuhkan identitas/otorisasi tambahan atau backend tepercaya, yang tidak diaktifkan dalam paket ini karena pilihan A harus dipertahankan.

Firebase App Check belum dapat diaktifkan dari paket saja: pemilik proyek harus mendaftarkan aplikasi web, memasang site key/provider yang sesuai, lalu mengaktifkan enforcement untuk Firestore di Firebase Console. Jangan aktifkan enforcement sebelum provider dan domain produksi diuji.

## Wajib sebelum produksi

1. Buat backup Firebase terbaru.
2. Deploy `index.html`, `sw.js`, manifest, dan ikon terlebih dahulu; minta semua perangkat memuat ulang aplikasi.
3. Setelah aplikasi baru aktif, deploy `firestore.rules` dari paket ini. Ini penting karena versi baru menyimpan `qty` mutasi/return sebagai angka, bukan string.
4. Pastikan Anonymous Authentication dan akun OWNER tetap aktif.
5. Uji OWNER dan CABANG: buat order, cetak/hapus order sendiri, buat mutasi dan return dari dua perangkat bersamaan, dan verifikasi nomor tidak sama.
6. Uji backup baru (checksum valid), backup lama (konfirmasi kompatibilitas), file yang diubah (harus ditolak), serta restore pada salinan/staging database.
7. Uji cache UID berbeda dan masa kedaluwarsa sebelum menggunakan perangkat bersama.

Paket telah diperiksa secara statis. Pengujian runtime Firebase/Firestore Rules Emulator, dua perangkat nyata, serta restore pada database staging tetap harus dilakukan di lingkungan pemilik proyek.
