// ─────────────────────────────────────────────────────────────
// 개인 업장 기록 (가본 곳 / 위시)
//
// 설계서 2장: 가본 곳/위시/평점/태그는 전부 기기(IndexedDB)에만 저장.
// 설계서 7장(최소수집):
//   - 동행자는 유형만(실명 금지)
//   - 위치는 구 선택만(GPS 미사용)
//   - 한줄평은 태그형 우선 + 자유 메모에 타인 개인정보 입력 금지 주의문구
//
// 스키마(records 스토어, keyPath 'id'):
//   { id, venueId, name, cat, gu, dong, status('방문함'|'위시'),
//     revisit('예'|'아니오'|''), sat(0~5), sit, good[], bad[], note,
//     createdAt, updatedAt }
// good/bad 토큰은 vocab 의 GOODS/BADS 와 동일 → ⑤ 매칭 키.
// ─────────────────────────────────────────────────────────────

import { SITS, GOODS, BADS, labelOf } from './vocab.js';
import { cats as poolCats, gusByCount } from './pool.js';

function uid() {
  if (crypto && crypto.randomUUID) return 'r_' + crypto.randomUUID();
  return 'r_' + Math.abs(hashStr(JSON.stringify(arguments) + performance.now())).toString(36);
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// 빈 기록 (status 기본 위시). venue: 공용 풀 업장(있으면 객관 정보 복사 + 참조)
export function blankRecord(status = '위시', venue = null) {
  return {
    id: uid(),
    venueId: venue ? venue.id : null,
    name: venue ? venue.name : '',
    cat:  venue ? venue.cat  : '',
    gu:   venue ? venue.gu   : '',
    dong: venue ? venue.dong : '',
    status,
    revisit: '',
    sat: 0,
    sit: '',
    good: [],
    bad: [],
    note: '',
    createdAt: 0,
    updatedAt: 0,
  };
}

// ── 등재/수정 폼 ──────────────────────────────────────────────
// host: 폼이 그려질 요소
// rec: 대상 기록(신규 또는 기존)
// opts: { isEdit, onSave(rec), onDelete(id), onCancel() }
export function buildRecordForm(host, rec, opts = {}) {
  const r = Object.assign(blankRecord(), rec);
  const goodSet = new Set(r.good || []);
  const badSet  = new Set(r.bad  || []);

  const guOpts  = gusByCount().map(([g]) => `<option value="${g}" ${g === r.gu ? 'selected' : ''}>${g}</option>`).join('');
  const catList = poolCats();
  const catOpts = ['<option value="">— 카테고리 —</option>',
    ...catList.map(c => `<option ${c === r.cat ? 'selected' : ''}>${c}</option>`),
    `<option value="기타" ${r.cat && !catList.includes(r.cat) ? 'selected' : ''}>기타</option>`].join('');

  const chipRow = (arr, set, bad) => arr.map(t =>
    `<button type="button" class="chip ${bad ? 'bad' : ''} ${set.has(t) ? 'on' : ''}" data-v="${t}">${labelOf(t)}</button>`).join('');

  host.innerHTML = `
    <div class="qsheet">
      <div class="qtitle" style="font-size:17px;letter-spacing:4px">업 장 등 재</div>

      <div class="recseg" id="rf-status">
        <button type="button" data-s="위시"  class="${r.status === '위시'  ? 'on' : ''}">위시 (방문 예정)</button>
        <button type="button" data-s="방문함" class="${r.status === '방문함' ? 'on' : ''}">가본 곳 (기록)</button>
      </div>

      <div class="fgrid">
        <div class="r"><div class="lbl">업장명</div><div class="val"><input class="rf-in" id="rf-name" placeholder="업장명 (필수)" value="${esc(r.name)}"></div></div>
        <div class="r"><div class="lbl">카테고리</div><div class="val"><select class="f" id="rf-cat">${catOpts}</select></div></div>
        <div class="r"><div class="lbl">음주지역</div><div class="val"><select class="f" id="rf-gu"><option value="">— 구 선택 (필수) —</option>${guOpts}</select></div></div>
        <div class="r"><div class="lbl">동</div><div class="val"><input class="rf-in" id="rf-dong" placeholder="동 (예: 역삼동)" value="${esc(r.dong)}"></div></div>
        <div class="r"><div class="lbl">동행 유형</div><div class="val"><div class="chips" id="rf-sit">${SITS.map(s => `<button type="button" class="chip ${r.sit === s ? 'on' : ''}" data-v="${s}">${s}</button>`).join('')}</div></div></div>
        <div class="r"><div class="lbl">우대조건</div><div class="val"><div class="chips" id="rf-good">${chipRow(GOODS, goodSet, false)}</div></div></div>
        <div class="r"><div class="lbl">반려사유</div><div class="val"><div class="chips" id="rf-bad">${chipRow(BADS, badSet, true)}</div></div></div>
      </div>

      <div id="rf-visited" class="fgrid" style="border-top:none;${r.status === '방문함' ? '' : 'display:none'}">
        <div class="r"><div class="lbl">만족도</div><div class="val"><select class="f" id="rf-sat">
          <option value="0">— 미평가 —</option>
          ${[5,4,3,2,1].map(n => `<option value="${n}" ${r.sat === n ? 'selected' : ''}>${'★'.repeat(n)} (${n})</option>`).join('')}
        </select></div></div>
        <div class="r"><div class="lbl">재방문</div><div class="val"><select class="f" id="rf-re">
          <option value="">— 미정 —</option>
          <option value="예"   ${r.revisit === '예'   ? 'selected' : ''}>예</option>
          <option value="아니오" ${r.revisit === '아니오' ? 'selected' : ''}>아니오</option>
        </select></div></div>
      </div>

      <div class="fgrid" style="border-top:none">
        <div class="r" style="min-height:auto"><div class="lbl">메모</div><div class="val"><textarea class="rf-in" id="rf-note" rows="2" placeholder="선택 입력">${esc(r.note)}</textarea></div></div>
      </div>
      <div class="rf-warn">※ 타인의 이름·연락처·직장명 등 개인정보는 입력하지 마십시오.</div>

      <div class="qnav" style="margin-top:14px">
        <button type="button" class="btn ghost" id="rf-cancel">취소</button>
        ${opts.isEdit ? '<button type="button" class="btn" id="rf-del" style="color:var(--stamp);border-color:#e3cfca">삭제</button>' : ''}
        <span class="sp" style="flex:1"></span>
        <button type="button" class="btn pri" id="rf-save">대 장 등 재</button>
      </div>
    </div>`;

  // 구분 토글
  host.querySelectorAll('#rf-status button').forEach(b => b.onclick = () => {
    r.status = b.dataset.s;
    host.querySelectorAll('#rf-status button').forEach(x => x.classList.toggle('on', x === b));
    host.querySelector('#rf-visited').style.display = r.status === '방문함' ? '' : 'none';
  });

  // 동행(단일)
  host.querySelectorAll('#rf-sit .chip').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    r.sit = (r.sit === v) ? '' : v;
    host.querySelectorAll('#rf-sit .chip').forEach(x => x.classList.toggle('on', x.dataset.v === r.sit));
  });
  // 우대/반려(복수)
  bindMulti(host, '#rf-good', goodSet);
  bindMulti(host, '#rf-bad', badSet);

  host.querySelector('#rf-cancel').onclick = () => opts.onCancel && opts.onCancel();
  if (opts.isEdit) host.querySelector('#rf-del').onclick = () => {
    if (confirm('해당 기록을 대장에서 삭제합니까?')) opts.onDelete && opts.onDelete(r.id);
  };

  host.querySelector('#rf-save').onclick = () => {
    const name = host.querySelector('#rf-name').value.trim();
    const gu   = host.querySelector('#rf-gu').value;
    if (!name) { alert('업장명을 기재하시오.'); return; }
    if (!gu)   { alert('음주지역(구)을 지정하시오.'); return; }
    const out = {
      ...r,
      name,
      cat:  host.querySelector('#rf-cat').value || '기타',
      gu,
      dong: host.querySelector('#rf-dong').value.trim(),
      good: [...goodSet],
      bad:  [...badSet],
      note: host.querySelector('#rf-note').value.trim(),
    };
    if (out.status === '방문함') {
      out.sat = parseInt(host.querySelector('#rf-sat').value) || 0;
      out.revisit = host.querySelector('#rf-re').value;
    } else {
      out.sat = 0; out.revisit = '';
    }
    opts.onSave && opts.onSave(out);
  };
}

