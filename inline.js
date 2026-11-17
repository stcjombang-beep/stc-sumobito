/* ================================================================
   KONFIGURASI FIREBASE CLOUD (STC SUMOBITO)
   ================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyBTQIaSq4tZXKJJDjHhJCCCRjKAXkMXuWo",
  authDomain: "stc-sumobito.firebaseapp.com",
  projectId: "stc-sumobito",
  storageBucket: "stc-sumobito.firebasestorage.app",
  messagingSenderId: "441800488590",
  appId: "1:441800488590:web:6aeabc53a8b7429ec27bdf"
};

// WAJIB DIISI setelah akun OWNER dibuat di Firebase Authentication.
// Ambil UID akun pemilik dari Firebase Console > Authentication > Users.
const OWNER_UID = '5ZQ0VcSeK6XqaYr3ZVmC60eUcO43';

let auth = null;
let db = null;
let unsubs = [];
let statusRoleAktif = 'CABANG';
let currentAuthUser = null;

let dbKat = [];
let dbBrg = [];
let dbOrder = [];
let dbMutasi = [];
let dbReturn = [];
let dbAuditLog = [];
let inputHariIni = [];
let dbPenjualanHariIni = [];
let dbAngsuran = [];

let configApp = { namaToko: 'SIAP TEKNIK COLDSTORAGE', namaCabang: 'STC SUMOBITO', alamatToko: 'JL. RAYA JOMBANG - SURABAYA' };
let petugasJagaAktif = { shift: 'PAGI', nama: 'HOLIGAS', waktu: '', catatan: '' };
let daftarKaryawanPenjaga = ['HOLIGAS','HERU','ANDRI'];
let riwayatPenjaga = [];
let pilihOrd=null, pilihUhd=null, pilihMut=null, pilihRet=null, pilihJual=null, pilihOrdKab=null;

// FIX2: cegah pengiriman ganda akibat klik berulang pada sesi browser yang sama.
const stcSaveLocks = new Set();
let stcHasPendingWrites = false;
function jalankanDenganKunciSimpan(kunci, pekerjaan){
  if(stcSaveLocks.has(kunci)){ alert('Permintaan sedang diproses. Tunggu hingga penyimpanan selesai.'); return Promise.resolve(false); }
  stcSaveLocks.add(kunci);
  return Promise.resolve().then(pekerjaan).finally(()=>stcSaveLocks.delete(kunci));
}
function perbaruiStatusSinkronisasi(snapshot){
  if(!snapshot || !snapshot.metadata) return;
  if(snapshot.metadata.hasPendingWrites){ stcHasPendingWrites = true; setBadgeCloud('⏳ Menyinkronkan data...', false); return; }
  stcHasPendingWrites = false;
  if(!navigator.onLine || snapshot.metadata.fromCache) setBadgeCloud('🟡 Data cache / menunggu koneksi', false);
  else setBadgeCloud(statusRoleAktif === 'OWNER' ? '🟢 Pemilik terhubung' : '🟢 Cabang terhubung', true);
}

/* FORMAT & KALKULASI */
function fAngka(e){ e.value = e.value.replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function angka(s){ return parseInt(String(s || '0').replace(/\D/g, '')) || 0; }
function tgl(){
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).replace(/\./g, ':');
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalisasiSpasi(teks){
  return String(teks || '').replace(/\s+/g, ' ').trim();
}
function nilaiQtyTransaksi(value){
  const n=typeof value==='number'?value:parseFloat(String(value||'0').replace(',','.'));
  return Number.isFinite(n)?n:0;
}

/* INISIALISASI FIREBASE & OTORISASI PERANGKAT */
function setBadgeCloud(text, online=false){
  const el = document.getElementById('badgeCloudStatus');
  if(!el) return;
  el.className = online ? 'badge-cloud online' : 'badge-cloud offline';
  el.innerText = text;
}

function setDeviceGate(show){
  const dash = document.getElementById('dashboard');
  if(dash) dash.style.display = 'grid';
}

function terapkanStatusPengguna(role){
  statusRoleAktif = role;
  const isOwner = role === 'OWNER';
  const badgeRole = document.getElementById('badgeRoleUser');
  const btnKeluar = document.getElementById('btnKeluarAuth');
  const btnRefresh = document.getElementById('btnRefreshAdmin');
  if(badgeRole) badgeRole.style.display = isOwner ? 'inline-block' : 'none';
  if(btnKeluar) btnKeluar.style.display = isOwner ? 'inline-block' : 'none';
  if(btnRefresh) btnRefresh.style.display = isOwner ? 'inline-block' : 'none';
  document.body.classList.toggle('is-owner', isOwner);
}

function inisialisasiFirebase(){
  try {
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    // FIX2: jangan aktifkan persistent disk cache karena perangkat cabang dapat dipakai bersama.
    // Firestore tetap melakukan reconnect otomatis; status pending/cache ditampilkan di badge.
    if(!window.__stcNetworkHandlersReady){
      window.__stcNetworkHandlersReady = true;
      window.addEventListener('online', ()=>setBadgeCloud('🔄 Koneksi kembali, menyinkronkan...', false));
      window.addEventListener('offline', ()=>setBadgeCloud('⚠️ Offline - data cloud belum terkonfirmasi', false));
    }

    auth.onAuthStateChanged(async user => {
      const nextUid = user && user.uid ? user.uid : '';
      if(stcLastAuthUid && nextUid !== stcLastAuthUid) {
        hapusCacheLokalSTC();
        stcNomorMutasiAktif=''; stcNomorReturnAktif='';
        const mutNoEl=document.getElementById('mutNo'), retNoEl=document.getElementById('retNo');
        if(mutNoEl) mutNoEl.value=''; if(retNoEl) retNoEl.value='';
      }
      stcLastAuthUid = nextUid;
      currentAuthUser = user || null;
      bersihkanListener();
      if(!user){
        terapkanStatusPengguna('CABANG');
        setDeviceGate(false);
        if(window.__stcLogoutInProgress){
          setBadgeCloud('🔒 Mode Admin sudah keluar');
          return;
        }
        setBadgeCloud('🔄 Menghubungkan...');
        try { await auth.signInAnonymously(); }
        catch(e){
          setBadgeCloud('⚠️ Gagal autentikasi');
          console.error('Login anonim gagal:', e);
        }
        return;
      }

      // OWNER harus cocok UID dan provider password, selaras dengan Firestore Rules.
      let ownerValid = false;
      if(user.uid === OWNER_UID && !user.isAnonymous){
        try {
          const tokenInfo = await user.getIdTokenResult();
          ownerValid = tokenInfo.claims && tokenInfo.claims.firebase &&
            tokenInfo.claims.firebase.sign_in_provider === 'password';
        } catch(err) { console.warn('Verifikasi sesi OWNER:', err.message); }
      }
      if(ownerValid){
        muatLokal();
        terapkanStatusPengguna('OWNER');
        setBadgeCloud('🟢 Pemilik terhubung', true);
        mulaiPengawasSesiOwner();
      } else if(user.isAnonymous){
        muatLokal();
        hentikanPengawasSesiOwner();
        terapkanStatusPengguna('CABANG');
        setBadgeCloud('🟢 Cabang terhubung', true);
      } else {
        // Akun non-OWNER tidak boleh memperoleh tampilan atau hak OWNER.
        hentikanPengawasSesiOwner();
        terapkanStatusPengguna('CABANG');
        setBadgeCloud('⚠️ Akun tidak memiliki hak OWNER');
        await auth.signOut();
        return;
      }
      setDeviceGate(false);
      hubungkanRealtimeFirestore();
    });
  } catch(e) {
    console.error('Firebase init:', e);
    setBadgeCloud('⚠️ Mode Offline');
    muatLokal();
  }
}

function terapkanHakAksesUI(isOwner){
  document.body.classList.toggle('is-owner', !!isOwner);
}

function bersihkanListener() {
  unsubs.forEach(u => { if(typeof u === 'function') u(); });
  unsubs = [];
}


function hubungkanRealtimeFirestore(){
  if(!db || !['OWNER','CABANG'].includes(statusRoleAktif)) return;
  const badgeCloud = document.getElementById('badgeCloudStatus');
  bersihkanListener();
  try {
    unsubs.push(db.collection('kategori').onSnapshot( snap => {
      perbaruiStatusSinkronisasi(snap);
      dbKat = snap.docs.map(namaKategoriDariDokumen).sort(bandingKategori);
      if(navigator.onLine) setBadgeCloud(statusRoleAktif === 'OWNER' ? '🟢 Pemilik terhubung' : '🟢 Cabang terhubung', true);
      tampilKat(); isiKat(); if(stcMenuSedangAktif('laporan','laporanFIX4')) isiFilterKategori(); if(stcMenuSedangAktif('ubahHargaData')) isiUhdKat(); if(stcMenuSedangAktif('cetakKategori')) isiFilterMenu7(); if(stcMenuSedangAktif('pindahKategori')) setupMenuPindahKategori(); if(stcMenuSedangAktif('cariCepatBarang')) setupCariCepat();
      jadwalkanSimpanCacheLokal();
    }, err => { console.warn('Kategori stream:', err.message); setBadgeCloud('⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection('barang').onSnapshot( snap => {
      perbaruiStatusSinkronisasi(snap);
      dbBrg = snap.docs.map(doc => doc.data()).sort((a,b) => bandingKodeBarang(a.kode, b.kode));
      if(stcMenuSedangAktif('order')) renderPilihanKabelOrder(); if(stcMenuSedangAktif('laporan')) tampilLaporan(); if(stcMenuSedangAktif('cetakKategori')) tampilTabelMenu7(); if(stcMenuSedangAktif('ubahHargaData')) tampilDaftarUhd(); if(stcMenuSedangAktif('cariCepatBarang')) cariCepatProses(); jadwalkanSimpanCacheLokal();
    }, err => { console.warn('Barang stream:', err.message); setBadgeCloud('⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection('orders').onSnapshot( snap => {
      perbaruiStatusSinkronisasi(snap);
      dbOrder = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      if(stcMenuSedangAktif('order')) tabelOrder(); if(stcMenuSedangAktif('riwayatAktivitas')) renderSemuaRiwayatFIX3(); if(stcMenuSedangAktif('laporan','laporanFIX4')) { if(stcMenuSedangAktif('laporan')) tampilLaporan(); else renderLaporanFIX4(); } jadwalkanSimpanCacheLokal();
    }, err => { console.warn('Orders stream:', err.message); setBadgeCloud('⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection('mutasi').onSnapshot( snap => {
      perbaruiStatusSinkronisasi(snap);
      dbMutasi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      if(stcMenuSedangAktif('mutasiBarang')) tabelMutasi(); if(stcMenuSedangAktif('riwayatAktivitas')) renderSemuaRiwayatFIX3(); if(stcMenuSedangAktif('laporan','laporanFIX4')) { if(stcMenuSedangAktif('laporan')) tampilLaporan(); else renderLaporanFIX4(); } jadwalkanSimpanCacheLokal();
    }, err => { console.warn('Mutasi stream:', err.message); setBadgeCloud('⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection('returns').onSnapshot( snap => {
      perbaruiStatusSinkronisasi(snap);
      dbReturn = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      if(stcMenuSedangAktif('barangReturn')) tabelReturn(); if(stcMenuSedangAktif('riwayatAktivitas')) renderSemuaRiwayatFIX3(); if(stcMenuSedangAktif('laporan','laporanFIX4')) { if(stcMenuSedangAktif('laporan')) tampilLaporan(); else renderLaporanFIX4(); } jadwalkanSimpanCacheLokal();
    }, err => { console.warn('Returns stream:', err.message); setBadgeCloud('⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection('pengaturan').doc('umum').onSnapshot( doc => {
      perbaruiStatusSinkronisasi(doc);
      if(doc.exists){
        const d = doc.data();
        if(d.configApp) configApp = d.configApp;
        if(d.petugasJagaAktif) petugasJagaAktif = d.petugasJagaAktif;
        if(Array.isArray(d.daftarKaryawanPenjaga)) daftarKaryawanPenjaga = d.daftarKaryawanPenjaga;
        if(Array.isArray(d.riwayatPenjaga)) riwayatPenjaga = d.riwayatPenjaga;
        applyPengaturanUI(); if(stcMenuSedangAktif('pengaturan')) muatFormPengaturan(); if(stcMenuSedangAktif('penjagaToko')) muatMenuPenjagaToko(); jadwalkanSimpanCacheLokal();
      }
    }, err => console.warn('Pengaturan stream:', err.message)));

    if(statusRoleAktif === 'OWNER'){
      unsubs.push(db.collection('penjualan').onSnapshot( snap => {
        perbaruiStatusSinkronisasi(snap);
        dbPenjualanHariIni = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
        if(stcMenuSedangAktif('penjualanHariIni')) { tabelPenjualanHariIni(); hitungTotalPenjualan(); } if(stcMenuSedangAktif('laporan','laporanFIX4')) { if(stcMenuSedangAktif('laporan')) tampilLaporan(); else renderLaporanFIX4(); } jadwalkanSimpanCacheLokal();
      }, err => console.warn('Penjualan stream:', err.message)));
      unsubs.push(db.collection('angsuran').onSnapshot( snap => {
        perbaruiStatusSinkronisasi(snap);
        dbAngsuran = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
        if(stcMenuSedangAktif('angsuranData')) tabelAngsuran(); if(stcMenuSedangAktif('laporan','laporanFIX4')) { if(stcMenuSedangAktif('laporan')) tampilLaporan(); else renderLaporanFIX4(); } jadwalkanSimpanCacheLokal();
      }, err => console.warn('Angsuran stream:', err.message)));
      unsubs.push(db.collection('audit_logs').orderBy('waktu','desc').limit(300).onSnapshot( snap => {
        perbaruiStatusSinkronisasi(snap);
        dbAuditLog = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(stcMenuSedangAktif('riwayatAktivitas')) renderSemuaRiwayatFIX3();
      }, err => { console.warn('Audit log stream:', err.message); const st=document.getElementById('fix3RiwayatStatus'); if(st)st.textContent='Audit log belum dapat dimuat: '+err.message; }));
    }
  } catch(e) {
    if(badgeCloud){ badgeCloud.className = 'badge-cloud offline'; badgeCloud.innerText = '⚠️ Akses Terbatas'; }
  }
}

/* CACHE LOKAL — DIPISAH PER UID DAN MEMILIKI MASA BERLAKU */
const STC_CACHE_KEY = 'stc_cache_final_v2';
const STC_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
let stcLastAuthUid = '';
function hapusCacheLokalSTC(){
  try { localStorage.removeItem(STC_CACHE_KEY); localStorage.removeItem('stc_cache_final'); } catch(_) {}
}
let stcMenuAktif = '';
let stcCacheTimer = null;
function stcMenuSedangAktif(...ids){ return ids.includes(stcMenuAktif) || ids.some(id => document.getElementById(id)?.classList.contains('active')); }
function jadwalkanSimpanCacheLokal(delay=800){
  if(stcCacheTimer) clearTimeout(stcCacheTimer);
  stcCacheTimer = setTimeout(() => { stcCacheTimer = null; simpanCacheLokal(); }, delay);
}
window.addEventListener('pagehide', () => { if(stcCacheTimer){ clearTimeout(stcCacheTimer); stcCacheTimer=null; } simpanCacheLokal(); });
function simpanCacheLokal(){
  // Data sensitif penjualan/angsuran dan audit tidak disimpan di localStorage.
  // Cache operasional hanya dapat dipakai kembali oleh UID yang sama dan maksimal 8 jam.
  const uid = currentAuthUser && currentAuthUser.uid ? currentAuthUser.uid : '';
  if(!uid) return;
  const payload = { schemaVersion:2, uid, savedAt:Date.now(), dbKat, dbBrg, dbOrder, dbMutasi, dbReturn, configApp, petugasJagaAktif, daftarKaryawanPenjaga, riwayatPenjaga };
  try { localStorage.setItem(STC_CACHE_KEY, JSON.stringify(payload)); }
  catch(e) { console.warn('Cache lokal tidak dapat disimpan:', e.message); }
}
function muatLokal(){
  let d='';
  try { d=localStorage.getItem(STC_CACHE_KEY)||''; } catch(e) { return; }
  if(!d) { hapusCacheLokalSTC(); return; }
  try {
    const o = JSON.parse(d), uid = currentAuthUser && currentAuthUser.uid ? currentAuthUser.uid : '';
    if(!uid || o.uid !== uid || !Number.isFinite(o.savedAt) || Date.now()-o.savedAt > STC_CACHE_TTL_MS){ hapusCacheLokalSTC(); return; }
    dbKat = Array.isArray(o.dbKat) ? o.dbKat : [];
    dbBrg = Array.isArray(o.dbBrg) ? o.dbBrg : [];
    dbOrder = Array.isArray(o.dbOrder) ? o.dbOrder : [];
    dbMutasi = Array.isArray(o.dbMutasi) ? o.dbMutasi : [];
    dbReturn = Array.isArray(o.dbReturn) ? o.dbReturn : [];
    dbPenjualanHariIni = []; dbAngsuran = [];
    if(o.configApp) configApp = o.configApp;
    if(o.petugasJagaAktif) petugasJagaAktif = o.petugasJagaAktif;
    if(Array.isArray(o.daftarKaryawanPenjaga)) daftarKaryawanPenjaga = o.daftarKaryawanPenjaga;
    if(Array.isArray(o.riwayatPenjaga)) riwayatPenjaga = o.riwayatPenjaga;
    refreshSemua();
  } catch(e){ hapusCacheLokalSTC(); }
}

function refreshSemua(){
  applyPengaturanUI();
  tampilKat(); isiKat(); isiFilterKategori(); isiUhdKat(); isiFilterMenu7(); setupMenuPindahKategori(); setupCariCepat(); renderPilihanKabelOrder();
  tabelInput(); tampilLaporan(); tabelOrder(); if(document.getElementById('mutNo') && !document.getElementById('mutNo').value) buatNomorMutasiBaru(); tabelMutasi(); tabelReturn(); tampilTabelMenu7();
  tabelPenjualanHariIni(); hitungTotalPenjualan(); tabelAngsuran();
}

function applyPengaturanUI(){
  document.getElementById('headerJudulToko').innerText = configApp.namaToko || 'SIAP TEKNIK COLDSTORAGE';
  document.getElementById('namaCabang').value = configApp.namaCabang || 'STC SUMOBITO';
  document.getElementById('headerAlamatToko').innerText = configApp.alamatToko || '';
}

function getPetugasJagaTag(){ return petugasJagaAktif && petugasJagaAktif.nama ? `[${petugasJagaAktif.shift || '-'} - ${petugasJagaAktif.nama}]` : '[TANPA PENJAGA]'; }

/* AKSES TERSEMBUNYI OWNER: 5 ketukan atau tekan lama 3 detik */
let hitunganHools = 0;
let timerHools = null;
let timerTekanLama = null;
function ketukanRahasiaHools(){
  if(statusRoleAktif === 'OWNER') { tampilkanPanelSudahAktif(); return; }
  hitunganHools++;
  clearTimeout(timerHools);
  timerHools = setTimeout(() => { hitunganHools = 0; }, 2500);
  if(hitunganHools >= 5){
    hitunganHools = 0;
    bukaModalLogin();
  }
}
function pasangTekanLama(elemen){
  if(!elemen) return;
  const mulai = () => {
    clearTimeout(timerTekanLama);
    timerTekanLama = setTimeout(() => {
      timerTekanLama = null;
      if(statusRoleAktif === 'OWNER') tampilkanPanelSudahAktif();
      else bukaModalLogin();
    }, 3000);
  };
  const batal = () => { if(timerTekanLama){ clearTimeout(timerTekanLama); timerTekanLama = null; } };
  elemen.addEventListener('pointerdown', mulai);
  ['pointerup','pointerleave','pointercancel','contextmenu'].forEach(ev => elemen.addEventListener(ev, batal));
}
function tampilkanPanelSudahAktif(){
  alert('Mode OWNER sudah aktif. Menu pengelolaan tersedia pada dashboard.');
}
const pemicuHeaderOwner = document.getElementById('headerJudulToko');
pemicuHeaderOwner.addEventListener('click', ketukanRahasiaHools);
pasangTekanLama(pemicuHeaderOwner);
pasangTekanLama(document.querySelector('.secret-hools'));

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    if(statusRoleAktif === 'OWNER') tampilkanPanelSudahAktif();
    else bukaModalLogin();
  }
  if (e.key === 'Escape') {
    tutupSemuaSaran();
    tutupModalLogin();
  }
  if (e.key === 'Enter' && document.getElementById('modalAuthOverlay').style.display === 'flex') {
    if(e.target && (e.target.id === 'authEmail' || e.target.id === 'authPassword')) prosesLoginFirebase();
  }
});

document.getElementById('modalAuthOverlay').addEventListener('click', function(e){
  if(e.target === this) tutupModalLogin();
});
function bukaModalLogin(){
  if(statusRoleAktif === 'OWNER') { tampilkanPanelSudahAktif(); return; }
  const notice = document.getElementById('authNotice');
  notice.style.display = 'none'; notice.innerText = '';
  document.getElementById('modalAuthOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('authEmail').focus(), 50);
}
function tutupModalLogin(){
  document.getElementById('modalAuthOverlay').style.display = 'none';
}
// Mode OWNER tidak dikunci berdasarkan waktu diam.
// Sesi berakhir saat pemilik menekan tombol 'Keluar Mode Admin'
// atau saat Firebase/browser mengakhiri sesi autentikasi.
function mulaiPengawasSesiOwner(){
  hentikanPengawasSesiOwner();
}
function hentikanPengawasSesiOwner(){
  if(window.__stcOwnerActivityHandler){
    ['pointerdown','keydown','touchstart','scroll'].forEach(ev => document.removeEventListener(ev, window.__stcOwnerActivityHandler));
    window.__stcOwnerActivityHandler = null;
  }
}

async function prosesLoginFirebase(){
  const emailEl = document.getElementById('authEmail');
  const passEl = document.getElementById('authPassword');
  const email = emailEl.value.trim();
  const pass = passEl.value; // Jangan trim password; spasi bisa merupakan bagian password.
  const notice = document.getElementById('authNotice');
  const tombol = document.getElementById('btnAuthLogin');
  notice.style.display = 'none';
  if(!email || !pass) {
    notice.innerText = 'Masukkan email dan password pemilik.';
    notice.style.display = 'block';
    return;
  }
  if(!auth){
    notice.innerText = 'Layanan autentikasi belum siap. Periksa koneksi internet.';
    notice.style.display = 'block';
    return;
  }
  tombol.disabled = true; tombol.textContent = 'Memverifikasi...';
  try {
    const credential = await auth.signInWithEmailAndPassword(email, pass);
    const tokenInfo = await credential.user.getIdTokenResult(true);
    const provider = tokenInfo.claims && tokenInfo.claims.firebase && tokenInfo.claims.firebase.sign_in_provider;
    if(credential.user.uid !== OWNER_UID || credential.user.isAnonymous || provider !== 'password'){
      await auth.signOut();
      throw new Error('Akun berhasil diautentikasi, tetapi UID/provider tidak terdaftar sebagai OWNER.');
    }
    passEl.value = '';
    tutupModalLogin();
    // Status OWNER diaktifkan kembali oleh onAuthStateChanged setelah token diverifikasi.
  } catch(e) {
    let pesan = e.message || 'Autentikasi gagal.';
    if(e.code === 'auth/api-key-not-valid' || pesan.includes('api-key-not-valid')){
      pesan = 'API Key belum diaktifkan untuk Authentication.';
    } else if(['auth/user-not-found','auth/wrong-password','auth/invalid-credential','auth/invalid-login-credentials'].includes(e.code)){
      pesan = 'Email atau password pemilik salah.';
    } else if(e.code === 'auth/too-many-requests'){
      pesan = 'Terlalu banyak percobaan. Coba kembali beberapa saat lagi.';
    }
    notice.innerText = 'Gagal masuk: ' + pesan;
    notice.style.display = 'block';
  } finally {
    tombol.disabled = false; tombol.textContent = 'Buka Kendali Penuh';
  }
}
async function prosesLogoutFirebase(){
  if(!auth){
    alert('Layanan autentikasi belum siap. Periksa koneksi internet lalu coba lagi.');
    return;
  }
  if(statusRoleAktif !== 'OWNER' || !currentAuthUser || currentAuthUser.uid !== OWNER_UID){
    alert('Sesi pemilik tidak terdeteksi. Muat ulang halaman lalu coba lagi.');
    return;
  }
  if(!confirm('Keluar dari Mode Admin sekarang?')) return;

  const tombolKeluar = document.getElementById('btnKeluarAuth');
  const teksAsli = tombolKeluar ? tombolKeluar.textContent : '';
  if(tombolKeluar){ tombolKeluar.disabled = true; tombolKeluar.textContent = '⏳ Keluar...'; }
  window.__stcLogoutInProgress = true;
  try {
    hentikanPengawasSesiOwner();
    const passwordEl = document.getElementById('authPassword');
    if(passwordEl) passwordEl.value = '';

    // Hentikan sesi OWNER terlebih dahulu. Flag mencegah callback auth
    // langsung membuat sesi anonim sebelum proses logout selesai.
    await auth.signOut();
    currentAuthUser = null;
    terapkanStatusPengguna('CABANG');
    setDeviceGate(false);
    setBadgeCloud('🔒 Mode Admin sudah keluar');

    // Kembalikan sesi anonim untuk penggunaan mode cabang biasa.
    window.__stcLogoutInProgress = false;
    try {
      await auth.signInAnonymously();
    } catch(anonError) {
      console.warn('Sesi anonim tidak dapat dimulai:', anonError);
      setBadgeCloud('⚠️ Keluar berhasil; mode cabang offline');
    }
    alert('Berhasil keluar dari Mode Admin.');
  } catch(e) {
    window.__stcLogoutInProgress = false;
    console.error('Logout Firebase gagal:', e);
    alert('Gagal keluar dari Mode Admin: ' + (e.message || 'Kesalahan tidak diketahui'));
    if(tombolKeluar){ tombolKeluar.disabled = false; tombolKeluar.textContent = teksAsli || '🚪 Keluar Mode Admin'; }
  }
}

/* NAVIGASI & TAB */
function bukaMenuTarget(targetId){
  if(!['OWNER','CABANG'].includes(statusRoleAktif)){
    alert('Perangkat ini belum disetujui OWNER. Data belum dapat diakses.');
    return;
  }
  const menuKhusus = ['inputBarang', 'ubahHargaData', 'laporan', 'pindahKategori', 'penjualanHariIni', 'angsuranData', 'pengaturan', 'penjagaToko', 'pulihkanData', 'backupData', 'riwayatAktivitas', 'laporanFIX4'];
  if(statusRoleAktif !== 'OWNER' && menuKhusus.includes(targetId)){
    alert("Hanya pemilik toko yang memiliki izin ke menu ini.");
    bukaModalLogin();
    return;
  }
  tutupSemuaSaran();
  document.getElementById('dashboard').style.display='none';
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(targetId).classList.add('active');
  stcMenuAktif = targetId;
  // Simpan riwayat navigasi agar tombol Back HP kembali ke menu utama, bukan menutup tab.
  history.pushState({ stcMenu: targetId }, '', '#menu-' + encodeURIComponent(targetId));
  
  if(targetId==='laporan'){ isiFilterKategori(); tampilLaporan(); }
  if(targetId==='laporanFIX4'){ renderLaporanFIX4(); }
  if(targetId==='ubahHargaData'){ isiUhdKat(); }
  if(targetId==='cetakKategori'){ isiFilterMenu7(); tampilTabelMenu7(); }
  if(targetId==='pindahKategori'){ setupMenuPindahKategori(); }
  if(targetId==='cariCepatBarang'){ setupCariCepat(); }
  if(targetId==='penjualanHariIni'){ tabelPenjualanHariIni(); hitungTotalPenjualan(); }
  if(targetId==='angsuranData'){ tabelAngsuran(); }
  if(targetId==='riwayatAktivitas'){ renderSemuaRiwayatFIX3(); }
  if(targetId==='pengaturan'){ muatFormPengaturan(); }
  if(targetId==='penjagaToko'){ muatMenuPenjagaToko(); }
  if(targetId==='barangReturn'){ if(!nomorReturnSekarang()) buatNomorReturnBaru(); tabelReturn(); }
  window.scrollTo({top: 0, behavior: 'smooth'});
}

document.querySelectorAll('.menu-card').forEach(b=>{ b.onclick=()=>{ bukaMenuTarget(b.dataset.target); }; });
function kembali(){
  tutupSemuaSaran();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  stcMenuAktif = '';
  document.getElementById('dashboard').style.display='grid';
  window.scrollTo({top: 0, behavior: 'smooth'});
}

// Kelola tombol Back Android/browser: dari halaman menu kembali ke dashboard.
// Saat sudah di dashboard, tanyakan sebelum pengguna meninggalkan website.
let stcIzinkanKeluar = false;
function stcAdaMenuTerbuka(){
  return !!document.querySelector('.page.active');
}
function stcKonfirmasiKeluar(){
  return confirm('Apakah Anda yakin ingin keluar dari website STC?');
}
window.addEventListener('popstate', function(){
  if(stcAdaMenuTerbuka()){
    kembali();
    // Tetap sediakan satu state agar tombol Back berikutnya bisa dikonfirmasi.
    history.pushState({ stcDashboard: true }, '', location.pathname + location.search + '#dashboard');
    return;
  }
  if(!stcIzinkanKeluar){
    if(stcKonfirmasiKeluar()){
      stcIzinkanKeluar = true;
      // Izinkan browser kembali ke halaman sebelumnya.
      history.back();
    } else {
      history.pushState({ stcDashboard: true }, '', location.pathname + location.search + '#dashboard');
    }
  }
});

// Prompt bawaan browser saat tab ditutup, halaman ditinggalkan, atau dimuat ulang.
// Browser/Android menentukan teks dialog dan mungkin membatasi kapan dialog ditampilkan.
window.addEventListener('beforeunload', function(e){
  if(stcIzinkanKeluar) return;
  e.preventDefault();
  e.returnValue = '';
});
document.querySelectorAll('.tab').forEach(t=>{
  t.onclick=()=>{
    tutupSemuaSaran();
    const p=t.closest('.page');
    p.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    p.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    p.querySelector('#'+t.dataset.tab).classList.add('active');
  };
});

/* PENCARIAN & AUTOCOMPLETE AMAN DARI KARAKTER PETIK */
function prediksiNama(input, idSaran, namaVar){
  const q = input.value.trim().toLowerCase(), box = document.getElementById(idSaran);
  if(!q){ box.style.display='none'; return; }
  const hasil = dbBrg.filter(b => cocokNamaBarang(b,q) || (b.kode || '').toLowerCase().includes(q));
  if(!hasil.length){ box.innerHTML = '<div class="saran-item">Tidak ditemukan</div>'; box.style.display = 'block'; return; }
  
  box.innerHTML = hasil.map(b => `
    <div class="saran-item" onclick="pilihSaranSafe('${encodeURIComponent(b.kode)}', '${idSaran}', '${namaVar}', '${input.id}');">
      <div><b>${escapeHTML(b.kode)}</b> · ${escapeHTML(namaBarangLengkap(b))}</div>
    </div>`).join('');
  box.style.display = 'block';
}

function kosongkanKolomCari(...ids){
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
}

function pilihSaranSafe(encodedKode, idSaran, namaVar, idInput){
  pilihSaran(decodeURIComponent(encodedKode), idSaran, namaVar, idInput);
}

function pilihSaran(kode, idSaran, namaVar, idInput){
  const b = dbBrg.find(x => String(x.kode || '').trim().toLowerCase() === String(kode || '').trim().toLowerCase());
  if(!b) return;
  if(namaVar === 'pilihOrd') pilihOrd = b;
  else if(namaVar === 'pilihUhd') pilihUhd = b;
  else if(namaVar === 'pilihMut') pilihMut = b;
  else if(namaVar === 'pilihRet') pilihRet = b;
  else if(namaVar === 'pilihJual') { pilihJual = b; document.getElementById('jualKode').value = b.kode; hitungSubtotalJual(); }
  kosongkanKolomCari(idInput);
  document.getElementById(idSaran).style.display = 'none';

  if(namaVar === 'pilihOrd') { infoOrd(); setTimeout(() => document.getElementById('ordKet')?.focus(), 150); }
  else if(namaVar === 'pilihUhd'){ tampilFormEditHargaData(); }
  else if(namaVar === 'pilihMut'){ infoMut(); setTimeout(() => document.getElementById('mutQty')?.focus(), 150); }
  else if(namaVar === 'pilihRet'){ infoRet(); setTimeout(() => document.getElementById('retQty')?.focus(), 150); }
}

function prediksiNamaKabel(input){
  const q=input.value.trim().toLowerCase(), box=document.getElementById('saranOrdKab');
  if(!q){box.style.display='none';return;}
  const hasil=dbBrg.filter(b=>(kategoriAdalahKabel(b.kat) || cocokNamaBarang(b,'kabel')) && (cocokNamaBarang(b,q) || (b.kode||'').toLowerCase().includes(q)));
  if(!hasil.length){box.innerHTML='<div class="saran-item">Tidak ditemukan kabel</div>';box.style.display='block';return;}
  box.innerHTML=hasil.map(b=>`
    <div class="saran-item" onclick="pilihSaranKabelSafe('${encodeURIComponent(b.kode)}')">
      <div><b>${escapeHTML(b.kode)}</b> · ${escapeHTML(namaBarangLengkap(b))}</div>
    </div>`).join('');
  box.style.display='block';
}

function pilihSaranKabelSafe(encKode){
  pilihSaranKabel(decodeURIComponent(encKode));
}

function pilihSaranKabel(kode){
  const b=dbBrg.find(x=>x.kode===kode); if(!b) return;
  pilihOrdKab=b;
  document.getElementById('ordKabNama').value=namaBarangLengkap(b).toUpperCase();
  document.getElementById('ordKabKode').value=b.kode.toUpperCase();
  document.getElementById('saranOrdKab').style.display='none';
  infoOrdKab();
}

function tutupSemuaSaran(){ document.querySelectorAll('.saran-box').forEach(b=>{ b.style.display='none'; b.innerHTML=''; }); }
document.addEventListener('click', e => { if(!e.target.closest('.form-group')) tutupSemuaSaran(); });

/* ID DOKUMEN UNIK LINTAS PERANGKAT */
// Timestamp tetap dipertahankan agar ID mudah ditelusuri, ditambah random bytes
// kriptografis supaya dua perangkat tidak memakai ID yang sama pada milidetik sama.
function buatIdDokumen(prefix){
  let token='';
  try {
    const bytes=new Uint8Array(12);
    if(window.crypto && window.crypto.getRandomValues){
      window.crypto.getRandomValues(bytes);
      token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    }
  } catch(_) {}
  if(!token) token=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
  return String(prefix||'DOC')+'-'+Date.now()+'-'+token.toUpperCase();
}

/* OPERASI MASTER KATEGORI & BARANG */
// Firestore document IDs are single path segments; a slash must never be used
// directly as part of an ID. Keep legacy IDs unchanged when they are already valid.
function idKategoriFirestore(nama){
  const nilai = String(nama || '');
  return nilai.includes('/') ? '__stc_cat__' + encodeURIComponent(nilai) : nilai;
}
function namaKategoriDariDokumen(doc){
  const data = doc.data() || {};
  if (data.nama) return String(data.nama);
  const id = String(doc.id || '');
  if (id.startsWith('__stc_cat__')) {
    try { return decodeURIComponent(id.slice('__stc_cat__'.length)); } catch (_) {}
  }
  return id;
}
// Pengurutan alfabetis/numerik hanya diterapkan pada nama kategori dan kode barang.
function bandingKategori(a, b){
  return String(a || '').localeCompare(String(b || ''), 'id', { sensitivity: 'base', numeric: true });
}
function bandingKodeBarang(a, b){
  return String(a || '').localeCompare(String(b || ''), 'id', { sensitivity: 'base', numeric: true });
}
function daftarKategoriUrut(){
  return [...dbKat].sort(bandingKategori);
}
function idBarangFirestore(kode){
  const nilai = String(kode || '');
  return nilai.includes('/') ? '__stc_barang__' + encodeURIComponent(nilai) : nilai;
}

async function simpanKategori(){
  const v = document.getElementById('namaKategori').value.trim().toUpperCase();
  if(!v) return alert('Nama kategori tidak boleh kosong!');
  if(db){
    try {
      await db.collection('kategori').doc(idKategoriFirestore(v)).set({ nama: v, dibuat: tgl() }, { merge: true });
      await catatAuditFIX3('SIMPAN','KATEGORI',v,`Simpan kategori ${v}`);
      document.getElementById('namaKategori').value = '';
      alert('Kategori tersimpan ke database!');
    } catch(e) { alert("Gagal simpan kategori: " + e.message); }
  } else {
    if(!dbKat.includes(v)) dbKat.push(v);
    await catatAuditFIX3('SIMPAN','KATEGORI',v,`Simpan kategori ${v}`);
    document.getElementById('namaKategori').value = '';
    jadwalkanSimpanCacheLokal(); refreshSemua();
  }
}

async function ubahNamaKategori(namaKat){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus Pemilik Toko!');
  try { namaKat = decodeURIComponent(String(namaKat)); } catch (_) { namaKat = String(namaKat); }
  const asal = String(namaKat || '').trim();
  if(!asal) return alert('Nama kategori tidak valid.');
  const normKat = s => String(s || '').trim().normalize('NFC').toLocaleUpperCase('id-ID');
  const input = prompt(`Ubah nama kategori "${asal}" menjadi:`, asal);
  if(input === null) return;
  const tujuan = String(input).trim().toUpperCase().replace(/\s+/g, ' ');
  if(!tujuan) return alert('Nama kategori baru tidak boleh kosong.');
  if(normKat(asal) === normKat(tujuan)) return;
  if(dbKat.some(k => normKat(k) === normKat(tujuan)))
    return alert(`Kategori "${tujuan}" sudah ada. Gunakan nama kategori lain.`);
  const jumlahBarang = dbBrg.filter(b => normKat(b.kat) === normKat(asal)).length;
  if(!confirm(`Ubah kategori "${asal}" menjadi "${tujuan}"?\n\n${jumlahBarang} barang yang memakai kategori ini juga akan diperbarui.`)) return;

  if(db){
    try {
      const kategoriCol = db.collection('kategori');
      const kategoriSnap = await kategoriCol.get();
      const asalDocs = kategoriSnap.docs.filter(d => normKat(namaKategoriDariDokumen(d)) === normKat(asal));
      const tujuanDocs = kategoriSnap.docs.filter(d => normKat(namaKategoriDariDokumen(d)) === normKat(tujuan));
      if(tujuanDocs.length) return alert(`Kategori "${tujuan}" sudah ada di Firebase. Tidak ada perubahan yang dilakukan.`);
      const barangSnap = await db.collection('barang').get();
      const barangDocs = barangSnap.docs.filter(d => normKat((d.data() || {}).kat) === normKat(asal));
      if(!asalDocs.length && !barangDocs.length)
        return alert(`Kategori "${asal}" tidak ditemukan di Firebase.`);

      for(let i = 0; i < barangDocs.length; i += 400){
        const batch = db.batch();
        barangDocs.slice(i, i + 400).forEach(d => batch.update(d.ref, { kat: tujuan }));
        await batch.commit();
      }
      const batchKategori = db.batch();
      batchKategori.set(kategoriCol.doc(idKategoriFirestore(tujuan)), { nama: tujuan, dibuat: tgl() }, { merge: true });
      asalDocs.forEach(d => batchKategori.delete(d.ref));
      await batchKategori.commit();

      dbKat = dbKat.filter(k => normKat(k) !== normKat(asal));
      if(!dbKat.some(k => normKat(k) === normKat(tujuan))) dbKat.push(tujuan);
      dbBrg.forEach(b => { if(normKat(b.kat) === normKat(asal)) b.kat = tujuan; });
      await catatAuditFIX3('UBAH','KATEGORI',asal,`Ubah nama kategori ${asal} menjadi ${tujuan}; barang diperbarui: ${barangDocs.length}`);
      jadwalkanSimpanCacheLokal(); refreshSemua();
      alert(`Nama kategori berhasil diubah menjadi "${tujuan}".\n${barangDocs.length} data barang ikut diperbarui.`);
    } catch(e) {
      console.error('Ubah nama kategori gagal:', e);
      alert('Gagal mengubah nama kategori di Firebase. Periksa koneksi dan izin Firestore.\n\nDetail: ' + (e && e.message ? e.message : e));
    }
  } else {
    dbBrg.forEach(b => { if(normKat(b.kat) === normKat(asal)) b.kat = tujuan; });
    dbKat = dbKat.filter(k => normKat(k) !== normKat(asal));
    dbKat.push(tujuan);
    await catatAuditFIX3('UBAH','KATEGORI',asal,`Ubah nama kategori ${asal} menjadi ${tujuan}`);
    jadwalkanSimpanCacheLokal(); refreshSemua();
    alert(`Nama kategori berhasil diubah menjadi "${tujuan}".`);
  }
}

async function hapusKategori(namaKat){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus Pemilik Toko!');
  try { namaKat = decodeURIComponent(String(namaKat)); } catch (_) { namaKat = String(namaKat); }
  const target = String(namaKat || '').trim();
  if(!target) return alert('Nama kategori tidak valid.');

  const normKat = s => String(s || '').trim().normalize('NFC').toLocaleUpperCase('id-ID');
  const terkait = dbBrg.filter(b => normKat(b.kat) === normKat(target)).length;
  const peringatanBarang = terkait
    ? `\\n\\nPerhatian: ${terkait} barang masih memakai kategori ini. Barang tidak akan dihapus; kategori pada barang perlu diganti jika Anda ingin menghilangkan nama kategori sepenuhnya.`
    : '';
  if(!confirm(`Hapus kategori "${target}"?${peringatanBarang}`)) return;

  if(db){
    try {
      const col = db.collection('kategori');
      const snap = await col.get();
      const cocok = snap.docs.filter(doc => normKat(namaKategoriDariDokumen(doc)) === normKat(target));
      // Include the deterministic document ID used by this app, even if a legacy
      // document does not carry a "nama" field or query matching cannot find it.
      const directRef = col.doc(idKategoriFirestore(target));
      const directSnap = await directRef.get();
      const refs = new Map();
      cocok.forEach(doc => refs.set(doc.ref.path, doc.ref));
      if(directSnap.exists) refs.set(directRef.path, directRef);

      if(refs.size === 0){
        // Do not pretend success if Firestore has no matching document.
        dbKat = dbKat.filter(k => normKat(k) !== normKat(target));
        jadwalkanSimpanCacheLokal();
        refreshSemua();
        alert(`Kategori "${target}" tidak ditemukan di koleksi Firebase. Daftar lokal telah disegarkan. Jika kategori tetap muncul, periksa koneksi dan aturan Firestore.`);
        return;
      }

      // Firestore batch supports up to 500 writes; category duplicates are normally few.
      const allRefs = [...refs.values()];
      for(let i = 0; i < allRefs.length; i += 400){
        const batch = db.batch();
        allRefs.slice(i, i + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
      dbKat = dbKat.filter(k => normKat(k) !== normKat(target));
      await catatAuditFIX3('HAPUS','KATEGORI',target,`Hapus kategori ${target}`);
      jadwalkanSimpanCacheLokal();
      refreshSemua();
      alert(`Kategori "${target}" berhasil dihapus dari Firebase.${terkait ? `\\n\\nCatatan: ${terkait} barang masih menggunakan nama kategori tersebut. Ubah kategori barang melalui menu Ubah Data & Harga agar nama itu tidak muncul lagi pada data barang.` : ''}`);
    } catch(e) {
      console.error('Hapus kategori gagal:', e);
      alert('Kategori gagal dihapus dari Firebase. Data lokal tidak diubah. Periksa koneksi dan izin Firestore.\\n\\nDetail: ' + (e && e.message ? e.message : e));
    }
  } else {
    dbKat = dbKat.filter(k => normKat(k) !== normKat(target));
    await catatAuditFIX3('HAPUS','KATEGORI',target,`Hapus kategori ${target}`);
    jadwalkanSimpanCacheLokal();
    refreshSemua();
    alert(`Kategori "${target}" dihapus dari penyimpanan lokal.${terkait ? `\\n\\nCatatan: ${terkait} barang masih memakai kategori ini.` : ''}`);
  }
}
function tampilKat(){ 
  const c = document.getElementById('daftarKategori'); 
  if(c) c.innerHTML = daftarKategoriUrut().map(k => `
    <div style="padding:8px; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
      <span>📁 ${escapeHTML(k)}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn-warning aksi-sm" onclick="ubahNamaKategori('${encodeURIComponent(k)}')">Ubah Nama</button>
        <button class="btn-danger aksi-sm" onclick="hapusKategori('${encodeURIComponent(k)}')">Hapus</button>
      </div>
    </div>`).join(''); 
}

function kategoriAdalahKabel(kategori){
  return String(kategori || '').trim().toUpperCase().includes('KABEL');
}
function barangMasukPilihanKabel(b){
  return kategoriAdalahKabel(b?.kat) || cocokNamaBarang(b, 'kabel');
}
function renderPilihanKabelOrder(){
  const box=document.getElementById('pilihanKabelOrder');
  if(!box) return;
  const daftar=(dbBrg||[]).filter(barangMasukPilihanKabel).sort((a,b)=>bandingKodeBarang(a.kode,b.kode));
  const kategoriSelect=document.getElementById('ordKabKategori');
  const kategoriAktif=kategoriSelect?.value||'';
  const kategoriList=[...new Set(daftar.map(b=>String(b.kat||'KABEL').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  if(kategoriSelect){
    kategoriSelect.innerHTML='<option value="">-- Pilih Kategori Kabel --</option>'+kategoriList.map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
    if(kategoriList.includes(kategoriAktif)) kategoriSelect.value=kategoriAktif;
  }
  if(!daftar.length){
    box.innerHTML='<div style="color:#fbbf24;padding:8px;">Belum ada barang kabel pada data inventaris.</div>';
    return;
  }
  const kategoriDipilih=kategoriSelect?.value||'';
  if(!kategoriDipilih){
    box.innerHTML='<div style="color:#94a3b8;padding:8px;">Pilih kategori kabel terlebih dahulu untuk menampilkan checklist.</div>';
    return;
  }
  const daftarKategori=daftar.filter(b=>String(b.kat||'KABEL').trim()===kategoriDipilih);
  if(!daftarKategori.length){
    box.innerHTML='<div style="color:#94a3b8;padding:8px;">Tidak ada kabel pada kategori ini.</div>';
    return;
  }
  box.innerHTML=daftarKategori.map(b=>{
    const kode=String(b.kode||'');
    const terpilih=!!pilihOrdKab && String(pilihOrdKab.kode||'')===kode;
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 7px;border-bottom:1px solid #334155;cursor:pointer;background:${terpilih?'rgba(5,150,105,.18)':'transparent'};">
      <input type="checkbox" ${terpilih?'checked':''} onchange="pilihKabelDariChecklist('${encodeURIComponent(kode)}',this.checked)" style="width:18px;height:18px;flex:0 0 auto;accent-color:#10b981;">
      <span style="min-width:0;display:block;"><b style="color:#6ee7b7;">${escapeHTML(kode)}</b><br><span>${escapeHTML(namaBarangLengkap(b))}</span><small style="display:block;color:#94a3b8;">${escapeHTML(b.kat||'KABEL')} · Rp ${(Number(b.hargaMeter)||0).toLocaleString('id-ID')}/meter</small></span>
    </label>`;
  }).join('');
}
function pilihKategoriKabelOrder(){
  pilihOrdKab=null;
  const info=document.getElementById('infoOrdKab'); if(info) info.innerHTML='';
  renderPilihanKabelOrder();
}
function pilihKabelDariChecklist(encodedKode,checked){
  const kode=decodeURIComponent(encodedKode);
  if(!checked){
    if(pilihOrdKab && String(pilihOrdKab.kode||'')===kode) pilihOrdKab=null;
    const info=document.getElementById('infoOrdKab'); if(info) info.innerHTML='';
    renderPilihanKabelOrder();
    return;
  }
  const barang=(dbBrg||[]).find(b=>String(b.kode||'')===kode && barangMasukPilihanKabel(b));
  if(!barang) return alert('Data kabel tidak ditemukan. Muat ulang daftar barang.');
  pilihOrdKab=barang;
  renderPilihanKabelOrder();
  infoOrdKab();
}
function toggleJenisKabelInput(){
  const kategori = document.getElementById('inKategori')?.value || '';
  const grup = document.getElementById('groupJenisKabel');
  const isKabel = kategoriAdalahKabel(kategori);
  if(grup) grup.style.display = isKabel ? 'block' : 'none';
  const grupUkuran=document.getElementById('groupUkuranKabel');
  if(grupUkuran) grupUkuran.style.display=isKabel?'block':'none';
  if(!isKabel){ const pilih=document.getElementById('inJenisKabel'); if(pilih) pilih.value=''; const ukuran=document.getElementById('inUkuranKabel'); if(ukuran) ukuran.value=''; }
}
function ambilJenisKabel(kategori){
  if(!kategoriAdalahKabel(kategori)) return '';
  return document.getElementById('inJenisKabel')?.value || '';
}
function toggleJenisKabelEdit(){
  const kategori=document.getElementById('editUhdKategori')?.value || '';
  const grup=document.getElementById('groupEditJenisKabel');
  const pilih=document.getElementById('editUhdJenisKabel');
  const isKabel=kategoriAdalahKabel(kategori);
  if(grup) grup.style.display=isKabel?'block':'none';
  const grupUkuran=document.getElementById('groupEditUkuranKabel');
  if(grupUkuran) grupUkuran.style.display=isKabel?'block':'none';
  if(!isKabel && pilih) pilih.value='';
  if(!isKabel){const ukuran=document.getElementById('editUhdUkuranKabel');if(ukuran)ukuran.value='';}
}
function normalisasiUkuranKabel(ukuran){
  // Standarkan format ukuran lama ke format tunggal yang dipakai master barang.
  return String(ukuran || '').trim().replace(/[xX×]/g, '×').replace(/\s*×\s*/g, '×');
}

function spesifikasiBarang(item){
  const kategori = item?.kat || item?.kategori || '';
  if(!kategoriAdalahKabel(kategori) && !(item?.jenisKabel || item?.ukuranKabel)) return '';
  const jenis = normalisasiJenisKabelLama(item?.jenisKabel) || item?.jenisKabel || '';
  const ukuran = normalisasiUkuranKabel(item?.ukuranKabel || '');
  return [jenis, ukuran].filter(Boolean).join(' • ');
}

function validasiMasterBarang({kode, nama, kat, harga, hargaMeter, hargaRoll, ket, excludeKode=''}){
  if(!kode || !nama) return 'Kode dan Nama Barang wajib diisi!';
  if(!kat) return 'Silakan pilih kategori barang!';
  if(!/^[A-Z0-9][A-Z0-9._\/-]{1,31}$/.test(kode))
    return 'Kode barang harus 2–32 karakter dan hanya boleh berisi huruf, angka, titik, garis miring, garis bawah, atau tanda hubung.';
  if(nama.length < 2) return 'Nama Barang minimal 2 karakter.';
  const angkaHarga=[harga,hargaMeter,hargaRoll].map(Number);
  if(angkaHarga.some(v=>v<0)) return 'Harga barang tidak boleh bernilai negatif.';
  const namaSama=dbBrg.some(b=>String(b.kode||'').toUpperCase()!==String(excludeKode||'').toUpperCase() &&
    normalisasiSpasi(b.nama).toUpperCase()===nama && String(b.kat||'').toUpperCase()===kat);
  if(namaSama && !confirm(`Sudah ada barang dengan nama "${nama}" pada kategori "${kat}". Simpan sebagai barang lain?`)) return '__BATAL__';
  return '';
}

function normalisasiJenisKabelLama(jenis){
  const v=String(jenis||'').trim().toUpperCase();
  if(['NYA','KABEL TUNGGAL / NYA','KABEL NYA'].includes(v)) return 'NYA';
  if(['NYM','KABEL NYM'].includes(v)) return 'NYM';
  if(['NYY','KABEL NYY'].includes(v)) return 'NYY';
  if(['NYAF','KABEL NYAF'].includes(v)) return 'NYAF';
  if(['NYMHY','KABEL NYMHY'].includes(v)) return 'NYMHY';
  return '';
}

function bersihkanFormInputBarang(){
  ['inKode','inNama','inHarga','inHargaMeter','inHargaRoll','inKet','inJenisKabel','inUkuranKabel','inJenisKabelLainnya'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const kategori=document.getElementById('inKategori'); if(kategori) kategori.value='';
  toggleJenisKabelInput();
}

async function simpanBarang_FIX2_core(){
  const kode = normalisasiSpasi(document.getElementById('inKode').value).toUpperCase();
  const nama = normalisasiSpasi(document.getElementById('inNama').value).toUpperCase();
  const kat = normalisasiSpasi(document.getElementById('inKategori').value).toUpperCase();
  const ket = normalisasiSpasi(document.getElementById('inKet').value).toUpperCase();
  // Validasi master: kode, nama, kategori, harga, dan duplikasi nama.
  const pesanValidasi = validasiMasterBarang({kode, nama, kat,
    harga: angka(document.getElementById('inHarga').value),
    hargaMeter: angka(document.getElementById('inHargaMeter').value),
    hargaRoll: angka(document.getElementById('inHargaRoll').value), ket});
  if(pesanValidasi === '__BATAL__') return;
  if(pesanValidasi) return alert(pesanValidasi);
  // Menu input adalah untuk barang baru; kode yang sudah terdaftar tidak boleh tertimpa.
  if(dbBrg.some(b => normalisasiSpasi(b.kode).toUpperCase() === kode))
    return alert('Kode barang sudah terdaftar! Gunakan menu Ubah Harga & Data untuk memperbarui barang tersebut.');
  const jenisKabel = ambilJenisKabel(kat);
  const ukuranKabel = kategoriAdalahKabel(kat) ? normalisasiUkuranKabel(document.getElementById('inUkuranKabel')?.value || '') : '';
  if(kategoriAdalahKabel(kat) && !jenisKabel) return alert('Pilih Jenis Kabel terlebih dahulu!');
  if(kategoriAdalahKabel(kat) && !ukuranKabel) return alert('Pilih Ukuran Kabel terlebih dahulu!');

  const item = {
    kode, nama, kat,
    ...(jenisKabel ? { jenisKabel, ukuranKabel } : {}),
    harga: angka(document.getElementById('inHarga').value),
    hargaMeter: angka(document.getElementById('inHargaMeter').value),
    hargaRoll: angka(document.getElementById('inHargaRoll').value),
    ket,
    tgl: tgl(),
    tglWaktu: Date.now()
  };

  if(db){
    try {
      await db.collection('barang').doc(idBarangFirestore(kode)).set(item);
      await catatAuditFIX3('BUAT','BARANG',kode,`Tambah barang ${kode} - ${nama}`);
      inputHariIni.push(item);
      tabelInput();
      bersihkanFormInputBarang();
      alert('Barang tersimpan ke database!');
    } catch(e) { alert("Gagal simpan barang: " + e.message); }
  } else {
    dbBrg.push(item);
    await catatAuditFIX3('BUAT','BARANG',kode,`Tambah barang ${kode} - ${nama}`);
    inputHariIni.push(item);
    tabelInput();
    jadwalkanSimpanCacheLokal(); refreshSemua();
    bersihkanFormInputBarang();
    alert('Barang tersimpan (Lokal)!');
  }
}

async function simpanBarang(){ return jalankanDenganKunciSimpan('barang-baru', simpanBarang_FIX2_core); }

function detailKolomKabel(item){
  const master = dbBrg.find(b => String(b.kode||'') === String(item?.kode||'')) || {};
  const kategori = item?.kat || item?.kategori || master.kat || '';
  const jenis = item?.jenisKabel || master.jenisKabel || '';
  const ukuran = item?.ukuranKabel || master.ukuranKabel || '';
  const isKabel = kategoriAdalahKabel(kategori) || item?.tipe === 'kabel' || (!kategori && (jenis || ukuran));
  return {
    jenis: isKabel ? (normalisasiJenisKabelLama(jenis)||jenis||'') : '',
    ukuran: isKabel ? (ukuran||'') : ''
  };
}
function kolomKabelHTML(item){
  const d = detailKolomKabel(item);
  return `<td>${escapeHTML(d.jenis)}</td><td>${escapeHTML(d.ukuran)}</td>`;
}

function namaBarangLengkap(item){
  if(!item) return '';
  const master = (typeof dbBrg !== 'undefined' ? dbBrg : []).find(b => String(b.kode||'') === String(item.kode||'')) || {};
  // Pada catatan transaksi, field nama menyimpan snapshot nama saat transaksi dibuat.
  // Gunakan nilai itu bila berbeda dari nama master; tidak menambah field Firestore baru.
  if(item !== master && item.nama && master.nama && normalisasiSpasi(item.nama) !== normalisasiSpasi(master.nama))
    return normalisasiSpasi(item.nama);
  const kategori = item.kat || item.kategori || master.kat || '';
  const isKabel = kategoriAdalahKabel(kategori) || item.tipe === 'kabel' ||
    (!kategori && (item.jenisKabel || item.ukuranKabel || master.jenisKabel || master.ukuranKabel));
  let namaDasar = normalisasiSpasi(item.namaDasar || item.nama || master.nama || '');
  if(!isKabel) return namaDasar;
  const jenis = normalisasiJenisKabelLama(item.jenisKabel || master.jenisKabel || '') || normalisasiSpasi(item.jenisKabel || master.jenisKabel || '');
  const ukuran = normalisasiUkuranKabel(item.ukuranKabel || master.ukuranKabel || '');
  const keterangan = normalisasiSpasi(item.ket || master.ket || '');
  // Hindari pengulangan token ukuran/jenis dan keterangan yang telanjur masuk ke nama dasar.
  const tokenKhusus = [jenis, ukuran].filter(Boolean);
  let kata = namaDasar.split(' ').filter(token => !tokenKhusus.some(t => t.toLowerCase() === token.toLowerCase()));
  namaDasar = kata.join(' ').trim();
  if(keterangan){
    const ketWords = keterangan.split(' ');
    const namaWords = namaDasar.split(' ');
    const suffix = namaWords.slice(-ketWords.length).join(' ');
    if(suffix.toLowerCase() === keterangan.toLowerCase()) namaDasar = namaWords.slice(0,-ketWords.length).join(' ');
  }
  return normalisasiSpasi([namaDasar, ukuran, jenis, keterangan].filter(Boolean).join(' '));
}

function snapshotNamaBarang(item){
  return namaBarangLengkap(item);
}

function cocokNamaBarang(item, kataKunci){
  const q=normalisasiSpasi(kataKunci).toLocaleLowerCase('id');
  if(!q) return false;
  return normalisasiSpasi(namaBarangLengkap(item)).toLocaleLowerCase('id').includes(q) ||
    normalisasiSpasi(item?.nama || '').toLocaleLowerCase('id').includes(q);
}

function tabelInput(){
  const tb = document.getElementById('tabelInput');
  if(tb) tb.innerHTML = inputHariIni.map((b,i)=>`
    <tr>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(b.nama || namaBarangLengkap(b))}</td>
      <td>${escapeHTML(b.kat)}</td>
      <td>${escapeHTML(spesifikasiBarang(b) || '-')}</td>
      <td>Rp ${(b.harga||0).toLocaleString('id-ID')}</td>
      <td>Rp ${(b.hargaMeter||0).toLocaleString('id-ID')}</td>
      <td>Rp ${(b.hargaRoll||0).toLocaleString('id-ID')}</td>
      <td>${escapeHTML(b.ket||'')}</td>
      <td><button class="btn-danger aksi-sm" onclick="inputHariIni.splice(${i},1); tabelInput();">Hapus</button></td>
    </tr>`).join('');
}
function kosongkanInputHariIni(){ inputHariIni=[]; tabelInput(); }

/* OPERASI UBAH HARGA */
function isiUhdKat(){ 
  const opsi = daftarKategoriUrut().map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
  const s=document.getElementById('uhdKategori'); if(s) s.innerHTML='<option value="">Semua</option>'+opsi;
  const se=document.getElementById('editUhdKategori'); if(se) se.innerHTML=opsi;
  const sd=document.getElementById('daftarUhdKategori'); if(sd) sd.innerHTML='<option value="">Semua Kategori</option>'+opsi;
  tampilDaftarUhd();
}
function filterUhdByKategori(){ pilihUhd=null; document.getElementById('uhdNama').value=''; tampilDaftarUhd(); }

function tampilDaftarUhd(){
  const tb=document.getElementById('tabelDaftarUhd'); if(!tb) return;
  const q=(document.getElementById('daftarUhdCari')?.value||'').trim().toLowerCase();
  const kat=document.getElementById('daftarUhdKategori')?.value||'';
  const data=dbBrg.filter(b=>{
    const cocokTeks=!q || String(b.kode||'').toLowerCase().includes(q) || cocokNamaBarang(b,q);
    return cocokTeks && (!kat || String(b.kat||'')===kat);
  });
  const info=document.getElementById('daftarUhdInfo');
  if(info) info.textContent=`Menampilkan ${data.length} dari ${dbBrg.length} barang`;
  if(!data.length){tb.innerHTML='<tr><td colspan="7" class="text-center" style="padding:12px;">Barang tidak ditemukan</td></tr>';return;}
  tb.innerHTML=data.map(b=>`<tr>
    <td>${escapeHTML(b.kode||'')}</td><td>${escapeHTML(namaBarangLengkap(b))}</td><td>${escapeHTML(b.kat||'-')}</td>
    <td>Rp ${(Number(b.harga)||0).toLocaleString('id-ID')}</td>
    <td>Rp ${(Number(b.hargaMeter)||0).toLocaleString('id-ID')}</td>
    <td>Rp ${(Number(b.hargaRoll)||0).toLocaleString('id-ID')}</td>
    <td style="white-space:nowrap;">
      <button class="btn-warning aksi-sm" onclick="pilihBarangUhdDariDaftar('${encodeURIComponent(b.kode||'')}')">Ubah</button>
      <button class="btn-danger aksi-sm" style="margin-left:4px;" onclick="hapusBarangDariDaftar('${encodeURIComponent(b.kode||'')}')">Hapus</button>
    </td>
  </tr>`).join('');
}
function pilihBarangUhdDariDaftar(encKode){
  const kode=decodeURIComponent(encKode);
  pilihUhd=dbBrg.find(b=>String(b.kode||'')===kode);
  if(pilihUhd){tampilFormEditHargaData();document.getElementById('formEditHargaData')?.scrollIntoView({behavior:'smooth',block:'start'});}
}
function cariUhdNama(){
  const q = document.getElementById('uhdNama').value.trim().toLowerCase();
  const kat = document.getElementById('uhdKategori')?.value || '';
  if(!q) return alert('Masukkan kode atau nama barang yang ingin dicari!');
  pilihUhd = dbBrg.find(b => {
    const cocokTeks = String(b.kode || '').toLowerCase() === q ||
      String(b.nama || '').toLowerCase() === q ||
      cocokNamaBarang(b,q) || String(b.kode || '').toLowerCase().includes(q);
    return cocokTeks && (!kat || String(b.kat || '') === kat);
  });
  if(pilihUhd) tampilFormEditHargaData();
  else alert('Barang tidak ditemukan pada kategori yang dipilih!');
}
function tampilFormEditHargaData(){
  if(!pilihUhd) return;
  document.getElementById('editUhdKode').value=pilihUhd.kode;
  document.getElementById('editUhdNama').value=pilihUhd.nama;
  if(document.getElementById('editUhdKategori')) document.getElementById('editUhdKategori').value = pilihUhd.kat || '';
  document.getElementById('editUhdJenisKabel').value=normalisasiJenisKabelLama(pilihUhd.jenisKabel);
  document.getElementById('editUhdUkuranKabel').value=normalisasiUkuranKabel(pilihUhd.ukuranKabel||'');
  toggleJenisKabelEdit();
  document.getElementById('editUhdHargaJual').value=(pilihUhd.harga||0).toLocaleString();
  document.getElementById('editUhdHargaMeter').value=(pilihUhd.hargaMeter||0).toLocaleString();
  document.getElementById('editUhdHargaRoll').value=(pilihUhd.hargaRoll||0).toLocaleString();
  document.getElementById('editUhdKet').value=pilihUhd.ket || '';
}

function bersihkanFormUbahHargaData(){
  // Kosongkan seluruh kolom edit setelah penyimpanan berhasil.
  pilihUhd = null;
  ['editUhdKode','editUhdNama','editUhdHargaJual','editUhdHargaMeter',
   'editUhdHargaRoll','editUhdKet','editUhdJenisKabel','editUhdUkuranKabel',
   'editUhdKategori','uhdNama'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  const saran = document.getElementById('saranUhd');
  if(saran) saran.innerHTML = '';
  toggleJenisKabelEdit();
}

async function simpanUbahHargaData(){
  if(!pilihUhd) return;
  const kode = document.getElementById('editUhdKode').value.trim().toUpperCase();
  const nama = normalisasiSpasi(document.getElementById('editUhdNama').value).toUpperCase();
  const kat = document.getElementById('editUhdKategori').value;
  const pesanValidasi = validasiMasterBarang({kode, nama, kat,
    harga: angka(document.getElementById('editUhdHargaJual').value),
    hargaMeter: angka(document.getElementById('editUhdHargaMeter').value),
    hargaRoll: angka(document.getElementById('editUhdHargaRoll').value),
    ket: normalisasiSpasi(document.getElementById('editUhdKet').value).toUpperCase(),
    excludeKode: pilihUhd?.kode || kode});
  if(pesanValidasi === '__BATAL__') return;
  if(pesanValidasi) return alert(pesanValidasi);
  const jenisKabel=kategoriAdalahKabel(kat)?(document.getElementById('editUhdJenisKabel')?.value||''):'';
  const ukuranKabel=kategoriAdalahKabel(kat)?normalisasiUkuranKabel(document.getElementById('editUhdUkuranKabel')?.value||''):'';
  if(kategoriAdalahKabel(kat) && !jenisKabel) return alert('Pilih Jenis Kabel terlebih dahulu!');
  if(kategoriAdalahKabel(kat) && !ukuranKabel) return alert('Pilih Ukuran Kabel terlebih dahulu!');
  const updateData = {
    kode,
    nama,
    kat,
    jenisKabel,
    ukuranKabel,
    harga: angka(document.getElementById('editUhdHargaJual').value),
    hargaMeter: angka(document.getElementById('editUhdHargaMeter').value),
    hargaRoll: angka(document.getElementById('editUhdHargaRoll').value),
    ket: normalisasiSpasi(document.getElementById('editUhdKet').value).toUpperCase()
  };

  if(db){
    try {
      await db.collection('barang').doc(idBarangFirestore(kode)).update(updateData);
      await catatAuditFIX3('UBAH','BARANG',kode,`Ubah data/harga barang ${kode}`);
      Object.assign(pilihUhd, updateData);
      jadwalkanSimpanCacheLokal();
      tampilLaporan(); tampilTabelMenu7(); cariCepatProses(); tampilDaftarUhd();
      bersihkanFormUbahHargaData();
      alert('Semua data dan harga barang berhasil diperbarui di cloud! Kolom formulir sudah dibersihkan.');
    } catch(e) { alert("Gagal update data: " + e.message); }
  } else {
    Object.assign(pilihUhd, updateData);
    await catatAuditFIX3('UBAH','BARANG',kode,`Ubah data/harga barang ${kode}`);
    jadwalkanSimpanCacheLokal(); refreshSemua(); tampilDaftarUhd();
    bersihkanFormUbahHargaData();
    alert('Semua data dan harga barang berhasil diperbarui secara lokal! Kolom formulir sudah dibersihkan.');
  }
}

async function hapusBarangDariDaftar(encKode){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus Pemilik Toko!');
  const kode = decodeURIComponent(encKode || '');
  const barang = dbBrg.find(b => String(b.kode||'') === kode);
  if(!barang) return alert('Barang tidak ditemukan atau daftar belum diperbarui.');
  const terkait = {
    order: dbOrder.filter(x=>String(x.kode||'')===kode).length,
    mutasi: dbMutasi.filter(x=>String(x.kode||'')===kode).length,
    retur: dbReturn.filter(x=>String(x.kode||'')===kode).length,
    penjualan: dbPenjualanHariIni.filter(x=>String(x.kode||'')===kode).length
  };
  const totalTerkait = terkait.order + terkait.mutasi + terkait.retur + terkait.penjualan;
  const infoRiwayat = totalTerkait
    ? `\n\nBarang ini memiliki ${totalTerkait} catatan terkait (order ${terkait.order}, mutasi ${terkait.mutasi}, retur ${terkait.retur}, penjualan ${terkait.penjualan}). Catatan tersebut tidak ikut dihapus.`
    : '\n\nTidak ditemukan catatan riwayat terkait pada data yang sedang dimuat.';
  if(!confirm(`Hapus permanen barang "${namaBarangLengkap(barang)}" (${kode}) dari data barang?${infoRiwayat}\n\nTindakan ini tidak dapat dibatalkan.`)) return;

  try {
    if(db){
      await db.collection('barang').doc(idBarangFirestore(kode)).delete();
    }
    await catatAuditFIX3('HAPUS','BARANG',kode,`Hapus barang ${kode} - ${namaBarangLengkap(barang)}`);
    dbBrg = dbBrg.filter(b => String(b.kode||'') !== kode);
    inputHariIni = inputHariIni.filter(b => String(b.kode||'') !== kode);
    if(pilihUhd && String(pilihUhd.kode||'') === kode) pilihUhd = null;
    jadwalkanSimpanCacheLokal();
    refreshSemua();
    alert('Barang berhasil dihapus dari daftar barang.');
  } catch(e){
    alert('Gagal menghapus barang: ' + (e.message || e));
  }
}

function refreshPanelAdmin(){
  if(statusRoleAktif !== 'OWNER') return alert('Refresh panel hanya tersedia untuk Pemilik Toko.');
  const tombol = document.getElementById('btnRefreshAdmin');
  if(tombol){ tombol.disabled = true; tombol.textContent = '⏳ Memuat...'; }
  // Muat ulang halaman agar seluruh panel dan koneksi realtime dimulai kembali.
  window.location.reload();
}

async function hapusBarangDariEdit(){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus Pemilik Toko!');
  if(!pilihUhd) return;
  return hapusBarangDariDaftar(encodeURIComponent(pilihUhd.kode));
}

function bukaUbahHargaDataDariLaporan(encKode){ 
  if(statusRoleAktif !== 'OWNER') return alert('Khusus Pemilik Toko!'); 
  const kode = decodeURIComponent(encKode);
  pilihUhd=dbBrg.find(b=>b.kode===kode); 
  if(pilihUhd){ bukaMenuTarget('ubahHargaData'); tampilFormEditHargaData(); } 
}

/* LAPORAN & PINDAH KATEGORI */
function isiFilterKategori(){
  const s=document.getElementById('filterKat'); if(!s) return;
  const lama=s.value;
  s.innerHTML='<option value="">Semua Kategori</option>'+daftarKategoriUrut().map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
  if([...s.options].some(o=>o.value===lama)) s.value=lama;
}
function dataLaporanBarang(){
  const q=(document.getElementById('lap7Cari')?.value||'').trim().toLocaleLowerCase('id-ID');
  const kat=document.getElementById('filterKat')?.value||'';
  const minEl=document.getElementById('lap7HargaMin')?.value||'';
  const maxEl=document.getElementById('lap7HargaMax')?.value||'';
  const min=minEl.trim()?angka(minEl):0;
  const max=maxEl.trim()?angka(maxEl):Infinity;
  const urut=document.getElementById('lap7Urut')?.value||'kode-asc';
  let items=(dbBrg||[]).filter(b=>{
    const nama=namaBarangLengkap(b);
    const cocokCari=!q||[b.kode,nama,b.nama,b.kat,b.ket].some(v=>String(v||'').toLocaleLowerCase('id-ID').includes(q));
    const cocokKat=!kat||String(b.kat||'')===kat;
    const harga=Number(b.harga)||0;
    return cocokCari&&cocokKat&&harga>=min&&harga<=max;
  });
  const cmp=(a,b)=>String(a||'').localeCompare(String(b||''),'id',{numeric:true,sensitivity:'base'});
  items.sort((a,b)=>{
    if(urut==='nama-asc') return cmp(namaBarangLengkap(a),namaBarangLengkap(b));
    if(urut==='nama-desc') return cmp(namaBarangLengkap(b),namaBarangLengkap(a));
    if(urut==='harga-asc') return (Number(a.harga)||0)-(Number(b.harga)||0)||cmp(a.kode,b.kode);
    if(urut==='harga-desc') return (Number(b.harga)||0)-(Number(a.harga)||0)||cmp(a.kode,b.kode);
    if(urut==='kategori-asc') return cmp(a.kat,b.kat)||cmp(a.kode,b.kode);
    return cmp(a.kode,b.kode);
  });
  return items;
}
function tampilLaporan(){
  const tb=document.getElementById('hasilLaporan'); if(!tb) return;
  const items=dataLaporanBarang();
  const kategori=new Set((dbBrg||[]).map(b=>String(b.kat||'').trim()).filter(Boolean));
  const harga=(dbBrg||[]).map(b=>Number(b.harga)||0).filter(v=>v>0);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('lap7TotalBarang',(dbBrg||[]).length.toLocaleString('id-ID'));
  set('lap7TotalKategori',kategori.size.toLocaleString('id-ID'));
  set('lap7HasilFilter',items.length.toLocaleString('id-ID'));
  set('lap7RentangHarga',harga.length?`Rp ${Math.min(...harga).toLocaleString('id-ID')} – ${Math.max(...harga).toLocaleString('id-ID')}`:'-');
  set('lap7Info',`Menampilkan ${items.length} dari ${(dbBrg||[]).length} barang. Ringkasan total mengikuti data katalog yang sedang dimuat.`);
  if(!items.length){tb.innerHTML='<div class="info-box">Tidak ada barang yang cocok dengan pencarian atau filter.</div>';return;}
  tb.innerHTML='<table><thead><tr><th>Kode</th><th>Nama Barang</th><th>Kategori</th><th>Harga Satuan</th><th>Harga Meter</th><th>Harga Roll</th><th>Keterangan</th><th class="kolom-aksi-admin">Aksi</th></tr></thead><tbody>'+items.map(b=>`<tr><td>${escapeHTML(b.kode||'-')}</td><td>${escapeHTML(namaBarangLengkap(b)||'-')}</td><td>${escapeHTML(b.kat||'-')}</td><td>Rp ${(Number(b.harga)||0).toLocaleString('id-ID')}</td><td>Rp ${(Number(b.hargaMeter)||0).toLocaleString('id-ID')}</td><td>Rp ${(Number(b.hargaRoll)||0).toLocaleString('id-ID')}</td><td>${escapeHTML(b.ket||'-')}</td><td class="kolom-aksi-admin"><div style="display:flex;gap:5px;flex-wrap:wrap;"><button class="btn-warning aksi-sm" onclick="bukaUbahHargaDataDariLaporan('${encodeURIComponent(b.kode||'')}')">Ubah</button><button class="btn-danger aksi-sm" onclick="hapusBarangDariDaftar('${encodeURIComponent(b.kode||'')}')">Hapus</button></div></td></tr>`).join('')+'</tbody></table>';
}
function resetFilterLaporanBarang(){
  ['lap7Cari','lap7HargaMin','lap7HargaMax'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const k=document.getElementById('filterKat');if(k)k.value='';
  const u=document.getElementById('lap7Urut');if(u)u.value='kode-asc';
  tampilLaporan();
}
function dataLaporanBarangUntukEkspor(){
  if(statusRoleAktif!=='OWNER') throw new Error('Fitur laporan hanya dapat digunakan OWNER.');
  return dataLaporanBarang();
}
function eksporLaporanBarangExcel(){
  let items;try{items=dataLaporanBarangUntukEkspor();}catch(e){return alert(e.message);}
  const rows=[['Kode','Nama Barang','Kategori','Harga Satuan','Harga Meter','Harga Roll','Keterangan'],...items.map(b=>[b.kode||'',namaBarangLengkap(b),b.kat||'',Number(b.harga)||0,Number(b.hargaMeter)||0,Number(b.hargaRoll)||0,b.ket||''])];
  const csv='\uFEFF'+rows.map(r=>r.map(v=>{let x=String(v??'');if(/^[\s]*[=+\-@]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`STC_Laporan_Data_Barang_${new Date().toISOString().slice(0,10)}.csv`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function eksporLaporanBarangPDF(){
  if(statusRoleAktif!=='OWNER')return alert('Ekspor laporan hanya dapat dilakukan OWNER.');
  if(!window.jspdf||!window.jspdf.jsPDF)return alert('Pustaka PDF belum siap. Periksa koneksi internet lalu coba lagi.');
  const items=dataLaporanBarang(),{jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const pw=doc.internal.pageSize.getWidth();
  doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(configApp.namaToko||'SIAP TEKNIK COLDSTORAGE',pw/2,13,{align:'center'});
  doc.setFontSize(11);doc.text('LAPORAN SEMUA DATA BARANG',pw/2,20,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(8);
  const kat=document.getElementById('filterKat')?.value||'Semua Kategori';
  doc.text(`Kategori: ${kat} | Jumlah: ${items.length} barang | Tanggal: ${tgl()}`,10,27);
  const rows=items.map(b=>[b.kode||'',namaBarangLengkap(b),b.kat||'',`Rp ${(Number(b.harga)||0).toLocaleString('id-ID')}`,`Rp ${(Number(b.hargaMeter)||0).toLocaleString('id-ID')}`,`Rp ${(Number(b.hargaRoll)||0).toLocaleString('id-ID')}`,b.ket||'-']);
  doc.autoTable({startY:31,head:[['Kode','Nama Barang','Kategori','Harga Satuan','Harga Meter','Harga Roll','Keterangan']],body:rows,theme:'grid',headStyles:{fillColor:[4,135,96],textColor:[255,255,255],fontStyle:'bold'},styles:{font:'helvetica',fontSize:7,cellPadding:2,overflow:'linebreak'},margin:{left:8,right:8}});
  doc.save(`STC_Laporan_Data_Barang_${new Date().toISOString().slice(0,10)}.pdf`);
}
function cetakLaporanBarang(){
  if(statusRoleAktif!=='OWNER')return alert('Cetak laporan hanya dapat dilakukan OWNER.');
  tampilLaporan();cetakLangsungHTML('LAPORAN SEMUA DATA BARANG','hasilLaporan');
}
async function hapusSemuaBarang(){
  if(statusRoleAktif!=='OWNER') return alert('Khusus Pemilik Toko!');
  const jumlah=(dbBrg||[]).length;
  if(!jumlah) return alert('Tidak ada data barang yang dapat dihapus.');
  if(!confirm(`PERINGATAN: Anda akan menghapus ${jumlah} data barang dari database.\n\nKategori dan riwayat transaksi tidak ikut dihapus. Tindakan ini tidak dapat dibatalkan.\n\nLanjutkan?`)) return;
  const verifikasi=prompt(`Untuk mengonfirmasi, ketik HAPUS ${jumlah}`);
  if(verifikasi!==`HAPUS ${jumlah}`) return alert('Konfirmasi tidak cocok. Tidak ada data yang dihapus.');
  try{
    if(db){
      const snap=await db.collection('barang').get();
      for(let i=0;i<snap.docs.length;i+=400){
        const batch=db.batch();snap.docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));await batch.commit();
      }
    }
    dbBrg=[];inputHariIni=[];if(typeof pilihUhd!=='undefined')pilihUhd=null;
    await catatAuditFIX3('HAPUS','BARANG','SEMUA',`Hapus semua data barang (${jumlah} data)`);
    jadwalkanSimpanCacheLokal();refreshSemua();
    alert(`Berhasil menghapus ${jumlah} data barang. Kategori dan riwayat transaksi tetap dipertahankan.`);
  }catch(e){
    console.error('Hapus semua barang gagal:',e);
    alert('Penghapusan tidak selesai. Periksa koneksi dan izin Firestore. Sebagian data mungkin sudah terhapus; segarkan data sebelum mencoba kembali.\n\nDetail: '+(e.message||e));
  }
}

function setupMenuPindahKategori(){ 
  const daftar = daftarKategoriUrut();
  const filter = document.getElementById('pkFilterKat');
  const tujuan = document.getElementById('pkKategoriTujuanMassal');

  if(filter) {
    const nilaiLama = filter.value;
    filter.innerHTML = '<option value="">-- SEMUA KATEGORI --</option>' +
      daftar.map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
    if(daftar.includes(nilaiLama)) filter.value = nilaiLama;
  }
  if(tujuan) {
    const nilaiLama = tujuan.value;
    tujuan.innerHTML = '<option value="">-- KATEGORI TUJUAN BARU --</option>' +
      daftar.map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
    if(daftar.includes(nilaiLama)) tujuan.value = nilaiLama;
  }
  muatTabelPindahKategori(); 
}

function toggleCentangSemuaPK(){
  const list = document.querySelectorAll('.chk-item-pk');
  if(!list.length) return;
  const semuaTercentang = Array.from(list).every(c => c.checked);
  list.forEach(c => c.checked = !semuaTercentang);
}

function batalCentangSemuaPK(){
  document.querySelectorAll('.chk-item-pk').forEach(c => c.checked = false);
}

function muatTabelPindahKategori(){ 
  const tb=document.getElementById('tabelPindahKategoriMulti'); 
  if(!tb) return;
  const kw = (document.getElementById('pkFilterKeyword')?.value || '').trim().toLocaleLowerCase('id');
  const kat = document.getElementById('pkFilterKat')?.value || '';
  let list = dbBrg.filter(b => {
    const cocokKategori = !kat || (b.kat || '') === kat;
    const cocokKata = !kw ||
      cocokNamaBarang(b,kw) ||
      (b.kode || '').toLocaleLowerCase('id').includes(kw) ||
      (b.kat || '').toLocaleLowerCase('id').includes(kw);
    return cocokKategori && cocokKata;
  });
  list.sort((a,b) => bandingKodeBarang(a.kode, b.kode));
  tb.innerHTML=list.map(b=>`
    <tr>
      <td style="text-align:center;"><input type="checkbox" class="chk-item-pk" value="${escapeHTML(b.kode)}"></td>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(b))}</td>
      <td>${escapeHTML(b.kat||'-')}</td>
      
    </tr>`).join('');
  if(!list.length) {
    tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:#94a3b8;">Tidak ada barang pada filter ini.</td></tr>';
  }
}

async function simpanPindahKategoriMassal(){ 
  const tujuanEl = document.getElementById('pkKategoriTujuanMassal');
  const t = tujuanEl?.value || '';
  const checkboxes = Array.from(document.querySelectorAll('.chk-item-pk:checked'));
  if(!checkboxes.length) return alert('Pilih minimal 1 barang!');
  if(!t) return alert('Pilih kategori tujuan baru terlebih dahulu!');

  const kodeTerpilih = checkboxes.map(c => c.value);
  const barangBerubah = kodeTerpilih.filter(kode => {
    const b = dbBrg.find(x => String(x.kode) === String(kode));
    return b && (b.kat || '') !== t;
  });
  if(!barangBerubah.length) return alert('Semua barang yang dipilih sudah berada di kategori tujuan tersebut.');

  if(!confirm(`Pindahkan ${barangBerubah.length} barang ke kategori "${t}"?`)) return;

  if(db){
    const batch = db.batch();
    barangBerubah.forEach(kode => {
      const ref = db.collection('barang').doc(idBarangFirestore(kode));
      batch.update(ref, { kat: t });
    });
    await batch.commit();
  } else {
    barangBerubah.forEach(kode => {
      const b = dbBrg.find(x => String(x.kode) === String(kode));
      if(b) b.kat = t;
    });
    jadwalkanSimpanCacheLokal(); refreshSemua();
  }
  alert(`${barangBerubah.length} barang berhasil dipindahkan ke kategori "${t}".`);
  const keyword = document.getElementById('pkFilterKeyword');
  if(keyword) keyword.value = '';
  setupMenuPindahKategori();
}

/* CARI CEPAT & MENU 7 */
function setupCariCepat(){ 
  const sel = document.getElementById('ccFilterKat'); 
  if(sel) sel.innerHTML = '<option value="">-- Semua Kategori --</option>' + daftarKategoriUrut().map(k => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join(''); 
  cariCepatProses(); 
}

function cariCepatProses(){
  const selKat = document.getElementById('ccFilterKat')?.value;
  const kw = document.getElementById('ccKeyword')?.value.trim().toLowerCase();
  const minH = angka(document.getElementById('ccHargaMin')?.value);
  const maxHVal = document.getElementById('ccHargaMax')?.value;
  const maxH = maxHVal?.trim() ? angka(maxHVal) : Infinity;

  const tb = document.getElementById('tabelCariCepat'); if(!tb) return;
  let hasil = dbBrg.filter(b => (!selKat || b.kat === selKat) && (!kw || cocokNamaBarang(b,kw) || (b.kode||'').toLowerCase().includes(kw)) && ((b.harga||0) >= minH && (b.harga||0) <= maxH));
  if(!hasil.length){ tb.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:10px;">Tidak ditemukan data</td></tr>`; return; }
  
  tb.innerHTML = hasil.map(b => `
    <tr>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(b))}</td>
      <td>${escapeHTML(b.kat||'-')}</td>
      
      <td>Rp ${(b.harga||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaMeter||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaRoll||0).toLocaleString()}</td>
      <td>${escapeHTML(b.ket||'')}</td>
      <td class="kolom-aksi-admin"><button class="btn-warning aksi-sm" onclick="bukaUbahHargaDataDariLaporan('${encodeURIComponent(b.kode)}')">Ubah</button></td>
    </tr>`).join('');
}
function resetCariCepat(){ document.getElementById('ccKeyword').value = ''; document.getElementById('ccHargaMin').value = ''; document.getElementById('ccHargaMax').value = ''; cariCepatProses(); }

function isiFilterMenu7(){ const sel = document.getElementById('pilihKatMenu7'); if(sel) sel.innerHTML = '<option value="">-- Semua Kategori --</option>' + daftarKategoriUrut().map(k => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join(''); }
function tampilTabelMenu7(){
  const kat = document.getElementById('pilihKatMenu7')?.value, tb = document.getElementById('tabelMenu7'); if(!tb) return;
  let data = kat ? dbBrg.filter(b => b.kat === kat) : dbBrg;
  if(!data.length){ tb.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:10px;">Tidak ada data</td></tr>`; return; }
  tb.innerHTML = data.map(b => `
    <tr>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(b))}</td>
      
      <td>Rp ${(b.harga||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaMeter||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaRoll||0).toLocaleString()}</td>
      <td>${escapeHTML(b.ket||'')}</td>
      <td class="kolom-aksi-admin"><button class="btn-warning aksi-sm" onclick="bukaUbahHargaDataDariLaporan('${encodeURIComponent(b.kode)}')">Ubah</button></td>
    </tr>`).join('');
}

/* ORDER BARANG & KABEL */
function isItemKabel(o){
  if(o.tipe === 'kabel') return true;
  if(o.tipe === 'barang') return false;
  const k = (o.ket || '').toUpperCase();
  const n = (o.nama || '').toUpperCase();
  return k.includes('ROLL') || k.includes('TOTAL:') || n.includes('KABEL');
}

function isiKat(){
  const sel=document.getElementById('inKategori'); if(sel) sel.innerHTML='<option value="">-- Pilih --</option>'+daftarKategoriUrut().map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
  toggleJenisKabelInput();
  const selOrd = document.getElementById('ordKategori');
  if(selOrd) selOrd.innerHTML = '<option value="">-- Semua Kategori --</option>' + daftarKategoriUrut().map(k => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
  renderPilihanBarangOrder();
}
function filterOrdByKategori(){ pilihOrd=null; const n=document.getElementById('ordNama'); if(n)n.value=''; const i=document.getElementById('infoOrd'); if(i)i.innerHTML=''; renderPilihanBarangOrder(); }
function renderPilihanBarangOrder(){
  const box=document.getElementById('pilihanBarangOrder');
  if(!box) return;
  const kategoriSelect=document.getElementById('ordKategori');
  const kategoriAktif=kategoriSelect?.value||'';
  if(!kategoriAktif){
    box.innerHTML='<div style="color:#94a3b8;padding:8px;">Pilih kategori barang terlebih dahulu untuk menampilkan checklist.</div>';
    return;
  }
  const daftar=(dbBrg||[]).filter(b=>String(b.kat||'').trim()===kategoriAktif).sort((a,b)=>bandingKodeBarang(a.kode,b.kode));
  if(!daftar.length){
    box.innerHTML='<div style="color:#94a3b8;padding:8px;">Tidak ada barang pada kategori ini.</div>';
    return;
  }
  box.innerHTML=daftar.map(b=>{
    const kode=String(b.kode||'');
    const terpilih=!!pilihOrd && String(pilihOrd.kode||'')===kode;
    return `<label style="display:flex;align-items:center;gap:10px;padding:9px 7px;border-bottom:1px solid #334155;cursor:pointer;background:${terpilih?'rgba(59,130,246,.18)':'transparent'};">
      <input type="checkbox" ${terpilih?'checked':''} onchange="pilihBarangDariChecklist('${encodeURIComponent(kode)}',this.checked)" style="width:18px;height:18px;flex:0 0 auto;accent-color:#3b82f6;">
      <span style="min-width:0;display:block;"><b style="color:#93c5fd;">${escapeHTML(kode)}</b><br><span>${escapeHTML(namaBarangLengkap(b))}</span><small style="display:block;color:#94a3b8;">${escapeHTML(b.kat||'-')} · Rp ${(Number(b.harga)||0).toLocaleString('id-ID')}</small></span>
    </label>`;
  }).join('');
}
function pilihBarangDariChecklist(encodedKode,checked){
  const kode=decodeURIComponent(encodedKode);
  if(!checked){
    if(pilihOrd && String(pilihOrd.kode||'')===kode) pilihOrd=null;
    const info=document.getElementById('infoOrd'); if(info) info.innerHTML='';
    renderPilihanBarangOrder();
    return;
  }
  const kat=document.getElementById('ordKategori')?.value||'';
  const barang=(dbBrg||[]).find(b=>String(b.kode||'')===kode && String(b.kat||'').trim()===kat);
  if(!barang) return alert('Data barang tidak ditemukan. Muat ulang daftar barang.');
  pilihOrd=barang;
  const n=document.getElementById('ordNama'); if(n)n.value='';
  renderPilihanBarangOrder();
  infoOrd();
}
function cariOrdNama(){
  const n=document.getElementById('ordNama').value.trim().toLowerCase(), kat=document.getElementById('ordKategori')?.value;
  if(n.length<2) return alert('Ketik minimal 2 karakter nama barang.');
  pilihOrd=dbBrg.find(b=>(cocokNamaBarang(b,n) || (b.nama||'').toLowerCase()===n) && (!kat || b.kat === kat));
  if(!pilihOrd) return alert('Barang tidak ditemukan! Periksa kategori atau nama barang.');
  kosongkanKolomCari('ordNama'); infoOrd();
}
function infoOrd(){
  const target=document.getElementById('infoOrd'); if(!target||!pilihOrd)return;
  target.innerHTML=`<div class="order-selected" style="border-radius:10px;padding:10px;margin:8px 0;color:#f8fafc;"><b>${escapeHTML(pilihOrd.kode)} · ${escapeHTML(namaBarangLengkap(pilihOrd))}</b><div style="font-size:11px;color:#cbd5e1;margin-top:4px;">Kategori: ${escapeHTML(pilihOrd.kat||'-')} · Satuan: Rp ${(pilihOrd.harga||0).toLocaleString()} · Meter: Rp ${(pilihOrd.hargaMeter||0).toLocaleString()}</div></div>`;
}

function cariOrdKabKode(){ const k=document.getElementById('ordKabKode').value.trim().toUpperCase(); pilihOrdKab=dbBrg.find(b=>b.kode===k); if(pilihOrdKab) { kosongkanKolomCari('ordKabKode','ordKabNama'); infoOrdKab(); } else alert('Tidak ditemukan!'); }
function cariOrdKabNama(){ const n=document.getElementById('ordKabNama').value.trim().toLowerCase(); pilihOrdKab=dbBrg.find(b=>cocokNamaBarang(b,n) || (b.nama||'').toLowerCase()===n); if(pilihOrdKab) { kosongkanKolomCari('ordKabKode','ordKabNama'); infoOrdKab(); } else alert('Tidak ditemukan!'); }
function infoOrdKab(){ if(pilihOrdKab) { document.getElementById('infoOrdKab').innerHTML=`<div class="info-box"><b>${escapeHTML(pilihOrdKab.kode)}</b> - ${escapeHTML(namaBarangLengkap(pilihOrdKab))}<br>Rp ${(pilihOrdKab.hargaMeter||0).toLocaleString()}/meter</div>`; hitungEstimasiKabel(); } }
function toggleModeOrderKabel(){ const m = document.getElementById('ordKabMode').value; document.getElementById('groupModeMeter').style.display = m==='meter'?'block':'none'; document.getElementById('groupModeRoll').style.display = m==='meter'?'none':'block'; hitungEstimasiKabel(); }
function hitungEstimasiKabel(){
  const m = document.getElementById('ordKabMode').value; let r = "";
  if(m === 'meter'){
    const t = angka(document.getElementById('ordKabMeter').value);
    if(t <= 0) r = "Masukkan meter valid";
    else { const roll = Math.floor(t / 100), sisa = t % 100; r = `${roll > 0 ? roll + ' Roll ' : ''}${sisa > 0 ? '+ ' + sisa + 'm' : ''} (Total: ${t}m)`; }
  } else {
    const j = angka(document.getElementById('ordKabJmlRoll').value), isi = angka(document.getElementById('ordKabIsiRoll').value)||100, s = angka(document.getElementById('ordKabSisaMeter').value);
    r = `${j} Roll (@${isi}m) ${s > 0 ? '+ ' + s + 'm' : ''} (Total: ${(j*isi)+s}m)`;
  }
  document.getElementById('ordKabHasilRangkuman').value = r.toUpperCase();
}

let orderBarangSedangDiubahId = null;

function resetModeUbahOrder(){
  orderBarangSedangDiubahId = null;
  const btn=document.getElementById('btnTambahOrder');
  if(btn){ btn.textContent='Tambah ke Daftar Order Barang'; btn.onclick=()=>tambahOrder(); }
  const cancel=document.getElementById('btnBatalUbahOrder');
  if(cancel) cancel.style.display='none';
}

function batalUbahOrder(){
  resetFormOrderBarang();
  alert('Perubahan order dibatalkan.');
}

function ubahOrderBarangById(id){
  const item=(dbOrder||[]).find(o=>String(o.id)===String(id));
  if(!item) return alert('Order tidak ditemukan atau sudah dihapus.');
  const isOwner=statusRoleAktif==='OWNER';
  const uid=currentAuthUser?.uid||'';
  if(!isOwner && (statusRoleAktif!=='CABANG' || !uid || String(item.createdByUid||'')!==uid))
    return alert('CABANG hanya dapat mengubah order yang dibuat oleh sesi CABANG ini. Order lama atau order perangkat lain hanya dapat diubah OWNER.');
  if(isItemKabel(item)) return alert('Tombol Ubah pada daftar ini hanya untuk Order Barang.');

  const barang=(dbBrg||[]).find(b=>String(b.kode||'').toUpperCase()===String(item.kode||'').toUpperCase());
  if(!barang) return alert('Data barang untuk order ini tidak ditemukan di Master Barang.');

  const toko=document.getElementById('ordToko');
  const kat=document.getElementById('ordKategori');
  const ket=document.getElementById('ordKet');
  const stok=document.getElementById('ordStok');
  if(toko) toko.value=item.toko||'';
  if(kat){ kat.value=barang.kat||item.kat||''; renderPilihanBarangOrder(); }
  pilihOrd=barang;
  if(ket) ket.value=item.ket||'';
  if(stok) stok.value=item.stok||'0';
  const nama=document.getElementById('ordNama'); if(nama) nama.value='';
  infoOrd();
  orderBarangSedangDiubahId=String(item.id);

  const btn=document.getElementById('btnTambahOrder');
  if(btn){ btn.textContent='💾 Simpan Perubahan Order'; btn.onclick=()=>simpanPerubahanOrderBarang(); }
  const cancel=document.getElementById('btnBatalUbahOrder');
  if(cancel) cancel.style.display='inline-flex';
  const form=document.getElementById('buatOrder');
  if(form) form.scrollIntoView({behavior:'smooth',block:'start'});
}

async function simpanPerubahanOrderBarang(){
  const id=orderBarangSedangDiubahId;
  if(!id) return tambahOrder();
  const item=(dbOrder||[]).find(o=>String(o.id)===String(id));
  if(!item) return alert('Order tidak ditemukan atau sudah dihapus.');
  const isOwner=statusRoleAktif==='OWNER';
  const uid=currentAuthUser?.uid||'';
  if(!isOwner && (statusRoleAktif!=='CABANG' || !uid || String(item.createdByUid||'')!==uid))
    return alert('CABANG hanya dapat mengubah order yang dibuat oleh sesi CABANG ini.');
  if(!pilihOrd) return alert('Pilih barang terlebih dahulu.');

  const toko=(document.getElementById('ordToko').value||'').trim().toUpperCase();
  const ket=(document.getElementById('ordKet').value||'').trim().toUpperCase();
  const stok=(document.getElementById('ordStok').value||'0').trim().toUpperCase();
  if(!toko || toko.length>120) return alert('Nama toko pemesan wajib diisi dan maksimal 120 karakter.');
  if(ket.length>1000) return alert('Jumlah / keterangan barang maksimal 1000 karakter.');
  if(stok.length>120) return alert('Keterangan stok terlalu panjang.');

  const duplicate=(dbOrder||[]).some(o=>String(o.id)!==String(id) && !isItemKabel(o) && String(o.toko||'').toUpperCase()===toko && String(o.kode||'').toUpperCase()===String(pilihOrd.kode||'').toUpperCase());
  if(duplicate && !confirm('Order aktif dengan barang dan toko yang sama sudah ada. Tetap simpan perubahan ini sebagai order yang sama?')) return;

  const updated={
    ...item,
    toko,
    kode:String(pilihOrd.kode||'').toUpperCase(),
    nama:snapshotNamaBarang(pilihOrd).toUpperCase(),
    kat:pilihOrd.kat||'',
    jenisKabel:pilihOrd.jenisKabel||'',
    ukuranKabel:pilihOrd.ukuranKabel||'',
    ket,
    stok,
    diperbaruiPada:Date.now(),
    diperbaruiOlehUid:uid
  };
  try{
    if(db) await db.collection('orders').doc(String(id)).update(updated);
    const idx=dbOrder.findIndex(o=>String(o.id)===String(id));
    if(idx>=0) dbOrder[idx]=updated;
    jadwalkanSimpanCacheLokal();
    tabelOrder();
    await catatAuditFIX3('UBAH','ORDER',id,`Ubah order barang ${updated.kode} untuk ${updated.toko}`);
    resetFormOrderBarang();
    alert('Perubahan order berhasil disimpan.');
  }catch(e){
    console.error('Ubah order gagal:',e);
    alert('Gagal menyimpan perubahan order: '+(e.message||e));
  }
}

async function tambahOrder_FIX2_core(){
  if(!pilihOrd) return alert('Pilih barang dahulu!');
  const toko=(document.getElementById('ordToko').value||'').trim().toUpperCase();
  const ket=(document.getElementById('ordKet').value||'').trim().toUpperCase();
  const stok=(document.getElementById('ordStok').value||'0').trim().toUpperCase();
  if(!toko || toko.length > 120) return alert('Nama toko pemesan wajib diisi dan maksimal 120 karakter.');
  if(ket.length > 1000) return alert('Jumlah / keterangan barang maksimal 1000 karakter.');
  if(stok.length > 120) return alert('Keterangan stok terlalu panjang.');
  const duplicate=dbOrder.some(o=>!isItemKabel(o)&&String(o.toko||'').toUpperCase()===toko&&String(o.kode||'').toUpperCase()===String(pilihOrd.kode||'').toUpperCase());
  if(duplicate&&!confirm('Order aktif dengan barang dan toko yang sama sudah ada. Tetap tambahkan sebagai order baru?')) return;
  const idDoc=buatIdDokumen('ORD');
  const payload={id:idDoc,createdByUid:currentAuthUser?.uid||'',toko,kode:pilihOrd.kode.toUpperCase(),nama:snapshotNamaBarang(pilihOrd).toUpperCase(),kat:pilihOrd.kat||'',jenisKabel:pilihOrd.jenisKabel||'',ukuranKabel:pilihOrd.ukuranKabel||'',ket,stok,tipe:'barang',status:'BARU',riwayatStatus:[{status:'BARU',waktu:Date.now(),tanggal:tgl()}],tgl:tgl(),tglWaktu:Date.now()};
  try{
    if(db) await db.collection('orders').doc(idDoc).set(payload);
    else {dbOrder.unshift(payload);jadwalkanSimpanCacheLokal();tabelOrder();}
    await catatAuditFIX3('BUAT','ORDER',idDoc,`Order barang ${payload.kode} untuk ${payload.toko}`);
    resetFormOrderBarang();
    alert('Barang berhasil dimasukkan ke daftar order.');
  }catch(e){console.error(e);alert('Gagal menyimpan order. Periksa koneksi lalu coba lagi.');}
}
async function tambahOrder(){ return jalankanDenganKunciSimpan('order-barang', tambahOrder_FIX2_core); }

function resetFormOrderBarang(){
  ['ordKet','ordNama'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const s=document.getElementById('ordStok');if(s)s.value='0';
  const i=document.getElementById('infoOrd');if(i)i.innerHTML=''; pilihOrd=null;
  resetModeUbahOrder();
  renderPilihanBarangOrder();
}

async function tambahOrderKabelOtomatis_FIX2_core(){
  if(!pilihOrdKab) return alert('Pilih kabel dahulu!');
  const toko=(document.getElementById('ordKabToko').value||'').trim().toUpperCase()||'STC SUMOBITO';
  const rangkuman=(document.getElementById('ordKabHasilRangkuman').value||'').trim().toUpperCase();
  const catatan=(document.getElementById('ordKabCatatan').value||'').trim().toUpperCase();
  const stok=(document.getElementById('ordKabStok').value||'READY').trim().toUpperCase()||'READY';
  if(!rangkuman||rangkuman.includes('MASUKKAN METER VALID')||rangkuman.length>1000) return alert('Masukkan kebutuhan kabel yang valid (maksimal 1000 karakter).');
  if(catatan.length>700) return alert('Catatan order kabel terlalu panjang.');
  const duplicate=dbOrder.some(o=>isItemKabel(o)&&String(o.toko||'').toUpperCase()===toko&&String(o.kode||'').toUpperCase()===String(pilihOrdKab.kode||'').toUpperCase()&&String(o.ket||'').toUpperCase()===rangkuman);
  if(duplicate&&!confirm('Order kabel dengan toko, kode, dan kebutuhan yang sama sudah ada. Tetap tambahkan?')) return;
  const idDoc=buatIdDokumen('ORD-KAB');
  const payload={id:idDoc,createdByUid:currentAuthUser?.uid||'',toko,kode:pilihOrdKab.kode.toUpperCase(),nama:snapshotNamaBarang(pilihOrdKab).toUpperCase(),kat:pilihOrdKab.kat||'',jenisKabel:pilihOrdKab.jenisKabel||'',ukuranKabel:pilihOrdKab.ukuranKabel||'',ket:catatan?`${rangkuman} | CATATAN: ${catatan}`:rangkuman,stok,tipe:'kabel',status:'BARU',riwayatStatus:[{status:'BARU',waktu:Date.now(),tanggal:tgl()}],tgl:tgl(),tglWaktu:Date.now()};
  try{
    if(db) await db.collection('orders').doc(idDoc).set(payload);
    else {dbOrder.unshift(payload);jadwalkanSimpanCacheLokal();tabelOrder();}
    await catatAuditFIX3('BUAT','ORDER',idDoc,`Order kabel ${payload.kode} untuk ${payload.toko}`);
    ['ordKabMeter','ordKabCatatan'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('ordKabStok').value='0'; document.getElementById('infoOrdKab').innerHTML=''; document.getElementById('ordKabHasilRangkuman').value=''; pilihOrdKab=null; renderPilihanKabelOrder();
    alert('Kabel berhasil dimasukkan ke daftar order.');
  }catch(e){console.error(e);alert('Gagal menyimpan order kabel.');}
}

async function tambahOrderKabelOtomatis(){ return jalankanDenganKunciSimpan('order-kabel', tambahOrderKabelOtomatis_FIX2_core); }

async function hapusOrderItemById(id){
  const item=dbOrder.find(o=>String(o.id)===String(id));
  if(!item) return alert('Order tidak ditemukan atau sudah dihapus.');
  const isOwner=statusRoleAktif==='OWNER';
  const uid=currentAuthUser?.uid||'';
  if(!isOwner && (statusRoleAktif!=='CABANG' || !uid || String(item.createdByUid||'')!==uid))
    return alert('CABANG hanya dapat menghapus order yang dibuat oleh sesi CABANG ini. Order lama atau order perangkat lain hanya dapat dihapus OWNER.');
  if(!confirm('Hapus item pesanan ini?')) return;
  try{
    if(db) await db.collection('orders').doc(String(id)).delete();
    else {
      if(!isOwner) return alert('Penghapusan order CABANG memerlukan koneksi Firebase.');
      dbOrder=dbOrder.filter(o=>String(o.id)!==String(id)); jadwalkanSimpanCacheLokal(); tabelOrder();
    }
    await catatAuditFIX3('HAPUS','ORDER',id,`Hapus order ${item.kode||''} ${item.toko||''}`);
  }catch(e){console.error('Hapus order gagal:',e);alert('Gagal menghapus order: '+(e.message||e));}
}

async function kosongkanTabelOrder(kategori){
  const isKabel=kategori==='kabel';
  const isOwner=statusRoleAktif==='OWNER';
  const uid=currentAuthUser?.uid||'';
  if(!isOwner && (statusRoleAktif!=='CABANG'||!uid)) return alert('Sesi CABANG tidak valid. Muat ulang aplikasi lalu coba lagi.');
  const daftarTarget=(dbOrder||[]).filter(o=>(isKabel?isItemKabel(o):!isItemKabel(o)) && (isOwner||String(o.createdByUid||'')===uid));
  if(!daftarTarget.length) return alert(isOwner?'Tidak ada order pada kategori ini.':'Tidak ada order kategori ini yang dibuat oleh sesi CABANG ini. Order lama/perangkat lain tetap menjadi kewenangan OWNER.');
  const label=isKabel?'kabel':'barang umum';
  const lingkup=isOwner?'seluruh daftar':'order milik sesi CABANG ini';
  if(!confirm(`Kosongkan ${daftarTarget.length} order ${label} (${lingkup})? Order milik sesi/perangkat lain tidak akan terhapus.`)) return;
  try{
    if(db){
      // Ambil ulang dokumen yang menjadi target agar penghapusan tidak hanya berdasarkan cache UI.
      const snap=isOwner
        ? await db.collection('orders').get()
        : await db.collection('orders').where('createdByUid','==',uid).get();
      const refs=snap.docs.filter(d=>isKabel?isItemKabel(d.data()):!isItemKabel(d.data()));
      if(!refs.length) return alert('Tidak ada order yang dapat dikosongkan.');
      for(let i=0;i<refs.length;i+=450){
        const batch=db.batch();
        refs.slice(i,i+450).forEach(d=>batch.delete(d.ref));
        await batch.commit();
      }
    }else{
      if(!isOwner) return alert('Pengosongan order CABANG memerlukan koneksi Firebase.');
      if(isKabel) dbOrder=dbOrder.filter(o=>!isItemKabel(o));
      else dbOrder=dbOrder.filter(o=>isItemKabel(o));
      jadwalkanSimpanCacheLokal(); tabelOrder();
    }
    await catatAuditFIX3('KOSONGKAN','ORDER',kategori,`Kosongkan ${label}; ${daftarTarget.length} order; peran ${isOwner?'OWNER':'CABANG'}`);
    alert(`Berhasil mengosongkan order ${label}.`);
  }catch(e){
    console.error('Kosongkan order gagal:',e);
    alert('Gagal mengosongkan order. Sebagian batch mungkin sudah berhasil jika jumlah order banyak. Periksa tabel dan ulangi untuk sisa order. '+(e.message||e));
  }
}

function tabelOrder(){
  const tbBarang=document.getElementById('tabelOrderBarang'),tbKabel=document.getElementById('tabelOrderKabel');
  let listBarang=dbOrder.filter(o=>!isItemKabel(o)),listKabel=dbOrder.filter(o=>isItemKabel(o));
  const qB=(document.getElementById('filterOrderBarang')?.value||'').trim().toUpperCase(),tB=document.getElementById('filterOrderBarangToko')?.value||'SEMUA';
  const qK=(document.getElementById('filterOrderKabel')?.value||'').trim().toUpperCase(),tK=document.getElementById('filterOrderKabelToko')?.value||'SEMUA';
  const match=(o,q,t)=>{const hay=`${o.toko||''} ${o.kode||''} ${namaBarangLengkap(o)||''} ${o.ket||''}`.toUpperCase();return (!q||hay.includes(q))&&(t==='SEMUA'||String(o.toko||'').toUpperCase()===t);};
  listBarang=listBarang.filter(o=>match(o,qB,tB));listKabel=listKabel.filter(o=>match(o,qK,tK));
  const allBarang=dbOrder.filter(o=>!isItemKabel(o)),allKabel=dbOrder.filter(o=>isItemKabel(o));
  const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;}; setText('orderCountBarang',allBarang.length);setText('orderCountKabel',allKabel.length);setText('orderCountTotal',allBarang.length+allKabel.length);
  if(tbBarang)tbBarang.innerHTML=listBarang.length?listBarang.map(o=>`<tr><td><b>${escapeHTML(o.toko||'-')}</b></td><td>${escapeHTML(o.kode||'')}</td><td>${escapeHTML(namaBarangLengkap(o))}</td><td>${escapeHTML(o.ket||'-')}</td><td>${escapeHTML(o.stok||'0')}</td><td><button class="btn-warning aksi-sm" onclick="ubahOrderBarangById('${escapeHTML(o.id)}')">Ubah</button> <button class="btn-danger aksi-sm" onclick="hapusOrderItemById('${escapeHTML(o.id)}')">Hapus</button></td></tr>`).join(''):`<tr><td colspan="6" class="text-center" style="color:#94a3b8;padding:10px;">${qB||tB!=='SEMUA'?'Tidak ada order yang sesuai filter.':'Belum ada order barang umum.'}</td></tr>`;
  if(tbKabel)tbKabel.innerHTML=listKabel.length?listKabel.map(o=>`<tr><td><b>${escapeHTML(o.toko||'-')}</b></td><td>${escapeHTML(o.kode||'')}</td><td><span style="color:#34d399;font-weight:700;">${escapeHTML(namaBarangLengkap(o))}</span></td><td>${escapeHTML(o.ket||'-')}</td><td>${escapeHTML(o.stok||'0')}</td><td><button class="btn-danger aksi-sm" onclick="hapusOrderItemById('${escapeHTML(o.id)}')">Hapus</button></td></tr>`).join(''):`<tr><td colspan="6" class="text-center" style="color:#94a3b8;padding:10px;">${qK||tK!=='SEMUA'?'Tidak ada order yang sesuai filter.':'Belum ada order khusus kabel.'}</td></tr>`;
}

/* MUTASI & RETURN */
function nomorMutasiSekarang(){
  const el = document.getElementById('mutNo');
  if(el && el.value.trim()) return el.value.trim().toUpperCase();
  return '';
}
function nomorLokalBerikutnya(prefix, daftar, field){
  let max=0;
  (daftar||[]).forEach(x=>{const n=String(x[field]||'');if(n.startsWith(prefix)){const v=parseInt(n.slice(prefix.length),10);if(Number.isFinite(v))max=Math.max(max,v);}});
  return prefix+String(max+1).padStart(3,'0');
}
function buatNomorMutasiBaru(){
  const now=new Date(),ymd=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
  const el=document.getElementById('mutNo'); if(el)el.value=nomorLokalBerikutnya('MUT-'+ymd+'-',dbMutasi,'noMutasi');
  stcNomorMutasiAktif=''; updateStatusMutasi('Nomor ditampilkan sebagai pratinjau. Nomor final diamankan saat item pertama disimpan.');
}
let stcNomorMutasiAktif='';
async function pastikanNomorMutasi(){
  const current=nomorMutasiSekarang();
  if(current && current===stcNomorMutasiAktif) return current;
  if(!db){ if(!current)buatNomorMutasiBaru(); return nomorMutasiSekarang(); }
  const no=await alokasikanNomorTerpusat('MUT','mutasi','noMutasi',dbMutasi);
  const el=document.getElementById('mutNo'); if(el)el.value=no;
  stcNomorMutasiAktif=no; updateStatusMutasi('Nomor mutasi unik berhasil diamankan.');
  return no;
}
async function alokasikanNomorTerpusat(jenis,koleksi,field,daftarLokal){
  if(!db || !currentAuthUser) throw new Error('Nomor transaksi terpusat memerlukan koneksi Firebase.');
  const now=new Date(),ymd=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
  const prefix=jenis+'-'+ymd+'-',ref=db.collection('sequence_counters').doc(jenis+'-'+ymd);
  let maxLokal=0;(daftarLokal||[]).forEach(x=>{const n=String(x[field]||'');if(n.startsWith(prefix)){const v=parseInt(n.slice(prefix.length),10);if(Number.isFinite(v))maxLokal=Math.max(maxLokal,v);}});
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),old=snap.exists?Number(snap.data().value||0):0;
    const next=Math.max(old+1,maxLokal+1);
    tx.set(ref,{jenis,tanggal:ymd,value:next,updatedByUid:currentAuthUser.uid,updatedAt:Date.now()});
    return prefix+String(next).padStart(3,'0');
  });
}
function validasiQtyMutasi(el){
  if(!el) return;
  let v = String(el.value || '').replace(',', '.').replace(/[^\d.]/g,'');
  const p = v.split('.');
  if(p.length > 2) v = p[0] + '.' + p.slice(1).join('');
  el.value = v;
}
function updateStatusMutasi(msg, ok=false){
  const el=document.getElementById('mutStatus');
  if(el){ el.textContent=msg || ''; el.style.color=ok ? '#34d399' : '#94a3b8'; }
}
function setNilaiMutasi(){
  const a=document.getElementById('mutAsal'), b=document.getElementById('mutTujuan');
  if(a && b && a.value === b.value) b.value = a.value === 'SUMOBITO' ? 'PETERONGAN' : 'SUMOBITO';
}
function tukarPosisiMutasi(){
  const a=document.getElementById('mutAsal'), b=document.getElementById('mutTujuan');
  if(!a || !b) return;
  const tmp=a.value; a.value=b.value; b.value=tmp;
  updateStatusMutasi(`Rute: ${a.value} → ${b.value}`);
}
function cariMutKode(){
  const k=document.getElementById('mutKode').value.trim().toUpperCase();
  pilihMut=dbBrg.find(b=>String(b.kode||'').toUpperCase()===k);
  if(pilihMut){ kosongkanKolomCari('mutKode','mutNama'); infoMut(); updateStatusMutasi('Barang ditemukan. Silakan isi jumlah.'); }
  else alert('Kode barang tidak ditemukan!');
}
function cariMutNama(){
  const n=document.getElementById('mutNama').value.trim().toLowerCase();
  if(!n) return alert('Masukkan nama barang terlebih dahulu!');
  pilihMut=dbBrg.find(b=>cocokNamaBarang(b,n) || String(b.nama||'').toLowerCase()===n);
  if(pilihMut){ kosongkanKolomCari('mutKode','mutNama'); infoMut(); updateStatusMutasi('Barang ditemukan. Silakan isi jumlah.'); }
  else alert('Nama barang tidak ditemukan!');
}
function infoMut(){
  if(pilihMut) document.getElementById('infoMut').innerHTML=
    `<div class="info-box"><b>${escapeHTML(pilihMut.kode)}</b> - ${escapeHTML(namaBarangLengkap(pilihMut))}</div>`;
}
function resetFormMutasiItem(){
  ['mutKode','mutNama','mutQty','mutKet'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
  const s=document.getElementById('mutSatuan'); if(s)s.value='PCS';
  const i=document.getElementById('infoMut'); if(i)i.innerHTML='';
  pilihMut=null;
  updateStatusMutasi('Form item dibersihkan.');
}
function dataMutasiSaatIni(){
  const no=nomorMutasiSekarang();
  if(!no) return [];
  return dbMutasi.filter(m=>String(m.noMutasi||'')===no).sort((a,b)=>(a.tglWaktu||0)-(b.tglWaktu||0));
}
function updateRingkasanMutasi(){
  const list=dataMutasiSaatIni();
  const tujuan=document.getElementById('mutTujuan')?.value || '-';
  const asal=document.getElementById('mutAsal')?.value || '-';
  const box=document.getElementById('mutSummary');
  const count=document.getElementById('mutCount');
  if(count) count.textContent=`(${list.length} item)`;
  if(box) box.innerHTML=`<b>Ringkasan:</b> ${list.length} item • ${escapeHTML(asal)} → ${escapeHTML(tujuan)} • No. ${escapeHTML(nomorMutasiSekarang()||'-')}`;
}
async function tambahMutasiItem_FIX2_core(){
  if(!pilihMut) return alert('Pilih barang dahulu!');
  const qtyRaw=document.getElementById('mutQty').value.trim();
  const qty=parseFloat(qtyRaw);
  if(!/^\d+(?:[.,]\d+)?$/.test(qtyRaw) || !Number.isFinite(qty) || qty<=0 || qty>1000000000) return alert('Jumlah harus angka valid lebih besar dari 0 dan tidak melebihi 1.000.000.000!');
  const asal=document.getElementById('mutAsal').value;
  const tujuan=document.getElementById('mutTujuan').value;
  if(!asal || !tujuan || asal===tujuan) return alert('Toko asal dan tujuan harus berbeda!');
  const no=await pastikanNomorMutasi();
  const satuan=document.getElementById('mutSatuan').value;
  const ket=document.getElementById('mutKet').value.trim() || '-';
  if(ket.length>1000) return alert('Keterangan mutasi maksimal 1000 karakter.');

  const duplikat=dataMutasiSaatIni().find(m=>String(m.kode||'')===String(pilihMut.kode||''));
  if(duplikat && !confirm(`Barang ${pilihMut.kode} sudah ada pada No. Mutasi ${no} (${duplikat.qty}). Tambahkan baris kedua?`)) return;

  const idDoc=buatIdDokumen('MUT');
  const payload={
    id:idDoc, noMutasi:no, tokoAsal:asal, tokoTujuan:tujuan,
    kode:pilihMut.kode, nama:snapshotNamaBarang(pilihMut), kat:pilihMut.kat||'',
    jenisKabel:pilihMut.jenisKabel||'', ukuranKabel:pilihMut.ukuranKabel||'',
    qty:qty, satuan:satuan, ket:ket, status:'DIBUAT', riwayatStatus:[{status:'DIBUAT',waktu:Date.now(),tanggal:tgl()}], tgl:tgl(), tglWaktu:Date.now()
  };
  try{
    if(db) await db.collection('mutasi').doc(idDoc).set(payload);
    else { dbMutasi.unshift(payload); jadwalkanSimpanCacheLokal(); tabelMutasi(); }
    await catatAuditFIX3('BUAT','MUTASI',idDoc,`Mutasi ${no}: ${asal} ke ${tujuan}, barang ${payload.kode}`);
    if(db) updateStatusMutasi(`Item ${pilihMut.kode} berhasil ditambahkan ke ${no}.`, true);
    resetFormMutasiItem();
    if(db) tabelMutasi();
  }catch(e){
    alert('Gagal menyimpan mutasi: ' + (e.message || e));
  }
}
async function tambahMutasiItem(){ return jalankanDenganKunciSimpan('mutasi-item', tambahMutasiItem_FIX2_core); }

function tabelMutasi(){
  const tb=document.getElementById('tabelMutasi'); if(!tb) return;
  const list=dataMutasiSaatIni();
  tb.innerHTML=list.map((m,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${escapeHTML(m.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(m))}</td>
      <td><b>${escapeHTML(m.qty)}</b> ${escapeHTML(m.satuan||'')}</td>
      <td>${escapeHTML(m.ket||'-')}</td>
      <td class="kolom-aksi-admin"><button class="btn-danger aksi-sm" onclick="hapusMutasiItem('${escapeHTML(m.id)}')">Hapus</button></td>
    </tr>`).join('') ||
    `<tr><td colspan="6" class="text-center" style="color:#94a3b8;padding:12px;">Belum ada item pada nomor mutasi ini.</td></tr>`;
  updateRingkasanMutasi();
}
async function hapusMutasiItem(id){
  if(!id) return;
  if(statusRoleAktif !== 'OWNER') return alert('Penghapusan mutasi hanya untuk OWNER.');
  const item=dbMutasi.find(m=>String(m.id)===String(id));
  if(!item) return;
  if(!confirm(`Hapus ${item.kode} dari No. Mutasi ${item.noMutasi||'-'}?`)) return;
  try{
    if(db) await db.collection('mutasi').doc(id).delete();
    else dbMutasi=dbMutasi.filter(m=>String(m.id)!==String(id));
    await catatAuditFIX3('HAPUS','MUTASI',id,`Hapus item mutasi ${item.kode} pada ${item.noMutasi||'-'}`);
    jadwalkanSimpanCacheLokal(); tabelMutasi();
  }catch(e){ alert('Gagal menghapus mutasi: '+(e.message||e)); }
}
function tampilkanRiwayatMutasi(){
  const box=document.getElementById('riwayatMutasiBox'); if(!box) return;
  box.style.display='block'; tabelRiwayatMutasi();
}
function tabelRiwayatMutasi(){
  const tb=document.getElementById('tabelRiwayatMutasi'); if(!tb) return;
  const q=(document.getElementById('mutRiwayatCari')?.value||'').trim().toLowerCase();
  const list=[...dbMutasi].sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0)).filter(m=>{
    const s=[m.noMutasi,m.tokoAsal,m.tokoTujuan,m.kode,namaBarangLengkap(m),m.qty,m.satuan,m.ket].join(' ').toLowerCase();
    return !q || s.includes(q);
  }).slice(0,200);
  tb.innerHTML=list.map(m=>`<tr>
    <td>${escapeHTML(m.tgl||'-')}</td>
    <td><b>${escapeHTML(m.noMutasi||'LEGACY')}</b></td>
    <td>${escapeHTML(m.tokoAsal||'SUMOBITO')} → ${escapeHTML(m.tokoTujuan||'PETERONGAN')}</td>
    <td>${escapeHTML(m.kode||'-')}</td>
    <td>${escapeHTML(namaBarangLengkap(m))}</td>
    <td>${escapeHTML(m.qty||'')} ${escapeHTML(m.satuan||'')}</td>
  </tr>`).join('') || `<tr><td colspan="6" style="color:#94a3b8;text-align:center;padding:12px;">Tidak ada riwayat yang cocok.</td></tr>`;
}
async function kosongkanMutasi(){
  if(statusRoleAktif !== 'OWNER') return alert('Hanya pemilik yang dapat mengosongkan mutasi!');
  const no=nomorMutasiSekarang();
  const list=dataMutasiSaatIni();
  if(!list.length) return alert('Tidak ada item pada nomor mutasi saat ini.');
  if(!confirm(`Hapus ${list.length} item pada No. Mutasi ${no}?`)) return;
  try{
    if(db){
      const batch=db.batch();
      list.forEach(m=>batch.delete(db.collection('mutasi').doc(m.id)));
      await batch.commit();
    }
    dbMutasi=dbMutasi.filter(m=>String(m.noMutasi||'')!==no);
    await catatAuditFIX3('KOSONGKAN','MUTASI',no,`Kosongkan mutasi ${no} (${list.length} item)`);
    jadwalkanSimpanCacheLokal(); tabelMutasi();
    updateStatusMutasi(`Mutasi ${no} dikosongkan.`);
  }catch(e){ alert('Gagal mengosongkan mutasi: '+(e.message||e)); }
}
function nomorReturnSekarang(){ const el=document.getElementById('retNo'); return el&&el.value.trim()?el.value.trim().toUpperCase():''; }
let stcNomorReturnAktif='';
function buatNomorReturnBaru(){
  const now=new Date(),ymd=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
  const el=document.getElementById('retNo');if(el)el.value=nomorLokalBerikutnya('RET-'+ymd+'-',dbReturn,'noReturn');
  stcNomorReturnAktif='';updateStatusReturn('Nomor ditampilkan sebagai pratinjau. Nomor final diamankan saat item pertama disimpan.');
}
async function pastikanNomorReturn(){
  const current=nomorReturnSekarang();if(current&&current===stcNomorReturnAktif)return current;
  if(!db){if(!current)buatNomorReturnBaru();return nomorReturnSekarang();}
  const no=await alokasikanNomorTerpusat('RET','returns','noReturn',dbReturn);
  const el=document.getElementById('retNo');if(el)el.value=no;stcNomorReturnAktif=no;
  updateStatusReturn('Nomor return unik berhasil diamankan.');return no;
}
function validasiQtyReturn(el){if(!el)return;let v=String(el.value||'').replace(',','.').replace(/[^\d.]/g,'');const p=v.split('.');if(p.length>2)v=p[0]+'.'+p.slice(1).join('');el.value=v;}
function updateStatusReturn(msg,ok=false){const el=document.getElementById('retStatus');if(el){el.textContent=msg||'';el.style.color=ok?'#34d399':'#94a3b8';}}
function dataReturnSaatIni(){const no=nomorReturnSekarang();if(!no)return[];return dbReturn.filter(r=>String(r.noReturn||'')===no).sort((a,b)=>(a.tglWaktu||0)-(b.tglWaktu||0));}
function updateRingkasanReturn(){const list=dataReturnSaatIni(),box=document.getElementById('retSummary'),count=document.getElementById('retCount');if(count)count.textContent=`(${list.length} item)`;const a=document.getElementById('retAsal')?.value||'-',t=document.getElementById('retTujuan')?.value||'-';if(box)box.innerHTML=`<b>Ringkasan:</b> ${list.length} item • ${escapeHTML(a)} → ${escapeHTML(t)} • No. ${escapeHTML(nomorReturnSekarang()||'-')}`;}
function tukarPosisiReturn(){const a=document.getElementById('retAsal'),b=document.getElementById('retTujuan');if(!a||!b)return;const t=a.value;a.value=b.value;b.value=t;updateStatusReturn(`Rute: ${a.value} → ${b.value}`);}
function cariRetKode(){const k=document.getElementById('retKode').value.trim().toUpperCase();pilihRet=dbBrg.find(b=>String(b.kode||'').toUpperCase()===k);if(pilihRet){kosongkanKolomCari('retKode','retNama');infoRet();updateStatusReturn('Barang ditemukan. Silakan isi jumlah.');}else alert('Kode barang tidak ditemukan!');}
function cariRetNama(){const n=document.getElementById('retNama').value.trim().toLowerCase();if(!n)return alert('Masukkan nama barang terlebih dahulu!');pilihRet=dbBrg.find(b=>cocokNamaBarang(b,n)||String(b.nama||'').toLowerCase()===n);if(pilihRet){kosongkanKolomCari('retKode','retNama');infoRet();updateStatusReturn('Barang ditemukan. Silakan isi jumlah.');}else alert('Nama barang tidak ditemukan!');}
function infoRet(){if(pilihRet)document.getElementById('infoRet').innerHTML=`<div class="info-box"><b>${escapeHTML(pilihRet.kode)}</b> - ${escapeHTML(namaBarangLengkap(pilihRet))}</div>`;}
function resetFormReturnItem(){['retKode','retNama','retQty','retKet'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const s=document.getElementById('retSatuan');if(s)s.value='PCS';const a=document.getElementById('retAlasan');if(a)a.value='RUSAK';const i=document.getElementById('infoRet');if(i)i.innerHTML='';pilihRet=null;updateStatusReturn('Form item dibersihkan.');}
async function tambahReturn_FIX2_core(){
  if(!pilihRet)return alert('Pilih barang dahulu!');
  const qtyRaw=document.getElementById('retQty').value.trim(),qty=parseFloat(qtyRaw); if(!/^\d+(?:[.,]\d+)?$/.test(qtyRaw)||!Number.isFinite(qty)||qty<=0||qty>1000000000)return alert('Jumlah harus angka valid lebih besar dari 0 dan tidak melebihi 1.000.000.000!');
  const asal=document.getElementById('retAsal').value,tujuan=document.getElementById('retTujuan').value;if(!asal||!tujuan||asal===tujuan)return alert('Toko asal dan tujuan harus berbeda!');
  const no=await pastikanNomorReturn(),satuan=document.getElementById('retSatuan').value,alasan=document.getElementById('retAlasan').value,ket=document.getElementById('retKet').value.trim()||'-';
  if(ket.length>1000)return alert('Keterangan return maksimal 1000 karakter.');
  const duplikat=dataReturnSaatIni().find(r=>String(r.kode||'')===String(pilihRet.kode||''));if(duplikat&&!confirm(`Barang ${pilihRet.kode} sudah ada pada No. Return ${no} (${duplikat.qty} ${duplikat.satuan||''}). Tambahkan baris kedua?`))return;
  const idDoc=buatIdDokumen('RET');const payload={id:idDoc,noReturn:no,tokoAsal:asal,tokoTujuan:tujuan,kode:pilihRet.kode,nama:snapshotNamaBarang(pilihRet),kat:pilihRet.kat||'',jenisKabel:pilihRet.jenisKabel||'',ukuranKabel:pilihRet.ukuranKabel||'',qty:qty,satuan,alasan,ket,status:'DIAJUKAN',riwayatStatus:[{status:'DIAJUKAN',waktu:Date.now(),tanggal:tgl()}],tgl:tgl(),tglWaktu:Date.now()};
  try{if(db)await db.collection('returns').doc(idDoc).set(payload);else{dbReturn.unshift(payload);jadwalkanSimpanCacheLokal();tabelReturn();}await catatAuditFIX3('BUAT','RETURN',idDoc,`Return ${no}: ${asal} ke ${tujuan}, barang ${payload.kode}`);if(db)tabelReturn();updateStatusReturn(`Item ${pilihRet.kode} berhasil ditambahkan ke ${no}.`,true);resetFormReturnItem();}catch(e){alert('Gagal menyimpan return: '+(e.message||e));}
}
async function tambahReturn(){ return jalankanDenganKunciSimpan('return-item', tambahReturn_FIX2_core); }

function tabelReturn(){const tb=document.getElementById('tabelReturn');if(!tb)return;const list=dataReturnSaatIni();tb.innerHTML=list.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(r.kode)}</td><td>${escapeHTML(namaBarangLengkap(r))}</td><td><b>${escapeHTML(r.qty)}</b> ${escapeHTML(r.satuan||'')}</td><td>${escapeHTML(r.alasan||'-')}</td><td>${escapeHTML(r.ket||'-')}</td><td class="kolom-aksi-admin"><button class="btn-danger aksi-sm" onclick="hapusReturnItem('${escapeHTML(r.id)}')">Hapus</button></td></tr>`).join('')||`<tr><td colspan="7" class="text-center" style="color:#94a3b8;padding:12px;">Belum ada item pada nomor return ini.</td></tr>`;updateRingkasanReturn();}
async function hapusReturnItem(id){if(statusRoleAktif!=='OWNER')return alert('Penghapusan return hanya untuk OWNER.');const item=dbReturn.find(r=>String(r.id)===String(id));if(!item)return;if(!confirm(`Hapus ${item.kode} dari No. Return ${item.noReturn||'-'}?`))return;try{if(db)await db.collection('returns').doc(id).delete();else dbReturn=dbReturn.filter(r=>String(r.id)!==String(id));await catatAuditFIX3('HAPUS','RETURN',id,`Hapus item return ${item.kode} pada ${item.noReturn||'-'}`);jadwalkanSimpanCacheLokal();tabelReturn();}catch(e){alert('Gagal menghapus return: '+(e.message||e));}}
function tampilkanRiwayatReturn(){const box=document.getElementById('riwayatReturnBox');if(!box)return;box.style.display='block';tabelRiwayatReturn();}
function tabelRiwayatReturn(){const tb=document.getElementById('tabelRiwayatReturn');if(!tb)return;const q=(document.getElementById('retRiwayatCari')?.value||'').trim().toLowerCase();const list=[...dbReturn].filter(r=>{const hay=`${r.noReturn||''} ${r.kode||''} ${namaBarangLengkap(r)||''} ${r.tokoAsal||''} ${r.tokoTujuan||''} ${r.alasan||''} ${r.ket||''}`.toLowerCase();return !q||hay.includes(q);}).sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0));tb.innerHTML=list.map(r=>`<tr><td>${escapeHTML(r.tgl||'-')}</td><td><b>${escapeHTML(r.noReturn||'LEGACY')}</b></td><td>${escapeHTML(r.tokoAsal||'-')} → ${escapeHTML(r.tokoTujuan||'-')}</td><td>${escapeHTML(r.kode||'-')}</td><td>${escapeHTML(namaBarangLengkap(r))}</td><td>${escapeHTML(r.qty||'')} ${escapeHTML(r.satuan||'')}</td><td>${escapeHTML(r.alasan||'-')}</td></tr>`).join('')||`<tr><td colspan="7" style="color:#94a3b8;text-align:center;padding:12px;">Tidak ada riwayat yang cocok.</td></tr>`;}
async function kosongkanReturn(){if(statusRoleAktif!=='OWNER')return alert('Hanya pemilik yang dapat mengosongkan return!');const no=nomorReturnSekarang(),list=dataReturnSaatIni();if(!list.length)return alert('Tidak ada item pada nomor return saat ini.');if(!confirm(`Hapus ${list.length} item pada No. Return ${no}?`))return;try{if(db){const batch=db.batch();list.forEach(r=>batch.delete(db.collection('returns').doc(r.id)));await batch.commit();}dbReturn=dbReturn.filter(r=>String(r.noReturn||'')!==no);await catatAuditFIX3('KOSONGKAN','RETURN',no,`Kosongkan return ${no} (${list.length} item)`);jadwalkanSimpanCacheLokal();tabelReturn();updateStatusReturn(`Return ${no} dikosongkan.`);}catch(e){alert('Gagal mengosongkan return: '+(e.message||e));}}

/* FIX3: AUDIT LOG, STATUS, RIWAYAT, PENCARIAN & FILTER */
async function catatAuditFIX3(aksi, modul, refId, ringkasan){
  const id=buatIdDokumen('AUD');
  const record={id,uid:currentAuthUser?.uid||'',aksi:String(aksi||'').slice(0,40),modul:String(modul||'').slice(0,40),refId:String(refId||'').slice(0,160),ringkasan:String(ringkasan||'').slice(0,500),peran:statusRoleAktif==='OWNER'?'OWNER':'CABANG',waktu:Date.now(),tanggal:tgl()};
  try{
    if(db) await db.collection('audit_logs').doc(id).set(record);
    else { dbAuditLog.unshift(record); renderSemuaRiwayatFIX3(); }
  }catch(e){ console.warn('Audit log gagal dicatat:',e.message); }
}
function statusAwalFIX3(modul,item){
  if(item && item.status) return item.status;
  return modul==='ORDER'?'BARU':modul==='MUTASI'?'DIBUAT':'DIAJUKAN';
}
function opsiStatusFIX3(modul,current,id){
  const options=modul==='ORDER'?['BARU','DIPROSES','SELESAI','DIBATALKAN']:modul==='MUTASI'?['DIBUAT','DIKIRIM','DITERIMA','DIBATALKAN']:['DIAJUKAN','DIPROSES','SELESAI','DITOLAK'];
  const value=statusAwalFIX3(modul,{status:current});
  return `<select class="aksi-sm" ${statusRoleAktif!=='OWNER'?'disabled title="Perubahan status hanya untuk OWNER"':''} onchange="ubahStatusFIX3('${modul}','${escapeHTML(id)}',this.value)">${options.map(x=>`<option value="${x}" ${x===value?'selected':''}>${x}</option>`).join('')}</select>`;
}
async function ubahStatusFIX3(modul,id,statusBaru){
  if(statusRoleAktif!=='OWNER') return alert('Perubahan status hanya dapat dilakukan OWNER.');
  const map={ORDER:{col:'orders',arr:dbOrder,key:'id',label:'order'},MUTASI:{col:'mutasi',arr:dbMutasi,key:'noMutasi',label:'mutasi'},RETURN:{col:'returns',arr:dbReturn,key:'noReturn',label:'return'}};
  const cfg=map[modul]; if(!cfg)return;
  const allowed=modul==='ORDER'?['BARU','DIPROSES','SELESAI','DIBATALKAN']:modul==='MUTASI'?['DIBUAT','DIKIRIM','DITERIMA','DIBATALKAN']:['DIAJUKAN','DIPROSES','SELESAI','DITOLAK'];
  if(!allowed.includes(statusBaru))return alert('Status tidak dikenal.');
  const items=cfg.arr.filter(x=>String(x[cfg.key])===String(id)); if(!items.length)return alert('Data riwayat tidak ditemukan.');
  const now=Date.now(),entry={status:statusBaru,waktu:now,tanggal:tgl(),peran:'OWNER'};
  try{
    if(db){
      const batch=db.batch();
      items.forEach(item=>{const hist=Array.isArray(item.riwayatStatus)?item.riwayatStatus:[];batch.update(db.collection(cfg.col).doc(String(item.id)),{status:statusBaru,riwayatStatus:[...hist,entry]});});
      await batch.commit();
    } else items.forEach(item=>{item.status=statusBaru;item.riwayatStatus=[...(item.riwayatStatus||[]),entry];});
    await catatAuditFIX3('UBAH STATUS',modul,id,`Status ${cfg.label} ${id} menjadi ${statusBaru}`);
    renderSemuaRiwayatFIX3();
  }catch(e){alert('Gagal mengubah status: '+(e.message||e));renderSemuaRiwayatFIX3();}
}
function filterTanggalFIX3(item){
  const from=document.getElementById('fix3DariTanggal')?.value||'',to=document.getElementById('fix3SampaiTanggal')?.value||'';
  const stamp=Number(item.waktu||item.tglWaktu||0); if(!stamp)return true; const date=new Date(stamp); if(!Number.isFinite(date.getTime()))return true;
  const ymd=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  return (!from||ymd>=from)&&(!to||ymd<=to);
}
function resetFilterRiwayatFIX3(){['fix3RiwayatCari','fix3DariTanggal','fix3SampaiTanggal'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const s=document.getElementById('fix3RiwayatJenis');if(s)s.value='SEMUA';renderSemuaRiwayatFIX3();}
function renderSemuaRiwayatFIX3(){
  const page=document.getElementById('riwayatAktivitas');if(!page)return;
  const q=(document.getElementById('fix3RiwayatCari')?.value||'').trim().toLowerCase(),kind=document.getElementById('fix3RiwayatJenis')?.value||'SEMUA';
  const match=x=>!q||JSON.stringify(x).toLowerCase().includes(q);
  const visible=id=>{const e=document.getElementById(id);if(e)e.style.display=(kind==='SEMUA'||kind===id.replace('fix3','').replace('Section','').toUpperCase())?'':'none';};
  ['fix3AuditSection','fix3OrderSection','fix3MutasiSection','fix3ReturnSection'].forEach(visible);
  const audit=(dbAuditLog||[]).filter(x=>match(x)&&filterTanggalFIX3({waktu:x.waktu})).slice(0,300);
  const orders=[...dbOrder].filter(x=>match(x)&&filterTanggalFIX3({tglWaktu:x.tglWaktu})).sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0)).slice(0,300);
  const mutasi=[...dbMutasi].filter(x=>match(x)&&filterTanggalFIX3({tglWaktu:x.tglWaktu})).sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0)).slice(0,300);
  const returns=[...dbReturn].filter(x=>match(x)&&filterTanggalFIX3({tglWaktu:x.tglWaktu})).sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0)).slice(0,300);
  const set=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
  set('fix3AuditBody',audit.map(x=>`<tr><td>${escapeHTML(x.tanggal||'-')}<br>${new Date(x.waktu||0).toLocaleTimeString('id-ID')}</td><td>${escapeHTML(x.peran||'-')}</td><td>${escapeHTML(x.modul||'-')}</td><td>${escapeHTML(x.aksi||'-')}</td><td>${escapeHTML(x.ringkasan||'-')}</td></tr>`).join('')||'<tr><td colspan="5">Belum ada catatan aktivitas yang cocok.</td></tr>');
  set('fix3OrderBody',orders.map(o=>`<tr><td>${escapeHTML(o.tgl||'-')}<br>${new Date(o.tglWaktu||0).toLocaleTimeString('id-ID')}</td><td>${escapeHTML(o.id||'-')}</td><td>${escapeHTML(o.toko||'-')}</td><td>${escapeHTML(o.kode||'-')} · ${escapeHTML(namaBarangLengkap(o))}<br>${escapeHTML(o.ket||'')}</td><td>${escapeHTML(statusAwalFIX3('ORDER',o))}<br><small>${(o.riwayatStatus||[]).length} perubahan</small></td><td>${opsiStatusFIX3('ORDER',statusAwalFIX3('ORDER',o),o.id)}</td></tr>`).join('')||'<tr><td colspan="6">Belum ada riwayat order yang cocok.</td></tr>');
  set('fix3MutasiBody',mutasi.map(m=>`<tr><td>${escapeHTML(m.tgl||'-')}<br>${new Date(m.tglWaktu||0).toLocaleTimeString('id-ID')}</td><td>${escapeHTML(m.noMutasi||'-')}</td><td>${escapeHTML(m.tokoAsal||'-')} → ${escapeHTML(m.tokoTujuan||'-')}</td><td>${escapeHTML(m.kode||'-')} · ${escapeHTML(namaBarangLengkap(m))}</td><td>${escapeHTML(m.qty||'')} ${escapeHTML(m.satuan||'')}</td><td>${escapeHTML(statusAwalFIX3('MUTASI',m))}<br><small>${(m.riwayatStatus||[]).length} perubahan</small></td><td>${opsiStatusFIX3('MUTASI',statusAwalFIX3('MUTASI',m),m.noMutasi)}</td></tr>`).join('')||'<tr><td colspan="7">Belum ada riwayat mutasi yang cocok.</td></tr>');
  set('fix3ReturnBody',returns.map(r=>`<tr><td>${escapeHTML(r.tgl||'-')}<br>${new Date(r.tglWaktu||0).toLocaleTimeString('id-ID')}</td><td>${escapeHTML(r.noReturn||'-')}</td><td>${escapeHTML(r.tokoAsal||'-')} → ${escapeHTML(r.tokoTujuan||'-')}</td><td>${escapeHTML(r.kode||'-')} · ${escapeHTML(namaBarangLengkap(r))}<br>${escapeHTML(r.qty||'')} ${escapeHTML(r.satuan||'')}</td><td>${escapeHTML(r.alasan||'-')}</td><td>${escapeHTML(statusAwalFIX3('RETURN',r))}<br><small>${(r.riwayatStatus||[]).length} perubahan</small></td><td>${opsiStatusFIX3('RETURN',statusAwalFIX3('RETURN',r),r.noReturn)}</td></tr>`).join('')||'<tr><td colspan="7">Belum ada riwayat return yang cocok.</td></tr>');
  const st=document.getElementById('fix3RiwayatStatus');if(st)st.textContent=`Hasil: ${audit.length} aktivitas • ${orders.length} order • ${mutasi.length} item mutasi • ${returns.length} item return. Maksimal 300 baris per jenis.`;
}


/* FIX4: LAPORAN, FILTER CABANG/PERIODE, DAN EKSPOR CSV */
function tanggalEpochFIX4(item){
  const n=Number(item?.tglWaktu||item?.waktu||0);
  if(n>0) return n;
  const s=String(item?.tgl||item?.tanggal||'');
  const d=new Date(s);
  return Number.isNaN(d.getTime())?0:d.getTime();
}
function rentangFIX4(item){
  const ts=tanggalEpochFIX4(item), d=new Date(ts);
  const dari=document.getElementById('fix4Dari')?.value||'';
  const sampai=document.getElementById('fix4Sampai')?.value||'';
  if(!ts) return !dari&&!sampai;
  if(dari && ts < new Date(dari+'T00:00:00').getTime()) return false;
  if(sampai && ts > new Date(sampai+'T23:59:59').getTime()) return false;
  return true;
}
function dataLaporanFIX4(abaikanJenis=false){
  const q=(document.getElementById('fix4Cari')?.value||'').trim().toLowerCase();
  const cab=(document.getElementById('fix4Cabang')?.value||'').toLowerCase();
  const pilih=(document.getElementById('fix4Jenis')?.value||'SEMUA');
  const dasar=(arr,jenis)=>arr.filter(x=>{
    if(!rentangFIX4(x)) return false;
    const teks=JSON.stringify(x).toLowerCase();
    if(q&&!teks.includes(q)) return false;
    if(cab){
      const lokasi=jenis==='ORDER'?String(x.toko||''):
        [x.tokoAsal||'',x.tokoTujuan||''].join(' ');
      if(!lokasi.toLowerCase().includes(cab)) return false;
    }
    return true;
  }).sort((a,b)=>tanggalEpochFIX4(b)-tanggalEpochFIX4(a));
  return {
    orders: abaikanJenis||pilih==='SEMUA'||pilih==='ORDER'?dasar(dbOrder,'ORDER'):[],
    mutasi: abaikanJenis||pilih==='SEMUA'||pilih==='MUTASI'?dasar(dbMutasi,'MUTASI'):[],
    returns: abaikanJenis||pilih==='SEMUA'||pilih==='RETURN'?dasar(dbReturn,'RETURN'):[]
  };
}
function isiPilihanCabangFIX4(){
  const el=document.getElementById('fix4Cabang'); if(!el)return;
  const lama=el.value;
  const nama=new Set();
  (dbOrder||[]).forEach(x=>{if(x.toko)nama.add(String(x.toko));});
  [...(dbMutasi||[]),...(dbReturn||[])].forEach(x=>{if(x.tokoAsal)nama.add(String(x.tokoAsal));if(x.tokoTujuan)nama.add(String(x.tokoTujuan));});
  el.innerHTML='<option value="">SEMUA CABANG</option>'+[...nama].sort((a,b)=>a.localeCompare(b,'id')).map(x=>`<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join('');
  if([...el.options].some(o=>o.value===lama))el.value=lama;
}
function renderLaporanFIX4(){
  if(statusRoleAktif!=='OWNER'){alert('Laporan FIX4 hanya dapat diakses OWNER.');kembali();return;}
  isiPilihanCabangFIX4();
  const d=dataLaporanFIX4(), semua=dataLaporanFIX4(true);
  const nO=semua.orders.length,nM=semua.mutasi.length,nR=semua.returns.length;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('fix4JumlahOrder',nO);set('fix4JumlahMutasi',nM);set('fix4JumlahReturn',nR);
  const jumlahMut=semua.mutasi.reduce((s,x)=>s+nilaiQtyTransaksi(x.qty),0);
  const jumlahRet=semua.returns.reduce((s,x)=>s+nilaiQtyTransaksi(x.qty),0);
  set('fix4Ringkasan',`Ringkasan sesuai filter: ${nO} order • ${nM} transaksi mutasi (${jumlahMut.toLocaleString('id-ID')} jumlah barang) • ${nR} transaksi return (${jumlahRet.toLocaleString('id-ID')} jumlah barang). Data ditampilkan dari koleksi yang sudah tersinkron.`);
  const jenis=document.getElementById('fix4Jenis')?.value||'SEMUA';
  let rows=[],heads=[];
  if(jenis==='ORDER'){
    heads=['Waktu','No./ID','Cabang/Pemesan','Kode Barang','Nama Barang','Status','Keterangan'];
    rows=d.orders.map(x=>[x.tgl||'',x.id||'',x.toko||'',x.kode||'',x.nama||'',statusAwalFIX3('ORDER',x),x.ket||'']);
  }else if(jenis==='MUTASI'){
    heads=['Waktu','No. Mutasi','Asal','Tujuan','Kode Barang','Nama Barang','Jumlah','Satuan','Status','Keterangan'];
    rows=d.mutasi.map(x=>[x.tgl||'',x.noMutasi||x.id||'',x.tokoAsal||'',x.tokoTujuan||'',x.kode||'',x.nama||'',x.qty||'',x.satuan||'',statusAwalFIX3('MUTASI',x),x.ket||'']);
  }else if(jenis==='RETURN'){
    heads=['Waktu','No. Return','Asal','Tujuan','Kode Barang','Nama Barang','Jumlah','Satuan','Alasan','Status'];
    rows=d.returns.map(x=>[x.tgl||'',x.noReturn||x.id||'',x.tokoAsal||'',x.tokoTujuan||'',x.kode||'',x.nama||'',x.qty||'',x.satuan||'',x.alasan||'',statusAwalFIX3('RETURN',x)]);
  }else{
    heads=['Jenis','Waktu','Nomor/ID','Cabang/Rute','Kode Barang','Nama Barang','Jumlah','Status'];
    rows=[
      ...d.orders.map(x=>['ORDER',x.tgl||'',x.id||'',x.toko||'',x.kode||'',x.nama||'',x.stok||'',statusAwalFIX3('ORDER',x)]),
      ...d.mutasi.map(x=>['MUTASI',x.tgl||'',x.noMutasi||x.id||'',`${x.tokoAsal||''} → ${x.tokoTujuan||''}`,x.kode||'',x.nama||'',x.qty||'',statusAwalFIX3('MUTASI',x)]),
      ...d.returns.map(x=>['RETURN',x.tgl||'',x.noReturn||x.id||'',`${x.tokoAsal||''} → ${x.tokoTujuan||''}`,x.kode||'',x.nama||'',x.qty||'',statusAwalFIX3('RETURN',x)])
    ];
  }
  const th=document.getElementById('fix4Head'),tb=document.getElementById('fix4Body');
  if(th)th.innerHTML='<tr>'+heads.map(x=>`<th>${escapeHTML(x)}</th>`).join('')+'</tr>';
  if(tb)tb.innerHTML=rows.map(r=>'<tr>'+r.map(v=>`<td>${escapeHTML(v??'')}</td>`).join('')+'</tr>').join('')||`<tr><td colspan="${heads.length}">Tidak ada data yang cocok dengan filter.</td></tr>`;
}
function resetFilterLaporanFIX4(){
  ['fix4Dari','fix4Sampai','fix4Cari'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const c=document.getElementById('fix4Cabang');if(c)c.value='';
  const j=document.getElementById('fix4Jenis');if(j)j.value='SEMUA';
  renderLaporanFIX4();
}
function csvFIX4(v){
  let s=String(v??'');
  // Cegah formula injection saat file dibuka di aplikasi spreadsheet.
  if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
function unduhCSVFIX4(nama,header,rows){
  const csv='\uFEFF'+[header,...rows].map(r=>r.map(csvFIX4).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nama;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function eksporLaporanFIX4(jenis){
  if(statusRoleAktif!=='OWNER')return alert('Ekspor laporan hanya dapat dilakukan OWNER.');
  const d=dataLaporanFIX4(jenis==='SEMUA'),stamp=new Date().toISOString().slice(0,10);
  if(jenis==='ORDER'){
    unduhCSVFIX4(`STC_Order_${stamp}.csv`,['Waktu','No./ID','Cabang/Pemesan','Kode Barang','Nama Barang','Status','Keterangan'],d.orders.map(x=>[x.tgl||'',x.id||'',x.toko||'',x.kode||'',x.nama||'',statusAwalFIX3('ORDER',x),x.ket||'']));
  }else if(jenis==='MUTASI'){
    unduhCSVFIX4(`STC_Mutasi_${stamp}.csv`,['Waktu','No. Mutasi','Asal','Tujuan','Kode Barang','Nama Barang','Jumlah','Satuan','Status','Keterangan'],d.mutasi.map(x=>[x.tgl||'',x.noMutasi||x.id||'',x.tokoAsal||'',x.tokoTujuan||'',x.kode||'',x.nama||'',x.qty||'',x.satuan||'',statusAwalFIX3('MUTASI',x),x.ket||'']));
  }else if(jenis==='RETURN'){
    unduhCSVFIX4(`STC_Return_${stamp}.csv`,['Waktu','No. Return','Asal','Tujuan','Kode Barang','Nama Barang','Jumlah','Satuan','Alasan','Status'],d.returns.map(x=>[x.tgl||'',x.noReturn||x.id||'',x.tokoAsal||'',x.tokoTujuan||'',x.kode||'',x.nama||'',x.qty||'',x.satuan||'',x.alasan||'',statusAwalFIX3('RETURN',x)]));
  }else{
    const rows=[
      ...d.orders.map(x=>['ORDER',x.tgl||'',x.id||'',x.toko||'',x.kode||'',x.nama||'',x.stok||'',statusAwalFIX3('ORDER',x)]),
      ...d.mutasi.map(x=>['MUTASI',x.tgl||'',x.noMutasi||x.id||'',`${x.tokoAsal||''} → ${x.tokoTujuan||''}`,x.kode||'',x.nama||'',x.qty||'',statusAwalFIX3('MUTASI',x)]),
      ...d.returns.map(x=>['RETURN',x.tgl||'',x.noReturn||x.id||'',`${x.tokoAsal||''} → ${x.tokoTujuan||''}`,x.kode||'',x.nama||'',x.qty||'',statusAwalFIX3('RETURN',x)])
    ];
    unduhCSVFIX4(`STC_Laporan_Gabungan_${stamp}.csv`,['Jenis','Waktu','Nomor/ID','Cabang/Rute','Kode Barang','Nama Barang','Jumlah','Status'],rows);
  }
}

/* PENJUALAN */
function hitungSubtotalJual(){ const h=(pilihJual?.harga||0)*angka(document.getElementById('jualQty').value||1); document.getElementById('jualSubtotal').value=h.toLocaleString(); }
function cariJualKode(){ pilihJual=dbBrg.find(b=>b.kode===document.getElementById('jualKode').value.trim().toUpperCase()); if(pilihJual) kosongkanKolomCari('jualKode','jualNama'); hitungSubtotalJual(); }
function cariJualNama(){ pilihJual=dbBrg.find(b=>cocokNamaBarang(b,document.getElementById('jualNama').value.trim())); if(pilihJual) kosongkanKolomCari('jualKode','jualNama'); hitungSubtotalJual(); }

async function tambahPenjualanHariIni(){
  if(!pilihJual) return alert('Pilih barang dahulu!');
  const idDoc = buatIdDokumen('JUAL');
  const qtyJual = angka(document.getElementById('jualQty').value);
  const subtotalJual = angka(document.getElementById('jualSubtotal').value);
  if(qtyJual <= 0 || subtotalJual <= 0) return alert('Jumlah dan subtotal penjualan harus lebih dari nol.');
  const payload = { id: idDoc, kode: pilihJual.kode, nama: snapshotNamaBarang(pilihJual), kat: pilihJual.kat || '', jenisKabel: pilihJual.jenisKabel || '', ukuranKabel: pilihJual.ukuranKabel || '', qty: qtyJual, subtotal: subtotalJual, tgl: tgl(), tglWaktu: Date.now() };

  if(db) await db.collection('penjualan').doc(idDoc).set(payload);
  else { dbPenjualanHariIni.unshift(payload); jadwalkanSimpanCacheLokal(); tabelPenjualanHariIni(); hitungTotalPenjualan(); }
  await catatAuditFIX3('BUAT','PENJUALAN',idDoc,`Penjualan ${payload.kode}, jumlah ${qtyJual}`);

  document.getElementById('jualKode').value=''; document.getElementById('jualNama').value=''; document.getElementById('jualQty').value='1'; document.getElementById('jualSubtotal').value='0'; pilihJual=null;
}
function tabelPenjualanHariIni(){ 
  const tb=document.getElementById('tabelPenjualanHariIni'); 
  if(tb) tb.innerHTML=dbPenjualanHariIni.map((j)=>`
    <tr>
      <td>${escapeHTML(j.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(j))}</td>
      
      <td>${escapeHTML(j.qty)}</td>
      <td>Rp ${(j.subtotal||0).toLocaleString()}</td>
      <td><button class="btn-danger aksi-sm" onclick="hapusPenjualanItem(decodeURIComponent('${encodeURIComponent(j.id)}'))">Hapus</button></td>
    </tr>`).join(''); 
}
async function hapusPenjualanItem(id){
  if(db) await db.collection('penjualan').doc(id).delete();
  else { dbPenjualanHariIni = dbPenjualanHariIni.filter(j => j.id !== id); jadwalkanSimpanCacheLokal(); tabelPenjualanHariIni(); hitungTotalPenjualan(); }
}
function hitungTotalPenjualan(){ const t=dbPenjualanHariIni.reduce((s,x)=>s+(x.subtotal||0),0); const el=document.getElementById('displayTotalPenjualan'); if(el) el.innerText=`Rp ${t.toLocaleString()}`; }
async function kosongkanPenjualanHariIni(){ 
  if(confirm('Bersihkan seluruh daftar transaksi kasir hari ini?')){ 
    if(db){
      const snap = await db.collection('penjualan').get();
      const batch = db.batch(); snap.forEach(d => batch.delete(d.ref)); await batch.commit();
    } else { dbPenjualanHariIni=[]; jadwalkanSimpanCacheLokal(); tabelPenjualanHariIni(); hitungTotalPenjualan(); }
  } 
}

/* ANGSURAN */
function hitungSisaAngsuranAwal(){
  const s = angka(document.getElementById('angTotalHarga').value) - angka(document.getElementById('angUangMuka').value);
  const el = document.getElementById('angSisaAwal');
  if(el) el.value = (s > 0 ? s : 0).toLocaleString();
}
function statusAngsuran(a){
  const sisa = Math.max(0, Number(a.totalHarga||0) - Number(a.totalBayar||0));
  if(sisa <= 0) return 'LUNAS';
  const jt = a.jatuhTempo;
  if(jt && new Date(jt+'T23:59:59') < new Date()) return 'JATUH_TEMPO';
  return 'BELUM';
}
function formatTanggalAngsuran(v){
  if(!v) return '-';
  try { return new Date(v+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'}); } catch(e){ return v; }
}
async function simpanAngsuranBaru(){
  const pembeli = document.getElementById('angPembeli').value.trim();
  const noHp = document.getElementById('angNoHp').value.trim();
  const barang = document.getElementById('angBarangNama').value.trim();
  const total = angka(document.getElementById('angTotalHarga').value);
  const dp = angka(document.getElementById('angUangMuka').value);
  const tenor = Math.max(0, parseInt(document.getElementById('angTenor').value || '0',10));
  const jatuhTempo = document.getElementById('angJatuhTempo').value || '';
  const catatan = document.getElementById('angCatatan').value.trim();
  if(!pembeli || !barang || total <= 0) return alert('Lengkapi nama pembeli, barang/layanan, dan total deal.');
  if(dp < 0 || dp > total) return alert('Uang muka tidak boleh melebihi total harga.');
  if(tenor < 0 || tenor > 120) return alert('Tenor harus antara 1–120 bulan atau dikosongkan.');

  const idDoc = buatIdDokumen('ANG');
  const payload = {
    id:idDoc, pembeli:pembeli.toUpperCase(), noHp, barangNama:barang.toUpperCase(),
    totalHarga:total, dp, totalBayar:dp, tenor, jatuhTempo, catatan,
    tglDibuat:tgl(), tglWaktu:Date.now(), riwayatBayar: dp>0 ? [{id:buatIdDokumen('DP'), tanggal:tgl(), waktu:Date.now(), nominal:dp, metode:'DP', catatan:'Uang muka'}] : []
  };
  if(db) await db.collection('angsuran').doc(idDoc).set(payload);
  else { dbAngsuran.unshift(payload); jadwalkanSimpanCacheLokal(); tabelAngsuran(); }
  await catatAuditFIX3('BUAT','ANGSURAN',idDoc,`Buat angsuran untuk ${payload.pembeli}`);

  ['angPembeli','angNoHp','angBarangNama','angTotalHarga','angUangMuka','angTenor','angJatuhTempo','angCatatan'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('angSisaAwal').value='0';
  alert('Data angsuran tersimpan!');
}
async function bayarCicilan(id){
  const a = dbAngsuran.find(x => x.id === id);
  if(!a) return;
  const sisa = Math.max(0, Number(a.totalHarga||0) - Number(a.totalBayar||0));
  if(sisa <= 0) return alert('Angsuran ini sudah LUNAS!');
  const bayarStr = prompt(`Masukkan pembayaran untuk ${a.pembeli}\nSisa: Rp ${sisa.toLocaleString()}`);
  if(!bayarStr) return;
  const bayarNominal = angka(bayarStr);
  if(bayarNominal <= 0) return alert('Nominal pembayaran tidak valid!');
  if(bayarNominal > sisa) return alert('Pembayaran melebihi sisa angsuran.');
  const metode = (prompt('Metode pembayaran: CASH / TRANSFER / QRIS / LAIN', 'CASH') || 'CASH').trim().toUpperCase();
  const catatan = (prompt('Catatan pembayaran (opsional):', '') || '').trim();
  const totalBaru = Number(a.totalBayar||0) + bayarNominal;
  const riwayat = Array.isArray(a.riwayatBayar) ? [...a.riwayatBayar] : [];
  riwayat.push({id:buatIdDokumen('BYR'), tanggal:tgl(), waktu:Date.now(), nominal:bayarNominal, metode, catatan});
  const update = { totalBayar:totalBaru, riwayatBayar:riwayat, pembayaranTerakhir:tgl() };
  if(db) await db.collection('angsuran').doc(id).update(update);
  else { Object.assign(a,update); jadwalkanSimpanCacheLokal(); tabelAngsuran(); }
  await catatAuditFIX3('PEMBAYARAN','ANGSURAN',id,`Pembayaran angsuran ${a.pembeli}: ${bayarNominal}`);
  alert(`Pembayaran Rp ${bayarNominal.toLocaleString()} dicatat. Sisa: Rp ${Math.max(0,a.totalHarga-totalBaru).toLocaleString()}`);
}
function lihatRiwayatAngsuran(id){
  const a=dbAngsuran.find(x=>x.id===id); if(!a) return;
  const rows=Array.isArray(a.riwayatBayar)?a.riwayatBayar:[];
  const txt=rows.length?rows.map((r,i)=>`${i+1}. ${r.tanggal||'-'} | ${r.metode||'-'} | Rp ${(Number(r.nominal)||0).toLocaleString()}${r.catatan?' | '+r.catatan:''}`).join('\n'):'Belum ada riwayat pembayaran.';
  alert(`Riwayat pembayaran ${a.pembeli}\n\n${txt}`);
}
async function hapusAngsuranItem(id){
  if(confirm('Hapus data angsuran beserta riwayat pembayarannya?')){
    if(db) await db.collection('angsuran').doc(id).delete();
    else { dbAngsuran=dbAngsuran.filter(a=>a.id!==id); jadwalkanSimpanCacheLokal(); tabelAngsuran(); }
  }
}
function tabelAngsuran(){
  const tb=document.getElementById('tabelAngsuranBody'); if(!tb) return;
  const q=(document.getElementById('cariAngsuran')?.value||'').trim().toLowerCase();
  const fs=document.getElementById('filterStatusAngsuran')?.value||'';
  const data=dbAngsuran.filter(a=>{
    const st=statusAngsuran(a);
    const hay=((a.pembeli||'')+' '+(a.barangNama||'')+' '+(a.noHp||'')).toLowerCase();
    return (!q||hay.includes(q)) && (!fs||st===fs);
  });
  const totalKontrak=data.reduce((s,a)=>s+Number(a.totalHarga||0),0);
  const totalBayar=data.reduce((s,a)=>s+Number(a.totalBayar||0),0);
  const totalSisa=Math.max(0,totalKontrak-totalBayar);
  const ring=document.getElementById('ringkasanAngsuran');
  if(ring) ring.innerHTML=`Data: <b>${data.length}</b> • Kontrak: <b>Rp ${totalKontrak.toLocaleString()}</b> • Terbayar: <b>Rp ${totalBayar.toLocaleString()}</b> • Sisa: <b>Rp ${totalSisa.toLocaleString()}</b>`;
  if(!data.length){ tb.innerHTML=`<tr><td colspan="10" class="text-center" style="padding:10px;color:#94a3b8;">Belum ada data angsuran</td></tr>`; return; }
  tb.innerHTML=data.map((a,i)=>{
    const sisa=Math.max(0,Number(a.totalHarga||0)-Number(a.totalBayar||0));
    const st=statusAngsuran(a);
    const badge=st==='LUNAS'?'#059669':st==='JATUH_TEMPO'?'#dc2626':'#d97706';
    return `<tr>
      <td>${i+1}</td><td>${escapeHTML(a.tglDibuat||'-')}</td>
      <td><b>${escapeHTML(a.pembeli||'-')}</b>${a.noHp?`<br><small>${escapeHTML(a.noHp)}</small>`:''}</td>
      <td>${escapeHTML(a.barangNama||'-')}</td>
      <td>Rp ${(Number(a.totalHarga)||0).toLocaleString()}</td>
      <td>Rp ${(Number(a.totalBayar)||0).toLocaleString()}</td>
      <td style="color:${st==='LUNAS'?'#34d399':'#f87171'};font-weight:700;">Rp ${sisa.toLocaleString()}</td>
      <td>${formatTanggalAngsuran(a.jatuhTempo)}</td>
      <td><span style="background:${badge};color:#fff;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">${st}</span></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap;">
        ${st!=='LUNAS'?`<button class="btn-success aksi-sm" onclick="bayarCicilan(decodeURIComponent('${encodeURIComponent(a.id)}'))">Bayar</button>`:''}
        <button class="btn-primary aksi-sm" onclick="lihatRiwayatAngsuran(decodeURIComponent('${encodeURIComponent(a.id)}'))">Riwayat</button>
        <button class="btn-danger aksi-sm" onclick="hapusAngsuranItem(decodeURIComponent('${encodeURIComponent(a.id)}'))">Hapus</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* PENGATURAN TOKO & PENJAGA */
function muatFormPengaturan(){ document.getElementById('setNamaToko').value=configApp.namaToko||''; document.getElementById('setNamaCabang').value=configApp.namaCabang||''; document.getElementById('setAlamatToko').value=configApp.alamatToko||''; }
async function simpanPengaturanUmum(){ 
  if(statusRoleAktif !== 'OWNER') return alert('Khusus OWNER.');
  configApp.namaCabang=document.getElementById('namaCabang').value; 
  if(db) await db.collection('pengaturan').doc('umum').set({ configApp, petugasJagaAktif }, { merge: true });
  else jadwalkanSimpanCacheLokal();
}
async function simpanPengaturanLengkap(){ 
  if(statusRoleAktif !== 'OWNER') return alert('Khusus OWNER.');
  configApp.namaToko=document.getElementById('setNamaToko').value; 
  configApp.namaCabang=document.getElementById('setNamaCabang').value; 
  configApp.alamatToko=document.getElementById('setAlamatToko').value; 
  if(db) await db.collection('pengaturan').doc('umum').set({ configApp, petugasJagaAktif }, { merge: true });
  else jadwalkanSimpanCacheLokal();
  await catatAuditFIX3('UBAH','PENGATURAN','umum','Pengaturan toko diperbarui');
  applyPengaturanUI(); 
  alert('Pengaturan toko diperbarui!'); 
}
function normalisasiNamaPenjaga(nama){ return normalisasiSpasi(nama).toUpperCase(); }
function waktuPenjagaFormat(iso){
  if(!iso) return '-';
  try { return new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(/\./g,':'); } catch(e){ return iso; }
}
function renderDaftarKaryawanPenjaga(){
  const tb=document.getElementById('daftarKaryawanPenjaga'); if(!tb) return;
  if(!daftarKaryawanPenjaga.length){ tb.innerHTML='<tr><td colspan="4" class="text-center">Belum ada karyawan.</td></tr>'; return; }
  tb.innerHTML=daftarKaryawanPenjaga.map((nama,i)=>{
    const aktif=String(petugasJagaAktif?.nama||'').toUpperCase()===String(nama).toUpperCase();
    return `<tr><td>${i+1}</td><td><b>${escapeHTML(nama)}</b></td><td><span style="background:${aktif?'#059669':'#475569'};color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700">${aktif?'AKTIF':'TERSEDIA'}</span></td><td>${aktif?'':`<button class="btn-danger aksi-sm" onclick="hapusKaryawanPenjaga(${i})">Hapus</button>`}</td></tr>`;
  }).join('');
}
function renderRiwayatPenjaga(){
  const tb=document.getElementById('riwayatPenjagaBody'); if(!tb) return;
  const data=riwayatPenjaga.slice().reverse().slice(0,30);
  if(!data.length){ tb.innerHTML='<tr><td colspan="5" class="text-center" style="padding:10px;color:#94a3b8">Belum ada riwayat penetapan petugas.</td></tr>'; return; }
  tb.innerHTML=data.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(waktuPenjagaFormat(r.waktu))}</td><td><b>${escapeHTML(r.shift||'-')}</b></td><td>${escapeHTML(r.nama||'-')}</td><td>${r.aksi==='NONAKTIF'?'<span style="color:#f87171;font-weight:700">NONAKTIF</span> ':r.aksi==='AKTIF'?'<span style="color:#34d399;font-weight:700">AKTIF</span> ':''}${escapeHTML(r.catatan||'-')}</td></tr>`).join('');
}
function muatMenuPenjagaToko(){
  const sh=document.getElementById('pilihShiftPenjaga');
  const nm=document.getElementById('pilihNamaPenjaga');
  const aktif=!!(petugasJagaAktif && String(petugasJagaAktif.nama||'').trim());
  if(sh) sh.value=petugasJagaAktif?.shift||'PAGI';
  if(nm){
    nm.innerHTML='<option value="">-- Pilih Penjaga --</option>'+daftarKaryawanPenjaga.map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
    nm.value=aktif ? (petugasJagaAktif.nama||'') : '';
  }
  const a=document.getElementById('infoPenjagaAktif'); if(a) a.textContent=aktif ? petugasJagaAktif.nama : 'TIDAK ADA / NONAKTIF';
  const b=document.getElementById('infoShiftAktif'); if(b) b.textContent=aktif ? (petugasJagaAktif.shift||'-') : '-';
  const c=document.getElementById('infoWaktuPenjaga'); if(c) c.textContent=aktif ? waktuPenjagaFormat(petugasJagaAktif.waktu) : '-';
  const cat=document.getElementById('catatanPenjaga'); if(cat) cat.value=aktif ? (petugasJagaAktif.catatan||'') : '';
  const st=document.getElementById('statusPenjagaToko');
  if(st){ st.innerHTML=aktif ? '🟢 <b>Penjaga toko aktif.</b> Transaksi dapat mencatat petugas yang sedang bertugas.' : '⚪ <b>Penjaga toko nonaktif.</b> Toko berjalan tanpa penjaga yang ditetapkan.'; }
  renderDaftarKaryawanPenjaga(); renderRiwayatPenjaga();
}
async function simpanDataPenjaga(){
  const payload={configApp,petugasJagaAktif,daftarKaryawanPenjaga,riwayatPenjaga};
  if(db) await db.collection('pengaturan').doc('umum').set(payload,{merge:true});
  else jadwalkanSimpanCacheLokal();
}
async function simpanPenjagaAktif(){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus OWNER.');
  const nama=document.getElementById('pilihNamaPenjaga').value;
  if(!nama) return alert('Pilih nama karyawan terlebih dahulu.');
  const shift=document.getElementById('pilihShiftPenjaga').value;
  const catatan=normalisasiSpasi(document.getElementById('catatanPenjaga').value);
  const waktu=new Date().toISOString();
  petugasJagaAktif={aktif:true,shift,nama,waktu,catatan};
  riwayatPenjaga.push({aksi:'AKTIF',shift,nama,waktu,catatan});
  if(riwayatPenjaga.length>100) riwayatPenjaga=riwayatPenjaga.slice(-100);
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
  alert(`Petugas ${nama} ditetapkan untuk shift ${shift}.`);
}
async function nonaktifkanPenjagaToko(){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus OWNER.');
  if(!petugasJagaAktif || !String(petugasJagaAktif.nama||'').trim()) return alert('Penjaga toko sudah dalam keadaan nonaktif.');
  if(!confirm(`Nonaktifkan penjaga toko saat ini (${petugasJagaAktif.nama})?\n\nSetelah ini status menjadi TANPA PENJAGA dan dapat diaktifkan kembali kapan saja.`)) return;
  const waktu=new Date().toISOString();
  const namaSebelumnya=petugasJagaAktif.nama;
  petugasJagaAktif={aktif:false,shift:'',nama:'',waktu,catatan:'Penjaga toko dinonaktifkan'};
  riwayatPenjaga.push({aksi:'NONAKTIF',shift:'-',nama:'(TANPA PENJAGA)',waktu,catatan:`Menonaktifkan ${namaSebelumnya}`});
  if(riwayatPenjaga.length>100) riwayatPenjaga=riwayatPenjaga.slice(-100);
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
  alert('Penjaga toko dinonaktifkan. Status sekarang: TANPA PENJAGA.');
}
async function tambahKaryawanPenjaga(){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus OWNER.');
  const el=document.getElementById('namaKaryawanBaru');
  const nama=normalisasiNamaPenjaga(el.value);
  if(nama.length<2) return alert('Nama karyawan minimal 2 karakter.');
  if(daftarKaryawanPenjaga.some(n=>String(n).toUpperCase()===nama)) return alert('Nama karyawan sudah ada.');
  daftarKaryawanPenjaga.push(nama);
  el.value='';
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
}
async function hapusKaryawanPenjaga(index){
  if(statusRoleAktif !== 'OWNER') return alert('Khusus OWNER.');
  const nama=daftarKaryawanPenjaga[index];
  if(!nama) return;
  if(String(petugasJagaAktif.nama||'').toUpperCase()===String(nama).toUpperCase()) return alert('Petugas yang sedang aktif tidak dapat dihapus. Tetapkan petugas lain terlebih dahulu.');
  if(!confirm(`Hapus karyawan ${nama} dari daftar?`)) return;
  daftarKaryawanPenjaga.splice(index,1);
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
}

/* BACKUP & RESTORE DATA — FREE-FIRST SAFE MODE */
function buatPayloadBackup(){
  const createdAt = new Date().toISOString();
  return {
    app: 'STC SUMOBITO',
    schemaVersion: 2,
    createdAt,
    backupType: 'client-export',
    counts: {
      kategori: Array.isArray(dbKat) ? dbKat.length : 0,
      barang: Array.isArray(dbBrg) ? dbBrg.length : 0,
      orders: Array.isArray(dbOrder) ? dbOrder.length : 0,
      mutasi: Array.isArray(dbMutasi) ? dbMutasi.length : 0,
      returns: Array.isArray(dbReturn) ? dbReturn.length : 0,
      penjualan: Array.isArray(dbPenjualanHariIni) ? dbPenjualanHariIni.length : 0,
      angsuran: Array.isArray(dbAngsuran) ? dbAngsuran.length : 0
    },
    dbKat, dbBrg, dbOrder, dbMutasi, dbReturn, dbPenjualanHariIni, dbAngsuran,
    configApp, petugasJagaAktif, daftarKaryawanPenjaga, riwayatPenjaga
  };
}
function unduhPayloadBackup(payload, prefix='STC_Backup'){
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  a.href = url;
  a.download = `${prefix}_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function unduhBackup(){
  if(statusRoleAktif !== 'OWNER') return alert('Backup hanya dapat dibuat oleh OWNER.');
  try {
    // Backup operasional selalu membaca data langsung dari server, bukan cache lokal.
    const payload = await buatPayloadBackupDariCloud();
    unduhPayloadBackup(payload);
    const info = document.getElementById('backupInfo');
    if(info) info.textContent = `Backup cloud disiapkan: ${new Date(payload.createdAt).toLocaleString('id-ID')} • ${Object.values(payload.counts).reduce((a,b)=>a+b,0)} item pada 8 kelompok data (termasuk arsip audit log).`;
  } catch(err) {
    console.error('Backup cloud gagal:',err);
    alert('Backup gagal dibuat dari Firestore. Pastikan koneksi internet dan akses OWNER aktif. Detail: ' + (err && err.message ? err.message : err));
  }
}
async function sha256STC(teks){
  if(!window.crypto || !crypto.subtle) throw new Error('Browser tidak mendukung pemeriksaan checksum SHA-256.');
  const bytes=new TextEncoder().encode(teks),hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function buatPayloadBackupDariCloud(){
  if(!db || !currentAuthUser || statusRoleAktif !== 'OWNER')
    throw new Error('Snapshot cloud hanya dapat dibuat saat OWNER terhubung ke Firestore.');
  // source:'server' mencegah snapshot dibuat dari cache lokal yang mungkin tertinggal.
  const namaKoleksi=['kategori','barang','orders','mutasi','returns','penjualan','angsuran','audit_logs'];
  const snapshotStartedAt=new Date().toISOString();
  const hasil=await Promise.all(namaKoleksi.map(nama=>db.collection(nama).get({source:'server'})));
  const kategori=hasil[0].docs.map(namaKategoriDariDokumen).sort(bandingKategori);
  const barang=hasil[1].docs.map(doc=>doc.data());
  const orders=hasil[2].docs.map(doc=>({id:doc.id,...doc.data()}));
  const mutasi=hasil[3].docs.map(doc=>({id:doc.id,...doc.data()}));
  const returns=hasil[4].docs.map(doc=>({id:doc.id,...doc.data()}));
  const penjualan=hasil[5].docs.map(doc=>({id:doc.id,...doc.data()}));
  const angsuran=hasil[6].docs.map(doc=>({id:doc.id,...doc.data()}));
  const auditLog=hasil[7].docs.map(doc=>({id:doc.id,...doc.data()}));
  const pengaturan=await db.collection('pengaturan').doc('umum').get({source:'server'});
  const setting=pengaturan.exists ? pengaturan.data() : {};
  const createdAt=new Date().toISOString();
  const payload={
    app:'STC SUMOBITO', schemaVersion:3, createdAt, snapshotStartedAt, snapshotFinishedAt:new Date().toISOString(),
    backupType:'firestore-multi-collection-best-effort',
    consistencyNote:'Koleksi dibaca langsung dari server, tetapi Firestore Web SDK tidak menyediakan snapshot atomik lintas koleksi untuk proses ekspor ini.',
    counts:{kategori:kategori.length,barang:barang.length,orders:orders.length,mutasi:mutasi.length,returns:returns.length,penjualan:penjualan.length,angsuran:angsuran.length,auditLogs:auditLog.length},
    dbKat:kategori, dbBrg:barang, dbOrder:orders, dbMutasi:mutasi, dbReturn:returns,
    dbPenjualanHariIni:penjualan, dbAngsuran:angsuran, dbAuditLog:auditLog,
    configApp:setting.configApp || configApp,
    petugasJagaAktif:setting.petugasJagaAktif || petugasJagaAktif,
    daftarKaryawanPenjaga:Array.isArray(setting.daftarKaryawanPenjaga)?setting.daftarKaryawanPenjaga:daftarKaryawanPenjaga,
    riwayatPenjaga:Array.isArray(setting.riwayatPenjaga)?setting.riwayatPenjaga:riwayatPenjaga
  };
  payload.integrity={algorithm:'SHA-256',digest:await sha256STC(JSON.stringify(payload))};
  return payload;
}
async function buatSnapshotSebelumPulih(){
  const payload = await buatPayloadBackupDariCloud();
  unduhPayloadBackup(payload, 'STC_Snapshot_Sebelum_Pemulihan');
  return payload;
}

async function prosesPulih(e){
  if(statusRoleAktif !== 'OWNER') { alert('Pemulihan data hanya dapat dilakukan oleh OWNER.'); return; }
  const file = e && e.target && e.target.files && e.target.files[0];
  if(!file) return;
  if(file.size > 20 * 1024 * 1024) {
    alert('File backup lebih dari 20 MB. Pemulihan dibatalkan demi keamanan dan kestabilan browser.');
    if(e && e.target) e.target.value='';
    return;
  }
  const reader = new FileReader();
  reader.onload = async function(ev){
    let restoreCommittedBatches = 0;
    try {
      const data = JSON.parse(ev.target.result);
      if(data.app && data.app !== 'STC SUMOBITO') throw new Error('File ini bukan backup STC SUMOBITO.');
      if(data.schemaVersion && Number(data.schemaVersion) > 3) throw new Error('Versi backup lebih baru daripada versi aplikasi ini.');
      if(data.integrity){
        if(data.integrity.algorithm!=='SHA-256' || typeof data.integrity.digest!=='string') throw new Error('Metadata integritas backup tidak valid.');
        const copy={...data};delete copy.integrity;
        const digest=await sha256STC(JSON.stringify(copy));
        if(digest!==data.integrity.digest) throw new Error('Checksum backup tidak cocok. File mungkin berubah atau rusak; pemulihan dibatalkan.');
      } else if(!confirm('Backup lama tidak memiliki checksum SHA-256. Lanjutkan dengan validasi struktur saja?')) return;
      const arrayKeys = ['dbKat','dbBrg','dbOrder','dbMutasi','dbReturn','dbPenjualanHariIni','dbAngsuran','dbAuditLog','daftarKaryawanPenjaga','riwayatPenjaga'];
      for(const key of arrayKeys){
        if(data[key] !== undefined && !Array.isArray(data[key])) throw new Error('Format ' + key + ' harus berupa daftar.');
      }
      const next = {
        dbKat: data.dbKat || [], dbBrg: data.dbBrg || [], dbOrder: data.dbOrder || [],
        dbMutasi: data.dbMutasi || [], dbReturn: data.dbReturn || [], dbPenjualanHariIni: data.dbPenjualanHariIni || [],
        dbAngsuran: data.dbAngsuran || [], dbAuditLog: data.dbAuditLog || [], configApp: data.configApp || configApp,
        petugasJagaAktif: data.petugasJagaAktif || petugasJagaAktif,
        daftarKaryawanPenjaga: Array.isArray(data.daftarKaryawanPenjaga) ? data.daftarKaryawanPenjaga : daftarKaryawanPenjaga,
        riwayatPenjaga: Array.isArray(data.riwayatPenjaga) ? data.riwayatPenjaga : riwayatPenjaga
      };
      if(next.dbBrg.some(x => !x || !x.kode) || next.dbOrder.some(x => !x || !x.id) ||
         next.dbMutasi.some(x => !x || !x.id) || next.dbReturn.some(x => !x || !x.id) ||
         next.dbPenjualanHariIni.some(x => !x || !x.id) || next.dbAngsuran.some(x => !x || !x.id)) {
        throw new Error('Ada data yang tidak memiliki kode/ID dokumen. Tidak ada data yang diubah.');
      }
      const daftarId=[['orders',next.dbOrder],['mutasi',next.dbMutasi],['returns',next.dbReturn],['penjualan',next.dbPenjualanHariIni],['angsuran',next.dbAngsuran],['audit_logs',next.dbAuditLog]];
      for(const [nama,list] of daftarId){
        const ids=list.map(x=>String(x.id));
        if(new Set(ids).size!==ids.length) throw new Error('Backup memiliki ID duplikat pada '+nama+'. Pemulihan dibatalkan.');
        if(ids.some(id=>!id || id.includes('/'))) throw new Error('Backup memiliki ID dokumen tidak valid pada '+nama+'.');
      }
      const total = arrayKeys.reduce((sum,key)=>sum+(next[key]||[]).length,0);
      const sourceDate = data.createdAt ? new Date(data.createdAt).toLocaleString('id-ID') : 'tanggal tidak tercatat';
      if(!confirm(`Periksa file backup:\\nTanggal: ${sourceDate}\\nTotal item: ${total}\\n\\nSebelum pemulihan, sistem akan mengunduh snapshot data saat ini. Pastikan browser mengizinkan unduhan. Lanjutkan?`)) return;

      // Auto-snapshot is a safety net before restore; it is not a scheduled cloud backup.
      const snapshotSebelumPulih = await buatSnapshotSebelumPulih();
      console.info('Snapshot cloud sebelum restore:', snapshotSebelumPulih.counts);
      if(!confirm('Snapshot sebelum pemulihan sudah diminta untuk diunduh. Lanjutkan pemulihan? Pastikan file STC_Snapshot_Sebelum_Pemulihan tersimpan.')) return;

      if(db){
        const jobs = [];
        next.dbKat.forEach(k => {
          if(typeof k === 'string' && k.trim()) jobs.push({col:'kategori', id:idKategoriFirestore(k), data:{nama:k, dibuat:tgl()}});
          else if(k && typeof k === 'object' && (k.nama || k.id)) {
            const nama = String(k.nama || k.id);
            jobs.push({col:'kategori', id:idKategoriFirestore(nama), data:k});
          }
        });
        next.dbBrg.forEach(x => jobs.push({col:'barang', id:idBarangFirestore(String(x.kode)), data:x}));
        next.dbOrder.forEach(x => jobs.push({col:'orders', id:String(x.id), data:x}));
        next.dbMutasi.forEach(x => jobs.push({col:'mutasi', id:String(x.id), data:x}));
        next.dbReturn.forEach(x => jobs.push({col:'returns', id:String(x.id), data:x}));
        next.dbPenjualanHariIni.forEach(x => jobs.push({col:'penjualan', id:String(x.id), data:x}));
        next.dbAngsuran.forEach(x => jobs.push({col:'angsuran', id:String(x.id), data:x}));
        jobs.push({col:'pengaturan', id:'umum', data:{configApp:next.configApp, petugasJagaAktif:next.petugasJagaAktif, daftarKaryawanPenjaga:next.daftarKaryawanPenjaga, riwayatPenjaga:next.riwayatPenjaga}});
        // Firestore batch limit 500; 350 gives room for safety.
        for(let i=0; i<jobs.length; i+=350){
          const batch = db.batch();
          jobs.slice(i, i+350).forEach(job => batch.set(db.collection(job.col).doc(job.id), job.data, {merge:true}));
          await batch.commit();
          restoreCommittedBatches++;
        }
      }
      dbKat=next.dbKat; dbBrg=next.dbBrg; dbOrder=next.dbOrder; dbMutasi=next.dbMutasi;
      dbReturn=next.dbReturn; dbPenjualanHariIni=next.dbPenjualanHariIni; dbAngsuran=next.dbAngsuran;
      configApp=next.configApp; petugasJagaAktif=next.petugasJagaAktif;
      daftarKaryawanPenjaga=next.daftarKaryawanPenjaga; riwayatPenjaga=next.riwayatPenjaga;
      jadwalkanSimpanCacheLokal(); refreshSemua();
      alert('Pemulihan selesai diproses. Data operasional digabungkan ke Firestore; dokumen yang tidak ada di backup tetap dipertahankan. Audit log ikut tersimpan di file backup sebagai arsip, tetapi tidak ditulis ulang ke Firestore agar sifat append-only dan jejak UID tetap terjaga. Jika terjadi kegagalan di tengah proses, gunakan snapshot cloud yang diunduh sebelum pemulihan untuk pemulihan manual. Periksa data utama sebelum operasional.');
    } catch(err){
      const detail=restoreCommittedBatches>0
        ? ` Pemulihan parsial: ${restoreCommittedBatches} batch sudah tersimpan di Firestore. Gunakan file STC_Snapshot_Sebelum_Pemulihan untuk pemulihan manual.`
        : ' Tidak ada batch pemulihan yang berhasil dikonfirmasi.';
      console.error('Restore gagal:',err,'Batch tersimpan:',restoreCommittedBatches);
      alert('Pemulihan gagal: ' + err.message + detail);
    }
    finally { if(e && e.target) e.target.value=''; }
  };
  reader.onerror = () => { alert('File backup tidak dapat dibaca.'); if(e && e.target) e.target.value=''; };
  reader.readAsText(file);
}

/* GENERATOR CETAK PDF & SURAT JALAN */
const pdfConfigStyles = { lineColor: [0, 0, 0], lineWidth: 0.35, textColor: [0, 0, 0] };

async function cetakOrderPDF(kategori){
  const isKabel = kategori === 'kabel';
  const filterTokoId = isKabel ? 'filterCetakOrdTokoKabel' : 'filterCetakOrdTokoBarang';
  const filterToko = document.getElementById(filterTokoId)?.value || 'SEMUA';
  // Snapshot item yang benar-benar masuk PDF. Hanya item dalam snapshot ini yang akan dihapus.
  const isOwnerCetak=statusRoleAktif==='OWNER';
  const uidCetak=currentAuthUser?.uid||'';
  if(!isOwnerCetak && (!uidCetak || statusRoleAktif!=='CABANG'))
    return alert('Sesi CABANG tidak valid. Silakan muat ulang aplikasi.');
  // CABANG hanya mencetak dan menghapus order yang dibuat oleh UID anonim sesi ini.
  // Filter nama toko tetap berlaku, tetapi tidak pernah memperluas hak lintas perangkat.
  const dataOrder = dbOrder.filter(o =>
    (isKabel ? isItemKabel(o) : !isItemKabel(o)) &&
    (isOwnerCetak || String(o.createdByUid||'')===uidCetak) &&
    (!filterToko || filterToko === 'SEMUA' || (o.toko || '').toUpperCase() === filterToko)
  );

  if(!dataOrder.length) return alert(`Tidak ada pesanan order ${isKabel ? 'kabel' : 'barang'} tercatat untuk ${filterToko}!`);
  if(!window.jspdf || !window.jspdf.jsPDF) return alert('Pustaka PDF belum siap. Periksa koneksi internet lalu coba lagi.');

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const cabangPemesan = filterToko !== 'SEMUA' ? filterToko : document.getElementById('namaCabang').value.toUpperCase();

    let currentY = 15;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(configApp.namaToko || "SIAP TEKNIK COLDSTORAGE", pageWidth / 2, currentY, { align: "center" });
    currentY += 6;

    doc.setFontSize(12);
    const judulSurat = isKabel ? "SURAT PERMINTAAN ORDER KHUSUS KABEL" : "SURAT PERMINTAAN ORDER BARANG UMUM";
    doc.text(judulSurat, pageWidth / 2, currentY, { align: "center" });
    currentY += 5;

    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`No. Surat: ORD/${isKabel ? 'KAB' : 'BRG'}/${Date.now().toString().slice(-6)}/STC  |  Tanggal: ${tgl()}`, pageWidth / 2, currentY, { align: "center" });
    currentY += 5;
    doc.text(`Toko Pemesan: ${cabangPemesan}  |  Petugas: ${getPetugasJagaTag()}`, pageWidth / 2, currentY, { align: "center" });
    currentY += 7;

    const headerTabel = isKabel
      ? [['No', 'Toko Pemesan', 'Kode', 'Nama Barang', 'Rincian Roll & Total Meter', 'Stok Toko']]
      : [['No', 'Toko Pemesan', 'Kode', 'Nama Barang', 'Jumlah / Keterangan', 'Stok Toko']];

    const rows = dataOrder.map((o, i) => [
      i + 1, (o.toko || '-').toUpperCase(), o.kode.toUpperCase(), namaBarangLengkap(o).toUpperCase(), (o.ket || '-').toUpperCase(), (o.stok || '0').toUpperCase()
    ]);

    doc.autoTable({
      startY: currentY, head: headerTabel, body: rows, theme: 'grid',
      headStyles: { fillColor: isKabel ? [4, 120, 87] : [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: pdfConfigStyles
    });

    let finalY = doc.lastAutoTable.finalY + 14;
    if (finalY > 235) { doc.addPage(); finalY = 25; }
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Pemohon / Pemesan (${cabangPemesan}),`, 45, finalY, { align: "center" });
    doc.text("( ________________________ )", 45, finalY + 22, { align: "center" });
    doc.text(`Menyetujui (Pusat / Owner),`, 165, finalY, { align: "center" });
    doc.text("( ________________________ )", 165, finalY + 22, { align: "center" });

    const namaFile = `Surat_Order_${isKabel ? 'Kabel' : 'Barang'}_${cabangPemesan.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
    // Jangan menghapus order sebelum proses pembuatan dan pemanggilan unduhan PDF berhasil.
    doc.save(namaFile);

    const idsTerpilih = dataOrder.map(o => String(o.id));
    if(!db && !isOwnerCetak) throw new Error('CABANG memerlukan koneksi Firebase untuk menghapus order secara aman.');
    if(db) {
      // Hapus hanya dokumen yang masuk PDF. Rules juga memverifikasi createdByUid untuk CABANG.
      for(let i = 0; i < idsTerpilih.length; i += 450) {
        const batch = db.batch();
        idsTerpilih.slice(i, i + 450).forEach(id => batch.delete(db.collection('orders').doc(id)));
        await batch.commit();
      }
    }

    const idSet = new Set(idsTerpilih);
    dbOrder = dbOrder.filter(o => !idSet.has(String(o.id)));
    jadwalkanSimpanCacheLokal();
    tabelOrder();
    try {
      await catatAuditFIX3('CETAK_DAN_HAPUS','ORDER',kategori,`PDF ${namaFile}; ${idsTerpilih.length} order sesi ${isOwnerCetak?'OWNER':'CABANG'} dihapus setelah PDF dibuat`);
    } catch(auditErr) { console.warn('Audit cetak order tidak tersimpan:', auditErr); }
    alert(`PDF berhasil dibuat. ${idsTerpilih.length} item order ${isKabel ? 'kabel' : 'barang'} untuk ${filterToko} telah dihapus dari tabel order.`);
  } catch(err) {
    console.error('Cetak PDF order gagal:', err);
    alert('Proses cetak atau penghapusan order gagal. Daftar order dipertahankan jika penghapusan belum berhasil. Silakan coba lagi atau periksa koneksi.');
  }
}

function cetakSuratJalanPDF(){
  const list=dataMutasiSaatIni();
  if(!list.length) return alert('Tidak ada item pada nomor mutasi saat ini untuk dicetak!');
  const asal=document.getElementById('mutAsal').value;
  const tujuan=document.getElementById('mutTujuan').value;
  const no=nomorMutasiSekarang() || list[0].noMutasi || 'LEGACY';
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const pw=doc.internal.pageSize.getWidth();

  doc.setFont("helvetica","bold"); doc.setFontSize(14);
  doc.text(configApp.namaToko || "SIAP TEKNIK COLDSTORAGE", pw/2, 15, {align:"center"});
  doc.setFontSize(12); doc.text("SURAT JALAN PENGIRIMAN MUTASI BARANG", pw/2, 21, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(`No. Mutasi: ${no} | Tanggal: ${tgl()}`, pw/2, 26, {align:"center"});
  doc.text(`Toko Asal: ${asal}  ===>  Toko Tujuan: ${tujuan}`, pw/2, 31, {align:"center"});

  const rows=list.map((m,i)=>[i+1,m.kode,namaBarangLengkap(m),`${m.qty} ${m.satuan||''}`.trim(),m.ket||'-']);
  doc.autoTable({
    startY:36, head:[['No','Kode Barang','Nama Barang','Jumlah','Keterangan']], body:rows,
    theme:'grid', headStyles:{fillColor:[37,99,235],textColor:[255,255,255],fontStyle:'bold'}, styles:pdfConfigStyles
  });

  let finalY=doc.lastAutoTable.finalY+15;
  if(finalY>240){doc.addPage();finalY=25;}
  doc.setFontSize(9);
  doc.text(`Pengirim (${asal}),`,45,finalY,{align:"center"});
  doc.text("( ________________________ )",45,finalY+22,{align:"center"});
  doc.text(`Penerima (${tujuan}),`,165,finalY,{align:"center"});
  doc.text("( ________________________ )",165,finalY+22,{align:"center"});
  doc.save(`Surat_Jalan_Mutasi_${no}_${Date.now()}.pdf`);
}


function cetakReturnPDF(){
  const list=dataReturnSaatIni(); if(!list.length)return alert('Tidak ada item pada nomor return saat ini untuk dicetak!');
  const asal=document.getElementById('retAsal').value,tujuan=document.getElementById('retTujuan').value,no=nomorReturnSekarang()||list[0].noReturn||'LEGACY';
  const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),pw=doc.internal.pageSize.getWidth();
  doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(configApp.namaToko||'SIAP TEKNIK COLDSTORAGE',pw/2,15,{align:'center'});
  doc.setFontSize(12);doc.text('SURAT PENGEMBALIAN BARANG (RETURN)',pw/2,21,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(9);
  doc.text(`No. Return: ${no} | Tanggal: ${tgl()}`,pw/2,26,{align:'center'});doc.text(`Toko Asal: ${asal}  ===>  Toko Tujuan: ${tujuan}`,pw/2,31,{align:'center'});
  const rows=list.map((r,i)=>[i+1,r.kode,namaBarangLengkap(r),`${r.qty} ${r.satuan||''}`.trim(),r.alasan||'-',r.ket||'-']);
  doc.autoTable({startY:36,head:[['No','Kode Barang','Nama Barang','Jumlah','Alasan','Keterangan']],body:rows,theme:'grid',headStyles:{fillColor:[220,38,38],textColor:[255,255,255],fontStyle:'bold'},styles:pdfConfigStyles});
  let finalY=doc.lastAutoTable.finalY+15;if(finalY>240){doc.addPage();finalY=25;}doc.setFontSize(9);
  doc.text(`Petugas Pengirim (${asal}),`,45,finalY,{align:'center'});doc.text('( ________________________ )',45,finalY+22,{align:'center'});doc.text(`Penerima (${tujuan}),`,165,finalY,{align:'center'});doc.text('( ________________________ )',165,finalY+22,{align:'center'});
  doc.save(`Surat_Return_${no}_${Date.now()}.pdf`);
}
function cetakPdfKategori(){
  const kat = document.getElementById('pilihKatMenu7')?.value;
  let data = kat ? dbBrg.filter(b => b.kat === kat) : dbBrg;
  if(!data.length) return alert('Tidak ada data barang untuk dicetak!');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(configApp.namaToko || "SIAP TEKNIK COLDSTORAGE", pw / 2, 15, { align: "center" });
  doc.setFontSize(11);
  doc.text("KATALOG & DAFTAR KETERSEDIAAN BARANG", pw / 2, 21, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Kategori: ${kat || 'SEMUA KATEGORI'} | Tanggal: ${tgl()}`, pw / 2, 26, { align: "center" });
  
  const rows = data.map((b, i) => [
    i + 1, b.kode, namaBarangLengkap(b), 'Rp ' + (b.harga || 0).toLocaleString('id-ID'),
    'Rp ' + (b.hargaMeter || 0).toLocaleString('id-ID'), 'Rp ' + (b.hargaRoll || 0).toLocaleString('id-ID'), b.ket || '-'
  ]);
  
  doc.autoTable({
    startY: 30, head: [['No', 'Kode', 'Nama Barang', 'Harga Satuan', 'Harga Meter', 'Harga Roll', 'Ket']], body: rows, theme: 'grid',
    headStyles: { fillColor: [4, 135, 96], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: pdfConfigStyles
  });
  doc.save(`Katalog_Barang_${kat ? kat.replace(/\s+/g,'_') : 'Semua'}_${Date.now()}.pdf`);
}

function cetakLangsungHTML(judulLaporan, idContainer) {
  const cabang = document.getElementById('namaCabang').value.toUpperCase();
  const el = document.getElementById(idContainer);
  if(!el) return;

  const jc = window.open('', '', 'height=600,width=800');
  jc.document.write('<html><head><title>' + judulLaporan + '</title>');
  jc.document.write('<style>body { font-family: Arial, sans-serif; padding: 20px; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; } th, td { border: 1px solid #000; padding: 8px; text-align: left; } th { background-color: #e2e8f0; } button, .aksi-sm, .kolom-aksi-admin { display: none !important; } </style>');
  jc.document.write('</head><body>');
  jc.document.write('<h2>' + escapeHTML(configApp.namaToko || 'STC') + '</h2><h3>' + escapeHTML(judulLaporan) + '</h3>');
  jc.document.write('<p>Cabang: ' + escapeHTML(cabang) + ' | Tanggal: ' + escapeHTML(tgl()) + '</p>');
  // Salin isi tabel tanpa tombol aksi; data teks sudah di-escape saat dirender.
  const printClone = el.cloneNode(true);
  printClone.querySelectorAll('button, .kolom-aksi-admin').forEach(n => n.remove());
  jc.document.write(printClone.innerHTML);
  jc.document.write('</body></html>');
  jc.document.close();
  jc.document.focus();
  setTimeout(() => { jc.print(); jc.close(); }, 500);
}

/* CEGAH SUBMIT FORM ENTER OTOMATIS */
document.addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'textarea') {
    if(!e.target.closest('.cari-grup')) {
      e.preventDefault();
    }
  }
});

/* STATUS JARINGAN */
window.addEventListener('offline', () => {
  const b = document.getElementById('badgeCloudStatus');
  if(b) { b.className = 'badge-cloud offline'; b.innerText = '🔴 Offline (Tanpa Internet)'; }
});
window.addEventListener('online', () => {
  setBadgeCloud('🔄 Menyambungkan kembali...');
  hubungkanRealtimeFirestore();
});

/* STARTUP */
window.onload = function(){
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      console.info('STC Service Worker aktif:', reg.scope);
    }).catch(err=>console.warn('Service Worker gagal didaftarkan:', err.message));
  }
  if(!history.state || (!history.state.stcDashboard && !history.state.stcMenu)) {
    history.replaceState({ stcDashboard: true }, '', location.pathname + location.search + '#dashboard');
  }
  setDeviceGate(false);
  setBadgeCloud('🔄 Menghubungkan...');
  muatLokal();
  inisialisasiFirebase();
};
