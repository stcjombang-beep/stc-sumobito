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


## Perbaikan login OWNER — 2026-11-13
- Memperbaiki urutan pemuatan Firebase SDK pada halaman utama, OWNER, dan CABANG.
- Firebase App/Auth/Firestore SDK kini dimuat sebelum bootstrap aplikasi yang memanggil `firebase.initializeApp()` dan `firebase.auth()`.
- Sebelumnya tag SDK memakai `defer`, sedangkan bootstrap inline berjalan saat parsing HTML; akibatnya `auth` dapat tetap `null` dan login menampilkan pesan “Layanan autentikasi belum siap”.
- Menaikkan versi cache Service Worker agar HTML yang sudah diperbaiki tidak tertahan cache lama.
- UID OWNER, Firebase project config, aturan Firestore, struktur data, dan fitur bisnis tidak diubah.
