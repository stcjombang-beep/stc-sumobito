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

/* ================================================================
   STAGE 1A — CORE CONSTANTS & SAFE UTILITIES
   Tujuan: konsistensi konfigurasi, validasi dasar, error handling,
   dan utility bersama TANPA mengubah alur bisnis aplikasi.
   ================================================================ */
const STC_CONFIG = Object.freeze({
  appName: 'STC SUMOBITO',
  appVersion: '2.2.0',
  cacheKey: 'stc_cache_final',
  backupPrefix: 'STC_Backup',
  locale: 'id-ID',
  currency: 'IDR',
  ownerUid: '5ZQ0VcSeK6XqaYr3ZVmC60eUcO43'
});

const STC_COLLECTIONS = Object.freeze({
  KATEGORI: 'kategori',
  BARANG: 'barang',
  ORDERS: 'orders',
  MUTASI: 'mutasi',
  RETURNS: 'returns',
  PENGATURAN: 'pengaturan',
  PENJUALAN: 'penjualan',
  ANGSURAN: 'angsuran'
});

const STC_ROLES = Object.freeze({ OWNER: 'OWNER', CABANG: 'CABANG' });
const STC_ENTRY_ROLE = ['OWNER','CABANG'].includes(String(window.STC_ENTRY_ROLE||'').toUpperCase()) ? String(window.STC_ENTRY_ROLE).toUpperCase() : 'AUTO';
function stcEntryIs(role){ return STC_ENTRY_ROLE === role; }
function stcSetEntryAuthRequired(required){ document.body.classList.toggle('entry-auth-required', !!required); }
const STC_EMPTY_ARRAY = Object.freeze([]);

const STC_DOM_CACHE = new Map();
const STC_QUERY_CACHE = new Map();
const STC_DEBOUNCE_TIMERS = new Map();
const STC_RUNTIME = {
  firebaseInitialized: false,
  cacheSaveTimer: null,
  cacheDirty: false,
  cacheLastRevision: -1,
  reconnectTimer: null,
  reconnectAttempts: 0,
  startupComplete: false,
  lastRuntimeErrorAt: 0
};

function stcNow(){ return Date.now(); }

function stcMarkCacheDirty(){
  STC_RUNTIME.cacheDirty = true;
}

function stcFlushCacheLokal(){
  if(!STC_RUNTIME.cacheDirty) return true;
  const payload = stcBuildCachePayload();
  try {
    const ok = stcSafeLocalStorageSet(STC_CONFIG.cacheKey, JSON.stringify(payload));
    if(ok){
      STC_RUNTIME.cacheDirty = false;
      STC_RUNTIME.cacheLastRevision = STC_DATA_INDEX.revision;
    }
    return ok;
  } catch(error){
    stcLogWarn('CACHE_FLUSH', error);
    return false;
  }
}

function stcScheduleCacheSave(delay=180){
  stcMarkCacheDirty();
  if(STC_RUNTIME.cacheSaveTimer) clearTimeout(STC_RUNTIME.cacheSaveTimer);
  STC_RUNTIME.cacheSaveTimer = setTimeout(() => {
    STC_RUNTIME.cacheSaveTimer = null;
    stcFlushCacheLokal();
  }, Math.max(0, Number(delay) || 0));
}

function stcScheduleRealtimeReconnect(){
  if(!db || !currentAuthUser || STC_RUNTIME.reconnectTimer || STC_RUNTIME.destroyed) return;
  const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(STC_RUNTIME.reconnectAttempts, 5)));
  STC_RUNTIME.reconnectAttempts++;
  STC_RUNTIME.reconnectTimer = setTimeout(() => {
    STC_RUNTIME.reconnectTimer = null;
    if(navigator.onLine) hubungkanRealtimeFirestore();
  }, delay);
}

function stcResetReconnectBackoff(){
  STC_RUNTIME.reconnectAttempts = 0;
  if(STC_RUNTIME.reconnectTimer){ clearTimeout(STC_RUNTIME.reconnectTimer); STC_RUNTIME.reconnectTimer = null; }
}
function stcEl(id){
  if(!id) return null;
  if(STC_DOM_CACHE.has(id)){
    const cached = STC_DOM_CACHE.get(id);
    if(cached && cached.isConnected) return cached;
    STC_DOM_CACHE.delete(id);
  }
  const el = document.getElementById(id);
  if(el) STC_DOM_CACHE.set(id, el);
  return el;
}
function stcClearDomCache(){ STC_DOM_CACHE.clear(); STC_QUERY_CACHE.clear(); }
function stcStaticAll(selector){
  if(!selector) return [];
  const cached = STC_QUERY_CACHE.get(selector);
  if(cached && cached.every(el => el && el.isConnected)) return cached;
  const list = Array.from(document.querySelectorAll(selector));
  STC_QUERY_CACHE.set(selector, list);
  return list;
}
function stcDebouncedCall(key, fn, delay=120){
  if(typeof fn !== 'function') return;
  const old = STC_DEBOUNCE_TIMERS.get(key);
  if(old) clearTimeout(old);
  const timer = setTimeout(() => {
    STC_DEBOUNCE_TIMERS.delete(key);
    try { fn(); } catch(error) { stcLogWarn('EVENT_DEBOUNCE', error); }
  }, Math.max(0, Number(delay) || 0));
  STC_DEBOUNCE_TIMERS.set(key, timer);
}
function stcCancelDebouncedCall(key){
  const timer = STC_DEBOUNCE_TIMERS.get(key);
  if(timer) clearTimeout(timer);
  STC_DEBOUNCE_TIMERS.delete(key);
}
function stcSetHTML(el, html){
  if(!el) return;
  const next = html == null ? '' : String(html);
  if(el.innerHTML === next) return;
  el.innerHTML = next;
}
function stcSetText(el, value){
  if(!el) return;
  const next = value == null ? '' : String(value);
  if(el.textContent === next) return;
  el.textContent = next;
}
function stcIsPageActive(id){
  const el = stcEl(id);
  return !!el && el.classList.contains('active');
}
const STC_RENDER_QUEUE = new Map();
let stcRenderQueueScheduled = false;
function stcText(el, value){ if(el) el.textContent = value == null ? '' : String(value); }
function stcLogError(context, error){
  const message = error && error.message ? error.message : String(error || 'Kesalahan tidak diketahui');
  console.error(`[STC:${context}] ${message}`, error);
  return message;
}
function stcLogWarn(context, error){
  const message = error && error.message ? error.message : String(error || 'Peringatan tidak diketahui');
  console.warn(`[STC:${context}] ${message}`, error);
  return message;
}
function stcSafeJsonParse(raw, fallback=null){
  try { return JSON.parse(raw); }
  catch(error){ stcLogWarn('JSON_PARSE', error); return fallback; }
}
function stcSafeLocalStorageGet(key, fallback=null){
  try { return localStorage.getItem(key) ?? fallback; }
  catch(error){ stcLogWarn('LOCALSTORAGE_GET', error); return fallback; }
}
function stcSafeLocalStorageSet(key, value){
  try { localStorage.setItem(key, value); return true; }
  catch(error){ stcLogWarn('LOCALSTORAGE_SET', error); return false; }
}
function stcFirestoreError(context, error, badgeText='⚠️ Akses data bermasalah'){
  stcLogError(`FIRESTORE:${context}`, error);
  setBadgeCloud(badgeText);
  stcRecordRuntimeFailure(`FIRESTORE:${context}`, error);
}

/* ================================================================
   STAGE 2 — RELIABILITY & MAINTAINABILITY HARDENING
   2A: runtime state & invariant helpers
   2B: async action guard / duplicate-submit protection
   2C: listener lifecycle & stale callback protection
   2D: Firestore error classification & retry policy
   2E: local/remote state consistency
   2F: bounded batch operations
   2G: runtime observability & recovery
   2H: lifecycle cleanup & maintainability contracts
   ================================================================ */

/* ================================================================
   STAGE 4 — SECURITY & DATA INTEGRITY HARDENING (4A–4O)
   Client-side hardening is an additional safety layer; Firestore Rules remain
   the authoritative security boundary.
   ================================================================ */
const STC_STAGE4 = Object.freeze({
  schemaVersion: 5,
  cacheSchemaVersion: 5,
  maxBackupBytes: 20 * 1024 * 1024,
  maxStringLength: 5000,
  maxArrayItems: 50000,
  maxBatchWrites: 350,
  allowedCollections: Object.freeze([
    STC_COLLECTIONS.KATEGORI, STC_COLLECTIONS.BARANG, STC_COLLECTIONS.ORDERS,
    STC_COLLECTIONS.MUTASI, STC_COLLECTIONS.RETURNS, STC_COLLECTIONS.PENGATURAN,
    STC_COLLECTIONS.PENJUALAN, STC_COLLECTIONS.ANGSURAN
  ])
});
STC_RUNTIME.securityEvents = [];
STC_RUNTIME.securityBaseline = null;
STC_RUNTIME.lastSecurityCheckAt = 0;

function stcSecurityEvent(type, detail=''){
  const item={type:String(type||'UNKNOWN'),detail:String(detail||''),at:stcNow()};
  STC_RUNTIME.securityEvents.push(item);
  if(STC_RUNTIME.securityEvents.length>30) STC_RUNTIME.securityEvents.shift();
  return item;
}
function stcIsOwnerSession(){
  return !!currentAuthUser && !currentAuthUser.isAnonymous && currentAuthUser.uid===STC_CONFIG.ownerUid && statusRoleAktif===STC_ROLES.OWNER;
}
function stcIsBranchSession(){
  return !!currentAuthUser && !!currentAuthUser.isAnonymous && statusRoleAktif===STC_ROLES.CABANG;
}
function stcSecuritySessionOK(){ return stcIsOwnerSession() || stcIsBranchSession(); }
function stcCollectionAllowed(name){ return STC_STAGE4.allowedCollections.includes(String(name||'')); }
function stcSafeDocId(value,label='ID dokumen'){
  const id=String(value??'').trim();
  if(!id || id.length>150 || /[\\/]/.test(id) || id==='.' || id==='..') throw new Error(`${label} tidak valid.`);
  return id;
}
function stcValidateString(value,label,max=STC_STAGE4.maxStringLength){
  if(value==null) return;
  if(typeof value!=='string') throw new Error(`${label} harus berupa teks.`);
  if(value.length>max) throw new Error(`${label} terlalu panjang.`);
}
function stcValidateArray(value,label){
  if(!Array.isArray(value)) throw new Error(`${label} harus berupa daftar.`);
  if(value.length>STC_STAGE4.maxArrayItems) throw new Error(`${label} melebihi batas item.`);
}
function stcValidateRecordShape(record,label){
  if(!record || typeof record!=='object' || Array.isArray(record)) throw new Error(`${label} memiliki bentuk data tidak valid.`);
  Object.keys(record).forEach(key=>{
    if(key==='__proto__' || key==='constructor' || key==='prototype') throw new Error(`${label} mengandung field terlarang.`);
    if(typeof record[key]==='string') stcValidateString(record[key],`${label}.${key}`);
  });
}
function stcValidateBackupArrays(data){
  const keys=['dbKat','dbBrg','dbOrder','dbMutasi','dbReturn','dbPenjualanHariIni','dbAngsuran','daftarKaryawanPenjaga','riwayatPenjaga'];
  keys.forEach(key=>{
    if(data[key]!==undefined){
      stcValidateArray(data[key],key);
      data[key].forEach((item,i)=>{if(item && typeof item==='object') stcValidateRecordShape(item,`${key}[${i}]`);});
    }
  });
}
function stcAssertWriteSession(collection,operation='write'){
  if(!stcCollectionAllowed(collection)) throw new Error(`Koleksi ${collection} tidak diizinkan oleh security gate.`);
  if(!stcSecuritySessionOK()){
    stcSecurityEvent('WRITE_BLOCKED',`${operation}:${collection}:invalid-session`);
    throw new Error('Sesi tidak sah atau sudah berakhir. Silakan masuk kembali.');
  }
  const ownerOnly=[STC_COLLECTIONS.BARANG,STC_COLLECTIONS.KATEGORI,STC_COLLECTIONS.PENGATURAN,STC_COLLECTIONS.PENJUALAN,STC_COLLECTIONS.ANGSURAN];
  if(ownerOnly.includes(collection) && !stcIsOwnerSession()){
    stcSecurityEvent('WRITE_BLOCKED',`${operation}:${collection}:owner-only`);
    throw new Error('Operasi ini hanya dapat dilakukan oleh OWNER.');
  }
  return true;
}
function stcCanonicalize(value){
  if(Array.isArray(value)) return value.map(stcCanonicalize);
  if(value && typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>out[k]=stcCanonicalize(value[k]));return out;}
  return value;
}
function stcCanonicalJson(value){return JSON.stringify(stcCanonicalize(value));}
async function stcSha256(value){
  const bytes=new TextEncoder().encode(String(value));
  if(globalThis.crypto?.subtle){
    const d=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return `legacy-${bytes.length}-${String(value).length}`;
}
async function stcBuildIntegrityHash(payload){const copy=JSON.parse(JSON.stringify(payload));delete copy.integrity;return stcSha256(stcCanonicalJson(copy));}
function stcValidateRestoreCompatibility(data){
  if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Format backup tidak valid.');
  if(data.app && data.app!=='STC SUMOBITO') throw new Error('File ini bukan backup STC SUMOBITO.');
  const version=Number(data.schemaVersion||2);
  if(!Number.isFinite(version) || version<2 || version>STC_STAGE7.schemaVersion) throw new Error('Versi backup tidak didukung.');
  stcValidateBackupArrays(data);
  return {version,integrityPresent:typeof data.integrity==='string' && /^[a-f0-9]{64}$/i.test(data.integrity)};
}
function stcGuardDestructiveAction(actionKey,message){
  if(stcActionLocked(`SECURITY:${actionKey}`)) return false;
  return confirm(message);
}
function stcSecurityAudit(){
  STC_RUNTIME.lastSecurityCheckAt=stcNow();
  return Object.freeze({
    at:STC_RUNTIME.lastSecurityCheckAt,
    session:stcSecuritySessionOK(),
    role:statusRoleAktif,
    uid:currentAuthUser?.uid||null,
    anonymousBranchPolicy:true,
    ownerUidProtected:STC_CONFIG.ownerUid==='5ZQ0VcSeK6XqaYr3ZVmC60eUcO43',
    allowedCollections:STC_STAGE4.allowedCollections.slice(),
    events:STC_RUNTIME.securityEvents.slice()
  });
}
STC_RUNTIME.securityBaseline=Object.freeze({ownerUid:STC_CONFIG.ownerUid,appVersion:STC_CONFIG.appVersion,at:stcNow()});
/* ================================================================
   STAGE 5 — DATA CONSISTENCY, TRANSACTION INTEGRITY & OFFLINE RECOVERY
   5A: optimistic concurrency metadata
   5B: idempotent operation journal
   5C: transaction-safe create/update/delete helpers
   5D: conflict detection & explicit recovery
   5E: Firestore offline persistence / reconnect state
   5F: snapshot reconciliation of pending operations
   5G: stable client operation IDs
   5H: lost-update protection for critical OWNER writes
   5I: atomic payment update for ANGSURAN
   5J: bounded/batch integrity for destructive operations
   5K: restore/write provenance preservation
   5L: runtime consistency observability
   5M: cache-vs-cloud recovery guidance
   5N: legacy-document compatibility
   ================================================================ */
const STC_STAGE5 = Object.freeze({
  schemaVersion: 5,
  mutationSchemaVersion: 1,
  journalKey: 'stc_mutation_journal_v5',
  maxJournalItems: 120,
  maxConflictItems: 50,
  operationTimeoutMs: 45000
});
STC_RUNTIME.online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
STC_RUNTIME.persistenceEnabled = false;
STC_RUNTIME.persistenceMode = 'memory';
STC_RUNTIME.lastConsistencyCheckAt = 0;
STC_RUNTIME.consistencyConflicts = [];
STC_RUNTIME.mutationSeq = Number(localStorage.getItem('stc_mutation_seq_v5') || 0) || 0;

function stcNextMutationId(){
  STC_RUNTIME.mutationSeq = (STC_RUNTIME.mutationSeq + 1) % 2147483647;
  stcSafeLocalStorageSet('stc_mutation_seq_v5', String(STC_RUNTIME.mutationSeq));
  return `STC-${Date.now().toString(36)}-${STC_RUNTIME.mutationSeq.toString(36)}-${Math.random().toString(36).slice(2,8)}`.toUpperCase();
}
function stcReadMutationJournal(){
  const raw=stcSafeLocalStorageGet(STC_STAGE5.journalKey,'[]');
  const data=stcSafeJsonParse(raw,[]);
  return Array.isArray(data)?data:[];
}
function stcWriteMutationJournal(list){
  const trimmed=(Array.isArray(list)?list:[]).slice(-STC_STAGE5.maxJournalItems);
  stcSafeLocalStorageSet(STC_STAGE5.journalKey,JSON.stringify(trimmed));
}
function stcJournalMutation(entry){
  const list=stcReadMutationJournal();
  const i=list.findIndex(x=>x && x.opId===entry.opId);
  if(i>=0) list[i]={...list[i],...entry}; else list.push(entry);
  stcWriteMutationJournal(list);
}
function stcJournalStatus(opId,status,detail=''){
  if(!opId) return;
  const list=stcReadMutationJournal();
  const item=list.find(x=>x && x.opId===opId);
  if(!item) return;
  item.status=status; item.detail=String(detail||''); item.at=stcNow();
  stcWriteMutationJournal(list);
}
function stcRecordConsistencyConflict(collection,id,expected,actual,operation='update'){
  const item={id:stcNextMutationId(),collection:String(collection),docId:String(id),operation,
    expectedVersion:expected?.version ?? null,actualVersion:actual?._stcVersion ?? null,
    expectedUpdatedAt:expected?.updatedAt ?? null,actualUpdatedAt:actual?._stcUpdatedAt ?? null,at:stcNow()};
  STC_RUNTIME.consistencyConflicts.push(item);
  if(STC_RUNTIME.consistencyConflicts.length>STC_STAGE5.maxConflictItems) STC_RUNTIME.consistencyConflicts.shift();
  stcSecurityEvent('DATA_CONFLICT',`${operation}:${collection}/${id}`);
  return item;
}
function stcBuildMutationMeta(opId,operation,existing=null){
  const version=Math.max(0,Number(existing?._stcVersion)||0)+1;
  return {_stcSchema:STC_STAGE5.mutationSchemaVersion,_stcOpId:String(opId),_stcOperation:String(operation),
    _stcVersion:version,_stcUpdatedAt:stcNow(),_stcUpdatedBy:currentAuthUser?.uid||'offline'};
}
function stcExpectedFromItem(item){
  if(!item) return null;
  const version=Number(item._stcVersion);
  const updatedAt=Number(item._stcUpdatedAt);
  return (Number.isFinite(version)||Number.isFinite(updatedAt)) ? {version:Number.isFinite(version)?version:null,updatedAt:Number.isFinite(updatedAt)?updatedAt:null} : null;
}
async function stcCreateDoc(collection,id,data,operation='create'){
  stcAssertWriteSession(collection,operation); const docId=stcSafeDocId(id); const opId=stcNextMutationId();
  const ref=db.collection(collection).doc(docId);
  const payload={...data,...stcBuildMutationMeta(opId,operation)};
  stcJournalMutation({opId,collection,docId,operation,status:STC_RUNTIME.online?'PENDING':'QUEUED_LOCAL',at:stcNow()});
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(snap.exists){
        const old=snap.data()||{};
        if(old._stcOpId===opId) return;
        throw new Error(`Dokumen ${collection}/${docId} sudah ada. Operasi dibatalkan untuk mencegah duplikasi.`);
      }
      tx.set(ref,payload);
    });
    stcJournalStatus(opId,navigator.onLine?'COMMITTED_LOCAL':'QUEUED_LOCAL');
    return {opId,payload};
  }catch(e){ stcJournalStatus(opId,'FAILED',e.message||String(e)); throw e; }
}
async function stcUpdateDoc(collection,id,patch,options={}){
  stcAssertWriteSession(collection,options.operation||'update'); const docId=stcSafeDocId(id); const opId=stcNextMutationId();
  const ref=db.collection(collection).doc(docId); const expected=options.expected||null;
  stcJournalMutation({opId,collection,docId,operation:options.operation||'update',status:STC_RUNTIME.online?'PENDING':'QUEUED_LOCAL',at:stcNow()});
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref); if(!snap.exists){
        if(options.createIfMissing){
          const meta=stcBuildMutationMeta(opId,options.operation||'update');
          tx.set(ref,{...patch,...meta},{merge:true});
          return;
        }
        throw new Error(`Dokumen ${collection}/${docId} tidak ditemukan.`);
      }
      const old=snap.data()||{};
      if(expected){
        const ev=expected.version!=null?Number(expected.version):null, av=Number(old._stcVersion);
        const et=expected.updatedAt!=null?Number(expected.updatedAt):null, at=Number(old._stcUpdatedAt);
        const versionMismatch=ev!=null && Number.isFinite(av) && ev!==av;
        const timeMismatch=et!=null && Number.isFinite(at) && et!==at;
        if(versionMismatch||timeMismatch){ stcRecordConsistencyConflict(collection,docId,expected,old,options.operation||'update'); throw new Error('Konflik data: dokumen telah berubah di perangkat/sesi lain. Data Anda tidak ditimpa. Muat ulang data lalu ulangi perubahan.'); }
      }
      const meta=stcBuildMutationMeta(opId,options.operation||'update',old);
      tx.set(ref,{...patch,...meta},{merge:true});
    });
    stcJournalStatus(opId,navigator.onLine?'COMMITTED_LOCAL':'QUEUED_LOCAL'); return {opId};
  }catch(e){ stcJournalStatus(opId,e.message?.startsWith('Konflik data')?'CONFLICT':'FAILED',e.message||String(e)); throw e; }
}
async function stcDeleteDoc(collection,id,options={}){
  stcAssertWriteSession(collection,options.operation||'delete'); const docId=stcSafeDocId(id); const opId=stcNextMutationId();
  const ref=db.collection(collection).doc(docId); const expected=options.expected||null;
  stcJournalMutation({opId,collection,docId,operation:options.operation||'delete',status:STC_RUNTIME.online?'PENDING':'QUEUED_LOCAL',at:stcNow()});
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref); if(!snap.exists) return;
      const old=snap.data()||{};
      if(expected){
        const ev=expected.version!=null?Number(expected.version):null, av=Number(old._stcVersion);
        const et=expected.updatedAt!=null?Number(expected.updatedAt):null, at=Number(old._stcUpdatedAt);
        if((ev!=null&&Number.isFinite(av)&&ev!==av)||(et!=null&&Number.isFinite(at)&&et!==at)){
          stcRecordConsistencyConflict(collection,docId,expected,old,options.operation||'delete');
          throw new Error('Konflik data: dokumen berubah sebelum dihapus. Penghapusan dibatalkan.');
        }
      }
      tx.delete(ref);
    });
    stcJournalStatus(opId,navigator.onLine?'COMMITTED_LOCAL':'QUEUED_LOCAL'); return {opId};
  }catch(e){ stcJournalStatus(opId,e.message?.startsWith('Konflik data')?'CONFLICT':'FAILED',e.message||String(e)); throw e; }
}
async function stcUpdateAngsuranPayment(id,bayarNominal,metode,catatan){
  stcAssertWriteSession(STC_COLLECTIONS.ANGSURAN,'payment'); const docId=stcSafeDocId(id,'ID angsuran'); const opId=stcNextMutationId();
  const ref=db.collection(STC_COLLECTIONS.ANGSURAN).doc(docId);
  stcJournalMutation({opId,collection:STC_COLLECTIONS.ANGSURAN,docId,operation:'payment',status:STC_RUNTIME.online?'PENDING':'QUEUED_LOCAL',at:stcNow()});
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref); if(!snap.exists) throw new Error('Data angsuran tidak ditemukan.');
      const a=snap.data()||{}; const total=Number(a.totalHarga)||0; const paid=Number(a.totalBayar)||0; const sisa=Math.max(0,total-paid);
      if(bayarNominal<=0||bayarNominal>sisa) throw new Error('Nominal pembayaran tidak valid terhadap saldo terbaru.');
      const riwayat=Array.isArray(a.riwayatBayar)?[...a.riwayatBayar]:[];
      riwayat.push({id:'BYR-'+opId,tanggal:tgl(),waktu:stcNow(),nominal:bayarNominal,metode,catatan});
      tx.set(ref,{totalBayar:paid+bayarNominal,riwayatBayar:riwayat,pembayaranTerakhir:tgl(),...stcBuildMutationMeta(opId,'payment',a)},{merge:true});
    });
    stcJournalStatus(opId,navigator.onLine?'COMMITTED_LOCAL':'QUEUED_LOCAL'); return {opId};
  }catch(e){ stcJournalStatus(opId,'FAILED',e.message||String(e)); throw e; }
}
function stcReconcileMutationJournal(snapshotDocs){
  const docs=Array.isArray(snapshotDocs)?snapshotDocs:[]; const byOp=new Map(); docs.forEach(d=>{const op=d?.data?._stcOpId;if(op)byOp.set(op,d.id);});
  const list=stcReadMutationJournal(); let changed=false;
  list.forEach(item=>{if(item && (item.status==='PENDING'||item.status==='COMMITTED_LOCAL'||item.status==='QUEUED_LOCAL') && byOp.has(item.opId)){item.status='SYNCED';item.syncedAt=stcNow();changed=true;}});
  if(changed)stcWriteMutationJournal(list); STC_RUNTIME.lastConsistencyCheckAt=stcNow();
}
function stcConsistencySummary(){
  const j=stcReadMutationJournal(); return {online:STC_RUNTIME.online,persistence:STC_RUNTIME.persistenceMode,
    pending:j.filter(x=>['PENDING','QUEUED_LOCAL','COMMITTED_LOCAL'].includes(x.status)).length,
    failed:j.filter(x=>x.status==='FAILED').length,conflicts:STC_RUNTIME.consistencyConflicts.length,
    lastCheck:STC_RUNTIME.lastConsistencyCheckAt};
}
function stcShowConsistencyRecovery(message){
  const summary=stcConsistencySummary(); alert(`${message}\n\nStatus: ${summary.online?'ONLINE':'OFFLINE'}\nOperasi lokal tertunda: ${summary.pending}\nKonflik terdeteksi: ${summary.conflicts}\n\nData cloud tidak ditimpa secara paksa. Muat ulang data setelah koneksi stabil lalu ulangi operasi yang konflik.`);
}
function stcMarkOnlineState(online){
  STC_RUNTIME.online=!!online;
  if(online){ stcResetReconnectBackoff(); setBadgeCloud('🟢 Online',true); stcScheduleRealtimeReconnect(); }
  else { setBadgeCloud('⚠️ Offline — perubahan disimpan lokal',false); stcSecurityEvent('OFFLINE_MODE','network-lost'); }
}
window.addEventListener('online',()=>stcMarkOnlineState(true));
window.addEventListener('offline',()=>stcMarkOnlineState(false));

