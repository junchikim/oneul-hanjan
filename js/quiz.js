// ─────────────────────────────────────────────────────────────
// 취향 퀴즈 5문항 (설계서 4장)
//
// "회원가입은 없지만 첫 진입 시 퀴즈 5문항으로 개인 취향 벡터를 만들어
//  콜드스타트를 메운다. 아카이브 축과 추천 질문이 같은 자(尺)를 쓴다는
//  1단계 원칙을 유지하므로, 5문항이 그대로 추천 벡터가 된다."
//
// 각 옵션의 value 는 추천 단계(⑤)의 매칭 토큰이며,
// 기안 화면의 우대조건(GOODS)·반려사유(BADS) 어휘와 정렬돼 있다.
// 개인정보 최소수집: 동행자는 유형만, 실명 입력 없음. 지역은 구 선택만.
// ─────────────────────────────────────────────────────────────

import { gusByCount } from './pool.js';

// 지역(Q5) 옵션은 공용 풀에 실제 존재하는 구에서 동적으로 만든다.
function regionOptions() {
  return gusByCount().map(([gu]) => ({ label: gu, value: gu }));
}

export function buildQuiz() {
  return [
    {
      key: 'sits', multi: true, required: true,
      q: '주 동행 유형을 기재하시오.',
      hint: '복수 기재 가능 · 유형만 기재하며 실명은 기재하지 아니함',
      options: [
        { label: '연인 동반', value: '연인' },
        { label: '직장 동료', value: '직장동료' },
        { label: '친우', value: '친구' },
        { label: '단독 (1인)', value: '혼자' },
        { label: '가족 동반', value: '가족' },
      ],
    },
    {
      key: 'priorities', multi: true, required: true,
      q: '업장 선정 시 우대 기준을 선정하시오.',
      hint: '복수 선정 가능',
      options: [
        { label: '메뉴 구성 다양', value: '메뉴 구성 다양' },
        { label: '가격 대비 만족', value: '가격 대비 만족도 우수' },
        { label: '안주 품질 우수', value: '안주 품질 우수' },
        { label: '분위기 양호', value: '분위기 양호' },
        { label: '2차 연계 용이', value: '2차 연계 용이' },
      ],
    },
    {
      key: 'avoid', multi: true, required: false, bad: true,
      q: '반려 사유에 해당하는 항목을 선정하시오.',
      hint: '복수 선정 가능 · 해당 사항 없을 시 미선정 가능',
      options: [
        { label: '혼잡도 과다', value: '혼잡도 높음' },
        { label: '소음 과다', value: '소음 수준 과다' },
        { label: '위생 미흡', value: '위생 관리 상태 다소 미흡' },
        { label: '객단가 과다', value: '객단가 다소 높음' },
        { label: '대기 시간 과다', value: '대기 시간 과다' },
      ],
    },
    {
      key: 'vibe', multi: true, required: true,
      q: '선호 업장 성향을 기재하시오.',
      hint: '복수 기재 가능',
      options: [
        { label: '노포·로컬 정취', value: 'retro' },
        { label: '트렌디·분위기 중시', value: 'trendy' },
        { label: '가성비 실속', value: 'value' },
        { label: '정숙·단독 적합', value: 'solo' },
      ],
    },
    {
      key: 'regions', multi: true, required: true,
      q: '주 관심 음주지역(구)을 지정하시오.',
      hint: '서울 소재 구 · 복수 지정 가능 · 추천 기본 지역으로 적용함',
      options: regionOptions(),
    },
  ];
}

// 빈 프로필 골격
export function emptyAnswers() {
  return { sits: [], priorities: [], avoid: [], vibe: [], regions: [] };
}

// ── 온보딩 컨트롤러 ───────────────────────────────────────────
// container: 진단서가 그려질 요소
// initial: 기존 응답(재설정 시)
// onDone(answers|null): 완료 시 응답, 건너뛰기 시 null
export function runQuiz(container, initial, onDone) {
  const QUIZ = buildQuiz();
  const ans = Object.assign(emptyAnswers(), initial || {});
  let step = 0;

  const sel = q => new Set(ans[q.key] || []);

  function render() {
    const q = QUIZ[step];
    const chosen = sel(q);
    const last = step === QUIZ.length - 1;
    container.innerHTML = `
      <div class="qsheet">
        <div class="sample">취향 진단서 · SAMPLE</div>
        <div class="qtitle">취 향 진 단 서</div>
        <div class="qmeta">
          <span>제 ${step + 1} 항 / 총 ${QUIZ.length} 항</span>
          <span class="qskip" id="q-skip">추후 보완</span>
        </div>
        <div class="qprog"><div class="qprog-bar" style="width:${((step + 1) / QUIZ.length) * 100}%"></div></div>
        <div class="qq">${q.q}</div>
        <div class="qhint">${q.hint || ''}</div>
        <div class="chips qchips" id="q-chips">
          ${q.options.map(o => `<button class="chip ${q.bad ? 'bad' : ''} ${chosen.has(o.value) ? 'on' : ''}" data-v="${o.value}">${o.label}</button>`).join('')}
        </div>
        <div class="qnav">
          <button class="btn ghost" id="q-prev" ${step === 0 ? 'disabled style="visibility:hidden"' : ''}>← 이전 항</button>
          <span class="sp" style="flex:1"></span>
          <button class="btn pri" id="q-next">${last ? '상 신' : '다음 항 →'}</button>
        </div>
      </div>`;

    const chips = container.querySelectorAll('#q-chips .chip');
    chips.forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      const s = sel(q);
      if (q.multi) {
        if (s.has(v)) s.delete(v); else s.add(v);
      } else {
        s.clear(); s.add(v);
        chips.forEach(x => x.classList.remove('on'));
      }
      b.classList.toggle('on', s.has(v));
      ans[q.key] = [...s];
    });

    container.querySelector('#q-prev').onclick = () => { if (step > 0) { step--; render(); } };
    container.querySelector('#q-skip').onclick = () => onDone(null);
    container.querySelector('#q-next').onclick = () => {
      if (q.required && (!ans[q.key] || ans[q.key].length === 0)) {
        alert('1개 이상 항목을 선정하시오.');
        return;
      }
      if (last) { onDone(finalize(ans)); }
      else { step++; render(); }
    };
  }

  render();
}

function finalize(ans) {
  return {
    sits:       ans.sits || [],
    priorities: ans.priorities || [],
    avoid:      ans.avoid || [],
    vibe:       ans.vibe || [],
    regions:    ans.regions || [],
    v: 1,
  };
}
