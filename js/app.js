// ─────────────────────────────────────────────────────────────
// 오늘의 한잔 — v1 앱 (①② 단계)
//
// 이 단계의 범위:
//   ① 임베드 데이터 분리 → 코드에 박힌 데이터 제거, 공용 풀은 fetch 로 로드
//   ② 공용 풀(객관 정보만) 정적 JSON 을 읽기 전용으로 사용
//
// ③ 취향 퀴즈 5문항 온보딩 + 기기 저장(IndexedDB) — 적용됨.
// ④ 가본 곳/위시 등재·수정을 IndexedDB 에 저장 — 적용됨.
//
// 아직 미구현 (예정):
//   ⑤ 기기 기록 ∪ 공용 풀 추천 + 감쇠계수 + 공문서체 사유
//   ⑥ 내보내기/가져오기 + 초기화 + 개인정보 안내
//
// 지금 추천은 "공용 풀(구 기준) 객관 후보"이며, 퀴즈 프로필은
// 기안 화면의 기본값(동행/우대조건/반려사유/지역)을 채우는 데 쓴다.
// 프로필·개인 기록 기반 점수·감쇠계수는 ⑤ 단계에서 얹는다.
// ─────────────────────────────────────────────────────────────

import { loadPool, getMeta, gusByCount, cats, filterPool } from './pool.js';
import { openDB, getProfile, saveProfile, recAll, recPut, recDel, wipeAll, dumpAll, restoreAll } from './db.js';
import { runQuiz } from './quiz.js';
import { SITS, GOODS, BADS, labelOf } from './vocab.js';
import { blankRecord, buildRecordForm, recordCardHTML } from './records.js';
import { recommend } from './recommend.js';

const $ = id => document.getElementById(id);
const escAttr = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 동행자 / 우대조건 / 반려사유 토큰은 vocab.js 에서 공용 관리(퀴즈·기록과 동일 자)

const state = { loc: '', sit: '', good: new Set(), bad: new Set() };
let profile = null;      // 취향 퀴즈 프로필 (IndexedDB)
let records = [];        // 개인 업장 기록 (IndexedDB)
let listTab = '방문함';  // 목록 탭: '방문함' | '위시' | 'pool'

// ── 날짜 / 음주운 / 문서번호 ──────────────────────────────────
const now = new Date();
const dn  = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
const ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

const FORTUNES = [
  [5, '금일 음주운 매우 양호. 모든 안건이 원안대로 가결될 상이니 자신 있게 상신할 것.'],
  [4, '음주 기운 양호. 다만 2차 연계 안건은 신중 검토 후 결재 요망.'],
  [4, '동행자와의 합의가 순조로운 날. 제안 안건 대부분 승인 예상.'],
  [3, '보통의 기운. 객단가 높은 안건은 반려를 권장함.'],
  [3, '무난한 하루. 1차 종료 후 귀가 안건의 조속한 처리를 권함.'],
  [2, '지갑 사정과 흥이 충돌하는 날. 예산 초과 안건 부결 가능성 높음.'],
  [2, '혼잡 주의보. 인기 업장은 대기 시간 과다로 반려될 우려 있음.'],
  [1, '금일 음주 안건 전면 보류 권고. 무리한 상신 시 익일 컨디션에 중대한 차질 예상.'],
  [4, '신규 업장 개척에 길한 기운. 위시 안건의 과감한 결재를 권장함.'],
  [3, '검증된 단골 안건이 안전한 날. 모험적 신규 안건은 후일로 이월 권고.'],
  [5, '오늘의 한 잔이 곧 사기 진작. 동료 격려 차원의 회식 안건 적극 승인 요망.'],
  [2, '소음 수준 과다 업장 회피 요망. 조용한 곳으로 안건 수정 권고.'],
  [3, '재방문 의사 높았던 업장이 길함. 기존 검증 안건 우선 처리 권장.'],
  [4, '분위기 양호한 업장과 인연 있는 날. 연인 동행 안건 결재에 적기.'],
  [2, '체류 시간 제약 주의. 느긋한 한 잔을 원한다면 회전 빠른 업장은 반려할 것.'],
  [3, '가격 대비 만족도가 관건. 가성비 안건에 가중치 부여를 권함.'],
  [4, '안주 품질 우수 업장이 길함. 식사 겸 음주 안건 가결 예상.'],
  [1, '음주 자제 권고일. 무알콜 대체 안건 검토를 정중히 상신함.'],
  [3, '1인 방문에 길한 날. 혼술 안건의 독자 결재 가능.'],
  [4, '노포 정취가 어울리는 하루. 로컬 업장 안건 적극 승인 권함.'],
  [5, '전결권 행사에 막힘이 없는 날. 어떤 안건도 무리 없이 가결될 상.'],
  [2, '예상치 못한 협조부서(동행자) 변수 발생 주의. 유연한 안건 조정 요망.'],
  [3, '무난 가결의 날. 다만 익일 조기 출근 시 음주량 안건의 하향 조정 권고.'],
  [4, '금일 결재선 통과 순조. 제1안건의 신속 처리를 권장함.'],
];