/* ================================================================
   STAGE 6 — DISTRIBUTED DATA INTEGRITY & ADVANCED FIRESTORE ARCHITECTURE
   6A: canonical business identity / deterministic keys
   6B: server-authoritative mutation timestamps
   6C: atomic multi-document transaction primitives
   6D: business invariant validation
   6E: idempotent business operation fingerprints
   6F: cross-document conflict detection
   6G: monotonic version enforcement
   6H: safe legacy-document upgrade
   6I: snapshot freshness / read-your-write reconciliation
   6J: transaction retry classification
   6K: recovery after ambiguous commit
   6L: integrity diagnostics & repair planning
   6M: rules-compatible write envelope
   6N: migration-safe architecture
   ================================================================ */
const STC_STAGE6 = Object.freeze({
  schemaVersion: 6,
  mutationSchemaVersion: 2,
  maxBusinessKeyLength: 240,
  maxRepairItems: 100,
  maxTransactionRetries: 5,
  serverTimestampField: '_stcServerAt',
  businessKeyField: '_stcBusinessKey',
  fingerprintField: '_stcFingerprint'
});
STC_RUNTIME.stage6 = STC_RUNTIME.stage6 || {
  transactionCount: 0,
  transactionRetries: 0,
  ambiguousCommits: 0,
  repairPlans: [],
  lastAuditAt: 0
};

function stcStage6Normalize(value){
  return String(value == null ? '' : value).trim().normalize('NFC').toUpperCase();
}
function stcStage6HashSync(value){
  const s=String(value||''); let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619);}
  return ('00000000'+(h>>>0).toString(16)).slice(-8);
}
function stcStage6BusinessKey(collection, parts){
  const raw=[String(collection||''),...(Array.isArray(parts)?parts:[])].map(stcStage6Normalize).join('|');
  const compact=raw.replace(/\|+/g,'|').slice(0,STC_STAGE6.maxBusinessKeyLength);
  return `${compact}|H:${stcStage6HashSync(raw)}`;
}
function stcStage6Fingerprint(collection, businessKey, payload){
  const base=stcCanonicalJson({collection,businessKey,payload});
  return `S6-${stcStage6HashSync(base)}`;
}
function stcStage6ServerTimestamp(){
  return firebase?.firestore?.FieldValue?.serverTimestamp ? firebase.firestore.FieldValue.serverTimestamp() : null;
}
function stcStage6MutationMeta(opId,operation,existing=null,extra={}){
  const version=Math.max(0,Number(existing?._stcVersion)||0)+1;
  const meta={
    _stcSchema:STC_STAGE6.mutationSchemaVersion,
    _stcOpId:String(opId),
    _stcOperation:String(operation),
    _stcVersion:version,
    _stcUpdatedAt:stcNow(),
    _stcUpdatedBy:currentAuthUser?.uid||'offline'
  };
  const serverAt=stcStage6ServerTimestamp();
  if(serverAt) meta[STC_STAGE6.serverTimestampField]=serverAt;
  return {...meta,...extra};
}
function stcStage6ExpectedMatches(expected, old){
  if(!expected) return true;
  const ev=expected.version!=null?Number(expected.version):null;
  const av=Number(old?._stcVersion);
  const et=expected.updatedAt!=null?Number(expected.updatedAt):null;
  const at=Number(old?._stcUpdatedAt);
  return !((ev!=null&&Number.isFinite(av)&&ev!==av)||(et!=null&&Number.isFinite(at)&&et!==at));
}
function stcStage6ValidateBusinessPayload(collection,payload){
  if(!stcCollectionAllowed(collection)) throw new Error(`Koleksi ${collection} tidak diizinkan.`);
  stcValidateRecordShape(payload,`${collection} payload`);
  const id=payload.id;
  if(id!=null) stcSafeDocId(id,'ID bisnis');
  if(collection===STC_COLLECTIONS.BARANG){
    const kode=stcStage6Normalize(payload.kode); if(!kode) throw new Error('Kode barang wajib diisi.');
    if(Number(payload.harga)<0||Number(payload.hargaMeter)<0||Number(payload.hargaRoll)<0) throw new Error('Harga tidak boleh negatif.');
  }
  if([STC_COLLECTIONS.ORDERS,STC_COLLECTIONS.MUTASI,STC_COLLECTIONS.RETURNS].includes(collection)){
    if(!stcStage6Normalize(payload.kode)) throw new Error('Kode barang pada transaksi wajib diisi.');
  }
  if(collection===STC_COLLECTIONS.ANGSURAN){
    const total=Number(payload.totalHarga); const bayar=Number(payload.totalBayar);
    if(!Number.isFinite(total)||total<0||!Number.isFinite(bayar)||bayar<0||bayar>total) throw new Error('Saldo angsuran tidak konsisten.');
  }
  return true;
}
async function stcStage6RunTransaction(label, callback){
  stcAssertWriteSession(callback?.collection||STC_COLLECTIONS.ORDERS,label||'transaction');
  if(!db) throw new Error('Firestore tidak tersedia untuk transaksi atomik.');
  const max=STC_STAGE6.maxTransactionRetries;
  STC_RUNTIME.stage6.transactionCount++;
  try{
    return await db.runTransaction(async tx=>{
      return callback(tx);
    });
  }catch(e){
    const code=String(e?.code||'');
    if(code==='aborted' || code==='failed-precondition') STC_RUNTIME.stage6.transactionRetries++;
    if(code==='unknown' || code==='deadline-exceeded') STC_RUNTIME.stage6.ambiguousCommits++;
    throw e;
  }
}
async function stcStage6CreateBusinessDoc(collection,id,data,operation='create',businessParts=[]){
  stcAssertWriteSession(collection,operation); const docId=stcSafeDocId(id); const opId=stcNextMutationId();
  const ref=db.collection(collection).doc(docId);
  const businessKey=stcStage6BusinessKey(collection,[...businessParts,docId]);
  const payload={...data,_stcBusinessKey:businessKey};
  stcStage6ValidateBusinessPayload(collection,payload);
  const fingerprint=stcStage6Fingerprint(collection,businessKey,payload);
  const finalPayload={...payload,_stcFingerprint:fingerprint,...stcStage6MutationMeta(opId,operation,null)};
  stcJournalMutation({opId,collection,docId,operation,status:STC_RUNTIME.online?'PENDING':'QUEUED_LOCAL',businessKey,fingerprint,at:stcNow()});
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(snap.exists){
        const old=snap.data()||{};
        if(old._stcFingerprint===fingerprint || old._stcBusinessKey===businessKey) throw new Error(`Operasi bisnis duplikat terdeteksi untuk ${collection}/${docId}.`);
        throw new Error(`Dokumen ${collection}/${docId} sudah ada.`);
      }
      tx.set(ref,finalPayload);
    });
    stcJournalStatus(opId,STC_RUNTIME.online?'COMMITTED_LOCAL':'QUEUED_LOCAL');
    return {opId,businessKey,fingerprint};
  }catch(e){
    stcJournalStatus(opId,'FAILED',e.message||String(e)); throw e;
  }
}
async function stcStage6UpdateBusinessDoc(collection,id,patch,options={}){
  stcAssertWriteSession(collection,options.operation||'update'); const docId=stcSafeDocId(id); const opId=stcNextMutationId();
  const ref=db.collection(collection).doc(docId); const expected=options.expected||null;
  stcJournalMutation({opId,collection,docId,operation:options.operation||'update',status:STC_RUNTIME.online?'PENDING':'QUEUED_LOCAL',at:stcNow()});
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists){
        if(!options.createIfMissing) throw new Error(`Dokumen ${collection}/${docId} tidak ditemukan.`);
        const businessKey=stcStage6BusinessKey(collection,[docId]);
        const next={...patch,id:patch.id||docId,_stcBusinessKey:businessKey};
        stcStage6ValidateBusinessPayload(collection,next);
        const fingerprint=stcStage6Fingerprint(collection,businessKey,next);
        tx.set(ref,{...next,_stcFingerprint:fingerprint,...stcStage6MutationMeta(opId,options.operation||'update')},{merge:true});
        return;
      }
      const old=snap.data()||{};
      if(!stcStage6ExpectedMatches(expected,old)){
        stcRecordConsistencyConflict(collection,docId,expected,old,options.operation||'update');
        throw new Error('Konflik data: dokumen telah berubah. Perubahan dibatalkan untuk menjaga integritas data.');
      }
      const businessKey=old._stcBusinessKey||stcStage6BusinessKey(collection,[docId]);
      const next={...old,...patch,id:old.id||docId,_stcBusinessKey:businessKey};
      stcStage6ValidateBusinessPayload(collection,next);
      const fingerprint=stcStage6Fingerprint(collection,businessKey,patch);
      tx.set(ref,{...patch,_stcBusinessKey:businessKey,_stcFingerprint:fingerprint,...stcStage6MutationMeta(opId,options.operation||'update',old)},{merge:true});
    });
    stcJournalStatus(opId,STC_RUNTIME.online?'COMMITTED_LOCAL':'QUEUED_LOCAL'); return {opId};
  }catch(e){stcJournalStatus(opId,e.message?.startsWith('Konflik data')?'CONFLICT':'FAILED',e.message||String(e));throw e;}
}
function stcStage6RepairPlan(collection,id,reason,details={}){
  const item={collection:String(collection),docId:String(id),reason:String(reason),details,at:stcNow()};
  const a=STC_RUNTIME.stage6.repairPlans; a.push(item); if(a.length>STC_STAGE6.maxRepairItems)a.shift(); return item;
}
function stcStage6AuditDocument(collection,id,data){
  const issues=[]; const d=data||{};
  if(d._stcVersion!=null && (!Number.isFinite(Number(d._stcVersion))||Number(d._stcVersion)<1)) issues.push('INVALID_VERSION');
  if(d._stcOpId!=null && !String(d._stcOpId).trim()) issues.push('INVALID_OPERATION_ID');
  if(d._stcBusinessKey!=null && String(d._stcBusinessKey).length>STC_STAGE6.maxBusinessKeyLength+20) issues.push('BUSINESS_KEY_TOO_LONG');
  if(d._stcFingerprint!=null && !/^S6-[0-9a-f]{8}$/i.test(String(d._stcFingerprint))) issues.push('INVALID_FINGERPRINT');
  if(issues.length) stcStage6RepairPlan(collection,id,'DOCUMENT_INTEGRITY', {issues});
  return issues;
}
function stcStage6RuntimeSummary(){
  return {...stcConsistencySummary(),stage6:{...STC_RUNTIME.stage6},serverTimestampField:STC_STAGE6.serverTimestampField};
}
function stcStage6IntegrityAudit(){
  const collections=[STC_COLLECTIONS.BARANG,STC_COLLECTIONS.ORDERS,STC_COLLECTIONS.MUTASI,STC_COLLECTIONS.RETURNS,STC_COLLECTIONS.ANGSURAN];
  STC_RUNTIME.stage6.lastAuditAt=stcNow();
  return {at:STC_RUNTIME.stage6.lastAuditAt,collections,repairPlans:STC_RUNTIME.stage6.repairPlans.slice(),runtime:stcStage6RuntimeSummary()};
}

/* ================================================================
   STAGE 7 — BUSINESS LEDGER & CROSS-COLLECTION INTEGRITY
   7A: deterministic business-event identity
   7B: movement ledger derived from existing MUTASI/RETURNS semantics
   7C: cross-collection reference/orphan detection
   7D: duplicate event and business-key detection
   7E: movement balance reconciliation without inventing opening stock
   7F: sales/order scope validation (no false stock mutation)
   7G: repair-plan generation, owner-only execution boundary
   7H: runtime observability and audit summary

   IMPORTANT: STAGE 7 does NOT reinterpret the existing `orders.stok`
   text field as authoritative stock, and does NOT silently mutate `barang`.
   Stock opening balances and branch-specific sales location are not present
   in the current data model, so the engine reports scoped/derived balances
   instead of fabricating stock totals.
   ================================================================ */
const STC_STAGE7 = Object.freeze({
  schemaVersion: 7,
  ledgerSchemaVersion: 1,
  maxAuditItems: 500,
  maxRepairItems: 100,
  maxSampleItems: 25,
  collections: Object.freeze({
    BARANG: STC_COLLECTIONS.BARANG,
    ORDERS: STC_COLLECTIONS.ORDERS,
    MUTASI: STC_COLLECTIONS.MUTASI,
    RETURNS: STC_COLLECTIONS.RETURNS,
    PENJUALAN: STC_COLLECTIONS.PENJUALAN,
    ANGSURAN: STC_COLLECTIONS.ANGSURAN
  })
});
STC_RUNTIME.stage7 = STC_RUNTIME.stage7 || {
  lastAuditAt: 0, lastAudit: null, repairPlans: [],
  duplicateEvents: 0, orphanReferences: 0, invalidMovements: 0,
  scopedMovementLines: 0, unscopedSales: 0
};

function stcStage7Normalize(value){
  return String(value == null ? '' : value).trim().normalize('NFC').toUpperCase();
}
function stcStage7Number(value){
  const n=Number(String(value==null?'':value).replace(',','.'));
  return Number.isFinite(n) ? n : NaN;
}
function stcStage7EventIdentity(collection,item){
  const d=item||{};
  const existing=String(d._stcBusinessKey||'').trim();
  if(existing) return existing;
  const id=String(d.id||'').trim();
  const parts=[collection,id,d.noMutasi,d.noReturn,d.kode,d.tokoAsal,d.tokoTujuan,d.tglWaktu];
  return `LEGACY7|${stcStage6BusinessKey(collection,parts)}`;
}
function stcStage7RepairPlan(code,details={}){
  const item={code:String(code),details,at:stcNow()};
  const a=STC_RUNTIME.stage7.repairPlans; a.push(item);
  if(a.length>STC_STAGE7.maxRepairItems) a.shift();
  return item;
}
function stcStage7MovementLine(collection,item){
  const d=item||{};
  const qty=stcStage7Number(d.qty);
  if(!Number.isFinite(qty) || qty<=0) return {valid:false,code:'INVALID_QTY'};
  const code=stcStage7Normalize(d.kode);
  const asal=stcStage7Normalize(d.tokoAsal);
  const tujuan=stcStage7Normalize(d.tokoTujuan);
  if(!code) return {valid:false,code:'MISSING_ITEM_CODE'};
  if(!asal || !tujuan) return {valid:false,code:'MISSING_LOCATION'};
  if(asal===tujuan) return {valid:false,code:'SAME_ORIGIN_DESTINATION'};
  return {valid:true,collection,itemId:String(d.id||''),eventId:stcStage7EventIdentity(collection,d),kode:code,asal,tujuan,qty,satuan:stcStage7Normalize(d.satuan),no:String(d.noMutasi||d.noReturn||'')};
}
function stcStage7BuildMovementLedger(){
  const lines=[]; const issues=[];
  const sources=[[STC_COLLECTIONS.MUTASI,dbMutasi],[STC_COLLECTIONS.RETURNS,dbReturn]];
  sources.forEach(([collection,list])=>{
    (Array.isArray(list)?list:[]).forEach(item=>{
      const line=stcStage7MovementLine(collection,item);
      if(!line.valid){issues.push({collection,id:String(item?.id||''),code:line.code});STC_RUNTIME.stage7.invalidMovements++;return;}
      lines.push(line);
    });
  });
  STC_RUNTIME.stage7.scopedMovementLines=lines.length;
  return {lines,issues};
}
function stcStage7ReconcileMovementLedger(lines){
  const byItem=new Map(); const byRoute=new Map();
  (lines||[]).forEach(l=>{
    const itemKey=l.kode; const routeKey=`${l.kode}|${l.asal}|${l.tujuan}`;
    if(!byItem.has(itemKey)) byItem.set(itemKey,{kode:l.kode,totalMoved:0,lines:0});
    const a=byItem.get(itemKey); a.totalMoved+=l.qty; a.lines++;
    if(!byRoute.has(routeKey)) byRoute.set(routeKey,{kode:l.kode,asal:l.asal,tujuan:l.tujuan,out:0,in:0,net:0,lines:0});
    byRoute.get(routeKey).out+=l.qty; byRoute.get(routeKey).lines++;
  });
  byRoute.forEach(r=>{
    const reverse=byRoute.get(`${r.kode}|${r.tujuan}|${r.asal}`);
    r.in=reverse ? reverse.out : 0;
    r.net=r.in-r.out;
  });
  const itemRows=[]; byItem.forEach(v=>itemRows.push(v));
  return {byItem:itemRows,byRoute:Array.from(byRoute.values())};
}
function stcStage7AuditDuplicates(collection,list,seenBusiness,seenOp){
  (Array.isArray(list)?list:[]).slice(0,STC_STAGE7.maxAuditItems).forEach(item=>{
    const business=stcStage7EventIdentity(collection,item);
    if(seenBusiness.has(business)){STC_RUNTIME.stage7.duplicateEvents++;stcStage7RepairPlan('DUPLICATE_BUSINESS_ID',{collection,id:item?.id,businessKey:business});}
    else seenBusiness.set(business,{collection,id:String(item?.id||'')});
    const op=String(item?._stcOpId||'').trim();
    if(op){
      if(seenOp.has(op)){stcStage7RepairPlan('DUPLICATE_OPERATION_ID',{collection,id:item?.id,opId:op,first:seenOp.get(op)});}
      else seenOp.set(op,{collection,id:String(item?.id||'')});
    }
  });
}
function stcStage7AuditLoadedData(){
  STC_RUNTIME.stage7.duplicateEvents=0;
  STC_RUNTIME.stage7.orphanReferences=0;
  STC_RUNTIME.stage7.invalidMovements=0;
  STC_RUNTIME.stage7.repairPlans=[];
  const seenBusiness=new Map(),seenOp=new Map(),orphan=[];
  const masterCodes=new Set((Array.isArray(dbBrg)?dbBrg:[]).map(x=>stcStage7Normalize(x?.kode)).filter(Boolean));
  const collections=[
    [STC_COLLECTIONS.BARANG,dbBrg],[STC_COLLECTIONS.ORDERS,dbOrder],[STC_COLLECTIONS.MUTASI,dbMutasi],
    [STC_COLLECTIONS.RETURNS,dbReturn],[STC_COLLECTIONS.PENJUALAN,dbPenjualanHariIni],[STC_COLLECTIONS.ANGSURAN,dbAngsuran]
  ];
  collections.forEach(([collection,list])=>stcStage7AuditDuplicates(collection,list,seenBusiness,seenOp));
  [[STC_COLLECTIONS.ORDERS,dbOrder],[STC_COLLECTIONS.MUTASI,dbMutasi],[STC_COLLECTIONS.RETURNS,dbReturn],[STC_COLLECTIONS.PENJUALAN,dbPenjualanHariIni]].forEach(([collection,list])=>{
    (Array.isArray(list)?list:[]).forEach(item=>{
      const code=stcStage7Normalize(item?.kode);
      if(code && !masterCodes.has(code)) orphan.push({collection,id:String(item?.id||''),kode:code});
    });
  });
  STC_RUNTIME.stage7.orphanReferences=orphan.length;
  orphan.slice(0,STC_STAGE7.maxRepairItems).forEach(x=>stcStage7RepairPlan('ORPHAN_ITEM_REFERENCE',x));
  const ledger=stcStage7BuildMovementLedger();
  const reconciliation=stcStage7ReconcileMovementLedger(ledger.lines);
  const sales=(Array.isArray(dbPenjualanHariIni)?dbPenjualanHariIni:[]).map(x=>({id:String(x.id||''),kode:stcStage7Normalize(x.kode),qty:stcStage7Number(x.qty),status:'UNSCOPED_LOCATION'}));
  STC_RUNTIME.stage7.unscopedSales=sales.length;
  const result={
    at:stcNow(),schemaVersion:STC_STAGE7.schemaVersion,ledgerSchemaVersion:STC_STAGE7.ledgerSchemaVersion,
    counts:{barang:dbBrg?.length||0,orders:dbOrder?.length||0,mutasi:dbMutasi?.length||0,returns:dbReturn?.length||0,penjualan:dbPenjualanHariIni?.length||0,angsuran:dbAngsuran?.length||0},
    masterCodes:masterCodes.size,duplicateBusinessEvents:STC_RUNTIME.stage7.duplicateEvents,
    orphanReferences:orphan.length,invalidMovements:ledger.issues.length,
    movementLedger:{lines:ledger.lines.length,issues:ledger.issues.slice(0,STC_STAGE7.maxSampleItems),reconciliation},
    salesScope:{total:sales.length,unscoped:sales.length,sample:sales.slice(0,STC_STAGE7.maxSampleItems)},
    repairPlans:STC_RUNTIME.stage7.repairPlans.slice(-STC_STAGE7.maxRepairItems),
    limitation:[
      'Tidak ada saldo awal stok yang tersimpan secara eksplisit pada model data saat ini.',
      'orders.stok adalah teks operasional dan tidak diperlakukan sebagai saldo stok otoritatif.',
      'penjualan tidak memiliki lokasi/cabang pada dokumen saat ini sehingga tidak dimasukkan ke saldo stok per lokasi.'
    ]
  };
  STC_RUNTIME.stage7.lastAuditAt=result.at; STC_RUNTIME.stage7.lastAudit=result;
  return result;
}
function stcStage7RuntimeSummary(){return {...stcRuntimeSummary(),stage7:{...STC_RUNTIME.stage7}};}
function stcStage7IntegrityAudit(){return stcStage7AuditLoadedData();}
function stcStage7CanRepair(){return stcIsOwnerSession() && stcSecuritySessionOK();}
const STC_STAGE2 = Object.freeze({
  maxBatchWrites: 400,
  actionLockMs: 1200,
  reconnectMaxMs: 30000,
  runtimeErrorWindowMs: 1500
});

