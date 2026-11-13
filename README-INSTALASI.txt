STC SUMOBITO - PEMBARUAN AKSES CABANG

ISI PAKET
- index.html: aplikasi STC dengan layar Aktivasi Perangkat Cabang dihapus dan ID barang/kategori yang mengandung garis miring ditangani dengan aman.
- firestore.rules: aturan Firestore tanpa pemeriksaan persetujuan perangkat.

PERUBAHAN
1. Perangkat cabang memakai Firebase Anonymous Authentication dan langsung dapat masuk tanpa menunggu OWNER.
2. UID OWNER tetap dikenali sebagai akun pemilik.
3. Menu persetujuan perangkat dan penggunaan koleksi deviceAccess di aplikasi dihapus. Data lama di deviceAccess (jika ada) tidak dihapus.
4. Cabang dapat membaca dan menginput/memperbarui barang, serta mengelola orders, mutasi, dan returns. Penghapusan seluruh barang tetap khusus OWNER.
5. Kategori dapat dibaca cabang tetapi hanya OWNER yang dapat mengubahnya.
6. Pengaturan dapat dibaca cabang tetapi hanya OWNER yang dapat mengubahnya. Penjualan dan angsuran tetap khusus OWNER.

CARA PEMASANGAN
1. Simpan salinan index.html lama sebagai cadangan.
2. Ganti file website dengan index.html dari paket ini.
3. Firebase Console > Firestore Database > Rules: ganti isi rules dengan firestore.rules, lalu Publish.
4. Firebase Authentication > Sign-in method: pastikan Anonymous dan Email/Password aktif.
5. Uji dari perangkat cabang dan akun OWNER.
6. Kode barang dan nama kategori yang mengandung "/" tetap ditampilkan seperti semula; aplikasi menyimpan dokumen dengan ID Firestore aman. ID lama tanpa "/" tetap dipakai agar kompatibel.

PENTING
- Jangan hapus database, koleksi, atau dokumen lama.
- Aturan ini membolehkan setiap sesi anonim yang dapat mengakses aplikasi melakukan operasi cabang pada koleksi yang ditentukan. Karena tidak ada persetujuan per perangkat, tautan aplikasi yang diketahui publik dapat digunakan oleh pihak lain.
- Firebase Anonymous Authentication bukan identitas pegawai; bila tautan bocor, siapa pun dapat memperoleh sesi cabang. Amankan data pusat dengan backup rutin, pemantauan, dan pembatasan fitur sensitif seperti yang tetap diterapkan di rules.
- Uji semua menu sebelum digunakan operasional.


CATATAN PERBAIKAN VERSI FIX
- ID Firestore untuk barang/kategori yang mengandung "/" memakai ID aman berawalan __stc_barang__ / __stc_cat__.
- Nilai kode barang dan nama kategori di aplikasi tidak diubah.
- ID lama yang tidak mengandung "/" tetap dipakai; tidak ada migrasi massal atau penghapusan dokumen.
- Untuk penggunaan online di HP/laptop, buka melalui URL hosting (Firebase Hosting atau hosting web lain), bukan file:/// dari File Manager.