function bindMulti(host, sel, set) {
  host.querySelectorAll(sel + ' .chip').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    if (set.has(v)) set.delete(v); else set.add(v);
    b.classList.toggle('on', set.has(v));
  });
}

// ── 목록 카드 ─────────────────────────────────────────────────
export function recordCardHTML(r) {
  const tags = []
    .concat((r.good || []).map(t => `<span class="tg g">＋${labelOf(t)}</span>`))
    .concat((r.bad  || []).map(t => `<span class="tg b">－${labelOf(t)}</span>`))
    .join(' ');
  const meta = [];
  if (r.status === '방문함') {
    meta.push(r.sat ? '★'.repeat(r.sat) : '미평가');
    if (r.revisit) meta.push('재방문 ' + (r.revisit === '예' ? '○' : '✕'));
  }
  if (r.sit) meta.push('동행: ' + r.sit);
  return `
    <div class="reccard" data-id="${r.id}">
      <div class="rc-h">
        <div><span class="li-name">${esc(r.name)}</span> <span class="li-cat">${esc(r.cat)}</span></div>
        <button type="button" class="rc-edit" data-edit="${r.id}">수정</button>
      </div>
      <div class="li-loc">서울 ${esc(r.gu)} ${esc(r.dong)}</div>
      ${meta.length ? `<div class="rc-meta">${meta.join(' · ')}</div>` : ''}
      ${tags ? `<div class="ac-tags" style="margin-top:6px">${tags}</div>` : ''}
      ${r.note ? `<div class="li-note">“${esc(r.note)}”</div>` : ''}
    </div>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