STC_RUNTIME.listenerEpoch = 0;
STC_RUNTIME.actionLocks = new Map();
STC_RUNTIME.runtimeFailures = [];
STC_RUNTIME.lastSnapshotAt = 0;
STC_RUNTIME.pendingWrites = 0;
STC_RUNTIME.destroyed = false;

function stcRecordRuntimeFailure(context, error){
  const now = stcNow();
  const message = error && error.message ? error.message : String(error || 'Unknown error');
  STC_RUNTIME.runtimeFailures.push({ context, message, at: now });
  if(STC_RUNTIME.runtimeFailures.length > 20) STC_RUNTIME.runtimeFailures.shift();
  return message;
}

function stcIsRole(role){ return statusRoleAktif === role; }
function stcHasSession(){ return !!currentAuthUser && !!db; }
function stcCanOperate(){ return [STC_ROLES.OWNER, STC_ROLES.CABANG].includes(statusRoleAktif); }

function stcActionLocked(key){
  const k = String(key || '');
  if(!k) return false;
  const now = stcNow();
  const old = STC_RUNTIME.actionLocks.get(k) || 0;
  if(old > now) return true;
  STC_RUNTIME.actionLocks.set(k, now + STC_STAGE2.actionLockMs);
  return false;
}

function stcClearActionLock(key){ STC_RUNTIME.actionLocks.delete(String(key || '')); }
function stcIsCurrentListenerEpoch(epoch){ return epoch === STC_RUNTIME.listenerEpoch && !STC_RUNTIME.destroyed; }

function stcClassifyFirestoreError(error){
  const code = String(error?.code || '').toLowerCase();
  if(['permission-denied','unauthenticated'].includes(code)) return 'AUTH';
  if(['failed-precondition','aborted'].includes(code)) return 'RETRY';
  if(['unavailable','deadline-exceeded','internal','resource-exhausted'].includes(code)) return 'RETRY';
  return 'FATAL';
}

function stcShouldRetryFirestore(error){ return stcClassifyFirestoreError(error) === 'RETRY'; }

async function stcWithWriteGuard(actionKey, fn){
  if(typeof fn !== 'function') return;
  if(stcActionLocked(actionKey)) return;
  STC_RUNTIME.pendingWrites++;
  try { return await fn(); }
  catch(error){ stcRecordRuntimeFailure(`WRITE:${actionKey}`, error); throw error; }
  finally { STC_RUNTIME.pendingWrites = Math.max(0, STC_RUNTIME.pendingWrites - 1); }
}

function stcBatchChunks(items, size=STC_STAGE2.maxBatchWrites){
  const source = Array.isArray(items) ? items : [];
  const chunks = [];
  for(let i=0; i<source.length; i += size) chunks.push(source.slice(i, i + size));
  return chunks;
}

function stcMarkSnapshotReceived(){ STC_RUNTIME.lastSnapshotAt = stcNow(); }
function stcRuntimeSummary(){
  return Object.freeze({
    role: statusRoleAktif,
    online: navigator.onLine,
    pendingWrites: STC_RUNTIME.pendingWrites,
    lastSnapshotAt: STC_RUNTIME.lastSnapshotAt,
    reconnectAttempts: STC_RUNTIME.reconnectAttempts,
    listenerEpoch: STC_RUNTIME.listenerEpoch,
    startupComplete: STC_RUNTIME.startupComplete,
    consistency: stcConsistencySummary()
  });
}

function stcCleanupRuntime(){
  STC_RUNTIME.destroyed = true;
  STC_RUNTIME.listenerEpoch++;
  if(STC_RUNTIME.reconnectTimer){ clearTimeout(STC_RUNTIME.reconnectTimer); STC_RUNTIME.reconnectTimer = null; }
  if(STC_RUNTIME.cacheSaveTimer){ clearTimeout(STC_RUNTIME.cacheSaveTimer); STC_RUNTIME.cacheSaveTimer = null; }
  STC_DEBOUNCE_TIMERS.forEach(timer => clearTimeout(timer));
  STC_DEBOUNCE_TIMERS.clear();
  if(STC_RUNTIME.renderFrame){
    if(typeof cancelAnimationFrame === 'function') cancelAnimationFrame(STC_RUNTIME.renderFrame);
    else clearTimeout(STC_RUNTIME.renderFrame);
    STC_RUNTIME.renderFrame = null;
  }
  if(STC_RUNTIME.maintenanceTimer){ clearInterval(STC_RUNTIME.maintenanceTimer); STC_RUNTIME.maintenanceTimer = null; }
  stcRenderQueueScheduled = false;
  STC_RENDER_QUEUE.clear();
  STC_RUNTIME.actionLocks.clear();
  stcPruneDomCaches();
  bersihkanListener();
  stcFlushCacheLokal();
}


/* ================================================================
   STAGE 3 — ADVANCED PERFORMANCE / MEMORY / CACHE OPTIMIZATION
   3A: advanced memory lifecycle
   3B: bounded local cache architecture
   3C: snapshot/data efficiency
   3D: render scheduling & DOM efficiency
   3E: index/search maintenance
   3F: timer/listener lifecycle
   3G: idle background maintenance
   3H: final runtime audit helpers
   ================================================================ */
const STC_STAGE3 = Object.freeze({
  cacheSchema: 3,
  domPruneIntervalMs: 60000,
  maintenanceIntervalMs: 60000,
  maxQueryCacheEntries: 80,
  maxRenderJobs: 64,
  idleTimeoutMs: 1200
});

STC_RUNTIME.renderFrame = null;
STC_RUNTIME.maintenanceTimer = null;
STC_RUNTIME.lastMaintenanceAt = 0;
STC_RUNTIME.cacheSchema = STC_STAGE3.cacheSchema;

function stcInvalidateDataIndexes(){
  STC_DATA_INDEX.kategoriRef = null;
  STC_DATA_INDEX.barangRef = null;
  STC_DATA_INDEX.orderRef = null;
  STC_DATA_INDEX.mutasiRef = null;
  STC_DATA_INDEX.returnRef = null;
  STC_DATA_INDEX.penjualanRef = null;
  STC_DATA_INDEX.angsuranRef = null;
}

function stcPruneDomCaches(){
  for(const [id, el] of STC_DOM_CACHE){
    if(!el || !el.isConnected) STC_DOM_CACHE.delete(id);
  }
  for(const [selector, list] of STC_QUERY_CACHE){
    if(!Array.isArray(list) || !list.length || !list.some(el => el && el.isConnected)){
      STC_QUERY_CACHE.delete(selector);
      continue;
    }
    const live = list.filter(el => el && el.isConnected);
    if(live.length !== list.length) STC_QUERY_CACHE.set(selector, live);
  }
  while(STC_QUERY_CACHE.size > STC_STAGE3.maxQueryCacheEntries){
    const firstKey = STC_QUERY_CACHE.keys().next().value;
    if(firstKey === undefined) break;
    STC_QUERY_CACHE.delete(firstKey);
  }
}

function stcBuildCachePayload(){
  return {
    schema: STC_STAGE3.cacheSchema,
    savedAt: stcNow(),
    dbKat, dbBrg, dbOrder, dbMutasi, dbReturn,
    configApp, petugasJagaAktif, daftarKaryawanPenjaga, riwayatPenjaga
  };
}

function stcReadCachePayload(raw){
  const o = stcSafeJsonParse(raw, null);
  if(!o || typeof o !== 'object') return null;
  const schema = Number(o.schema || 1);
  if(schema > STC_STAGE3.cacheSchema) return null;
  const arrays = ['dbKat','dbBrg','dbOrder','dbMutasi','dbReturn'];
  if(arrays.some(k => !Array.isArray(o[k]))) return null;
  return o;
}

function stcScheduleMaintenance(){
  if(STC_RUNTIME.maintenanceTimer || STC_RUNTIME.destroyed) return;
  STC_RUNTIME.maintenanceTimer = setInterval(() => {
    if(STC_RUNTIME.destroyed) return;
    STC_RUNTIME.lastMaintenanceAt = stcNow();
    stcPruneDomCaches();
    stcEnsureDataIndexes();
  }, STC_STAGE3.maintenanceIntervalMs);
}

function stcRunIdleMaintenance(){
  const run = () => {
    if(STC_RUNTIME.destroyed) return;
    stcPruneDomCaches();
    stcEnsureDataIndexes();
  };
  if(typeof requestIdleCallback === 'function') requestIdleCallback(run, {timeout: STC_STAGE3.idleTimeoutMs});
  else setTimeout(run, 0);
}

function stcRenderQueueFlush(){
  stcRenderQueueScheduled = false;
  STC_RUNTIME.renderFrame = null;
  const jobs = Array.from(STC_RENDER_QUEUE.values());
  STC_RENDER_QUEUE.clear();
  for(const job of jobs){
    try { job(); } catch(error) { stcLogWarn('DOM_RENDER', error); }
  }
}

/* Re-definisi scheduler Stage 3: satu frame maksimum per burst perubahan. */
function stcScheduleRender(key, fn){
  if(typeof fn !== 'function') return;
  STC_RENDER_QUEUE.set(key, fn);
  if(STC_RENDER_QUEUE.size > STC_STAGE3.maxRenderJobs){
    const firstKey = STC_RENDER_QUEUE.keys().next().value;
    if(firstKey !== undefined && firstKey !== key) STC_RENDER_QUEUE.delete(firstKey);
  }
  if(stcRenderQueueScheduled) return;
  stcRenderQueueScheduled = true;
  if(typeof requestAnimationFrame === 'function'){
    STC_RUNTIME.renderFrame = requestAnimationFrame(stcRenderQueueFlush);
  }else{
    STC_RUNTIME.renderFrame = setTimeout(stcRenderQueueFlush, 0);
  }
}

function stcStage3RuntimeAudit(){
  return Object.freeze({
    cacheSchema: STC_STAGE3.cacheSchema,
    domCacheEntries: STC_DOM_CACHE.size,
    queryCacheEntries: STC_QUERY_CACHE.size,
    debounceTimers: STC_DEBOUNCE_TIMERS.size,
    renderJobs: STC_RENDER_QUEUE.size,
    pendingWrites: STC_RUNTIME.pendingWrites,
    maintenanceAt: STC_RUNTIME.lastMaintenanceAt,
    indexRevision: STC_DATA_INDEX.revision
  });
}

/* Tahap 3 tidak mengubah model otorisasi: Anonymous Auth tetap CABANG. */

/* ================================================================
   STAGE 1D — DATA PROCESSING & SEARCH OPTIMIZATION
   Tujuan: mengurangi pencarian linear berulang, normalisasi string
   berulang, dan kalkulasi agregat yang sama tanpa mengubah perilaku.
   ================================================================ */
const STC_DATA_INDEX = {
  barangRef: null, barangLen: -1,
  barangByCode: new Map(), barangSearch: [], barangTextByItem: new WeakMap(),
  barangByCategory: new Map(), barangCategoryKeyByItem: new WeakMap(),
  kategoriRef: null, kategoriLen: -1, kategoriSorted: [], kategoriSet: new Set(),
  orderRef: null, orderLen: -1, orderById: new Map(), orderCountByCode: new Map(),
  orderSearch: [], orderByType: { barang: [], kabel: [] },
  mutasiRef: null, mutasiLen: -1, mutasiById: new Map(), mutasiCountByCode: new Map(), mutasiByNo: new Map(),
  returnRef: null, returnLen: -1, returnById: new Map(), returnCountByCode: new Map(), returnByNo: new Map(),
  penjualanRef: null, penjualanLen: -1, penjualanById: new Map(), penjualanCountByCode: new Map(),
  angsuranRef: null, angsuranLen: -1, angsuranById: new Map(), angsuranCountByCode: new Map(),
  revision: 0
};

function stcNormalizeSearch(value){
  return normalisasiSpasi(value).toLocaleLowerCase('id');
}

function stcComposeBarangSearchText(item){
  if(!item) return '';
  return stcNormalizeSearch([
    item.kode, item.nama, item.kat, item.jenis, item.ukuran,
    item.ket, item.keterangan, item.satuan
  ].filter(Boolean).join(' '));
}

function stcRebuildBarangIndex(){
  STC_DATA_INDEX.barangByCode.clear();
  STC_DATA_INDEX.barangSearch = [];
  STC_DATA_INDEX.barangTextByItem = new WeakMap();
  STC_DATA_INDEX.barangByCategory.clear();
  STC_DATA_INDEX.barangCategoryKeyByItem = new WeakMap();

  dbBrg.forEach(item => {
    const key = String(item?.kode || '').trim().toLowerCase();
    if(key) STC_DATA_INDEX.barangByCode.set(key, item);

    const text = stcComposeBarangSearchText(item);
    const katKey = normalisasiSpasi(item?.kat || '').toLowerCase();
    STC_DATA_INDEX.barangSearch.push({ item, text, katKey });

    if(item && typeof item === 'object'){
      STC_DATA_INDEX.barangTextByItem.set(item, text);
      STC_DATA_INDEX.barangCategoryKeyByItem.set(item, katKey);
    }

    if(katKey){
      if(!STC_DATA_INDEX.barangByCategory.has(katKey)) STC_DATA_INDEX.barangByCategory.set(katKey, []);
      STC_DATA_INDEX.barangByCategory.get(katKey).push(item);
    }
  });

  STC_DATA_INDEX.barangRef = dbBrg;
  STC_DATA_INDEX.barangLen = dbBrg.length;
  STC_DATA_INDEX.revision++;
}

function stcRebuildCollectionIndex(data, prefix, countByCode){
  const byId = STC_DATA_INDEX[prefix + 'ById'];
  byId.clear();
  countByCode.clear();

  if(prefix === 'mutasi') STC_DATA_INDEX.mutasiByNo.clear();
  if(prefix === 'return') STC_DATA_INDEX.returnByNo.clear();
  if(prefix === 'order'){
    STC_DATA_INDEX.orderSearch = [];
    STC_DATA_INDEX.orderByType.barang = [];
    STC_DATA_INDEX.orderByType.kabel = [];
  }

  data.forEach(item => {
    if(item?.id != null) byId.set(String(item.id), item);

    const code = String(item?.kode || '').trim().toLowerCase();
    if(code) countByCode.set(code, (countByCode.get(code) || 0) + 1);

    if(prefix === 'mutasi'){
      const no = String(item?.noMutasi || '').trim().toUpperCase();
      if(no){
        if(!STC_DATA_INDEX.mutasiByNo.has(no)) STC_DATA_INDEX.mutasiByNo.set(no, []);
        STC_DATA_INDEX.mutasiByNo.get(no).push(item);
      }
    } else if(prefix === 'return'){
      const no = String(item?.noReturn || '').trim().toUpperCase();
      if(no){
        if(!STC_DATA_INDEX.returnByNo.has(no)) STC_DATA_INDEX.returnByNo.set(no, []);
        STC_DATA_INDEX.returnByNo.get(no).push(item);
      }
    } else if(prefix === 'order'){
      const isKabel = isItemKabel(item);
      const type = isKabel ? 'kabel' : 'barang';
      STC_DATA_INDEX.orderByType[type].push(item);
      STC_DATA_INDEX.orderSearch.push({
        item,
        type,
        hay: stcNormalizeSearch([
          item?.toko, item?.kode, namaBarangLengkap(item), item?.ket
        ].filter(Boolean).join(' '))
      });
    }
  });

  STC_DATA_INDEX[prefix + 'Ref'] = data;
  STC_DATA_INDEX[prefix + 'Len'] = data.length;
  STC_DATA_INDEX.revision++;
}

function stcRebuildKategoriIndex(){
  STC_DATA_INDEX.kategoriSet.clear();
  dbKat.forEach(item => {
    const key = normalisasiSpasi(item).toLowerCase();
    if(key) STC_DATA_INDEX.kategoriSet.add(key);
  });
  STC_DATA_INDEX.kategoriRef = dbKat;
  STC_DATA_INDEX.kategoriLen = dbKat.length;
  STC_DATA_INDEX.revision++;
}

function stcEnsureDataIndexes(){
  if(STC_DATA_INDEX.kategoriRef !== dbKat || STC_DATA_INDEX.kategoriLen !== dbKat.length) stcRebuildKategoriIndex();
  if(STC_DATA_INDEX.barangRef !== dbBrg || STC_DATA_INDEX.barangLen !== dbBrg.length) stcRebuildBarangIndex();
  if(STC_DATA_INDEX.orderRef !== dbOrder || STC_DATA_INDEX.orderLen !== dbOrder.length) stcRebuildCollectionIndex(dbOrder, 'order', STC_DATA_INDEX.orderCountByCode);
  if(STC_DATA_INDEX.mutasiRef !== dbMutasi || STC_DATA_INDEX.mutasiLen !== dbMutasi.length) stcRebuildCollectionIndex(dbMutasi, 'mutasi', STC_DATA_INDEX.mutasiCountByCode);
  if(STC_DATA_INDEX.returnRef !== dbReturn || STC_DATA_INDEX.returnLen !== dbReturn.length) stcRebuildCollectionIndex(dbReturn, 'return', STC_DATA_INDEX.returnCountByCode);
  if(STC_DATA_INDEX.penjualanRef !== dbPenjualanHariIni || STC_DATA_INDEX.penjualanLen !== dbPenjualanHariIni.length) stcRebuildCollectionIndex(dbPenjualanHariIni, 'penjualan', STC_DATA_INDEX.penjualanCountByCode);
  if(STC_DATA_INDEX.angsuranRef !== dbAngsuran || STC_DATA_INDEX.angsuranLen !== dbAngsuran.length) stcRebuildCollectionIndex(dbAngsuran, 'angsuran', STC_DATA_INDEX.angsuranCountByCode || new Map());
}

function stcGetBarangByKode(kode){
  stcEnsureDataIndexes();
  return STC_DATA_INDEX.barangByCode.get(String(kode || '').trim().toLowerCase()) || null;
}
function stcSearchBarang(keyword, predicate=null){
  stcEnsureDataIndexes();
  const q = stcNormalizeSearch(keyword);
  if(!q){
    if(!predicate) return dbBrg.slice();
    const result = [];
    for(const entry of STC_DATA_INDEX.barangSearch){
      if(predicate(entry.item)) result.push(entry.item);
    }
    return result;
  }

  const result = [];
  for(const entry of STC_DATA_INDEX.barangSearch){
    if(entry.text.includes(q) && (!predicate || predicate(entry.item))) result.push(entry.item);
  }
  return result;
}

function stcGetBarangByKategori(kategori){
  stcEnsureDataIndexes();
  const key = normalisasiSpasi(kategori || '').toLowerCase();
  return key ? (STC_DATA_INDEX.barangByCategory.get(key) || STC_EMPTY_ARRAY) : dbBrg;
}

function stcGetItemsByNomor(collectionName, nomor){
  stcEnsureDataIndexes();
  const key = String(nomor || '').trim().toUpperCase();
  if(!key) return STC_EMPTY_ARRAY;
  if(collectionName === 'mutasi') return STC_DATA_INDEX.mutasiByNo.get(key) || STC_EMPTY_ARRAY;
  if(collectionName === 'returns') return STC_DATA_INDEX.returnByNo.get(key) || STC_EMPTY_ARRAY;
  return STC_EMPTY_ARRAY;
}
function stcFindBarang(keyword, predicate=null){
  stcEnsureDataIndexes();
  const raw = String(keyword || '').trim().toLowerCase();
  const q = stcNormalizeSearch(keyword);
  for(const entry of STC_DATA_INDEX.barangSearch){
    const item = entry.item;
    if(predicate && !predicate(item)) continue;
    const exactNama = String(item?.nama || '').trim().toLowerCase() === raw;
    if(exactNama || (q && entry.text.includes(q))) return item;
  }
  return null;
}

function stcCountByCode(collectionName, kode){
  stcEnsureDataIndexes();
  const key = String(kode || '').trim().toLowerCase();
  const map = collectionName === 'orders' ? STC_DATA_INDEX.orderCountByCode
    : collectionName === 'mutasi' ? STC_DATA_INDEX.mutasiCountByCode
    : collectionName === 'returns' ? STC_DATA_INDEX.returnCountByCode
    : STC_DATA_INDEX.penjualanCountByCode;
  return map.get(key) || 0;
}
function stcGetById(collectionName, id){
  stcEnsureDataIndexes();
  const key = String(id);
  const map = collectionName === 'orders' ? STC_DATA_INDEX.orderById
    : collectionName === 'mutasi' ? STC_DATA_INDEX.mutasiById
    : collectionName === 'returns' ? STC_DATA_INDEX.returnById
    : collectionName === 'penjualan' ? STC_DATA_INDEX.penjualanById
    : STC_DATA_INDEX.angsuranById;
  return map.get(key) || null;
}

// WAJIB DIISI setelah akun OWNER dibuat di Firebase Authentication.
// Ambil UID akun pemilik dari Firebase Console > Authentication > Users.
const OWNER_UID = STC_CONFIG.ownerUid;

let auth = null;
let db = null;
const unsubs = [];
let statusRoleAktif = STC_ROLES.CABANG;
let currentAuthUser = null;

let dbKat = [];
let dbBrg = [];
let dbOrder = [];
let dbMutasi = [];
let dbReturn = [];
let inputHariIni = [];
let dbPenjualanHariIni = [];
let dbAngsuran = [];

let configApp = { namaToko: 'SIAP TEKNIK COLDSTORAGE', namaCabang: 'STC SUMOBITO', alamatToko: 'JL. RAYA JOMBANG - SURABAYA' };
let petugasJagaAktif = { shift: 'PAGI', nama: 'HOLIGAS', waktu: '', catatan: '' };
let daftarKaryawanPenjaga = ['HOLIGAS','HERU','ANDRI'];
let riwayatPenjaga = [];
let pilihOrd=null, pilihUhd=null, pilihMut=null, pilihRet=null, pilihJual=null, pilihOrdKab=null;

