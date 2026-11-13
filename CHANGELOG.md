# STC SUMOBITO — Post Stage 7A–7F Repair
Tanggal: 2026-11-13

## Perbaikan
- Menambahkan aset ikon PWA PNG 192×192 dan 512×512 yang sebelumnya dirujuk oleh manifest dan Service Worker tetapi tidak ada di arsip.
- Mendaftarkan Service Worker pada entry root, OWNER, dan CABANG. Path tetap relatif sehingga deployment pada GitHub Pages dengan subpath tetap didukung.
- Menaikkan nama cache Service Worker agar browser tidak memakai shell lama.
- Menunggu penyimpanan cache navigasi melalui event lifetime agar proses cache tidak terputus setelah respons dikirim.

## Validasi lokal
- `node --check inline.js` dan `node --check sw.js`.
- Parsing HTML root, OWNER, CABANG.
- Validasi JSON manifest dan keberadaan seluruh aset shell.
- Validasi ZIP.

## Batas verifikasi
Firebase Authentication, Firestore Rules, transaksi cloud, dan hak akses aktual memerlukan pengujian pada project Firebase aktif. Tidak ada perubahan UID OWNER, model Anonymous CABANG, skema koleksi, atau izin Firestore dalam perbaikan ini.