function initHeader() {
  $('kday').textContent = ymd + '(' + dn + ')';
  const start = new Date(now.getFullYear(), 0, 0);
  const doy = Math.floor((now - start) / 86400000);
  const f = FORTUNES[doy % FORTUNES.length];
  $('fo-stars').textContent = '★'.repeat(f[0]) + '☆'.repeat(5 - f[0]);
  $('fo-text').textContent = f[1];
  // 문서번호는 예시 표기 — 날짜 시드로 안정적으로 생성(난수 미사용)
  $('docno').textContent = '음주-' + now.getFullYear() + '-' + String(1000 + (doy * 37) % 9000) + ' (예시)';
}

// ── 기안 화면 ────────────────────────────────────────────────
function fillGuSelect(sel, allLabel) {
  let o = `<option value="">${allLabel}</option>`;
  for (const [g] of gusByCount()) o += `<option value="${g}">${g}</option>`;
  sel.innerHTML = o;
}

function updSubj() {
  const sj = $('subj');
  if (!state.loc) { sj.textContent = '— 음주지역 선택 시 자동 기재 —'; return; }
  const who = state.sit ? ` (동행: ${state.sit})` : '';
  sj.textContent = `금일 ${state.loc} 음주장소 선정 결재의 건${who}`;
}

function buildChips(id, arr, key, bad) {
  const el = $(id);
  el.innerHTML = arr.map(v => `<button class="chip ${bad ? 'bad' : ''}" data-v="${v}">${v}</button>`).join('');
  el.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    if (key === 'sit') {
      el.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      if (state.sit === v) state.sit = '';
      else { state.sit = v; b.classList.add('on'); }
      updSubj();
    } else {
      const s = state[key];
      if (s.has(v)) { s.delete(v); b.classList.remove('on'); }
      else { s.add(v); b.classList.add('on'); }
    }
  });
}

// ⑤ 추천 — 본인 기록 ∪ 공용 풀, 출처별 가중치 + 감쇠계수 + 공문서체 사유
function submitDraft() {
  if (!state.loc) { alert('음주지역(구)을 먼저 선택해 주십시오.'); return; }

  const result = recommend({
    pool: filterPool({}),
    records,
    profile,
    today: { loc: state.loc, sit: state.sit, good: [...state.good], bad: [...state.bad] },
    limit: 3,
  });
  renderResults(result);
  $('st-org').classList.add('on');
}

const SOURCE_BADGE = {
  '방문함': { cls: 'again', text: '재방문 승인' },
  '위시':   { cls: 'new',   text: '위시 검토' },
  'pool':   { cls: 'new',   text: '공용 명부' },
};