/* FORMAT & KALKULASI */
function fAngka(e){ if(!e) return; e.value = String(e.value || '').replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function angka(s){ return parseInt(String(s || '0').replace(/\D/g, '')) || 0; }
function tgl(){
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).replace(/\./g, ':');
}

function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalisasiSpasi(teks){
  return String(teks || '').replace(/\s+/g, ' ').trim();
}

/* ================================================================
   STC ARCHITECTURE — SINGLE INDEX / ROLE-SEPARATED LAYERS
   CORE  : Firebase, Auth, shared state, security helpers
   OWNER : administrasi, konfigurasi, penjualan, angsuran, backup
   CABANG: operasional cabang melalui Anonymous Auth
   ================================================================ */

/* INISIALISASI FIREBASE & OTORISASI SESI */
function setBadgeCloud(text, online=false){
  const el = stcEl('badgeCloudStatus');
  if(!el) return;
  el.className = online ? 'badge-cloud online' : 'badge-cloud offline';
  el.innerText = text;
}

function setDeviceGate(show){
  const dash = stcEl('dashboard');
  if(dash) dash.style.display = 'grid';
}

function terapkanStatusPengguna(role){
  statusRoleAktif = role;
  const isOwner = role === STC_ROLES.OWNER;
  const badgeRole = stcEl('badgeRoleUser');
  const btnKeluar = stcEl('btnKeluarAuth');
  const btnRefresh = stcEl('btnRefreshAdmin');
  if(badgeRole) badgeRole.style.display = isOwner ? 'inline-block' : 'none';
  if(btnKeluar) btnKeluar.style.display = isOwner ? 'inline-block' : 'none';
  if(btnRefresh) btnRefresh.style.display = isOwner ? 'inline-block' : 'none';
  inisialisasiLayerRole(role);
}

function inisialisasiFirebase(){
  if(STC_RUNTIME.firebaseInitialized) return;
  try {
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    try {
      db.enablePersistence({ synchronizeTabs: true }).then(() => {
        STC_RUNTIME.persistenceEnabled = true;
        STC_RUNTIME.persistenceMode = 'multi-tab';
      }).catch(err => {
        const code = err && err.code ? err.code : '';
        if(code === 'failed-precondition') STC_RUNTIME.persistenceMode = 'single-tab';
        else if(code === 'unimplemented') STC_RUNTIME.persistenceMode = 'unsupported';
        else STC_RUNTIME.persistenceMode = 'memory';
        stcLogWarn('FIRESTORE_PERSISTENCE', err);
      });
    } catch(err) { STC_RUNTIME.persistenceMode = 'memory'; stcLogWarn('FIRESTORE_PERSISTENCE_INIT', err); }
    STC_RUNTIME.firebaseInitialized = true;

    auth.onAuthStateChanged(async user => {
      currentAuthUser = user || null;
      bersihkanListener();
      if(!user){
        bersihkanLayerRole();
        if(stcEntryIs(STC_ROLES.OWNER)){
          stcSetEntryAuthRequired(true);
          setBadgeCloud('🔐 Menunggu login OWNER');
          terapkanStatusPengguna(STC_ROLES.CABANG);
          setTimeout(() => { if(!currentAuthUser && stcEntryIs(STC_ROLES.OWNER)) bukaModalLogin(); }, 0);
          return;
        }
        stcSetEntryAuthRequired(false);
        terapkanStatusPengguna(STC_ROLES.CABANG);
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

      // Setiap entry point menegakkan sesi yang sesuai. Tidak ada fallback
      // diam-diam dari OWNER ke CABANG pada URL /owner/.
      if(stcEntryIs(STC_ROLES.OWNER) && user.isAnonymous){
        stcSetEntryAuthRequired(true);
        try { await auth.signOut(); } catch(e) { console.warn('Pembersihan sesi CABANG:', e); }
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
        if(stcEntryIs(STC_ROLES.CABANG)){
          // URL CABANG tidak boleh berubah menjadi panel OWNER hanya karena
          // browser masih menyimpan sesi OWNER. Kembali ke sesi anonim.
          hentikanPengawasSesiOwner();
          try { await auth.signOut(); } catch(e) { console.warn('Pembersihan sesi OWNER:', e); }
          return;
        }
        stcSetEntryAuthRequired(false);
        terapkanStatusPengguna(STC_ROLES.OWNER);
        setBadgeCloud('🟢 Pemilik terhubung', true);
        mulaiPengawasSesiOwner();
      } else if(user.isAnonymous){
        if(stcEntryIs(STC_ROLES.OWNER)){
          stcSetEntryAuthRequired(true);
          try { await auth.signOut(); } catch(e) {}
          return;
        }
        stcSetEntryAuthRequired(false);
        hentikanPengawasSesiOwner();
        terapkanStatusPengguna(STC_ROLES.CABANG);
        setBadgeCloud('🟢 Cabang terhubung', true);
      } else {
        // Akun non-OWNER tidak boleh memperoleh tampilan atau hak OWNER.
        hentikanPengawasSesiOwner();
        if(stcEntryIs(STC_ROLES.OWNER)){
          stcSetEntryAuthRequired(true);
          setBadgeCloud('⚠️ Akun bukan OWNER');
        } else {
          stcSetEntryAuthRequired(false);
          terapkanStatusPengguna(STC_ROLES.CABANG);
          setBadgeCloud('⚠️ Sesi tidak dikenali');
        }
        await auth.signOut();
        return;
      }
      setDeviceGate(false);
      stcSecurityEvent('SESSION_ROLE', `${statusRoleAktif}:${currentAuthUser?.uid || 'none'}`);
      stcSecurityAudit();
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

/*
 * Role layer initializer. Semua tetap berada dalam satu index.html agar
 * deployment GitHub tetap sederhana, tetapi lifecycle OWNER/CABANG dipisahkan.
 */
function inisialisasiLayerRole(role){
  const isOwner = role === STC_ROLES.OWNER;
  terapkanHakAksesUI(isOwner);

  if(isOwner){
    inisialisasiLayerOwner();
  }else{
    inisialisasiLayerCabang();
  }
}

function inisialisasiLayerOwner(){
  // UI OWNER hanya diaktifkan setelah sesi OWNER tervalidasi.
  document.body.classList.add('is-owner');
}

function inisialisasiLayerCabang(){
  // CABANG tetap menggunakan Anonymous Auth; tidak ada device approval.
  document.body.classList.remove('is-owner');
}

function bersihkanLayerRole(){
  document.body.classList.remove('is-owner');
}

function bersihkanListener() {
  const listeners = Array.isArray(unsubs) ? unsubs.slice() : [];
  unsubs.length = 0;
  listeners.forEach((unsubscribe, index) => {
    if(typeof unsubscribe !== 'function') return;
    try { unsubscribe(); }
    catch(error){ stcLogWarn(`LISTENER_CLEANUP_${index + 1}`, error); }
  });
}


function hubungkanRealtimeFirestore(){
  if(!db || ![STC_ROLES.OWNER, STC_ROLES.CABANG].includes(statusRoleAktif) || STC_RUNTIME.destroyed) return;
  stcResetReconnectBackoff();
  bersihkanListener();
  STC_RUNTIME.listenerEpoch++;
  hubungkanRealtimeFirestoreShared(STC_RUNTIME.listenerEpoch);

  if(statusRoleAktif === STC_ROLES.OWNER){
    hubungkanRealtimeFirestoreOwner(STC_RUNTIME.listenerEpoch);
  }
}

/* ========================= CORE / SHARED DATA ========================= */
function hubungkanRealtimeFirestoreShared(epoch=STC_RUNTIME.listenerEpoch){
  try {
    unsubs.push(db.collection(STC_COLLECTIONS.KATEGORI).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbKat = snap.docs.map(namaKategoriDariDokumen).sort(bandingKategori);
      stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})));
      stcInvalidateDataIndexes();
      if(navigator.onLine) setBadgeCloud(statusRoleAktif === STC_ROLES.OWNER ? '🟢 Pemilik terhubung' : '🟢 Cabang terhubung', true);
      stcScheduleRender('kategori-stream', () => {
        if(stcIsPageActive('kategori')) tampilKat();
        if(stcIsPageActive('laporan')) { isiFilterKategori(); tampilLaporan(); }
        if(stcIsPageActive('ubahHargaData')) isiUhdKat();
        if(stcIsPageActive('pindahKategori')) setupMenuPindahKategori();
        if(stcIsPageActive('cariCepatBarang')) setupCariCepat();
        if(stcIsPageActive('cetakKategori')) { isiFilterMenu7(); tampilTabelMenu7(); }
      });
      simpanCacheLokal();
    }, err => { stcFirestoreError('KATEGORI_STREAM', err, '⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection(STC_COLLECTIONS.BARANG).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbBrg = snap.docs.map(doc => doc.data()).sort((a,b) => bandingKodeBarang(a.kode, b.kode));
      stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})));
      stcInvalidateDataIndexes();
      stcScheduleRender('barang-stream', () => {
        if(stcIsPageActive('laporan')) tampilLaporan();
        if(stcIsPageActive('cetakKategori')) tampilTabelMenu7();
        if(stcIsPageActive('ubahHargaData')) tampilDaftarUhd();
        if(stcIsPageActive('cariCepatBarang')) cariCepatProses();
        if(stcIsPageActive('order')) tabelOrder();
        if(stcIsPageActive('mutasiBarang')) tabelMutasi();
        if(stcIsPageActive('barangReturn')) tabelReturn();
      });
      simpanCacheLokal();
    }, err => { stcFirestoreError('BARANG_STREAM', err, '⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection(STC_COLLECTIONS.ORDERS).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbOrder = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      stcInvalidateDataIndexes();
      stcScheduleRender('orders-stream', () => {
        if(stcIsPageActive('order')) tabelOrder();
      });
      simpanCacheLokal();
    }, err => { stcFirestoreError('ORDERS_STREAM', err, '⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection(STC_COLLECTIONS.MUTASI).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbMutasi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      stcInvalidateDataIndexes();
      stcScheduleRender('mutasi-stream', () => {
        if(stcIsPageActive('mutasiBarang')) tabelMutasi();
      });
      simpanCacheLokal();
    }, err => { stcFirestoreError('MUTASI_STREAM', err, '⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection(STC_COLLECTIONS.RETURNS).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbReturn = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      stcInvalidateDataIndexes();
      stcScheduleRender('returns-stream', () => {
        if(stcIsPageActive('barangReturn')) tabelReturn();
      });
      simpanCacheLokal();
    }, err => { stcFirestoreError('RETURNS_STREAM', err, '⚠️ Izin data ditolak'); }));

    unsubs.push(db.collection(STC_COLLECTIONS.PENGATURAN).doc('umum').onSnapshot(doc => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      if(doc.exists){
        const d = doc.data();
        if(d.configApp) configApp = d.configApp;
        if(d.petugasJagaAktif) petugasJagaAktif = d.petugasJagaAktif;
        if(Array.isArray(d.daftarKaryawanPenjaga)) daftarKaryawanPenjaga = d.daftarKaryawanPenjaga;
        if(Array.isArray(d.riwayatPenjaga)) riwayatPenjaga = d.riwayatPenjaga;
        applyPengaturanUI();
        stcScheduleRender('pengaturan-stream', () => {
          if(stcIsPageActive('penjagaToko')) muatMenuPenjagaToko();
          if(stcIsPageActive('pengaturan')) muatFormPengaturan();
        });
        simpanCacheLokal();
      }
    }, err => stcLogWarn('PENGATURAN_STREAM', err)));
  } catch(e) {
    stcLogError('FIRESTORE_SHARED_INIT', e);
    setBadgeCloud('⚠️ Akses Terbatas');
    stcScheduleRealtimeReconnect();
  }
}

/* =========================== OWNER LAYER =========================== */
function hubungkanRealtimeFirestoreOwner(epoch=STC_RUNTIME.listenerEpoch){
  try {
    unsubs.push(db.collection(STC_COLLECTIONS.PENJUALAN).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbPenjualanHariIni = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      stcInvalidateDataIndexes();
      stcScheduleRender('penjualan-owner-stream', () => {
        if(stcIsPageActive('penjualanHariIni')) { tabelPenjualanHariIni(); hitungTotalPenjualan(); }
      });
      simpanCacheLokal();
    }, err => stcFirestoreError('PENJUALAN_OWNER_STREAM', err, '⚠️ Izin OWNER ditolak')));

    unsubs.push(db.collection(STC_COLLECTIONS.ANGSURAN).onSnapshot(snap => {
      if(!stcIsCurrentListenerEpoch(epoch)) return;
      stcMarkSnapshotReceived();
      dbAngsuran = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        stcReconcileMutationJournal(snap.docs.map(d => ({id:d.id,data:d.data()})))
        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));
      stcInvalidateDataIndexes();
      stcScheduleRender('angsuran-owner-stream', () => {
        if(stcIsPageActive('angsuranData')) tabelAngsuran();
      });
      simpanCacheLokal();
    }, err => stcFirestoreError('ANGSURAN_OWNER_STREAM', err, '⚠️ Izin OWNER ditolak')));
  } catch(e) {
    stcLogError('FIRESTORE_OWNER_INIT', e);
    setBadgeCloud('⚠️ Akses OWNER terbatas');
    stcScheduleRealtimeReconnect();
  }
}

/* CACHE LOKAL */
function simpanCacheLokal(){
  // Tahap 1E: penulisan localStorage dibuat terjadwal/debounced agar beberapa
  // onSnapshot yang datang berdekatan tidak mem-serialize seluruh dataset berkali-kali.
  // Cache lokal tetap TIDAK menyimpan penjualan/angsuran.
  stcScheduleCacheSave();
}

function muatLokal(){
  const d = stcSafeLocalStorageGet(STC_CONFIG.cacheKey);
  if(!d) return;
  try {
    const o = stcReadCachePayload(d);
    if(!o) return;
    dbKat = o.dbKat;
    dbBrg = o.dbBrg;
    dbOrder = o.dbOrder;
    dbMutasi = o.dbMutasi;
    dbReturn = o.dbReturn;
    stcInvalidateDataIndexes();
    dbPenjualanHariIni = [];
    dbAngsuran = [];
    if(o.configApp) configApp = o.configApp;
    if(o.petugasJagaAktif) petugasJagaAktif = o.petugasJagaAktif;
    if(Array.isArray(o.daftarKaryawanPenjaga)) daftarKaryawanPenjaga = o.daftarKaryawanPenjaga;
    if(Array.isArray(o.riwayatPenjaga)) riwayatPenjaga = o.riwayatPenjaga;
    // Hapus field sensitif dari cache lama (versi sebelum pengamanan) pada browser ini.
    dbPenjualanHariIni = []; dbAngsuran = [];
    simpanCacheLokal();
    refreshSemua();
  } catch(e){ stcLogWarn('CACHE_LOAD', e); }
}

function refreshSemua(){
  applyPengaturanUI();
  tampilKat(); isiKat(); isiFilterKategori(); isiUhdKat(); isiFilterMenu7(); setupMenuPindahKategori(); setupCariCepat();
  tabelInput(); tampilLaporan(); tabelOrder(); if(stcEl('mutNo') && !stcEl('mutNo').value) buatNomorMutasiBaru(); tabelMutasi(); tabelReturn(); tampilTabelMenu7();
  tabelPenjualanHariIni(); hitungTotalPenjualan(); tabelAngsuran();
}

function applyPengaturanUI(){
  stcEl('headerJudulToko').innerText = configApp.namaToko || 'SIAP TEKNIK COLDSTORAGE';
  stcEl('namaCabang').value = configApp.namaCabang || 'STC SUMOBITO';
  stcEl('headerAlamatToko').innerText = configApp.alamatToko || '';
}

function getPetugasJagaTag(){ return `[${petugasJagaAktif.shift || 'PAGI'} - ${petugasJagaAktif.nama || 'HOLIGAS'}]`; }

