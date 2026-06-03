// ─────────────────────────────────────────────────────────────
// 추천 로직 (설계서 5·6장)
//
// 후보 = 기기 내 본인 기록(위시 + 방문함 중 재방문≠아니오) ∪ 공용 풀.
// 출처별 가중치:
//   · 본인 방문함(검증): 검증 보너스 + 오늘 조건/퀴즈 매칭 + 만족도 반영 (최고)
//   · 본인 위시: 등재 의사 보너스 + 오늘 조건 매칭
//   · 공용 풀: 만족도 없음 → 퀴즈 벡터·오늘 조건의 객관 부합도(카테고리·지역·선호유형)
// 감쇠계수: 본인 등재 수가 늘수록 공용 점수를 낮춤
//   계수 = max(0.3, 1 − 본인등재수 / 30)  ※ 30은 시작값(튜닝 대상)
// 사유: 공문서체 타인추천형(시스템이 객관 사유를 댄다).
// ─────────────────────────────────────────────────────────────

import { labelOf } from './vocab.js';

export const DECAY_THRESHOLD = 30; // 시작값 — 실사용하며 튜닝

// 성향(vibe) 토큰 → 표시 라벨
const VIBE_LABEL = { retro: '노포·로컬 정취', trendy: '트렌디·분위기', value: '가성비 실속', solo: '정숙·단독' };

// 성향 토큰 → 공용 풀 카테고리 키워드(객관 부합도 추정용, 휴리스틱)
const VIBE_CAT_KW = {
  retro:  ['노포', '전', '국밥', '백반', '민속', '전통', '막걸리', '선술집', '포장마차', '족발', '보쌈', '곱창', '막창', '횟집', '조개'],
  trendy: ['요리주점', '와인', '칵테일', '바', '이자카야', '다이닝', '퓨전', '비스트로', '펍', '오마카세'],
  value:  ['포장마차', '호프', '맥주', '분식', '국밥', '치킨', '꼬치', '오뎅', '닭', '곱창'],
  solo:   ['국밥', '라멘', '우동', '덮밥', '바', '이자카야', '정식', '소바', '면'],
};

// "메뉴 구성 다양" 우대조건과 통하는 폭넓은 업종
const DIVERSE = ['포장마차', '요리주점', '술집', '전통,민속주점', '맥주,호프', '오뎅,꼬치'];

const inter = (set, arr) => (arr || []).filter(x => set.has(x));

// 기록/풀 항목의 공용 풀 식별 키 (중복 제거용)
const venKey = x => x.venueId || (x.name + '|' + x.gu);

export function recommend({ pool = [], records = [], profile = null, today = {}, limit = 3 } = {}) {
  const gu   = today.loc || '';
  const good = new Set(today.good || []);
  const bad  = new Set(today.bad  || []);
  const sit  = today.sit || '';
  const prof = profile || {};
  const vibe = new Set(prof.vibe || []);
  const prio = new Set(prof.priorities || []);
  const prefRegion = (prof.regions || []).includes(gu);

  const personalCount = records.length;
  const decay = Math.max(0.3, 1 - personalCount / DECAY_THRESHOLD);

  const picks = [];
  const rejected = [];
  const ownKeys = new Set(records.map(venKey));

  // ── 본인 기록 (해당 구) ──
  for (const r of records) {
    if (r.gu !== gu) continue;

    const badHit = inter(bad, r.bad);
    if (badHit.length) {
      rejected.push({ name: r.name, cat: r.cat, gu: r.gu, dong: r.dong,
        reason: `반려사유 '${labelOf(badHit[0])}'에 해당하여 금일 추천 대상에서 제외함` });
      continue;
    }

    if (r.status === '방문함') {
      if (r.revisit === '아니오') {
        rejected.push({ name: r.name, cat: r.cat, gu: r.gu, dong: r.dong,
          reason: `재방문 의사 '아니오' 등재 건으로 금일 추천 대상에서 제외함` });
        continue;
      }
      const goodHit = inter(good, r.good);
      let s = 40 + (r.sat || 0) * 4;
      if (sit && r.sit === sit) s += 12;
      s += goodHit.length * 10;
      if (r.revisit === '예') s += 10;
      const oo = goodHit.length ? labelOf(goodHit[0]) : null;
      picks.push({
        item: r, source: '방문함', score: s, tags: { good: r.good || [], bad: [] },
        reason: oo
          ? `본 업장은 귀하의 재방문 의사 등재 건으로, 우대조건 '${oo}' 부합에 따라 추천 상신함`
          : `본 업장은 귀하의 재방문 의사 등재 검증 건으로, 금일 조건 부합에 따라 추천 상신함`,
      });
    } else { // 위시
      const goodHit = inter(good, r.good);
      let s = 22 + goodHit.length * 8;
      if (sit && r.sit === sit) s += 6;
      s += catAffinity(r.cat, vibe, prio) * 0.5;
      picks.push({
        item: r, source: '위시', score: s, tags: { good: r.good || [], bad: [] },
        reason: `귀하가 방문 예정으로 등재한 건으로, 금일 조건에 부합하여 우선 검토 대상에 포함함`,
      });
    }
  }

  // ── 공용 풀 (해당 구, 본인 기록과 중복 제외) ──
  for (const p of pool) {
    if (p.gu !== gu) continue;
    if (ownKeys.has(p.id) || ownKeys.has(p.name + '|' + p.gu)) continue;

    let aff = catAffinity(p.cat, vibe, prio);
    if (prefRegion) aff += 4;
    if (good.has('메뉴 구성 다양') && DIVERSE.includes(p.cat)) aff += 6;
    aff += (hashStr(p.id) % 5);                 // 안정적 미세 변주(난수 미사용)
    const s = aff * decay;

    const oo = pickPoolReasonLabel(p.cat, vibe, prio);
    picks.push({
      item: p, source: 'pool', score: s, tags: { good: [], bad: [] },
      reason: oo
        ? `공용 업장 명부 등재 건으로, 취향 진단 결과 '${oo}' 선호에 부합하여 추천함`
        : `공용 업장 명부 등재 건으로, 금일 선정 지역 부합에 따라 추천함`,
    });
  }

  picks.sort((a, b) => b.score - a.score);
  return {
    picks: picks.slice(0, limit),
    rejected: rejected.slice(0, 3),
    decay,
    personalCount,
  };
}

// 카테고리 ↔ 성향/우대 부합도(휴리스틱 점수)
function catAffinity(cat, vibeSet, prioSet) {
  if (!cat) return 0;
  let a = 0;
  for (const v of vibeSet) {
    if ((VIBE_CAT_KW[v] || []).some(kw => cat.includes(kw))) a += 6;
  }
  if (prioSet.has('메뉴 구성 다양') && DIVERSE.includes(cat)) a += 4;
  return a;
}

// 공용 사유의 '○○' 라벨 선정 (가장 잘 맞는 성향, 없으면 null)
function pickPoolReasonLabel(cat, vibeSet, prioSet) {
  for (const v of vibeSet) {
    if ((VIBE_CAT_KW[v] || []).some(kw => cat.includes(kw))) return VIBE_LABEL[v];
  }
  if (prioSet.has('메뉴 구성 다양') && DIVERSE.includes(cat)) return '메뉴 구성 다양';
  return null;
}

function hashStr(s) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