function renderResults({ picks, rejected, decay, personalCount }) {
  const B = $('bodybox');
  if (!picks.length) {
    B.innerHTML = `<div class="bguide">「${state.loc}」 관내 상신 가능한 안건이 없습니다.<br>관리대장에서 위시·가본 곳을 등재하거나, 다른 지역(구)을 선택해 주십시오.</div>`;
    B.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const rk = ['第1案', '第2案', '第3案'];
  let h = `<div class="rbanner">▣ 결재 검토 결과 — ${state.loc} 관내 추천 ${picks.length}건</div>`;

  picks.forEach((x, i) => {
    const p = x.item, bd = SOURCE_BADGE[x.source] || SOURCE_BADGE.pool;
    let tags = '';
    (x.tags.good || []).forEach(g => tags += `<span class="tg g">＋${labelOf(g)}</span>`);
    (x.tags.bad  || []).forEach(b => tags += `<span class="tg b">－${labelOf(b)}</span>`);
    h += `<div class="acase"><div class="ac-h"><span class="ac-rank">${rk[i] || ('第' + (i + 1) + '案')}</span>
        <span class="ac-badge ${bd.cls}">${bd.text}</span></div>
      <div class="ac-b"><div class="ac-name">${escAttr(p.name)}</div><div class="ac-cat">${escAttr(p.cat)}</div>
        <div class="ac-loc">소재지 : 서울 ${escAttr(p.gu)} ${escAttr(p.dong)}</div>
        ${tags ? `<div class="ac-tags">${tags}</div>` : ''}
        <div class="ac-why"><b>추천 사유</b> &nbsp;${x.reason}.</div></div></div>`;
  });

  if (rejected && rejected.length) {
    h += `<div class="rbanner" style="color:var(--sub)">▣ 반려 안건 ${rejected.length}건</div>`;
    rejected.forEach(r => {
      h += `<div class="acase"><div class="ac-b" style="padding:9px 12px">
        <div class="ac-name" style="font-size:13px;color:var(--sub)">${escAttr(r.name)} <span class="ac-cat">${escAttr(r.cat)}</span></div>
        <div class="ac-why" style="background:#fdf6f5;border-color:#e3cfca"><b style="color:var(--stamp)">반려 사유</b> &nbsp;${r.reason}.</div></div></div>`;
    });
  }

  // 감쇠계수 안내(설계서 5장) — 본인 등재가 늘수록 공용 풀 비중이 줄어듦
  const pct = Math.round(decay * 100);
  h += `<div class="bguide" style="border-top:1px solid var(--line2)">본인 등재 <b>${personalCount}</b>건 · 공용 풀 가중 <b>${pct}%</b> 적용${personalCount >= 30 ? ' (개인 데이터 중심)' : ''}.</div>`;

  B.innerHTML = h;
  B.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 업장 관리대장 (개인 기록 + 공용 명부) ─────────────────────
function fillListFilters() {
  fillGuSelect($('lgu'), '전체 구');
  $('lcat').innerHTML = '<option value="">전체 카테고리</option>' + cats().map(c => `<option>${c}</option>`).join('');
}

function setListTab(tab) {
  listTab = tab;
  $('list-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  // 공용 명부 탭만 카테고리/검색 필터 노출
  $('lcat').classList.toggle('hide', tab !== 'pool');
  $('lq').classList.toggle('hide', tab !== 'pool');
  $('b-add').classList.toggle('hide', tab === 'pool');
  renderList();
}

function recordsByStatus(status) {
  return records
    .filter(r => r.status === status)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function renderList() {
  const gu = $('lgu').value;
  const L = $('list');

  if (listTab === 'pool') {
    // 공용 명부(읽기 전용) — 각 행에 "등재" 버튼으로 내 기록에 담기
    const cat = $('lcat').value, q = $('lq').value;
    const rows = filterPool({ gu, cat, q });
    const cond = [gu, cat, q.trim() ? `“${q.trim()}”` : ''].filter(Boolean).join(' · ');
    $('lstat').textContent = `공용 명부 총 ${rows.length}건` + (cond ? ` · ${cond}` : '');
    if (!rows.length) { L.innerHTML = `<div class="empty">해당 조건의 등재분이 없습니다.</div>`; return; }
    let h = `<table class="list"><tr><th>업장 / 소재지</th><th>담기</th></tr>`;
    for (const p of rows) {
      h += `<tr><td><span class="li-name">${escAttr(p.name)}</span> <span class="li-cat">${p.cat}</span>
          <div class="li-loc">${p.gu} ${p.dong}</div></td>
        <td style="text-align:center;white-space:nowrap">
          <button class="mini" data-add-wish="${p.id}">위시</button>
          <button class="mini" data-add-visit="${p.id}">가본 곳</button></td></tr>`;
    }
    L.innerHTML = h + `</table>`;
    return;
  }

  // 개인 기록 탭 (방문함 / 위시)
  let rows = recordsByStatus(listTab);
  if (gu) rows = rows.filter(r => r.gu === gu);
  const label = listTab === '방문함' ? '가본 곳' : '위시';
  $('lstat').textContent = `${label} ${rows.length}건` + (gu ? ` · ${gu}` : '') + ' · 이 기기에 저장됨';
  if (!rows.length) {
    L.innerHTML = `<div class="empty">등재된 ${label} 기록이 없습니다.<br>상단 <b>＋ 신규 등재</b> 또는 <b>공용 명부</b>에서 담아 주십시오.</div>`;
    return;
  }
  L.innerHTML = rows.map(recordCardHTML).join('');
}

// 공용 풀 / 카드의 액션 버튼을 이벤트 위임으로 처리
function onListClick(e) {
  const t = e.target;
  if (t.dataset.addWish)  { openRecordForm(blankRecord('위시',  poolVenue(t.dataset.addWish)),  false); return; }
  if (t.dataset.addVisit) { openRecordForm(blankRecord('방문함', poolVenue(t.dataset.addVisit)), false); return; }
  if (t.dataset.edit)     { const r = records.find(x => x.id === t.dataset.edit); if (r) openRecordForm(r, true); return; }
}
function poolVenue(id) { return filterPool({}).find(v => v.id === id) || null; }

// ── 등재/수정 폼 오버레이 ─────────────────────────────────────
function openRecordForm(rec, isEdit) {
  const ov = $('rec-overlay');
  ov.classList.remove('hide');
  buildRecordForm($('rec-host'), rec, {
    isEdit,
    onCancel: () => ov.classList.add('hide'),
    onSave: async (out) => {
      const nowMs = Date.now();
      if (!out.createdAt) out.createdAt = nowMs;
      out.updatedAt = nowMs;
      await recPut(out);
      records = await recAll();
      ov.classList.add('hide');
      listTab = out.status;       // 저장한 구분 탭으로 이동
      setListTab(listTab);
    },
    onDelete: async (id) => {
      await recDel(id);
      records = await recAll();
      ov.classList.add('hide');
      renderList();
    },
  });
  window.scrollTo({ top: 0 });
}

// ── 네비게이션 ───────────────────────────────────────────────
function nav(v) {
  const list = v === 'list';
  $('v-draft').classList.toggle('hide', list);
  $('v-list').classList.toggle('hide', !list);
  $('b-submit').style.display = list ? 'none' : '';
  $('b-list').style.display   = list ? 'none' : '';
  $('b-quiz').style.display   = list ? 'none' : '';
  $('b-back').style.display   = list ? '' : 'none';
  $('bar-title').style.display = list ? '' : 'none';
  if (list) setListTab(listTab);
  window.scrollTo({ top: 0 });
}

// ── 퀴즈 프로필 → 기안 화면 기본값 ────────────────────────────
// 설계서 4장: "5문항이 그대로 추천 벡터가 된다."
// 프로필이 있으면 동행/우대조건/반려사유/지역 칩과 셀렉트를 미리 채운다.
function applyProfileToDraft() {
  if (!profile) return;

  // 동행자(단일) — 프로필의 첫 항목을 기본값으로
  if (profile.sits && profile.sits.length) {
    state.sit = profile.sits[0];
  }
  // 우대조건(복수) — GOODS 와 어휘 정렬돼 있음
  state.good = new Set((profile.priorities || []).filter(v => GOODS.includes(v)));
  // 반려사유(복수) — BADS 와 어휘 정렬돼 있음
  state.bad  = new Set((profile.avoid || []).filter(v => BADS.includes(v)));

  // 칩 on 상태 반영
  syncChips('sit', state.sit ? new Set([state.sit]) : new Set());
  syncChips('good', state.good);
  syncChips('bad', state.bad);

  // 음주지역 기본값 — 관심 지역 중 풀에 존재하는 첫 구
  const poolGus = new Set(gusByCount().map(([g]) => g));
  const firstRegion = (profile.regions || []).find(g => poolGus.has(g));
  if (firstRegion) {
    $('loc').value = firstRegion;
    state.loc = firstRegion;
  }
  updSubj();
}

function syncChips(id, set) {
  $(id).querySelectorAll('.chip').forEach(b => b.classList.toggle('on', set.has(b.dataset.v)));
}

// ── 온보딩 오버레이 제어 ──────────────────────────────────────
function openQuiz(isReset) {
  const ov = $('quiz-overlay');
  ov.classList.remove('hide');
  runQuiz($('quiz-host'), isReset ? profile : null, async (answers) => {
    if (answers) {
      profile = answers;
      await saveProfile(profile);
      applyProfileToDraft();
    }
    ov.classList.add('hide');
  });
}

// ── ⑥ 안내·데이터 관리 ───────────────────────────────────────
function openInfo()  { $('info-overlay').classList.remove('hide'); window.scrollTo({ top: 0 }); }
function closeInfo()  { $('info-overlay').classList.add('hide'); }

// 내보내기 — 프로필 + 등재 업장 전체를 JSON 파일로 다운로드
async function exportData() {
  const data = await dumpAll();
  const payload = {
    format: 'oneul-hanjan-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: data.profile,
    records: data.records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  a.href = url;
  a.download = `오늘의한잔_백업_${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  const n = (data.records || []).length;
  alert(`내보내기 완료. 취향 프로필 + 등재 업장 ${n}건을 파일로 저장하였음.`);
}

// 가져오기 — 백업 파일을 읽어 복원(기존 데이터 덮어씀)
async function importData(file) {
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); }
  catch { alert('파일을 읽지 못하였음. 올바른 백업 JSON 파일인지 확인 바람.'); return; }
  if (!obj || (obj.format && obj.format !== 'oneul-hanjan-backup')) {
    alert('본 서비스의 백업 파일 형식이 아님.'); return;
  }
  if (!confirm('가져오기를 진행하면 현재 기기의 데이터가 파일 내용으로 대체됨. 계속하겠음?')) return;
  await restoreAll({ profile: obj.profile, records: obj.records });
  profile = await getProfile();
  records = await recAll();
  if (profile) applyProfileToDraft();
  closeInfo();
  alert(`가져오기 완료. 등재 업장 ${(records || []).length}건을 복원하였음.`);
}

// 전체 초기화 — 기기 내 모든 데이터 삭제(데이터 통제권)
async function resetData() {
  if (!confirm('기기에 저장된 모든 데이터(취향 프로필·등재 업장)를 삭제함. 되돌릴 수 없음. 계속하겠음?')) return;
  await wipeAll();
  profile = null;
  records = [];
  state.sit = ''; state.good.clear(); state.bad.clear();
  syncChips('sit', new Set()); syncChips('good', new Set()); syncChips('bad', new Set());
  closeInfo();
  alert('초기화 완료. 취향 진단을 다시 진행함.');
  openQuiz(false);
}

// ── 부팅 ─────────────────────────────────────────────────────
async function boot() {
  initHeader();
  try {
    await loadPool();
  } catch (e) {
    $('bodybox').innerHTML = `<div class="bguide" style="color:var(--stamp)">${e.message}<br><br>※ 정적 파일을 직접 여신 경우(file://) 브라우저가 JSON 로드를 막습니다.<br>폴더에서 <b>python3 -m http.server</b> 실행 후 <b>localhost:8000</b> 으로 접속해 주십시오.</div>`;
    return;
  }

  // 기안 화면 구성
  fillGuSelect($('loc'), '— 구 선택 —');
  $('loc').onchange = e => { state.loc = e.target.value; updSubj(); };
  buildChips('sit', SITS, 'sit');
  buildChips('good', GOODS, 'good');
  buildChips('bad', BADS, 'bad', true);

  // 목록 화면 구성
  fillListFilters();
  ['lgu', 'lcat'].forEach(id => $(id).onchange = renderList);
  $('lq').oninput = renderList;
  $('list-tabs').querySelectorAll('button').forEach(b => b.onclick = () => setListTab(b.dataset.t));
  $('list').addEventListener('click', onListClick);
  $('b-add').onclick = () => openRecordForm(blankRecord(listTab === '위시' ? '위시' : '방문함'), false);

  // ⑥ 안내·데이터 관리 버튼
  $('b-info').onclick    = openInfo;
  $('info-close').onclick = closeInfo;
  $('info-export').onclick = exportData;
  $('info-reset').onclick  = resetData;
  $('info-import').onclick = () => $('import-file').click();
  $('import-file').onchange = e => { importData(e.target.files[0]); e.target.value = ''; };

  // 공용 명부 건수 안내
  const m = getMeta();
  if (m) $('pool-count').textContent = `공용 업장 명부 ${m.count}건 (서울 · 객관 정보만 · 읽기 전용)`;

  // IndexedDB: 취향 프로필 + 개인 기록 로드
  try {
    await openDB();
    profile = await getProfile();
    records = await recAll();
  } catch (e) {
    console.warn('IndexedDB 사용 불가:', e);
  }
  if (profile) applyProfileToDraft();
  else openQuiz(false);
}

// 버튼 onclick 에서 부르는 전역 핸들러
window.submitDraft = submitDraft;
window.nav = nav;
window.openQuiz = openQuiz;
window.openInfo = openInfo;

boot();