/* AKSES TERSEMBUNYI OWNER: 5 ketukan atau tekan lama 3 detik */
let hitunganHools = 0;
let timerHools = null;
let timerTekanLama = null;
function ketukanRahasiaHools(){
  if(statusRoleAktif === STC_ROLES.OWNER) { tampilkanPanelSudahAktif(); return; }
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
      if(statusRoleAktif === STC_ROLES.OWNER) tampilkanPanelSudahAktif();
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
const pemicuHeaderOwner = stcEl('headerJudulToko');
if(stcEntryIs(STC_ROLES.OWNER)){
  if(pemicuHeaderOwner) {
    pemicuHeaderOwner.addEventListener('click', ketukanRahasiaHools);
    pasangTekanLama(pemicuHeaderOwner);
  }
  pasangTekanLama(document.querySelector('.secret-hools'));
}

document.addEventListener('keydown', function(e) {
  if (stcEntryIs(STC_ROLES.OWNER) && e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    if(statusRoleAktif === STC_ROLES.OWNER) tampilkanPanelSudahAktif();
    else bukaModalLogin();
  }
  if (e.key === 'Escape') {
    tutupSemuaSaran();
    tutupModalLogin();
  }
  if (e.key === 'Enter' && stcEl('modalAuthOverlay').style.display === 'flex') {
    if(e.target && (e.target.id === 'authEmail' || e.target.id === 'authPassword')) prosesLoginFirebase();
  }
});

stcEl('modalAuthOverlay').addEventListener('click', function(e){
  if(e.target === this) tutupModalLogin();
});
function bukaModalLogin(){
  if(statusRoleAktif === STC_ROLES.OWNER) { tampilkanPanelSudahAktif(); return; }
  const notice = stcEl('authNotice');
  notice.style.display = 'none'; notice.innerText = '';
  stcEl('modalAuthOverlay').style.display = 'flex';
  setTimeout(() => stcEl('authEmail').focus(), 50);
}
function tutupModalLogin(){
  stcEl('modalAuthOverlay').style.display = 'none';
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
  const emailEl = stcEl('authEmail');
  const passEl = stcEl('authPassword');
  const email = emailEl.value.trim();
  const pass = passEl.value; // Jangan trim password; spasi bisa merupakan bagian password.
  const notice = stcEl('authNotice');
  const tombol = stcEl('btnAuthLogin');
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
  if(statusRoleAktif !== STC_ROLES.OWNER || !currentAuthUser || currentAuthUser.uid !== OWNER_UID){
    alert('Sesi pemilik tidak terdeteksi. Muat ulang halaman lalu coba lagi.');
    return;
  }
  if(!confirm('Keluar dari Mode Admin sekarang?')) return;

  const tombolKeluar = stcEl('btnKeluarAuth');
  const teksAsli = tombolKeluar ? tombolKeluar.textContent : '';
  if(tombolKeluar){ tombolKeluar.disabled = true; tombolKeluar.textContent = '⏳ Keluar...'; }
  window.__stcLogoutInProgress = true;
  try {
    hentikanPengawasSesiOwner();
    const passwordEl = stcEl('authPassword');
    if(passwordEl) passwordEl.value = '';

    // Hentikan sesi OWNER terlebih dahulu. Flag mencegah callback auth
    // langsung membuat sesi anonim sebelum proses logout selesai.
    await auth.signOut();
    currentAuthUser = null;
    terapkanStatusPengguna(STC_ROLES.CABANG);
    setDeviceGate(false);
    setBadgeCloud('🔒 Mode Admin sudah keluar');

    window.__stcLogoutInProgress = false;
    alert('Berhasil keluar dari Mode Admin.');
    if(stcEntryIs(STC_ROLES.OWNER)){
      window.location.replace('../cabang/');
      return;
    }
    try { await auth.signInAnonymously(); }
    catch(anonError) {
      console.warn('Sesi anonim tidak dapat dimulai:', anonError);
      setBadgeCloud('⚠️ Keluar berhasil; mode cabang offline');
    }
  } catch(e) {
    window.__stcLogoutInProgress = false;
    console.error('Logout Firebase gagal:', e);
    alert('Gagal keluar dari Mode Admin: ' + (e.message || 'Kesalahan tidak diketahui'));
    if(tombolKeluar){ tombolKeluar.disabled = false; tombolKeluar.textContent = teksAsli || '🚪 Keluar Mode Admin'; }
  }
}

/* NAVIGASI & TAB */
function bukaMenuTarget(targetId){
  if(![STC_ROLES.OWNER, STC_ROLES.CABANG].includes(statusRoleAktif)){
    alert('Sesi cabang belum siap. Pastikan Firebase Authentication dan koneksi internet tersedia.');
    return;
  }
  const menuKhusus = ['inputBarang', 'ubahHargaData', 'laporan', 'pindahKategori', 'penjualanHariIni', 'angsuranData', 'pengaturan', 'penjagaToko', 'pulihkanData', 'backupData'];
  if(statusRoleAktif !== STC_ROLES.OWNER && menuKhusus.includes(targetId)){
    alert("Hanya pemilik toko yang memiliki izin ke menu ini.");
    bukaModalLogin();
    return;
  }
  tutupSemuaSaran();
  stcEl('dashboard').style.display='none';
  stcStaticAll('.page').forEach(p=>p.classList.remove('active'));
  stcEl(targetId).classList.add('active');
  // Simpan riwayat navigasi agar tombol Back HP kembali ke menu utama, bukan menutup tab.
  history.pushState({ stcMenu: targetId }, '', '#menu-' + encodeURIComponent(targetId));
  
  if(targetId==='laporan'){ isiFilterKategori(); tampilLaporan(); }
  if(targetId==='ubahHargaData'){ isiUhdKat(); }
  if(targetId==='cetakKategori'){ isiFilterMenu7(); tampilTabelMenu7(); }
  if(targetId==='pindahKategori'){ setupMenuPindahKategori(); }
  if(targetId==='cariCepatBarang'){ setupCariCepat(); }
  if(targetId==='penjualanHariIni'){ tabelPenjualanHariIni(); hitungTotalPenjualan(); }
  if(targetId==='angsuranData'){ tabelAngsuran(); }
  if(targetId==='pengaturan'){ muatFormPengaturan(); }
  if(targetId==='penjagaToko'){ muatMenuPenjagaToko(); }
  if(targetId==='barangReturn'){ if(!nomorReturnSekarang()) buatNomorReturnBaru(); tabelReturn(); }
  window.scrollTo({top: 0, behavior: 'smooth'});
}

const stcDashboard = stcEl('dashboard');
if(stcDashboard){
  stcDashboard.addEventListener('click', function(e){
    const card = e.target.closest('.menu-card');
    if(card && stcDashboard.contains(card)) bukaMenuTarget(card.dataset.target);
  });
}
function kembali(){
  tutupSemuaSaran();
  stcStaticAll('.page').forEach(p=>p.classList.remove('active'));
  stcEl('dashboard').style.display='grid';
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
document.addEventListener('click', function(e){
  const t = e.target.closest('.tab');
  if(!t) return;
  const p = t.closest('.page');
  if(!p) return;
  tutupSemuaSaran();
  p.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  p.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  const target = p.querySelector('#'+t.dataset.tab);
  if(target) target.classList.add('active');
});

/* PENCARIAN & AUTOCOMPLETE AMAN DARI KARAKTER PETIK */
function prediksiNama(input, idSaran, namaVar){
  const q = input.value.trim().toLowerCase(), box = stcEl(idSaran);
  if(!q){ box.style.display='none'; return; }
  const hasil = stcSearchBarang(q);
  if(!hasil.length){ stcSetHTML(box,  '<div class="saran-item">Tidak ditemukan</div>'); box.style.display = 'block'; return; }
  
  stcSetHTML(box,  hasil.map(b => `
    <div class="saran-item" data-stc-saran-kode="${encodeURIComponent(b.kode)}" data-stc-saran-box="${escapeHTML(idSaran)}" data-stc-saran-var="${escapeHTML(namaVar)}" data-stc-saran-input="${escapeHTML(input.id)}">
      <div><b>${escapeHTML(b.kode)}</b> · ${escapeHTML(namaBarangLengkap(b))}</div>
    </div>`).join(''));
  box.style.display = 'block';
}

function kosongkanKolomCari(...ids){
  ids.forEach(id => {
    const el = stcEl(id);
    if(el) el.value = '';
  });
}

function pilihSaranSafe(encodedKode, idSaran, namaVar, idInput){
  pilihSaran(decodeURIComponent(encodedKode), idSaran, namaVar, idInput);
}

function pilihSaran(kode, idSaran, namaVar, idInput){
  const b = stcGetBarangByKode(kode);
  if(!b) return;
  if(namaVar === 'pilihOrd') pilihOrd = b;
  else if(namaVar === 'pilihUhd') pilihUhd = b;
  else if(namaVar === 'pilihMut') pilihMut = b;
  else if(namaVar === 'pilihRet') pilihRet = b;
  else if(namaVar === 'pilihJual') { pilihJual = b; stcEl('jualKode').value = b.kode; hitungSubtotalJual(); }
  kosongkanKolomCari(idInput);
  stcEl(idSaran).style.display = 'none';

  if(namaVar === 'pilihOrd') { infoOrd(); setTimeout(() => stcEl('ordKet')?.focus(), 150); }
  else if(namaVar === 'pilihUhd'){ tampilFormEditHargaData(); }
  else if(namaVar === 'pilihMut'){ infoMut(); setTimeout(() => stcEl('mutQty')?.focus(), 150); }
  else if(namaVar === 'pilihRet'){ infoRet(); setTimeout(() => stcEl('retQty')?.focus(), 150); }
}

function prediksiNamaKabel(input){
  const q=input.value.trim().toLowerCase(), box=stcEl('saranOrdKab');
  if(!q){box.style.display='none';return;}
  const hasil=stcSearchBarang(q, b => kategoriAdalahKabel(b.kat) || stcComposeBarangSearchText(b).includes('kabel'));
  if(!hasil.length){stcSetHTML(box, '<div class="saran-item">Tidak ditemukan kabel</div>');box.style.display='block';return;}
  stcSetHTML(box, hasil.map(b=>`
    <div class="saran-item" data-stc-saran-kabel="${encodeURIComponent(b.kode)}">
      <div><b>${escapeHTML(b.kode)}</b> · ${escapeHTML(namaBarangLengkap(b))}</div>
    </div>`).join(''));
  box.style.display='block';
}

function pilihSaranKabelSafe(encKode){
  pilihSaranKabel(decodeURIComponent(encKode));
}

function pilihSaranKabel(kode){
  const b=stcGetBarangByKode(kode); if(!b) return;
  pilihOrdKab=b;
  stcEl('ordKabNama').value=namaBarangLengkap(b).toUpperCase();
  stcEl('ordKabKode').value=b.kode.toUpperCase();
  stcEl('saranOrdKab').style.display='none';
  infoOrdKab();
}

function tutupSemuaSaran(){ stcStaticAll('.saran-box').forEach(b=>{ b.style.display='none'; stcSetHTML(b, ''); }); }
document.addEventListener('click', function(e){
  const saran = e.target.closest('.saran-item');
  if(saran){
    if(saran.dataset.stcSaranKode){
      pilihSaranSafe(saran.dataset.stcSaranKode, saran.dataset.stcSaranBox, saran.dataset.stcSaranVar, saran.dataset.stcSaranInput);
      return;
    }
    if(saran.dataset.stcSaranKabel){
      pilihSaranKabelSafe(saran.dataset.stcSaranKabel);
      return;
    }
  }
  if(!e.target.closest('.form-group')) tutupSemuaSaran();
});

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
  if(STC_DATA_INDEX.kategoriRef !== dbKat || STC_DATA_INDEX.kategoriLen !== dbKat.length){
    STC_DATA_INDEX.kategoriSorted = dbKat.slice().sort(bandingKategori);
    STC_DATA_INDEX.kategoriRef = dbKat;
    STC_DATA_INDEX.kategoriLen = dbKat.length;
  }
  return STC_DATA_INDEX.kategoriSorted;
}
function idBarangFirestore(kode){
  const nilai = String(kode || '');
  return nilai.includes('/') ? '__stc_barang__' + encodeURIComponent(nilai) : nilai;
}

async function simpanKategori(){
  if(stcActionLocked('simpanKategori')) return;
  const v = stcEl('namaKategori').value.trim().toUpperCase();
  if(!v) return alert('Nama kategori tidak boleh kosong!');
  if(db){
    try {
      await stcUpdateDoc(STC_COLLECTIONS.KATEGORI,idKategoriFirestore(v),{nama:v,dibuat:tgl()},{operation:'category-save',createIfMissing:true});
      stcEl('namaKategori').value = '';
      alert('Kategori tersimpan ke database!');
    } catch(e) { alert("Gagal simpan kategori: " + e.message); }
  } else {
    if(!dbKat.includes(v)) dbKat.push(v);
    stcEl('namaKategori').value = '';
    simpanCacheLokal(); refreshSemua();
  }
}

async function hapusKategori(namaKat){
  if(stcActionLocked('hapusKategori')) return;
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus Pemilik Toko!');
  try { namaKat = decodeURIComponent(String(namaKat)); } catch (_) { namaKat = String(namaKat); }
  const target = String(namaKat || '').trim();
  if(!target) return alert('Nama kategori tidak valid.');

  const normKat = s => String(s || '').trim().normalize('NFC').toLocaleUpperCase('id-ID');
  const terkait = stcGetBarangByKategori(target).length;
  const peringatanBarang = terkait
    ? `\\n\\nPerhatian: ${terkait} barang masih memakai kategori ini. Barang tidak akan dihapus; kategori pada barang perlu diganti jika Anda ingin menghilangkan nama kategori sepenuhnya.`
    : '';
  if(!confirm(`Hapus kategori "${target}"?${peringatanBarang}`)) return;

  if(db){
    try {
      const col = db.collection(STC_COLLECTIONS.KATEGORI);
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
        simpanCacheLokal();
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
      simpanCacheLokal();
      refreshSemua();
      alert(`Kategori "${target}" berhasil dihapus dari Firebase.${terkait ? `\\n\\nCatatan: ${terkait} barang masih menggunakan nama kategori tersebut. Ubah kategori barang melalui menu Ubah Data & Harga agar nama itu tidak muncul lagi pada data barang.` : ''}`);
    } catch(e) {
      console.error('Hapus kategori gagal:', e);
      alert('Kategori gagal dihapus dari Firebase. Data lokal tidak diubah. Periksa koneksi dan izin Firestore.\\n\\nDetail: ' + (e && e.message ? e.message : e));
    }
  } else {
    dbKat = dbKat.filter(k => normKat(k) !== normKat(target));
    simpanCacheLokal();
    refreshSemua();
    alert(`Kategori "${target}" dihapus dari penyimpanan lokal.${terkait ? `\\n\\nCatatan: ${terkait} barang masih memakai kategori ini.` : ''}`);
  }
}
function tampilKat(){ 
  const c = stcEl('daftarKategori'); 
  if(c) stcSetHTML(c,  daftarKategoriUrut().map(k => `
    <div style="padding:8px; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
      <span>📁 ${escapeHTML(k)}</span>
      <button class="btn-danger aksi-sm" onclick="hapusKategori('${encodeURIComponent(k)}')">Hapus</button>
    </div>`).join('')); 
}

function kategoriAdalahKabel(kategori){
  return String(kategori || '').trim().toUpperCase().includes('KABEL');
}
function toggleJenisKabelInput(){
  const kategori = stcEl('inKategori')?.value || '';
  const grup = stcEl('groupJenisKabel');
  const isKabel = kategoriAdalahKabel(kategori);
  if(grup) grup.style.display = isKabel ? 'block' : 'none';
  const grupUkuran=stcEl('groupUkuranKabel');
  if(grupUkuran) grupUkuran.style.display=isKabel?'block':'none';
  if(!isKabel){ const pilih=stcEl('inJenisKabel'); if(pilih) pilih.value=''; const ukuran=stcEl('inUkuranKabel'); if(ukuran) ukuran.value=''; }
}
function ambilJenisKabel(kategori){
  if(!kategoriAdalahKabel(kategori)) return '';
  return stcEl('inJenisKabel')?.value || '';
}
function toggleJenisKabelEdit(){
  const kategori=stcEl('editUhdKategori')?.value || '';
  const grup=stcEl('groupEditJenisKabel');
  const pilih=stcEl('editUhdJenisKabel');
  const isKabel=kategoriAdalahKabel(kategori);
  if(grup) grup.style.display=isKabel?'block':'none';
  const grupUkuran=stcEl('groupEditUkuranKabel');
  if(grupUkuran) grupUkuran.style.display=isKabel?'block':'none';
  if(!isKabel && pilih) pilih.value='';
  if(!isKabel){const ukuran=stcEl('editUhdUkuranKabel');if(ukuran)ukuran.value='';}
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
    const el=stcEl(id); if(el) el.value='';
  });
  const kategori=stcEl('inKategori'); if(kategori) kategori.value='';
  toggleJenisKabelInput();
}

async function simpanBarang(){
  if(stcActionLocked('simpanBarang')) return;
  const kode = normalisasiSpasi(stcEl('inKode').value).toUpperCase();
  const nama = normalisasiSpasi(stcEl('inNama').value).toUpperCase();
  const kat = normalisasiSpasi(stcEl('inKategori').value).toUpperCase();
  const ket = normalisasiSpasi(stcEl('inKet').value).toUpperCase();
  // Validasi master: kode, nama, kategori, harga, dan duplikasi nama.
  const pesanValidasi = validasiMasterBarang({kode, nama, kat,
    harga: angka(stcEl('inHarga').value),
    hargaMeter: angka(stcEl('inHargaMeter').value),
    hargaRoll: angka(stcEl('inHargaRoll').value), ket});
  if(pesanValidasi === '__BATAL__') return;
  if(pesanValidasi) return alert(pesanValidasi);
  // Menu input adalah untuk barang baru; kode yang sudah terdaftar tidak boleh tertimpa.
  if(dbBrg.some(b => normalisasiSpasi(b.kode).toUpperCase() === kode))
    return alert('Kode barang sudah terdaftar! Gunakan menu Ubah Harga & Data untuk memperbarui barang tersebut.');
  const jenisKabel = ambilJenisKabel(kat);
  const ukuranKabel = kategoriAdalahKabel(kat) ? normalisasiUkuranKabel(stcEl('inUkuranKabel')?.value || '') : '';
  if(kategoriAdalahKabel(kat) && !jenisKabel) return alert('Pilih Jenis Kabel terlebih dahulu!');
  if(kategoriAdalahKabel(kat) && !ukuranKabel) return alert('Pilih Ukuran Kabel terlebih dahulu!');

  const item = {
    kode, nama, kat,
    ...(jenisKabel ? { jenisKabel, ukuranKabel } : {}),
    harga: angka(stcEl('inHarga').value),
    hargaMeter: angka(stcEl('inHargaMeter').value),
    hargaRoll: angka(stcEl('inHargaRoll').value),
    ket,
    tgl: tgl(),
    tglWaktu: Date.now()
  };

  if(db){
    try {
      await stcStage6CreateBusinessDoc(STC_COLLECTIONS.BARANG,idBarangFirestore(kode),item,'barang-create',[kode]);
      inputHariIni.push(item);
      tabelInput();
      bersihkanFormInputBarang();
      alert('Barang tersimpan ke database!');
    } catch(e) { alert("Gagal simpan barang: " + e.message); }
  } else {
    dbBrg.push(item);
    inputHariIni.push(item);
    tabelInput();
    simpanCacheLokal(); refreshSemua();
    bersihkanFormInputBarang();
    alert('Barang tersimpan (Lokal)!');
  }
}

function detailKolomKabel(item){
  const master = stcGetBarangByKode(item?.kode) || {};
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
  const master = stcGetBarangByKode(item?.kode) || {};
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
  const q=stcNormalizeSearch(kataKunci);
  if(!q) return false;
  stcEnsureDataIndexes();
  const indexed = item && typeof item === 'object' ? STC_DATA_INDEX.barangTextByItem.get(item) : null;
  return (indexed || stcComposeBarangSearchText(item)).includes(q);
}

function tabelInput(){
  const tb = stcEl('tabelInput');
  if(tb) stcSetHTML(tb,  inputHariIni.map((b,i)=>`
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
    </tr>`).join(''));
}
function kosongkanInputHariIni(){ inputHariIni=[]; tabelInput(); }

/* OPERASI UBAH HARGA */
function isiUhdKat(){ 
  const opsi = daftarKategoriUrut().map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('');
  const s=stcEl('uhdKategori'); if(s) stcSetHTML(s, '<option value="">Semua</option>'+opsi);
  const se=stcEl('editUhdKategori'); if(se) stcSetHTML(se, opsi);
  const sd=stcEl('daftarUhdKategori'); if(sd) stcSetHTML(sd, '<option value="">Semua Kategori</option>'+opsi);
  tampilDaftarUhd();
}
function filterUhdByKategori(){ pilihUhd=null; stcEl('uhdNama').value=''; tampilDaftarUhd(); }

function tampilDaftarUhd(){
  const tb=stcEl('tabelDaftarUhd'); if(!tb) return;
  const q=(stcEl('daftarUhdCari')?.value||'').trim().toLowerCase();
  const kat=stcEl('daftarUhdKategori')?.value||'';
  const data=dbBrg.filter(b=>{
    const cocokTeks=!q || String(b.kode||'').toLowerCase().includes(q) || cocokNamaBarang(b,q);
    return cocokTeks && (!kat || String(b.kat||'')===kat);
  });
  const info=stcEl('daftarUhdInfo');
  if(info) info.textContent=`Menampilkan ${data.length} dari ${dbBrg.length} barang`;
  if(!data.length){stcSetHTML(tb, '<tr><td colspan="7" class="text-center" style="padding:12px;">Barang tidak ditemukan</td></tr>');return;}
  stcSetHTML(tb, data.map(b=>`<tr>
    <td>${escapeHTML(b.kode||'')}</td><td>${escapeHTML(namaBarangLengkap(b))}</td><td>${escapeHTML(b.kat||'-')}</td>
    <td>Rp ${(Number(b.harga)||0).toLocaleString('id-ID')}</td>
    <td>Rp ${(Number(b.hargaMeter)||0).toLocaleString('id-ID')}</td>
    <td>Rp ${(Number(b.hargaRoll)||0).toLocaleString('id-ID')}</td>
    <td style="white-space:nowrap;">
      <button class="btn-warning aksi-sm" onclick="pilihBarangUhdDariDaftar('${encodeURIComponent(b.kode||'')}')">Ubah</button>
      <button class="btn-danger aksi-sm" style="margin-left:4px;" onclick="hapusBarangDariDaftar('${encodeURIComponent(b.kode||'')}')">Hapus</button>
    </td>
  </tr>`).join(''));
}
function pilihBarangUhdDariDaftar(encKode){
  const kode=decodeURIComponent(encKode);
  pilihUhd=stcGetBarangByKode(kode);
  if(pilihUhd){tampilFormEditHargaData();stcEl('formEditHargaData')?.scrollIntoView({behavior:'smooth',block:'start'});}
}
function cariUhdNama(){
  const q = stcEl('uhdNama').value.trim().toLowerCase();
  const kat = stcEl('uhdKategori')?.value || '';
  if(!q) return alert('Masukkan kode atau nama barang yang ingin dicari!');
  pilihUhd = stcFindBarang(q, b => (!kat || String(b.kat || '') === kat));
  if(pilihUhd) tampilFormEditHargaData();
  else alert('Barang tidak ditemukan pada kategori yang dipilih!');
}
function tampilFormEditHargaData(){
  if(!pilihUhd) return;
  stcEl('editUhdKode').value=pilihUhd.kode;
  stcEl('editUhdNama').value=pilihUhd.nama;
  if(stcEl('editUhdKategori')) stcEl('editUhdKategori').value = pilihUhd.kat || '';
  stcEl('editUhdJenisKabel').value=normalisasiJenisKabelLama(pilihUhd.jenisKabel);
  stcEl('editUhdUkuranKabel').value=normalisasiUkuranKabel(pilihUhd.ukuranKabel||'');
  toggleJenisKabelEdit();
  stcEl('editUhdHargaJual').value=(pilihUhd.harga||0).toLocaleString();
  stcEl('editUhdHargaMeter').value=(pilihUhd.hargaMeter||0).toLocaleString();
  stcEl('editUhdHargaRoll').value=(pilihUhd.hargaRoll||0).toLocaleString();
  stcEl('editUhdKet').value=pilihUhd.ket || '';
}

function bersihkanFormUbahHargaData(){
  // Kosongkan seluruh kolom edit setelah penyimpanan berhasil.
  pilihUhd = null;
  ['editUhdKode','editUhdNama','editUhdHargaJual','editUhdHargaMeter',
   'editUhdHargaRoll','editUhdKet','editUhdJenisKabel','editUhdUkuranKabel',
   'editUhdKategori','uhdNama'].forEach(id => {
    const el = stcEl(id);
    if(el) el.value = '';
  });
  const saran = stcEl('saranUhd');
  if(saran) stcSetHTML(saran,  '');
  toggleJenisKabelEdit();
}

async function simpanUbahHargaData(){
  if(!pilihUhd) return;
  const kode = stcEl('editUhdKode').value.trim().toUpperCase();
  const nama = normalisasiSpasi(stcEl('editUhdNama').value).toUpperCase();
  const kat = stcEl('editUhdKategori').value;
  const pesanValidasi = validasiMasterBarang({kode, nama, kat,
    harga: angka(stcEl('editUhdHargaJual').value),
    hargaMeter: angka(stcEl('editUhdHargaMeter').value),
    hargaRoll: angka(stcEl('editUhdHargaRoll').value),
    ket: normalisasiSpasi(stcEl('editUhdKet').value).toUpperCase(),
    excludeKode: pilihUhd?.kode || kode});
  if(pesanValidasi === '__BATAL__') return;
  if(pesanValidasi) return alert(pesanValidasi);
  const jenisKabel=kategoriAdalahKabel(kat)?(stcEl('editUhdJenisKabel')?.value||''):'';
  const ukuranKabel=kategoriAdalahKabel(kat)?normalisasiUkuranKabel(stcEl('editUhdUkuranKabel')?.value||''):'';
  if(kategoriAdalahKabel(kat) && !jenisKabel) return alert('Pilih Jenis Kabel terlebih dahulu!');
  if(kategoriAdalahKabel(kat) && !ukuranKabel) return alert('Pilih Ukuran Kabel terlebih dahulu!');
  const updateData = {
    kode,
    nama,
    kat,
    jenisKabel,
    ukuranKabel,
    harga: angka(stcEl('editUhdHargaJual').value),
    hargaMeter: angka(stcEl('editUhdHargaMeter').value),
    hargaRoll: angka(stcEl('editUhdHargaRoll').value),
    ket: normalisasiSpasi(stcEl('editUhdKet').value).toUpperCase()
  };

  if(db){
    try {
      await stcStage6UpdateBusinessDoc(STC_COLLECTIONS.BARANG,idBarangFirestore(kode),updateData,{operation:'barang-update',expected:stcExpectedFromItem(pilihUhd)});
      Object.assign(pilihUhd, updateData);
      simpanCacheLokal();
      tampilLaporan(); tampilTabelMenu7(); cariCepatProses(); tampilDaftarUhd();
      bersihkanFormUbahHargaData();
      alert('Semua data dan harga barang berhasil diperbarui di cloud! Kolom formulir sudah dibersihkan.');
    } catch(e) { alert("Gagal update data: " + e.message); }
  } else {
    Object.assign(pilihUhd, updateData);
    simpanCacheLokal(); refreshSemua(); tampilDaftarUhd();
    bersihkanFormUbahHargaData();
    alert('Semua data dan harga barang berhasil diperbarui secara lokal! Kolom formulir sudah dibersihkan.');
  }
}

async function hapusBarangDariDaftar(encKode){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus Pemilik Toko!');
  const kode = decodeURIComponent(encKode || '');
  const barang = stcGetBarangByKode(kode);
  if(!barang) return alert('Barang tidak ditemukan atau daftar belum diperbarui.');
  const terkait = {
    order: stcCountByCode('orders', kode),
    mutasi: stcCountByCode('mutasi', kode),
    retur: stcCountByCode('returns', kode),
    penjualan: stcCountByCode('penjualan', kode)
  };
  const totalTerkait = terkait.order + terkait.mutasi + terkait.retur + terkait.penjualan;
  const infoRiwayat = totalTerkait
    ? `\n\nBarang ini memiliki ${totalTerkait} catatan terkait (order ${terkait.order}, mutasi ${terkait.mutasi}, retur ${terkait.retur}, penjualan ${terkait.penjualan}). Catatan tersebut tidak ikut dihapus.`
    : '\n\nTidak ditemukan catatan riwayat terkait pada data yang sedang dimuat.';
  if(!confirm(`Hapus permanen barang "${namaBarangLengkap(barang)}" (${kode}) dari data barang?${infoRiwayat}\n\nTindakan ini tidak dapat dibatalkan.`)) return;

  try {
    if(db){
      await stcDeleteDoc(STC_COLLECTIONS.BARANG,idBarangFirestore(kode),{operation:'barang-delete',expected:stcExpectedFromItem(barang)});
    }
    dbBrg = dbBrg.filter(b => String(b.kode||'') !== kode);
    inputHariIni = inputHariIni.filter(b => String(b.kode||'') !== kode);
    if(pilihUhd && String(pilihUhd.kode||'') === kode) pilihUhd = null;
    simpanCacheLokal();
    refreshSemua();
    alert('Barang berhasil dihapus dari daftar barang.');
  } catch(e){
    alert('Gagal menghapus barang: ' + (e.message || e));
  }
}

function refreshPanelAdmin(){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Refresh panel hanya tersedia untuk Pemilik Toko.');
  const tombol = stcEl('btnRefreshAdmin');
  if(tombol){ tombol.disabled = true; tombol.textContent = '⏳ Memuat...'; }
  // Muat ulang halaman agar seluruh panel dan koneksi realtime dimulai kembali.
  window.location.reload();
}

async function hapusBarangDariEdit(){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus Pemilik Toko!');
  if(!pilihUhd) return;
  return hapusBarangDariDaftar(encodeURIComponent(pilihUhd.kode));
}

function bukaUbahHargaDataDariLaporan(encKode){ 
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus Pemilik Toko!'); 
  const kode = decodeURIComponent(encKode);
  pilihUhd=stcGetBarangByKode(kode); 
  if(pilihUhd){ bukaMenuTarget('ubahHargaData'); tampilFormEditHargaData(); } 
}

