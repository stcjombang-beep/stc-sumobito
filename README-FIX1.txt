STC SUMOBITO – FIX1: PENYEMPURNAAN KEAMANAN DAN HAK AKSES

KETENTUAN AKSES YANG DIPERTAHANKAN
1. Cabang masuk otomatis menggunakan Firebase Anonymous Authentication.
2. Tidak memerlukan persetujuan OWNER.
3. Tidak memerlukan username/password, identitas pegawai, atau identitas perangkat.
4. OWNER tetap masuk menggunakan akun Email/Password dengan UID yang ditentukan di index.html dan Firestore Rules.
5. Data lama tidak dihapus dan tidak memerlukan migrasi.

PERUBAHAN FIX1
1. Aturan Firestore diselaraskan dengan hak akses yang benar-benar tersedia pada aplikasi.
2. Cabang dan OWNER dapat membaca data barang, kategori, order, mutasi, retur, serta pengaturan umum.
3. Perubahan data master barang dan kategori hanya dapat dilakukan OWNER.
4. Cabang dapat membuat catatan order, mutasi, dan retur baru.
5. Perubahan atau penghapusan catatan order, mutasi, dan retur yang sudah tersimpan hanya dapat dilakukan OWNER.
6. Penghapusan item order di sisi aplikasi sekarang juga diperiksa sebagai tindakan OWNER, bukan hanya disembunyikan melalui tampilan.
7. Pengaturan hanya dapat diubah OWNER.
8. Penjualan dan angsuran tetap khusus OWNER.
9. Koleksi yang tidak disebutkan secara eksplisit ditolak secara default.
10. File aturan utama menggunakan nama firestore.rules. File firestore_rules.rules tetap disertakan sebagai salinan kompatibilitas.

CATATAN PENTING TENTANG AKSES ANONIM
Karena cabang tidak menggunakan identitas perangkat atau pegawai, Firebase hanya dapat membedakan sesi OWNER dan sesi anonim. Siapa pun yang dapat membuka aplikasi dan memperoleh sesi anonim akan diperlakukan sebagai cabang. Aturan ini membatasi jenis operasi, tetapi tidak dapat membatasi cabang tertentu atau membuktikan siapa pelakunya. Jangan menyimpan rahasia atau data sensitif yang tidak perlu di koleksi yang dapat dibaca cabang.

CARA PEMASANGAN
1. Buat cadangan file website dan database sebelum penerapan.
2. Unggah index.html hasil FIX1 ke hosting.
3. Buka Firebase Console > Firestore Database > Rules.
4. Ganti seluruh aturan dengan isi file firestore.rules, lalu klik Publish.
5. Pastikan Firebase Authentication > Sign-in method mengaktifkan Anonymous dan Email/Password.
6. Pastikan OWNER_UID di index.html sama persis dengan UID akun OWNER di Firebase Authentication.
7. Jangan menghapus koleksi atau dokumen lama.

DAFTAR PENGUJIAN SETELAH PENERAPAN
A. CABANG (sesi anonim)
- Aplikasi terbuka tanpa persetujuan OWNER.
- Data barang dan kategori dapat dibaca.
- Membuat order baru berhasil.
- Membuat mutasi baru berhasil.
- Membuat retur baru berhasil.
- Tidak dapat mengubah/menghapus order, mutasi, atau retur yang sudah tersimpan.
- Tidak dapat mengubah barang, kategori, pengaturan, penjualan, atau angsuran.

B. OWNER (akun Email/Password dengan UID yang benar)
- Mode OWNER aktif dan menu OWNER tersedia.
- Dapat menambah/mengubah/menghapus barang dan kategori.
- Dapat mengelola order, mutasi, dan retur termasuk perubahan/penghapusan.
- Dapat mengelola pengaturan, penjualan, dan angsuran.

C. KEAMANAN
- Coba akses koleksi yang tidak tercantum; hasil harus ditolak.
- Uji dari satu HP cabang dan satu browser OWNER.
- Periksa Console browser dan Firebase Rules Playground jika ada operasi yang ditolak.

BATASAN / HAL YANG BELUM DIKERJAKAN
- Tidak ada identitas cabang atau identitas pegawai, sesuai keputusan pemilik.
- Belum ada pembatasan akses berdasarkan cabang tertentu karena tidak ada identitas cabang yang dapat dipercaya oleh Rules.
- Belum ada audit log yang dapat mengaitkan transaksi ke pegawai tertentu.
- Perlu pengujian langsung di Firebase milik pemilik setelah Rules dipublikasikan; pengujian lokal tidak dapat membuktikan konfigurasi Firebase produksi.
