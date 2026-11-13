from pathlib import Path
p=Path('/mnt/data/stage3work/inline.js')
s=p.read_text()
marker='/* ================================================================\n   STAGE 1D — DATA PROCESSING & SEARCH OPTIMIZATION'
assert marker in s
block=r'''/* ================================================================
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

'''
s=s.replace(marker,block+marker,1)
# Enhance cleanup for Stage 3 resources.
old="""  STC_RENDER_QUEUE.clear();\n  STC_RUNTIME.actionLocks.clear();\n  bersihkanListener();\n"""
new="""  if(STC_RUNTIME.renderFrame){\n    if(typeof cancelAnimationFrame === 'function') cancelAnimationFrame(STC_RUNTIME.renderFrame);\n    else clearTimeout(STC_RUNTIME.renderFrame);\n    STC_RUNTIME.renderFrame = null;\n  }\n  if(STC_RUNTIME.maintenanceTimer){ clearInterval(STC_RUNTIME.maintenanceTimer); STC_RUNTIME.maintenanceTimer = null; }\n  stcRenderQueueScheduled = false;\n  STC_RENDER_QUEUE.clear();\n  STC_RUNTIME.actionLocks.clear();\n  stcPruneDomCaches();\n  bersihkanListener();\n"""
assert old in s
s=s.replace(old,new,1)
# Make local cache loader schema-aware and invalidate indexes after cache hydration.
old2="""  try {\n    const o = JSON.parse(d);\n    dbKat = o.dbKat || [];\n    dbBrg = o.dbBrg || [];\n    dbOrder = o.dbOrder || [];\n    dbMutasi = o.dbMutasi || [];\n    dbReturn = o.dbReturn || [];\n"""
new2="""  try {\n    const o = stcReadCachePayload(d);\n    if(!o) return;\n    dbKat = o.dbKat;\n    dbBrg = o.dbBrg;\n    dbOrder = o.dbOrder;\n    dbMutasi = o.dbMutasi;\n    dbReturn = o.dbReturn;\n    stcInvalidateDataIndexes();\n"""
assert old2 in s
s=s.replace(old2,new2,1)
# Invalidate indexes whenever snapshot arrays are replaced.
repls={
"dbKat = snap.docs.map(namaKategoriDariDokumen).sort(bandingKategori);":"dbKat = snap.docs.map(namaKategoriDariDokumen).sort(bandingKategori);\n      stcInvalidateDataIndexes();",
"dbBrg = snap.docs.map(doc => doc.data()).sort((a,b) => bandingKodeBarang(a.kode, b.kode));":"dbBrg = snap.docs.map(doc => doc.data()).sort((a,b) => bandingKodeBarang(a.kode, b.kode));\n      stcInvalidateDataIndexes();",
"dbOrder = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));":"dbOrder = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));\n      stcInvalidateDataIndexes();",
"dbMutasi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));":"dbMutasi = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));\n      stcInvalidateDataIndexes();",
"dbReturn = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));":"dbReturn = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));\n      stcInvalidateDataIndexes();",
"dbPenjualanHariIni = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));":"dbPenjualanHariIni = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));\n      stcInvalidateDataIndexes();",
"dbAngsuran = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));":"dbAngsuran = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))\n        .sort((a,b) => (b.tglWaktu || 0) - (a.tglWaktu || 0));\n      stcInvalidateDataIndexes();"
}
for a,b in repls.items():
    assert a in s, a
    s=s.replace(a,b,1)
# Add maintenance start after Firebase startup completion.
old3="""    STC_RUNTIME.startupComplete = true;\n    inisialisasiFirebase();\n"""
new3="""    STC_RUNTIME.startupComplete = true;\n    stcScheduleMaintenance();\n    stcRunIdleMaintenance();\n    inisialisasiFirebase();\n"""
assert old3 in s
s=s.replace(old3,new3,1)
p.write_text(s)
