// ─────────────────────────────────────────────────────────────
// IndexedDB 래퍼 (기기 로컬 저장)
//
// 설계서 2장: "개인 기록은 기기 밖으로 나가지 않는다."
//   - 취향 퀴즈 응답, 온보딩 플래그 등은 'meta' 스토어
//   - 가본 곳/위시 등 개인 업장 기록은 'records' 스토어 (④ 단계에서 사용)
// 서버 전송 없음. 전부 브라우저 IndexedDB 에만 저장.
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'oneul-hanjan';
const DB_VER  = 1;

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 IndexedDB 를 지원하지 않습니다.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = req.result;
      // 퀴즈 응답·설정 플래그 등 키-값
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // 개인 업장 기록 (가본 곳/위시) — ④ 단계에서 본격 사용
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id' });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('gu', 'gu', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

// IDBRequest → Promise 헬퍼
function reqAsync(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function tx(store, mode) {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

// ── meta (키-값) ──────────────────────────────────────────────
export async function metaGet(key) {
  const os = await tx('meta', 'readonly');
  const row = await reqAsync(os.get(key));
  return row ? row.value : undefined;
}
export async function metaSet(key, value) {
  const os = await tx('meta', 'readwrite');
  await reqAsync(os.put({ key, value }));
  return value;
}
export async function metaDel(key) {
  const os = await tx('meta', 'readwrite');
  await reqAsync(os.delete(key));
}

// ── 취향 프로필 (③ 단계 핵심) ─────────────────────────────────
export function getProfile()        { return metaGet('profile'); }
export function saveProfile(profile) { return metaSet('profile', profile); }
export function clearProfile()       { return metaDel('profile'); }

// ── 개인 업장 기록 (④ 단계에서 사용) ──────────────────────────
export async function recAll() {
  const os = await tx('records', 'readonly');
  return reqAsync(os.getAll());
}
export async function recPut(rec) {
  const os = await tx('records', 'readwrite');
  await reqAsync(os.put(rec));
  return rec;
}
export async function recDel(id) {
  const os = await tx('records', 'readwrite');
  await reqAsync(os.delete(id));
}

// 전체 초기화 (⑥ 단계 초기화 버튼에서 사용)
export async function wipeAll() {
  const db = await openDB();
  await Promise.all([...db.objectStoreNames].map(name =>
    reqAsync(db.transaction(name, 'readwrite').objectStore(name).clear())
  ));
}

// ── 내보내기 / 가져오기 (⑥ 단계) ─────────────────────────────
// 기기 내 데이터(취향 프로필 + 등재 업장 전체)를 한 덩이로 떠낸다.
export async function dumpAll() {
  return { profile: (await getProfile()) || null, records: await recAll() };
}

// 백업 파일로 복원한다. 기존 데이터는 비우고 덮어쓴다.
export async function restoreAll({ profile, records } = {}) {
  await wipeAll();
  if (profile && typeof profile === 'object') await saveProfile(profile);
  if (Array.isArray(records)) {
    for (const r of records) {
      if (r && r.id) await recPut(r);
    }
  }
}
