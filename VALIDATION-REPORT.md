# Laporan Validasi Statis — STC SUMOBITO FIX STABLE Tahap 1–5

## Pemeriksaan yang berhasil

- Inline JavaScript pada `index.html`: lulus `node --check`.
- `inline.js`: lulus `node --check` dan disamakan dengan script di `index.html`.
- `sw.js`: lulus `node --check`.
- HTML berhasil diparsing; 242 ID ditemukan dan tidak ada ID duplikat.
- Pemeriksaan statis Firestore Rules: audit UID/peran, append-only, validasi kuantitas numerik, allowlist field, dan sequence counter terdeteksi.
- Backup SHA-256: alur pembuatan dan verifikasi checksum tersedia.
- Backup menyertakan arsip audit log; restore tidak menulis ulang audit log agar jejak UID dan sifat append-only tetap terjaga.
- Arsip ZIP diverifikasi setelah dibuat.

## Belum diuji pada layanan runtime

- Kompilasi Firestore Rules oleh Firebase CLI/Emulator.
- Izin aktual OWNER dan Anonymous CABANG pada proyek Firebase.
- Uji dua perangkat nyata yang membuat MUT/RET secara bersamaan.
- Backup/restore terhadap salinan database staging.
- App Check enforcement (memerlukan registrasi aplikasi, provider/site key, domain, dan konfigurasi Firebase Console).

Lulus pemeriksaan statis bukan bukti bahwa seluruh layanan Firebase telah diuji langsung. Terapkan dahulu di staging atau lakukan backup penuh sebelum produksi.