/* LAPORAN & PINDAH KATEGORI */
function isiFilterKategori(){ const s=stcEl('filterKat'); if(s) stcSetHTML(s, '<option value="">Semua Kategori</option>'+daftarKategoriUrut().map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('')); }
function tampilLaporan(){
  const tb=stcEl('hasilLaporan'); if(!tb) return;
  const kat = stcEl('filterKat')?.value;
  let items = kat ? stcGetBarangByKategori(kat) : dbBrg;
  stcSetHTML(tb, `<table><thead><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>Satuan</th><th>Meter</th><th>Roll</th></tr></thead><tbody>`+
    items.map(b=>`<tr><td>${escapeHTML(b.kode)}</td><td>${escapeHTML(namaBarangLengkap(b))}</td><td>${escapeHTML(b.kat||'-')}</td><td>Rp ${(b.harga||0).toLocaleString()}</td><td>Rp ${(b.hargaMeter||0).toLocaleString()}</td><td>Rp ${(b.hargaRoll||0).toLocaleString()}</td></tr>`).join('')+`</tbody></table>`);
}

async function hapusSemuaBarang(){ 
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus Pemilik Toko!'); 
  if(confirm('HAPUS SEMUA DATA BARANG DI DATABASE? Tindakan ini tidak dapat dibatalkan!')){ 
    if(db){
      const snap = await db.collection(STC_COLLECTIONS.BARANG).get();
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } else {
      dbBrg=[]; simpanCacheLokal(); refreshSemua();
    }
    alert('Semua data barang telah dibersihkan!');
  } 
}

