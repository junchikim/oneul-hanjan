// ─────────────────────────────────────────────────────────────
// 공용 업장 풀 (읽기 전용)
//
// 설계서 2장 원칙: "공용 풀은 객관 정보만 읽기 전용으로 빌려준다."
// data/venues.json 에는 업장명·카테고리·구·동 객관 정보만 들어있다.
// 개인 평가(만족도·재방문·태그·메모)는 이 풀에 존재하지 않으며,
// 개인 기록은 ④ 단계에서 IndexedDB 로 따로 저장한다.
// ─────────────────────────────────────────────────────────────

let _pool = [];      // [{id, name, cat, gu, dong}]
let _meta = null;
let _loaded = false;

// 공용 풀 정적 JSON 을 한 번만 읽어온다.
export async function loadPool() {
  if (_loaded) return _pool;
  const res = await fetch('data/venues.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('공용 업장 명부를 불러오지 못했습니다 (' + res.status + ')');
  const doc = await res.json();
  _meta = doc.meta || null;
  // 방어적 복사 — 호출부에서 풀 원본을 변형하지 못하도록 동결한다.
  _pool = (doc.venues || []).map(v => Object.freeze({
    id: v.id, name: v.name, cat: v.cat, gu: v.gu, dong: v.dong,
  }));
  Object.freeze(_pool);
  _loaded = true;
  return _pool;
}

export function getPool() { return _pool; }
export function getMeta() { return _meta; }

// 풀에 등장하는 구 목록 (건수 내림차순)
export function gusByCount() {
  const c = {};
  for (const v of _pool) c[v.gu] = (c[v.gu] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]); // [[gu, n], ...]
}

// 풀에 등장하는 카테고리 목록 (가나다순)
export function cats() {
  return [...new Set(_pool.map(v => v.cat))].sort((a, b) => a.localeCompare(b, 'ko'));
}

// id 로 업장 조회 (개인 기록이 공용 풀 업장을 참조할 때 사용 — ④⑤ 단계)
export function venueById(id) {
  return _pool.find(v => v.id === id) || null;
}

// 조건 필터 (구 / 카테고리 / 이름 검색)
export function filterPool({ gu = '', cat = '', q = '' } = {}) {
  const needle = q.trim();
  return _pool.filter(v =>
    (!gu  || v.gu === gu) &&
    (!cat || v.cat === cat) &&
    (!needle || v.name.includes(needle))
  );
}