function setupMenuPindahKategori(){ 
  const daftar = daftarKategoriUrut();
  const filter = stcEl('pkFilterKat');
  const tujuan = stcEl('pkKategoriTujuanMassal');

  if(filter) {
    const nilaiLama = filter.value;
    stcSetHTML(filter,  '<option value="">-- SEMUA KATEGORI --</option>' +
      daftar.map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join(''));
    if(daftar.includes(nilaiLama)) filter.value = nilaiLama;
  }
  if(tujuan) {
    const nilaiLama = tujuan.value;
    stcSetHTML(tujuan,  '<option value="">-- KATEGORI TUJUAN BARU --</option>' +
      daftar.map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join(''));
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
  const tb=stcEl('tabelPindahKategoriMulti'); 
  if(!tb) return;
  const kw = (stcEl('pkFilterKeyword')?.value || '').trim().toLocaleLowerCase('id');
  const kat = stcEl('pkFilterKat')?.value || '';
  let list = dbBrg.filter(b => {
    const cocokKategori = !kat || (b.kat || '') === kat;
    const cocokKata = !kw ||
      cocokNamaBarang(b,kw) ||
      (b.kode || '').toLocaleLowerCase('id').includes(kw) ||
      (b.kat || '').toLocaleLowerCase('id').includes(kw);
    return cocokKategori && cocokKata;
  });
  list.sort((a,b) => bandingKodeBarang(a.kode, b.kode));
  stcSetHTML(tb, list.map(b=>`
    <tr>
      <td style="text-align:center;"><input type="checkbox" class="chk-item-pk" value="${escapeHTML(b.kode)}"></td>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(b))}</td>
      <td>${escapeHTML(b.kat||'-')}</td>
      
    </tr>`).join(''));
  if(!list.length) {
    stcSetHTML(tb,  '<tr><td colspan="4" style="text-align:center;padding:18px;color:#94a3b8;">Tidak ada barang pada filter ini.</td></tr>');
  }
}

async function simpanPindahKategoriMassal(){ 
  const tujuanEl = stcEl('pkKategoriTujuanMassal');
  const t = tujuanEl?.value || '';
  const checkboxes = Array.from(document.querySelectorAll('.chk-item-pk:checked'));
  if(!checkboxes.length) return alert('Pilih minimal 1 barang!');
  if(!t) return alert('Pilih kategori tujuan baru terlebih dahulu!');

  const kodeTerpilih = checkboxes.map(c => c.value);
  const barangBerubah = kodeTerpilih.filter(kode => {
    const b = stcGetBarangByKode(kode);
    return b && (b.kat || '') !== t;
  });
  if(!barangBerubah.length) return alert('Semua barang yang dipilih sudah berada di kategori tujuan tersebut.');

  if(!confirm(`Pindahkan ${barangBerubah.length} barang ke kategori "${t}"?`)) return;

  if(db){
    const batch = db.batch();
    barangBerubah.forEach(kode => {
      const ref = db.collection(STC_COLLECTIONS.BARANG).doc(idBarangFirestore(kode));
      batch.update(ref, { kat: t });
    });
    await batch.commit();
  } else {
    barangBerubah.forEach(kode => {
      const b = stcGetBarangByKode(kode);
      if(b) b.kat = t;
    });
    simpanCacheLokal(); refreshSemua();
  }
  alert(`${barangBerubah.length} barang berhasil dipindahkan ke kategori "${t}".`);
  const keyword = stcEl('pkFilterKeyword');
  if(keyword) keyword.value = '';
  setupMenuPindahKategori();
}

/* CARI CEPAT & MENU 7 */
function setupCariCepat(){ 
  const sel = stcEl('ccFilterKat'); 
  if(sel) stcSetHTML(sel,  '<option value="">-- Semua Kategori --</option>' + daftarKategoriUrut().map(k => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('')); 
  cariCepatProses(); 
}

function cariCepatProses(){
  const selKat = stcEl('ccFilterKat')?.value;
  const kw = stcEl('ccKeyword')?.value.trim().toLowerCase();
  const minH = angka(stcEl('ccHargaMin')?.value);
  const maxHVal = stcEl('ccHargaMax')?.value;
  const maxH = maxHVal?.trim() ? angka(maxHVal) : Infinity;

  const tb = stcEl('tabelCariCepat'); if(!tb) return;
  let hasil = dbBrg.filter(b => (!selKat || b.kat === selKat) && (!kw || cocokNamaBarang(b,kw) || (b.kode||'').toLowerCase().includes(kw)) && ((b.harga||0) >= minH && (b.harga||0) <= maxH));
  if(!hasil.length){ stcSetHTML(tb,  `<tr><td colspan="10" class="text-center" style="padding:10px;">Tidak ditemukan data</td></tr>`); return; }
  
  stcSetHTML(tb,  hasil.map(b => `
    <tr>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(b))}</td>
      <td>${escapeHTML(b.kat||'-')}</td>
      
      <td>Rp ${(b.harga||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaMeter||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaRoll||0).toLocaleString()}</td>
      <td>${escapeHTML(b.ket||'')}</td>
      <td class="kolom-aksi-admin"><button class="btn-warning aksi-sm" onclick="bukaUbahHargaDataDariLaporan('${encodeURIComponent(b.kode)}')">Ubah</button></td>
    </tr>`).join(''));
}
function resetCariCepat(){ stcEl('ccKeyword').value = ''; stcEl('ccHargaMin').value = ''; stcEl('ccHargaMax').value = ''; cariCepatProses(); }

function isiFilterMenu7(){ const sel = stcEl('pilihKatMenu7'); if(sel) stcSetHTML(sel,  '<option value="">-- Semua Kategori --</option>' + daftarKategoriUrut().map(k => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join('')); }
function tampilTabelMenu7(){
  const kat = stcEl('pilihKatMenu7')?.value, tb = stcEl('tabelMenu7'); if(!tb) return;
  let data = kat ? stcGetBarangByKategori(kat) : dbBrg;
  if(!data.length){ stcSetHTML(tb,  `<tr><td colspan="9" class="text-center" style="padding:10px;">Tidak ada data</td></tr>`); return; }
  stcSetHTML(tb,  data.map(b => `
    <tr>
      <td>${escapeHTML(b.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(b))}</td>
      
      <td>Rp ${(b.harga||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaMeter||0).toLocaleString()}</td>
      <td>Rp ${(b.hargaRoll||0).toLocaleString()}</td>
      <td>${escapeHTML(b.ket||'')}</td>
      <td class="kolom-aksi-admin"><button class="btn-warning aksi-sm" onclick="bukaUbahHargaDataDariLaporan('${encodeURIComponent(b.kode)}')">Ubah</button></td>
    </tr>`).join(''));
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
  const sel=stcEl('inKategori'); if(sel) stcSetHTML(sel, '<option value="">-- Pilih --</option>'+daftarKategoriUrut().map(k=>`<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join(''));
  toggleJenisKabelInput();
  const selOrd = stcEl('ordKategori');
  if(selOrd) stcSetHTML(selOrd,  '<option value="">-- Semua Kategori --</option>' + daftarKategoriUrut().map(k => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`).join(''));
}
function filterOrdByKategori(){ pilihOrd=null; const n=stcEl('ordNama'); if(n)n.value=''; const i=stcEl('infoOrd'); if(i)stcSetHTML(i, ''); }
function cariOrdNama(){
  const n=stcEl('ordNama').value.trim().toLowerCase(), kat=stcEl('ordKategori')?.value;
  if(n.length<2) return alert('Ketik minimal 2 karakter nama barang.');
  pilihOrd=stcFindBarang(n, b => (!kat || b.kat === kat));
  if(!pilihOrd) return alert('Barang tidak ditemukan! Periksa kategori atau nama barang.');
  kosongkanKolomCari('ordNama'); infoOrd();
}
function infoOrd(){
  const target=stcEl('infoOrd'); if(!target||!pilihOrd)return;
  stcSetHTML(target, `<div class="order-selected" style="border-radius:10px;padding:10px;margin:8px 0;color:#f8fafc;"><b>${escapeHTML(pilihOrd.kode)} · ${escapeHTML(namaBarangLengkap(pilihOrd))}</b><div style="font-size:11px;color:#cbd5e1;margin-top:4px;">Kategori: ${escapeHTML(pilihOrd.kat||'-')} · Satuan: Rp ${(pilihOrd.harga||0).toLocaleString()} · Meter: Rp ${(pilihOrd.hargaMeter||0).toLocaleString()}</div></div>`);
}

function cariOrdKabKode(){ const k=stcEl('ordKabKode').value.trim().toUpperCase(); pilihOrdKab=stcGetBarangByKode(k); if(pilihOrdKab) { kosongkanKolomCari('ordKabKode','ordKabNama'); infoOrdKab(); } else alert('Tidak ditemukan!'); }
function cariOrdKabNama(){ const n=stcEl('ordKabNama').value.trim().toLowerCase(); pilihOrdKab=stcFindBarang(n); if(pilihOrdKab) { kosongkanKolomCari('ordKabKode','ordKabNama'); infoOrdKab(); } else alert('Tidak ditemukan!'); }
function infoOrdKab(){ if(pilihOrdKab) { stcSetHTML(stcEl('infoOrdKab'), `<div class="info-box"><b>${escapeHTML(pilihOrdKab.kode)}</b> - ${escapeHTML(namaBarangLengkap(pilihOrdKab))}<br>Rp ${(pilihOrdKab.hargaMeter||0).toLocaleString()}/meter</div>`); hitungEstimasiKabel(); } }
function toggleModeOrderKabel(){ const m = stcEl('ordKabMode').value; stcEl('groupModeMeter').style.display = m==='meter'?'block':'none'; stcEl('groupModeRoll').style.display = m==='meter'?'none':'block'; hitungEstimasiKabel(); }
function hitungEstimasiKabel(){
  const m = stcEl('ordKabMode').value; let r = "";
  if(m === 'meter'){
    const t = angka(stcEl('ordKabMeter').value);
    if(t <= 0) r = "Masukkan meter valid";
    else { const roll = Math.floor(t / 100), sisa = t % 100; r = `${roll > 0 ? roll + ' Roll ' : ''}${sisa > 0 ? '+ ' + sisa + 'm' : ''} (Total: ${t}m)`; }
  } else {
    const j = angka(stcEl('ordKabJmlRoll').value), isi = angka(stcEl('ordKabIsiRoll').value)||100, s = angka(stcEl('ordKabSisaMeter').value);
    r = `${j} Roll (@${isi}m) ${s > 0 ? '+ ' + s + 'm' : ''} (Total: ${(j*isi)+s}m)`;
  }
  stcEl('ordKabHasilRangkuman').value = r.toUpperCase();
}

async function tambahOrder(){
  if(stcActionLocked('tambahOrder')) return;
  if(!pilihOrd) return alert('Pilih barang dahulu!');
  const toko=(stcEl('ordToko').value||'').trim().toUpperCase();
  const ket=(stcEl('ordKet').value||'').trim().toUpperCase();
  const stok=(stcEl('ordStok').value||'0').trim().toUpperCase();
  if(!toko) return alert('Pilih toko pemesan.');
  if(!ket) return alert('Isi jumlah / keterangan barang terlebih dahulu.');
  const duplicate=dbOrder.some(o=>!isItemKabel(o)&&String(o.toko||'').toUpperCase()===toko&&String(o.kode||'').toUpperCase()===String(pilihOrd.kode||'').toUpperCase());
  if(duplicate&&!confirm('Order aktif dengan barang dan toko yang sama sudah ada. Tetap tambahkan sebagai order baru?')) return;
  const idDoc='ORD-'+Date.now();
  const payload={id:idDoc,toko,kode:pilihOrd.kode.toUpperCase(),nama:snapshotNamaBarang(pilihOrd).toUpperCase(),kat:pilihOrd.kat||'',jenisKabel:pilihOrd.jenisKabel||'',ukuranKabel:pilihOrd.ukuranKabel||'',ket,stok,tipe:'barang',tgl:tgl(),tglWaktu:Date.now()};
  try{
    if(db) await stcStage6CreateBusinessDoc(STC_COLLECTIONS.ORDERS,idDoc,payload,'order-create',[payload.toko,payload.kode,payload.ket]);
    else {dbOrder.unshift(payload);simpanCacheLokal();tabelOrder();}
    resetFormOrderBarang();
    alert('Barang berhasil dimasukkan ke daftar order.');
  }catch(e){console.error(e);alert('Gagal menyimpan order. Periksa koneksi lalu coba lagi.');}
}
function resetFormOrderBarang(){
  ['ordKet','ordNama'].forEach(id=>{const e=stcEl(id);if(e)e.value='';});
  const s=stcEl('ordStok');if(s)s.value='0';
  const i=stcEl('infoOrd');if(i)stcSetHTML(i, ''); pilihOrd=null;
}

async function tambahOrderKabelOtomatis(){
  if(!pilihOrdKab) return alert('Pilih kabel dahulu!');
  const toko=(stcEl('ordKabToko').value||'').trim().toUpperCase()||'STC SUMOBITO';
  const rangkuman=(stcEl('ordKabHasilRangkuman').value||'').trim().toUpperCase();
  const catatan=(stcEl('ordKabCatatan').value||'').trim().toUpperCase();
  const stok=(stcEl('ordKabStok').value||'READY').trim().toUpperCase()||'READY';
  if(!rangkuman||rangkuman.includes('MASUKKAN METER VALID')) return alert('Masukkan kebutuhan kabel yang valid terlebih dahulu.');
  const duplicate=dbOrder.some(o=>isItemKabel(o)&&String(o.toko||'').toUpperCase()===toko&&String(o.kode||'').toUpperCase()===String(pilihOrdKab.kode||'').toUpperCase()&&String(o.ket||'').toUpperCase()===rangkuman);
  if(duplicate&&!confirm('Order kabel dengan toko, kode, dan kebutuhan yang sama sudah ada. Tetap tambahkan?')) return;
  const idDoc='ORD-KAB-'+Date.now();
  const payload={id:idDoc,toko,kode:pilihOrdKab.kode.toUpperCase(),nama:snapshotNamaBarang(pilihOrdKab).toUpperCase(),kat:pilihOrdKab.kat||'',jenisKabel:pilihOrdKab.jenisKabel||'',ukuranKabel:pilihOrdKab.ukuranKabel||'',ket:catatan?`${rangkuman} | CATATAN: ${catatan}`:rangkuman,stok,tipe:'kabel',tgl:tgl(),tglWaktu:Date.now()};
  try{
    if(db) await stcStage6CreateBusinessDoc(STC_COLLECTIONS.ORDERS,idDoc,payload,'order-create',[payload.toko,payload.kode,payload.ket]);
    else {dbOrder.unshift(payload);simpanCacheLokal();tabelOrder();}
    ['ordKabNama','ordKabMeter','ordKabCatatan'].forEach(id=>{const e=stcEl(id);if(e)e.value='';});
    stcEl('ordKabStok').value='0'; stcSetHTML(stcEl('infoOrdKab'), ''); stcEl('ordKabHasilRangkuman').value=''; pilihOrdKab=null;
    alert('Kabel berhasil dimasukkan ke daftar order.');
  }catch(e){console.error(e);alert('Gagal menyimpan order kabel.');}
}

async function hapusOrderItemById(id){
  if(confirm('Hapus item pesanan ini?')){
    if(db) await stcDeleteDoc(STC_COLLECTIONS.ORDERS,id,{operation:'order-delete',expected:stcExpectedFromItem(stcGetById('orders',id))});
    else { dbOrder = dbOrder.filter(o => o.id !== id); simpanCacheLokal(); tabelOrder(); }
  }
}

async function kosongkanTabelOrder(kategori){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Hanya pemilik yang dapat mengosongkan order!');
  const isKabel = kategori === 'kabel';
  if(confirm(`Kosongkan seluruh daftar order ${isKabel ? 'kabel' : 'barang umum'}?`)){
    if(db){
      const snap = await db.collection(STC_COLLECTIONS.ORDERS).get();
      const batch = db.batch();
      snap.forEach(d => {
        const item = d.data();
        if(isKabel && isItemKabel(item)) batch.delete(d.ref);
        else if(!isKabel && !isItemKabel(item)) batch.delete(d.ref);
      });
      await batch.commit();
    } else {
      if(isKabel) dbOrder = dbOrder.filter(o => !isItemKabel(o));
      else dbOrder = dbOrder.filter(o => isItemKabel(o));
      simpanCacheLokal(); tabelOrder();
    }
  }
}

function tabelOrder(){
  const tbBarang=stcEl('tabelOrderBarang'),tbKabel=stcEl('tabelOrderKabel');
  stcEnsureDataIndexes();

  const qB=stcNormalizeSearch(stcEl('filterOrderBarang')?.value||'');
  const tB=stcEl('filterOrderBarangToko')?.value||'SEMUA';
  const qK=stcNormalizeSearch(stcEl('filterOrderKabel')?.value||'');
  const tK=stcEl('filterOrderKabelToko')?.value||'SEMUA';

  const listBarang=[], listKabel=[];
  let allBarang=0, allKabel=0;

  const match=(entry,q,t)=>{
    const o=entry.item;
    return (!q || entry.hay.includes(q)) &&
      (t==='SEMUA' || String(o.toko||'').toUpperCase()===t);
  };

  for(const entry of STC_DATA_INDEX.orderSearch){
    if(entry.type==='kabel'){
      allKabel++;
      if(match(entry,qK,tK)) listKabel.push(entry.item);
    } else {
      allBarang++;
      if(match(entry,qB,tB)) listBarang.push(entry.item);
    }
  }

  const setText=(id,v)=>{const e=stcEl(id);if(e)e.textContent=v;};
  setText('orderCountBarang',allBarang);
  setText('orderCountKabel',allKabel);
  setText('orderCountTotal',allBarang+allKabel);

  if(tbBarang)stcSetHTML(tbBarang,listBarang.length
    ? listBarang.map(o=>`<tr><td><b>${escapeHTML(o.toko||'-')}</b></td><td>${escapeHTML(o.kode||'')}</td><td>${escapeHTML(namaBarangLengkap(o))}</td><td>${escapeHTML(o.ket||'-')}</td><td>${escapeHTML(o.stok||'0')}</td><td><button class="btn-danger aksi-sm" onclick="hapusOrderItemById('${escapeHTML(o.id)}')">Hapus</button></td></tr>`).join('')
    : `<tr><td colspan="6" class="text-center" style="color:#94a3b8;padding:10px;">${qB||tB!=='SEMUA'?'Tidak ada order yang sesuai filter.':'Belum ada order barang umum.'}</td></tr>`);

  if(tbKabel)stcSetHTML(tbKabel,listKabel.length
    ? listKabel.map(o=>`<tr><td><b>${escapeHTML(o.toko||'-')}</b></td><td>${escapeHTML(o.kode||'')}</td><td><span style="color:#34d399;font-weight:700;">${escapeHTML(namaBarangLengkap(o))}</span></td><td>${escapeHTML(o.ket||'-')}</td><td>${escapeHTML(o.stok||'0')}</td><td><button class="btn-danger aksi-sm" onclick="hapusOrderItemById('${escapeHTML(o.id)}')">Hapus</button></td></tr>`).join('')
    : `<tr><td colspan="6" class="text-center" style="color:#94a3b8;padding:10px;">${qK||tK!=='SEMUA'?'Tidak ada order yang sesuai filter.':'Belum ada order khusus kabel.'}</td></tr>`);
}

/* MUTASI & RETURN */
function nomorMutasiSekarang(){
  const el = stcEl('mutNo');
  if(el && el.value.trim()) return el.value.trim().toUpperCase();
  return '';
}
function buatNomorMutasiBaru(){
  const now = new Date();
  const ymd = now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0');
  const prefix = 'MUT-' + ymd + '-';
  let max = 0;
  dbMutasi.forEach(m => {
    const n = String(m.noMutasi || '');
    if(n.indexOf(prefix) === 0){
      const x = parseInt(n.slice(prefix.length),10);
      if(Number.isFinite(x)) max = Math.max(max,x);
    }
  });
  const el = stcEl('mutNo');
  if(el) el.value = prefix + String(max+1).padStart(3,'0');
  updateStatusMutasi('Nomor mutasi baru siap digunakan.');
}
function pastikanNomorMutasi(){
  let n = nomorMutasiSekarang();
  if(!n){ buatNomorMutasiBaru(); n = nomorMutasiSekarang(); }
  return n;
}
function validasiQtyMutasi(el){
  if(!el) return;
  let v = String(el.value || '').replace(',', '.').replace(/[^\d.]/g,'');
  const p = v.split('.');
  if(p.length > 2) v = p[0] + '.' + p.slice(1).join('');
  el.value = v;
}
function updateStatusMutasi(msg, ok=false){
  const el=stcEl('mutStatus');
  if(el){ el.textContent=msg || ''; el.style.color=ok ? '#34d399' : '#94a3b8'; }
}
function setNilaiMutasi(){
  const a=stcEl('mutAsal'), b=stcEl('mutTujuan');
  if(a && b && a.value === b.value) b.value = a.value === 'SUMOBITO' ? 'PETERONGAN' : 'SUMOBITO';
}
function tukarPosisiMutasi(){
  const a=stcEl('mutAsal'), b=stcEl('mutTujuan');
  if(!a || !b) return;
  const tmp=a.value; a.value=b.value; b.value=tmp;
  updateStatusMutasi(`Rute: ${a.value} → ${b.value}`);
}
function cariMutKode(){
  const k=stcEl('mutKode').value.trim().toUpperCase();
  pilihMut=stcGetBarangByKode(k);
  if(pilihMut){ kosongkanKolomCari('mutKode','mutNama'); infoMut(); updateStatusMutasi('Barang ditemukan. Silakan isi jumlah.'); }
  else alert('Kode barang tidak ditemukan!');
}
function cariMutNama(){
  const n=stcEl('mutNama').value.trim().toLowerCase();
  if(!n) return alert('Masukkan nama barang terlebih dahulu!');
  pilihMut=stcFindBarang(n);
  if(pilihMut){ kosongkanKolomCari('mutKode','mutNama'); infoMut(); updateStatusMutasi('Barang ditemukan. Silakan isi jumlah.'); }
  else alert('Nama barang tidak ditemukan!');
}
function infoMut(){
  if(pilihMut) stcSetHTML(stcEl('infoMut'),
    `<div class="info-box"><b>${escapeHTML(pilihMut.kode)}</b> - ${escapeHTML(namaBarangLengkap(pilihMut))}</div>`);
}
function resetFormMutasiItem(){
  ['mutKode','mutNama','mutQty','mutKet'].forEach(id=>{const e=stcEl(id); if(e)e.value='';});
  const s=stcEl('mutSatuan'); if(s)s.value='PCS';
  const i=stcEl('infoMut'); if(i)stcSetHTML(i, '');
  pilihMut=null;
  updateStatusMutasi('Form item dibersihkan.');
}
function dataMutasiSaatIni(){
  const no=nomorMutasiSekarang();
  if(!no) return [];
  return [...stcGetItemsByNomor('mutasi', no)].sort((a,b)=>(a.tglWaktu||0)-(b.tglWaktu||0));
}
function updateRingkasanMutasi(){
  const list=dataMutasiSaatIni();
  const tujuan=stcEl('mutTujuan')?.value || '-';
  const asal=stcEl('mutAsal')?.value || '-';
  const box=stcEl('mutSummary');
  const count=stcEl('mutCount');
  if(count) count.textContent=`(${list.length} item)`;
  if(box) stcSetHTML(box, `<b>Ringkasan:</b> ${list.length} item • ${escapeHTML(asal)} → ${escapeHTML(tujuan)} • No. ${escapeHTML(nomorMutasiSekarang()||'-')}`);
}
async function tambahMutasiItem(){
  if(stcActionLocked('tambahMutasiItem')) return;
  if(!pilihMut) return alert('Pilih barang dahulu!');
  const qtyRaw=stcEl('mutQty').value.trim();
  const qty=parseFloat(qtyRaw);
  if(!qtyRaw || !Number.isFinite(qty) || qty<=0) return alert('Jumlah harus lebih besar dari 0!');
  const asal=stcEl('mutAsal').value;
  const tujuan=stcEl('mutTujuan').value;
  if(!asal || !tujuan || asal===tujuan) return alert('Toko asal dan tujuan harus berbeda!');
  const no=pastikanNomorMutasi();
  const satuan=stcEl('mutSatuan').value;
  const ket=stcEl('mutKet').value.trim() || '-';

  const duplikat=dataMutasiSaatIni().find(m=>String(m.kode||'')===String(pilihMut.kode||''));
  if(duplikat && !confirm(`Barang ${pilihMut.kode} sudah ada pada No. Mutasi ${no} (${duplikat.qty}). Tambahkan baris kedua?`)) return;

  const idDoc='MUT-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const payload={
    id:idDoc, noMutasi:no, tokoAsal:asal, tokoTujuan:tujuan,
    kode:pilihMut.kode, nama:snapshotNamaBarang(pilihMut), kat:pilihMut.kat||'',
    jenisKabel:pilihMut.jenisKabel||'', ukuranKabel:pilihMut.ukuranKabel||'',
    qty:String(qtyRaw), satuan:satuan, ket:ket, tgl:tgl(), tglWaktu:Date.now()
  };
  try{
    if(db) await stcStage6CreateBusinessDoc(STC_COLLECTIONS.MUTASI,idDoc,payload,'mutasi-create',[payload.noMutasi,payload.kode,payload.tokoAsal,payload.tokoTujuan]);
    else { dbMutasi.unshift(payload); simpanCacheLokal(); tabelMutasi(); }
    if(db) updateStatusMutasi(`Item ${pilihMut.kode} berhasil ditambahkan ke ${no}.`, true);
    resetFormMutasiItem();
    if(db) tabelMutasi();
  }catch(e){
    alert('Gagal menyimpan mutasi: ' + (e.message || e));
  }
}
function tabelMutasi(){
  const tb=stcEl('tabelMutasi'); if(!tb) return;
  const list=dataMutasiSaatIni();
  stcSetHTML(tb, list.map((m,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${escapeHTML(m.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(m))}</td>
      <td><b>${escapeHTML(m.qty)}</b> ${escapeHTML(m.satuan||'')}</td>
      <td>${escapeHTML(m.ket||'-')}</td>
      <td class="kolom-aksi-admin"><button class="btn-danger aksi-sm" onclick="hapusMutasiItem('${escapeHTML(m.id)}')">Hapus</button></td>
    </tr>`).join('') ||
    `<tr><td colspan="6" class="text-center" style="color:#94a3b8;padding:12px;">Belum ada item pada nomor mutasi ini.</td></tr>`);
  updateRingkasanMutasi();
}
async function hapusMutasiItem(id){
  if(!id) return;
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Penghapusan mutasi hanya untuk OWNER.');
  const item=dbMutasi.find(m=>String(m.id)===String(id));
  if(!item) return;
  if(!confirm(`Hapus ${item.kode} dari No. Mutasi ${item.noMutasi||'-'}?`)) return;
  try{
    if(db) await stcDeleteDoc(STC_COLLECTIONS.MUTASI,id,{operation:'mutasi-delete',expected:stcExpectedFromItem(item)});
    else dbMutasi=dbMutasi.filter(m=>String(m.id)!==String(id));
    simpanCacheLokal(); tabelMutasi();
  }catch(e){ alert('Gagal menghapus mutasi: '+(e.message||e)); }
}
function tampilkanRiwayatMutasi(){
  const box=stcEl('riwayatMutasiBox'); if(!box) return;
  box.style.display='block'; tabelRiwayatMutasi();
}
function tabelRiwayatMutasi(){
  const tb=stcEl('tabelRiwayatMutasi'); if(!tb) return;
  const q=(stcEl('mutRiwayatCari')?.value||'').trim().toLowerCase();
  const list=[...dbMutasi].sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0)).filter(m=>{
    const s=[m.noMutasi,m.tokoAsal,m.tokoTujuan,m.kode,namaBarangLengkap(m),m.qty,m.satuan,m.ket].join(' ').toLowerCase();
    return !q || s.includes(q);
  }).slice(0,200);
  stcSetHTML(tb, list.map(m=>`<tr>
    <td>${escapeHTML(m.tgl||'-')}</td>
    <td><b>${escapeHTML(m.noMutasi||'LEGACY')}</b></td>
    <td>${escapeHTML(m.tokoAsal||'SUMOBITO')} → ${escapeHTML(m.tokoTujuan||'PETERONGAN')}</td>
    <td>${escapeHTML(m.kode||'-')}</td>
    <td>${escapeHTML(namaBarangLengkap(m))}</td>
    <td>${escapeHTML(m.qty||'')} ${escapeHTML(m.satuan||'')}</td>
  </tr>`).join('') || `<tr><td colspan="6" style="color:#94a3b8;text-align:center;padding:12px;">Tidak ada riwayat yang cocok.</td></tr>`);
}
async function kosongkanMutasi(){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Hanya pemilik yang dapat mengosongkan mutasi!');
  const no=nomorMutasiSekarang();
  const list=dataMutasiSaatIni();
  if(!list.length) return alert('Tidak ada item pada nomor mutasi saat ini.');
  if(!confirm(`Hapus ${list.length} item pada No. Mutasi ${no}?`)) return;
  try{
    if(db){
      const batch=db.batch();
      list.forEach(m=>batch.delete(db.collection(STC_COLLECTIONS.MUTASI).doc(m.id)));
      await batch.commit();
    }
    dbMutasi=dbMutasi.filter(m=>String(m.noMutasi||'')!==no);
    simpanCacheLokal(); tabelMutasi();
    updateStatusMutasi(`Mutasi ${no} dikosongkan.`);
  }catch(e){ alert('Gagal mengosongkan mutasi: '+(e.message||e)); }
}
function nomorReturnSekarang(){ const el=stcEl('retNo'); return el&&el.value.trim()?el.value.trim().toUpperCase():''; }
function buatNomorReturnBaru(){
  const now=new Date(), ymd=now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+String(now.getDate()).padStart(2,'0'), prefix='RET-'+ymd+'-'; let max=0;
  dbReturn.forEach(r=>{const n=String(r.noReturn||''); if(n.startsWith(prefix)){const x=parseInt(n.slice(prefix.length),10); if(Number.isFinite(x))max=Math.max(max,x);}});
  const el=stcEl('retNo'); if(el)el.value=prefix+String(max+1).padStart(3,'0'); updateStatusReturn('Nomor return baru siap digunakan.');
}
function pastikanNomorReturn(){let n=nomorReturnSekarang();if(!n){buatNomorReturnBaru();n=nomorReturnSekarang();}return n;}
function validasiQtyReturn(el){if(!el)return;let v=String(el.value||'').replace(',','.').replace(/[^\d.]/g,'');const p=v.split('.');if(p.length>2)v=p[0]+'.'+p.slice(1).join('');el.value=v;}
function updateStatusReturn(msg,ok=false){const el=stcEl('retStatus');if(el){el.textContent=msg||'';el.style.color=ok?'#34d399':'#94a3b8';}}
function dataReturnSaatIni(){const no=nomorReturnSekarang();if(!no)return[];return [...stcGetItemsByNomor('returns', no)].sort((a,b)=>(a.tglWaktu||0)-(b.tglWaktu||0));}
function updateRingkasanReturn(){const list=dataReturnSaatIni(),box=stcEl('retSummary'),count=stcEl('retCount');if(count)count.textContent=`(${list.length} item)`;const a=stcEl('retAsal')?.value||'-',t=stcEl('retTujuan')?.value||'-';if(box)stcSetHTML(box, `<b>Ringkasan:</b> ${list.length} item • ${escapeHTML(a)} → ${escapeHTML(t)} • No. ${escapeHTML(nomorReturnSekarang()||'-')}`);}
function tukarPosisiReturn(){const a=stcEl('retAsal'),b=stcEl('retTujuan');if(!a||!b)return;const t=a.value;a.value=b.value;b.value=t;updateStatusReturn(`Rute: ${a.value} → ${b.value}`);}
function cariRetKode(){const k=stcEl('retKode').value.trim().toUpperCase();pilihRet=stcGetBarangByKode(k);if(pilihRet){kosongkanKolomCari('retKode','retNama');infoRet();updateStatusReturn('Barang ditemukan. Silakan isi jumlah.');}else alert('Kode barang tidak ditemukan!');}
function cariRetNama(){const n=stcEl('retNama').value.trim().toLowerCase();if(!n)return alert('Masukkan nama barang terlebih dahulu!');pilihRet=stcFindBarang(n);if(pilihRet){kosongkanKolomCari('retKode','retNama');infoRet();updateStatusReturn('Barang ditemukan. Silakan isi jumlah.');}else alert('Nama barang tidak ditemukan!');}
function infoRet(){if(pilihRet)stcSetHTML(stcEl('infoRet'), `<div class="info-box"><b>${escapeHTML(pilihRet.kode)}</b> - ${escapeHTML(namaBarangLengkap(pilihRet))}</div>`);}
function resetFormReturnItem(){['retKode','retNama','retQty','retKet'].forEach(id=>{const e=stcEl(id);if(e)e.value='';});const s=stcEl('retSatuan');if(s)s.value='PCS';const a=stcEl('retAlasan');if(a)a.value='RUSAK';const i=stcEl('infoRet');if(i)stcSetHTML(i, '');pilihRet=null;updateStatusReturn('Form item dibersihkan.');}
async function tambahReturn(){
  if(stcActionLocked('tambahReturn')) return;
  if(!pilihRet)return alert('Pilih barang dahulu!');
  const qtyRaw=stcEl('retQty').value.trim(),qty=parseFloat(qtyRaw); if(!qtyRaw||!Number.isFinite(qty)||qty<=0)return alert('Jumlah harus lebih besar dari 0!');
  const asal=stcEl('retAsal').value,tujuan=stcEl('retTujuan').value;if(!asal||!tujuan||asal===tujuan)return alert('Toko asal dan tujuan harus berbeda!');
  const no=pastikanNomorReturn(),satuan=stcEl('retSatuan').value,alasan=stcEl('retAlasan').value,ket=stcEl('retKet').value.trim()||'-';
  const duplikat=dataReturnSaatIni().find(r=>String(r.kode||'')===String(pilihRet.kode||''));if(duplikat&&!confirm(`Barang ${pilihRet.kode} sudah ada pada No. Return ${no} (${duplikat.qty} ${duplikat.satuan||''}). Tambahkan baris kedua?`))return;
  const idDoc='RET-'+Date.now()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();const payload={id:idDoc,noReturn:no,tokoAsal:asal,tokoTujuan:tujuan,kode:pilihRet.kode,nama:snapshotNamaBarang(pilihRet),kat:pilihRet.kat||'',jenisKabel:pilihRet.jenisKabel||'',ukuranKabel:pilihRet.ukuranKabel||'',qty:String(qtyRaw),satuan,alasan,ket,tgl:tgl(),tglWaktu:Date.now()};
  try{if(db)await stcStage6CreateBusinessDoc(STC_COLLECTIONS.RETURNS,idDoc,payload,'return-create',[payload.noReturn,payload.kode,payload.tokoAsal,payload.tokoTujuan]);else{dbReturn.unshift(payload);simpanCacheLokal();tabelReturn();}if(db)tabelReturn();updateStatusReturn(`Item ${pilihRet.kode} berhasil ditambahkan ke ${no}.`,true);resetFormReturnItem();}catch(e){alert('Gagal menyimpan return: '+(e.message||e));}
}
function tabelReturn(){const tb=stcEl('tabelReturn');if(!tb)return;const list=dataReturnSaatIni();stcSetHTML(tb, list.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(r.kode)}</td><td>${escapeHTML(namaBarangLengkap(r))}</td><td><b>${escapeHTML(r.qty)}</b> ${escapeHTML(r.satuan||'')}</td><td>${escapeHTML(r.alasan||'-')}</td><td>${escapeHTML(r.ket||'-')}</td><td class="kolom-aksi-admin"><button class="btn-danger aksi-sm" onclick="hapusReturnItem('${escapeHTML(r.id)}')">Hapus</button></td></tr>`).join('')||`<tr><td colspan="7" class="text-center" style="color:#94a3b8;padding:12px;">Belum ada item pada nomor return ini.</td></tr>`);updateRingkasanReturn();}
async function hapusReturnItem(id){
  if(!stcIsOwnerSession()) return alert('Penghapusan return hanya untuk OWNER.');
  if(!stcGuardDestructiveAction(`return:${id}`,'Hapus item return ini?')) return;if(statusRoleAktif!=='OWNER')return alert('Penghapusan return hanya untuk OWNER.');const item=stcGetById('returns', id);if(!item)return;if(!confirm(`Hapus ${item.kode} dari No. Return ${item.noReturn||'-'}?`))return;try{if(db)await stcDeleteDoc(STC_COLLECTIONS.RETURNS,id,{operation:'return-delete',expected:stcExpectedFromItem(item)});else dbReturn=dbReturn.filter(r=>String(r.id)!==String(id));simpanCacheLokal();tabelReturn();}catch(e){alert('Gagal menghapus return: '+(e.message||e));}}
function tampilkanRiwayatReturn(){const box=stcEl('riwayatReturnBox');if(!box)return;box.style.display='block';tabelRiwayatReturn();}
function tabelRiwayatReturn(){const tb=stcEl('tabelRiwayatReturn');if(!tb)return;const q=(stcEl('retRiwayatCari')?.value||'').trim().toLowerCase();const list=[...dbReturn].filter(r=>{const hay=`${r.noReturn||''} ${r.kode||''} ${namaBarangLengkap(r)||''} ${r.tokoAsal||''} ${r.tokoTujuan||''} ${r.alasan||''} ${r.ket||''}`.toLowerCase();return !q||hay.includes(q);}).sort((a,b)=>(b.tglWaktu||0)-(a.tglWaktu||0));stcSetHTML(tb, list.map(r=>`<tr><td>${escapeHTML(r.tgl||'-')}</td><td><b>${escapeHTML(r.noReturn||'LEGACY')}</b></td><td>${escapeHTML(r.tokoAsal||'-')} → ${escapeHTML(r.tokoTujuan||'-')}</td><td>${escapeHTML(r.kode||'-')}</td><td>${escapeHTML(namaBarangLengkap(r))}</td><td>${escapeHTML(r.qty||'')} ${escapeHTML(r.satuan||'')}</td><td>${escapeHTML(r.alasan||'-')}</td></tr>`).join('')||`<tr><td colspan="7" style="color:#94a3b8;text-align:center;padding:12px;">Tidak ada riwayat yang cocok.</td></tr>`);}
async function kosongkanReturn(){if(statusRoleAktif!=='OWNER')return alert('Hanya pemilik yang dapat mengosongkan return!');const no=nomorReturnSekarang(),list=dataReturnSaatIni();if(!list.length)return alert('Tidak ada item pada nomor return saat ini.');if(!confirm(`Hapus ${list.length} item pada No. Return ${no}?`))return;try{if(db){const batch=db.batch();list.forEach(r=>batch.delete(db.collection(STC_COLLECTIONS.RETURNS).doc(r.id)));await batch.commit();}dbReturn=dbReturn.filter(r=>String(r.noReturn||'')!==no);simpanCacheLokal();tabelReturn();updateStatusReturn(`Return ${no} dikosongkan.`);}catch(e){alert('Gagal mengosongkan return: '+(e.message||e));}}

/* PENJUALAN */
function hitungSubtotalJual(){ const h=(pilihJual?.harga||0)*angka(stcEl('jualQty').value||1); stcEl('jualSubtotal').value=h.toLocaleString(); }
function cariJualKode(){ pilihJual=stcGetBarangByKode(stcEl('jualKode').value.trim().toUpperCase()); if(pilihJual) kosongkanKolomCari('jualKode','jualNama'); hitungSubtotalJual(); }
function cariJualNama(){ pilihJual=stcFindBarang(stcEl('jualNama').value.trim()); if(pilihJual) kosongkanKolomCari('jualKode','jualNama'); hitungSubtotalJual(); }

async function tambahPenjualanHariIni(){
  if(stcActionLocked('tambahPenjualanHariIni')) return;
  if(!pilihJual) return alert('Pilih barang dahulu!');
  const idDoc = 'JUAL-' + Date.now();
  const qtyJual = angka(stcEl('jualQty').value);
  const subtotalJual = angka(stcEl('jualSubtotal').value);
  if(qtyJual <= 0 || subtotalJual <= 0) return alert('Jumlah dan subtotal penjualan harus lebih dari nol.');
  const payload = { id: idDoc, kode: pilihJual.kode, nama: snapshotNamaBarang(pilihJual), kat: pilihJual.kat || '', jenisKabel: pilihJual.jenisKabel || '', ukuranKabel: pilihJual.ukuranKabel || '', qty: qtyJual, subtotal: subtotalJual, tgl: tgl(), tglWaktu: Date.now() };

  try {
    if(db) await stcStage6CreateBusinessDoc(STC_COLLECTIONS.PENJUALAN,idDoc,payload,'sales-create',[payload.kode,payload.tglWaktu]);
    else { dbPenjualanHariIni.unshift(payload); simpanCacheLokal(); tabelPenjualanHariIni(); hitungTotalPenjualan(); }
  } catch(e) {
    stcRecordRuntimeFailure('PENJUALAN_WRITE', e);
    alert('Gagal menyimpan penjualan: ' + (e.message || e));
    return;
  }

  stcEl('jualKode').value=''; stcEl('jualNama').value=''; stcEl('jualQty').value='1'; stcEl('jualSubtotal').value='0'; pilihJual=null;
}
function tabelPenjualanHariIni(){ 
  const tb=stcEl('tabelPenjualanHariIni'); 
  if(tb) stcSetHTML(tb, dbPenjualanHariIni.map((j)=>`
    <tr>
      <td>${escapeHTML(j.kode)}</td>
      <td>${escapeHTML(namaBarangLengkap(j))}</td>
      
      <td>${escapeHTML(j.qty)}</td>
      <td>Rp ${(j.subtotal||0).toLocaleString()}</td>
      <td><button class="btn-danger aksi-sm" onclick="hapusPenjualanItem(decodeURIComponent('${encodeURIComponent(j.id)}'))">Hapus</button></td>
    </tr>`).join('')); 
}
async function hapusPenjualanItem(id){
  if(db) await stcDeleteDoc(STC_COLLECTIONS.PENJUALAN,id,{operation:'sales-delete',expected:stcExpectedFromItem(stcGetById('penjualan',id))});
  else { dbPenjualanHariIni = dbPenjualanHariIni.filter(j => j.id !== id); simpanCacheLokal(); tabelPenjualanHariIni(); hitungTotalPenjualan(); }
}
function hitungTotalPenjualan(){ const t=dbPenjualanHariIni.reduce((s,x)=>s+(x.subtotal||0),0); const el=stcEl('displayTotalPenjualan'); if(el) el.innerText=`Rp ${t.toLocaleString()}`; }
async function kosongkanPenjualanHariIni(){ 
  if(confirm('Bersihkan seluruh daftar transaksi kasir hari ini?')){ 
    if(db){
      const snap = await db.collection(STC_COLLECTIONS.PENJUALAN).get();
      const batch = db.batch(); snap.forEach(d => batch.delete(d.ref)); await batch.commit();
    } else { dbPenjualanHariIni=[]; simpanCacheLokal(); tabelPenjualanHariIni(); hitungTotalPenjualan(); }
  } 
}

/* ANGSURAN */
function hitungSisaAngsuranAwal(){
  const s = angka(stcEl('angTotalHarga').value) - angka(stcEl('angUangMuka').value);
  const el = stcEl('angSisaAwal');
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
  if(stcActionLocked('simpanAngsuranBaru')) return;
  const pembeli = stcEl('angPembeli').value.trim();
  const noHp = stcEl('angNoHp').value.trim();
  const barang = stcEl('angBarangNama').value.trim();
  const total = angka(stcEl('angTotalHarga').value);
  const dp = angka(stcEl('angUangMuka').value);
  const tenor = Math.max(0, parseInt(stcEl('angTenor').value || '0',10));
  const jatuhTempo = stcEl('angJatuhTempo').value || '';
  const catatan = stcEl('angCatatan').value.trim();
  if(!pembeli || !barang || total <= 0) return alert('Lengkapi nama pembeli, barang/layanan, dan total deal.');
  if(dp < 0 || dp > total) return alert('Uang muka tidak boleh melebihi total harga.');
  if(tenor < 0 || tenor > 120) return alert('Tenor harus antara 1–120 bulan atau dikosongkan.');

  const idDoc = 'ANG-' + Date.now();
  const payload = {
    id:idDoc, pembeli:pembeli.toUpperCase(), noHp, barangNama:barang.toUpperCase(),
    totalHarga:total, dp, totalBayar:dp, tenor, jatuhTempo, catatan,
    tglDibuat:tgl(), tglWaktu:Date.now(), riwayatBayar: dp>0 ? [{id:'DP-'+Date.now(), tanggal:tgl(), waktu:Date.now(), nominal:dp, metode:'DP', catatan:'Uang muka'}] : []
  };
  try {
    if(db) await stcStage6CreateBusinessDoc(STC_COLLECTIONS.ANGSURAN,idDoc,payload,'angsuran-create',[payload.pembeli,payload.barangNama,payload.tglWaktu]);
    else { dbAngsuran.unshift(payload); simpanCacheLokal(); tabelAngsuran(); }
  } catch(e) {
    stcRecordRuntimeFailure('ANGSURAN_WRITE', e);
    alert('Gagal menyimpan angsuran: ' + (e.message || e));
    return;
  }

  ['angPembeli','angNoHp','angBarangNama','angTotalHarga','angUangMuka','angTenor','angJatuhTempo','angCatatan'].forEach(id=>{const el=stcEl(id);if(el)el.value='';});
  stcEl('angSisaAwal').value='0';
  alert('Data angsuran tersimpan!');
}
async function bayarCicilan(id){
  if(stcActionLocked('bayarCicilan:'+id)) return;
  const a = stcGetById('angsuran', id);
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
  riwayat.push({id:'BYR-'+Date.now(), tanggal:tgl(), waktu:Date.now(), nominal:bayarNominal, metode, catatan});
  const update = { totalBayar:totalBaru, riwayatBayar:riwayat, pembayaranTerakhir:tgl() };
  if(db) await stcUpdateAngsuranPayment(id,bayarNominal,metode,catatan);
  else { Object.assign(a,update); simpanCacheLokal(); tabelAngsuran(); }
  alert(`Pembayaran Rp ${bayarNominal.toLocaleString()} dicatat. Sisa: Rp ${Math.max(0,a.totalHarga-totalBaru).toLocaleString()}`);
}
function lihatRiwayatAngsuran(id){
  const a=stcGetById('angsuran', id); if(!a) return;
  const rows=Array.isArray(a.riwayatBayar)?a.riwayatBayar:[];
  const txt=rows.length?rows.map((r,i)=>`${i+1}. ${r.tanggal||'-'} | ${r.metode||'-'} | Rp ${(Number(r.nominal)||0).toLocaleString()}${r.catatan?' | '+r.catatan:''}`).join('\n'):'Belum ada riwayat pembayaran.';
  alert(`Riwayat pembayaran ${a.pembeli}\n\n${txt}`);
}
async function hapusAngsuranItem(id){
  if(confirm('Hapus data angsuran beserta riwayat pembayarannya?')){
    if(db) await stcDeleteDoc(STC_COLLECTIONS.ANGSURAN,id,{operation:'angsuran-delete',expected:stcExpectedFromItem(stcGetById('angsuran',id))});
    else { dbAngsuran=dbAngsuran.filter(a=>a.id!==id); simpanCacheLokal(); tabelAngsuran(); }
  }
}
function tabelAngsuran(){
  const tb=stcEl('tabelAngsuranBody'); if(!tb) return;
  const q=(stcEl('cariAngsuran')?.value||'').trim().toLowerCase();
  const fs=stcEl('filterStatusAngsuran')?.value||'';
  const data=dbAngsuran.filter(a=>{
    const st=statusAngsuran(a);
    const hay=((a.pembeli||'')+' '+(a.barangNama||'')+' '+(a.noHp||'')).toLowerCase();
    return (!q||hay.includes(q)) && (!fs||st===fs);
  });
  const totalKontrak=data.reduce((s,a)=>s+Number(a.totalHarga||0),0);
  const totalBayar=data.reduce((s,a)=>s+Number(a.totalBayar||0),0);
  const totalSisa=Math.max(0,totalKontrak-totalBayar);
  const ring=stcEl('ringkasanAngsuran');
  if(ring) stcSetHTML(ring, `Data: <b>${data.length}</b> • Kontrak: <b>Rp ${totalKontrak.toLocaleString()}</b> • Terbayar: <b>Rp ${totalBayar.toLocaleString()}</b> • Sisa: <b>Rp ${totalSisa.toLocaleString()}</b>`);
  if(!data.length){ stcSetHTML(tb, `<tr><td colspan="10" class="text-center" style="padding:10px;color:#94a3b8;">Belum ada data angsuran</td></tr>`); return; }
  stcSetHTML(tb, data.map((a,i)=>{
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
  }).join(''));
}

/* PENGATURAN TOKO & PENJAGA */
function muatFormPengaturan(){ stcEl('setNamaToko').value=configApp.namaToko||''; stcEl('setNamaCabang').value=configApp.namaCabang||''; stcEl('setAlamatToko').value=configApp.alamatToko||''; }
async function simpanPengaturanUmum(){ 
  if(stcActionLocked('simpanPengaturanUmum')) return;
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus OWNER.');
  configApp.namaCabang=stcEl('namaCabang').value; 
  if(db) await stcStage6UpdateBusinessDoc(STC_COLLECTIONS.PENGATURAN,'umum',{configApp,petugasJagaAktif},{operation:'settings-save',createIfMissing:true});
  else simpanCacheLokal();
}
async function simpanPengaturanLengkap(){ 
  if(stcActionLocked('simpanPengaturanLengkap')) return;
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus OWNER.');
  configApp.namaToko=stcEl('setNamaToko').value; 
  configApp.namaCabang=stcEl('setNamaCabang').value; 
  configApp.alamatToko=stcEl('setAlamatToko').value; 
  if(db) await stcStage6UpdateBusinessDoc(STC_COLLECTIONS.PENGATURAN,'umum',{configApp,petugasJagaAktif},{operation:'settings-save',createIfMissing:true});
  else simpanCacheLokal();
  applyPengaturanUI(); 
  alert('Pengaturan toko diperbarui!'); 
}
function normalisasiNamaPenjaga(nama){ return normalisasiSpasi(nama).toUpperCase(); }
function waktuPenjagaFormat(iso){
  if(!iso) return '-';
  try { return new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(/\./g,':'); } catch(e){ return iso; }
}
function renderDaftarKaryawanPenjaga(){
  const tb=stcEl('daftarKaryawanPenjaga'); if(!tb) return;
  if(!daftarKaryawanPenjaga.length){ stcSetHTML(tb, '<tr><td colspan="4" class="text-center">Belum ada karyawan.</td></tr>'); return; }
  stcSetHTML(tb, daftarKaryawanPenjaga.map((nama,i)=>{
    const aktif=String(petugasJagaAktif.nama||'').toUpperCase()===String(nama).toUpperCase();
    return `<tr><td>${i+1}</td><td><b>${escapeHTML(nama)}</b></td><td><span style="background:${aktif?'#059669':'#475569'};color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700">${aktif?'AKTIF':'TERSEDIA'}</span></td><td>${aktif?'':`<button class="btn-danger aksi-sm" onclick="hapusKaryawanPenjaga(${i})">Hapus</button>`}</td></tr>`;
  }).join(''));
}
function renderRiwayatPenjaga(){
  const tb=stcEl('riwayatPenjagaBody'); if(!tb) return;
  const data=riwayatPenjaga.slice().reverse().slice(0,30);
  if(!data.length){ stcSetHTML(tb, '<tr><td colspan="5" class="text-center" style="padding:10px;color:#94a3b8">Belum ada riwayat penetapan petugas.</td></tr>'); return; }
  stcSetHTML(tb, data.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHTML(waktuPenjagaFormat(r.waktu))}</td><td><b>${escapeHTML(r.shift||'-')}</b></td><td>${escapeHTML(r.nama||'-')}</td><td>${escapeHTML(r.catatan||'-')}</td></tr>`).join(''));
}
function muatMenuPenjagaToko(){
  const sh=stcEl('pilihShiftPenjaga');
  const nm=stcEl('pilihNamaPenjaga');
  if(sh) sh.value=petugasJagaAktif.shift||'PAGI';
  if(nm){ stcSetHTML(nm, daftarKaryawanPenjaga.map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('')); nm.value=petugasJagaAktif.nama||daftarKaryawanPenjaga[0]||''; }
  const a=stcEl('infoPenjagaAktif'); if(a) a.textContent=petugasJagaAktif.nama||'-';
  const b=stcEl('infoShiftAktif'); if(b) b.textContent=petugasJagaAktif.shift||'-';
  const c=stcEl('infoWaktuPenjaga'); if(c) c.textContent=waktuPenjagaFormat(petugasJagaAktif.waktu);
  const cat=stcEl('catatanPenjaga'); if(cat) cat.value=petugasJagaAktif.catatan||'';
  renderDaftarKaryawanPenjaga(); renderRiwayatPenjaga();
}
async function simpanDataPenjaga(){
  const payload={configApp,petugasJagaAktif,daftarKaryawanPenjaga,riwayatPenjaga};
  if(db) await stcUpdateDoc(STC_COLLECTIONS.PENGATURAN,'umum',payload,{operation:'guard-settings-save',createIfMissing:true});
  else simpanCacheLokal();
}
async function simpanPenjagaAktif(){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus OWNER.');
  const nama=stcEl('pilihNamaPenjaga').value;
  if(!nama) return alert('Pilih nama karyawan terlebih dahulu.');
  const shift=stcEl('pilihShiftPenjaga').value;
  const catatan=normalisasiSpasi(stcEl('catatanPenjaga').value);
  const waktu=new Date().toISOString();
  petugasJagaAktif={shift,nama,waktu,catatan};
  riwayatPenjaga.push({shift,nama,waktu,catatan});
  if(riwayatPenjaga.length>100) riwayatPenjaga=riwayatPenjaga.slice(-100);
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
  alert(`Petugas ${nama} ditetapkan untuk shift ${shift}.`);
}
async function tambahKaryawanPenjaga(){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus OWNER.');
  const el=stcEl('namaKaryawanBaru');
  const nama=normalisasiNamaPenjaga(el.value);
  if(nama.length<2) return alert('Nama karyawan minimal 2 karakter.');
  if(daftarKaryawanPenjaga.some(n=>String(n).toUpperCase()===nama)) return alert('Nama karyawan sudah ada.');
  daftarKaryawanPenjaga.push(nama);
  el.value='';
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
}
async function hapusKaryawanPenjaga(index){
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Khusus OWNER.');
  const nama=daftarKaryawanPenjaga[index];
  if(!nama) return;
  if(String(petugasJagaAktif.nama||'').toUpperCase()===String(nama).toUpperCase()) return alert('Petugas yang sedang aktif tidak dapat dihapus. Tetapkan petugas lain terlebih dahulu.');
  if(!confirm(`Hapus karyawan ${nama} dari daftar?`)) return;
  daftarKaryawanPenjaga.splice(index,1);
  await simpanDataPenjaga();
  muatMenuPenjagaToko();
}

/* BACKUP & RESTORE DATA — FREE-FIRST SAFE MODE */
async function buatPayloadBackup(){
  const payload={
    app:'STC SUMOBITO', schemaVersion:STC_STAGE7.schemaVersion, createdAt:new Date().toISOString(),
    backupType:'client-export-integrity-v7', integrityAlgorithm:'SHA-256', mutationSchemaVersion:STC_STAGE6.mutationSchemaVersion, stage6SchemaVersion:STC_STAGE6.schemaVersion, stage7SchemaVersion:STC_STAGE7.schemaVersion,
    sourceRole:statusRoleAktif, sourceUid:currentAuthUser?.uid||null,
    counts:{kategori:Array.isArray(dbKat)?dbKat.length:0,barang:Array.isArray(dbBrg)?dbBrg.length:0,orders:Array.isArray(dbOrder)?dbOrder.length:0,mutasi:Array.isArray(dbMutasi)?dbMutasi.length:0,returns:Array.isArray(dbReturn)?dbReturn.length:0,penjualan:Array.isArray(dbPenjualanHariIni)?dbPenjualanHariIni.length:0,angsuran:Array.isArray(dbAngsuran)?dbAngsuran.length:0},
    dbKat,dbBrg,dbOrder,dbMutasi,dbReturn,dbPenjualanHariIni,dbAngsuran,configApp,petugasJagaAktif,daftarKaryawanPenjaga,riwayatPenjaga
  };
  stcValidateBackupArrays(payload); payload.integrity=await stcBuildIntegrityHash(payload); return payload;
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
  if(statusRoleAktif !== STC_ROLES.OWNER) return alert('Backup hanya dapat dibuat oleh OWNER.');
  try {
    const payload = await buatPayloadBackup();
    unduhPayloadBackup(payload);
    const info = stcEl('backupInfo');
    if(info) info.textContent = `File backup disiapkan: ${new Date(payload.createdAt).toLocaleString('id-ID')} • ${Object.values(payload.counts).reduce((a,b)=>a+b,0)} item pada 7 kelompok data.`;
  } catch(err) {
    alert('Backup gagal dibuat: ' + (err && err.message ? err.message : err));
  }
}
async function buatSnapshotSebelumPulih(){
  const payload = await buatPayloadBackup();
  unduhPayloadBackup(payload, 'STC_Snapshot_Sebelum_Pemulihan');
  return payload;
}

async function prosesPulih(e){
  if(statusRoleAktif !== STC_ROLES.OWNER) { alert('Pemulihan data hanya dapat dilakukan oleh OWNER.'); return; }
  const file = e && e.target && e.target.files && e.target.files[0];
  if(!file) return;
  if(file.size > 20 * 1024 * 1024) {
    alert('File backup lebih dari 20 MB. Pemulihan dibatalkan demi keamanan dan kestabilan browser.');
    if(e && e.target) e.target.value='';
    return;
  }
  const reader = new FileReader();
  reader.onload = async function(ev){
    try {
      const data = JSON.parse(ev.target.result);
      const compatibility = stcValidateRestoreCompatibility(data);
      if(compatibility.integrityPresent){
        const expected = await stcBuildIntegrityHash(data);
        if(expected !== data.integrity) throw new Error('Integritas backup gagal diverifikasi. Pemulihan dibatalkan.');
      } else {
        stcSecurityEvent('LEGACY_BACKUP', `schema:${compatibility.version}`);
        if(!confirm('Backup lama tanpa checksum SHA-256 terdeteksi. Integritas kriptografis tidak dapat diverifikasi. Lanjutkan?')) return;
      }
      const arrayKeys = ['dbKat','dbBrg','dbOrder','dbMutasi','dbReturn','dbPenjualanHariIni','dbAngsuran','daftarKaryawanPenjaga','riwayatPenjaga'];
      const next = {
        dbKat: data.dbKat || [], dbBrg: data.dbBrg || [], dbOrder: data.dbOrder || [],
        dbMutasi: data.dbMutasi || [], dbReturn: data.dbReturn || [], dbPenjualanHariIni: data.dbPenjualanHariIni || [],
        dbAngsuran: data.dbAngsuran || [], configApp: data.configApp || configApp,
        petugasJagaAktif: data.petugasJagaAktif || petugasJagaAktif,
        daftarKaryawanPenjaga: Array.isArray(data.daftarKaryawanPenjaga) ? data.daftarKaryawanPenjaga : daftarKaryawanPenjaga,
        riwayatPenjaga: Array.isArray(data.riwayatPenjaga) ? data.riwayatPenjaga : riwayatPenjaga
      };
      if(next.dbBrg.some(x => !x || !x.kode) || next.dbOrder.some(x => !x || !x.id) ||
         next.dbMutasi.some(x => !x || !x.id) || next.dbReturn.some(x => !x || !x.id) ||
         next.dbPenjualanHariIni.some(x => !x || !x.id) || next.dbAngsuran.some(x => !x || !x.id)) {
        throw new Error('Ada data yang tidak memiliki kode/ID dokumen. Tidak ada data yang diubah.');
      }
      const total = arrayKeys.reduce((sum,key)=>sum+(next[key]||[]).length,0);
      const sourceDate = data.createdAt ? new Date(data.createdAt).toLocaleString('id-ID') : 'tanggal tidak tercatat';
      if(!confirm(`Periksa file backup:\\nTanggal: ${sourceDate}\\nTotal item: ${total}\\n\\nSebelum pemulihan, sistem akan mengunduh snapshot data saat ini. Pastikan browser mengizinkan unduhan. Lanjutkan?`)) return;

      // Auto-snapshot is a safety net before restore; it is not a scheduled cloud backup.
      await buatSnapshotSebelumPulih();
      if(!confirm('Snapshot sebelum pemulihan sudah diminta untuk diunduh. Lanjutkan pemulihan? Pastikan file STC_Snapshot_Sebelum_Pemulihan tersimpan.')) return;

      if(db){
        const jobs = [];
        [STC_COLLECTIONS.KATEGORI,STC_COLLECTIONS.BARANG,STC_COLLECTIONS.ORDERS,STC_COLLECTIONS.MUTASI,STC_COLLECTIONS.RETURNS,STC_COLLECTIONS.PENJUALAN,STC_COLLECTIONS.ANGSURAN,STC_COLLECTIONS.PENGATURAN].forEach(c=>stcAssertWriteSession(c,'restore'));
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
        for(let i=0; i<jobs.length; i+=STC_STAGE4.maxBatchWrites){
          const batch = db.batch();
          jobs.slice(i, i+350).forEach(job => batch.set(db.collection(job.col).doc(job.id), job.data, {merge:true}));
          await batch.commit();
        }
      }
      dbKat=next.dbKat; dbBrg=next.dbBrg; dbOrder=next.dbOrder; dbMutasi=next.dbMutasi;
      dbReturn=next.dbReturn; dbPenjualanHariIni=next.dbPenjualanHariIni; dbAngsuran=next.dbAngsuran;
      configApp=next.configApp; petugasJagaAktif=next.petugasJagaAktif;
      daftarKaryawanPenjaga=next.daftarKaryawanPenjaga; riwayatPenjaga=next.riwayatPenjaga;
      simpanCacheLokal(); refreshSemua();
      alert('Pemulihan selesai. Dokumen pada backup diproses. Dokumen yang tidak ada di backup tidak dihapus. Periksa data utama sebelum operasional.');
    } catch(err){ alert('Pemulihan dibatalkan: ' + err.message); }
    finally { if(e && e.target) e.target.value=''; }
  };
  reader.onerror = () => { alert('File backup tidak dapat dibaca.'); if(e && e.target) e.target.value=''; };
  reader.readAsText(file);
}

/* GENERATOR CETAK PDF & SURAT JALAN */
const pdfConfigStyles = { lineColor: [0, 0, 0], lineWidth: 0.35, textColor: [0, 0, 0] };

function cetakOrderPDF(kategori){
  const isKabel = kategori === 'kabel';
  const filterTokoId = isKabel ? 'filterCetakOrdTokoKabel' : 'filterCetakOrdTokoBarang';
  const filterToko = stcEl(filterTokoId)?.value || 'SEMUA';
  let dataOrder = dbOrder.filter(o => isKabel ? isItemKabel(o) : !isItemKabel(o));

  if(filterToko && filterToko !== 'SEMUA'){
    dataOrder = dataOrder.filter(o => (o.toko || '').toUpperCase() === filterToko);
  }

  if(!dataOrder.length) return alert(`Tidak ada pesanan order ${isKabel ? 'kabel' : 'barang'} tercatat untuk ${filterToko}!`);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cabangPemesan = filterToko !== 'SEMUA' ? filterToko : stcEl('namaCabang').value.toUpperCase();

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

  doc.save(`Surat_Order_${isKabel ? 'Kabel' : 'Barang'}_${cabangPemesan.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`);
}

function cetakSuratJalanPDF(){
  const list=dataMutasiSaatIni();
  if(!list.length) return alert('Tidak ada item pada nomor mutasi saat ini untuk dicetak!');
  const asal=stcEl('mutAsal').value;
  const tujuan=stcEl('mutTujuan').value;
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
  const asal=stcEl('retAsal').value,tujuan=stcEl('retTujuan').value,no=nomorReturnSekarang()||list[0].noReturn||'LEGACY';
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
  const kat = stcEl('pilihKatMenu7')?.value;
  let data = kat ? stcGetBarangByKategori(kat) : dbBrg;
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
  const cabang = stcEl('namaCabang').value.toUpperCase();
  const el = stcEl(idContainer);
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

/* STAGE 2H — maintenance diagnostics exposed read-only for debugging */
window.STC_DEBUG = Object.freeze({
  summary: () => stcRuntimeSummary(),
  failures: () => STC_RUNTIME.runtimeFailures.slice(),
  flushCache: () => stcFlushCacheLokal(),
  reconnect: () => { stcResetReconnectBackoff(); stcScheduleRealtimeReconnect(); },
  clearDomCache: () => stcClearDomCache(),
  securityAudit: () => stcSecurityAudit(),
  securityEvents: () => STC_RUNTIME.securityEvents.slice(),
  securityBaseline: () => STC_RUNTIME.securityBaseline,
  stage6: {
    summary: () => stcStage6RuntimeSummary(),
    audit: () => stcStage6IntegrityAudit(),
    businessKey: (collection, parts) => stcStage6BusinessKey(collection, parts),
    repairPlan: (collection, id, reason, details) => stcStage6RepairPlan(collection, id, reason, details)
  },
  stage7: {
    summary: () => stcStage7RuntimeSummary(),
    audit: () => stcStage7IntegrityAudit(),
    movementLedger: () => stcStage7ReconcileMovementLedger(stcStage7BuildMovementLedger().lines),
    canRepair: () => stcStage7CanRepair(),
    repairPlan: (code, details) => stcStage7RepairPlan(code, details)
  }
});

/* CEGAH SUBMIT FORM ENTER OTOMATIS */
document.addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'textarea') {
    if(!e.target.closest('.cari-grup')) {
      e.preventDefault();
    }
  }
});

/* ================================================================
   ROLE UI LAYERS — OWNER/CABANG
   ================================================================
   Fungsi bisnis tetap kompatibel dengan inline onclick lama.
   Pemisahan tahap ini dilakukan pada lifecycle, listener data, dan UI;
   pemecahan file fisik baru diperlukan bila nanti masuk Tahap 9.
   ================================================================ */

/* ================================================================
   STAGE 1A — STATUS & LIFECYCLE
   ================================================================ */
/* STATUS JARINGAN */
window.addEventListener('offline', () => {
  const b = stcEl('badgeCloudStatus');
  if(b) { b.className = 'badge-cloud offline'; b.innerText = '🔴 Offline (Tanpa Internet)'; }
  stcScheduleCacheSave(0);
});
window.addEventListener('online', () => {
  setBadgeCloud('🔄 Menyambungkan kembali...');
  stcScheduleRealtimeReconnect();
});
window.addEventListener('pagehide', event => { if(!event.persisted) stcCleanupRuntime(); else stcFlushCacheLokal(); });
window.addEventListener('beforeunload', () => { stcCleanupRuntime(); });
window.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') stcFlushCacheLokal();
});
window.addEventListener('error', event => {
  const now = stcNow();
  if(now - STC_RUNTIME.lastRuntimeErrorAt < 1500) return;
  STC_RUNTIME.lastRuntimeErrorAt = now;
  stcLogWarn('RUNTIME_ERROR', event.error || event.message); stcRecordRuntimeFailure('RUNTIME_ERROR', event.error || event.message);
});
window.addEventListener('unhandledrejection', event => {
  const now = stcNow();
  if(now - STC_RUNTIME.lastRuntimeErrorAt < 1500) return;
  STC_RUNTIME.lastRuntimeErrorAt = now;
  stcLogWarn('UNHANDLED_REJECTION', event.reason); stcRecordRuntimeFailure('UNHANDLED_REJECTION', event.reason);
});

/* STARTUP — Tahap 1F: shell tampil dahulu, pekerjaan berat setelah paint awal. */
window.addEventListener('load', function stcStartup(){
  stcMarkOnlineState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  if(!history.state || (!history.state.stcDashboard && !history.state.stcMenu)) {
    history.replaceState({ stcDashboard: true }, '', location.pathname + location.search + '#dashboard');
  }
  if(stcEntryIs(STC_ROLES.OWNER)){
    stcSetEntryAuthRequired(true);
    setBadgeCloud('🔐 Menunggu login OWNER');
  } else {
    stcSetEntryAuthRequired(false);
    setBadgeCloud('🔄 Menghubungkan...');
  }
  muatLokal();

  const startHeavyWork = () => {
    refreshSemua();
    STC_RUNTIME.startupComplete = true;
    stcScheduleMaintenance();
    stcRunIdleMaintenance();
    inisialisasiFirebase();
  };
  if(typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(startHeavyWork));
  } else {
    setTimeout(startHeavyWork, 0);
  }
}, { once: true });
