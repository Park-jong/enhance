# 검증 문제 기록

dev-cycle 검증에서 나온 문제와 재발 방지 규칙. **프로그래머는 코드를 쓰기 전에 이 파일 전체를 읽고 아래 규칙을 지킨다.** 테스터는 이번 변경이 이 규칙을 어겼는지도 확인한다. 이 파일은 QA 팀장만 고친다.

강조 단계: 1회 = 기록 / 2회 = ⚠️ 주의 / 3회 이상 = 🚨 필수 (맨 위 섹션으로 옮김)

## 🚨 반드시 지킬 규칙 (3회 이상 반복된 문제)

### 🚨 V2. 규칙·코드 위치를 바꿀 때 JS 밖 소비자(도구·QA 테스트·설계 문서)가 갱신되지 않는다 (4회)
- **예방 규칙**: **불변식(항상 존재, 항상 유효)을 깨는 규칙 변경은 grep으로 js/ 밖(tools/, tests/, docs/design)의 같은 API 사용처와 문서 서술까지 찾아 같은 변경에서 함께 고쳐라. 코드를 옮기거나 지우는 리팩터링도 같다: 소스 문자열을 정규식으로 보는 정적 테스트(tests/run-m1-round2-tests.js 등)를 grep으로 찾아 함께 고쳐라. 함수의 반환 형태를 바꾸면(예: SV.peek이 상태 대신 {state, corrupt, raw}를 반환) tests/ 아래 모든 스위트(run-m1*.js 포함)에서 그 함수 호출을 grep으로 찾아 같은 변경에서 고쳐라.**
- 증상: tools/sim-late가 파괴 후 R.activeSword(S).lv에서 TypeError로 중단. QA 테스트 4건 실패. docs/design/m1-storage.md 16행과 154행이 옛 자동 활성 규칙을 그대로 서술.
- 증상(3회째): SV.peek 반환 형태 변경 후 QA 소유 tests/run-m1.1-qa-tests.js 648-649행이 .gauge/.mastery를 읽어 1건 실패.
- 증상(4회째): 저장 데이터 객체에 필드 추가(검 trait: null, 정규화 §10) 후 QA 소유 tests/run-m1.1-qa-tests.js:586의 deepStrictEqual이 1건 실패. docs/design/m1-storage.md 23·41·87행은 검이 {id,lv,prot,pity}라고 서술. **저장 객체에 필드를 더하면 tests/ 전체에서 그 객체의 deepStrictEqual 기대값과 m1-storage.md를 grep으로 찾아 같은 변경에서 고쳐라.**
- 근본 원인: 변경 범위를 js/와 화면 호출처로만 잡았다.
- 확인 방법: grep -rn "activeSword|S.active" tools tests docs, 그리고 옮기는 함수·식별자 이름(예: setLocked, resume(true))을 grep -rn 으로 tests/ 에서 찾는다 와 node tools/sim-late/selfcheck.js 를 실행한다. 사전 리뷰에 도구·문서 소비자 목록 항목을 넣는다.
- 해소 기록: 2026-11-19 REQ-021·REQ-024로 tools/sim-late가 R.enhanceOpts(S)를 쓰도록 고쳐졌고 selfcheck 블록 G(13건)가 옵션 어긋남을 막는다. 남은 위험: 도구 자체 후보 A/B(S._gauge/S._mastery)를 켜면 게임 S.gauge/S.mastery와 함께 적용되어 이중 계산된다. A/B 후보를 쓰는 시뮬 전에 게임 쪽 값을 끄거나 후보를 폐기할 것.
- 발생: 2026-11-19 3단계 3-6 (tools/sim-late/lib/engine.js:115, profiles.js:12, docs/design/m1-storage.md), 2026-11-19 3단계 3-3 REQ-012 (tests/run-m1-round2-tests.js의 main.js 정적 검사 2건이 탭 잠금 분리·resume(forceAdopt) 제거 후 실패. QA가 직접 수정), 2026-11-19 3단계 3-4 저장 안전 (SV.peek 계약 변경, tests/run-m1.1-qa-tests.js:648-649를 QA가 .state로 수정), 2026-11-20 5단계 5-A (swords[].trait 추가 후 tests/run-m1.1-qa-tests.js:586 기대값, QA가 수정. docs/design/m1-storage.md는 미갱신)


## 문제 기록

### ⚠️ V1. 포인터 제스처·2회 클릭 확인 같은 임시 UI 상태가 외부 이벤트로 정리되지 않아 남는다 (2회)
- **예방 규칙**: 포인터 제스처(드래그·롱프레스)는 드래그가 실제로 시작되는 시점(임계값 통과 후)에 포인터를 capture하거나 window에서 pointerup/pointercancel을 받고(pointerdown 시점 capture는 금지, V3 참고), move 이벤트에서 buttons를 확인하며, 렌더 교체·탭 정지·저장 채택·새 게임 때 호출할 cancel()을 반드시 제공하라. 2회 클릭 확인(armed) 같은 임시 상태도 탭 전환·활성 검 변경·강화 시작·새 게임·저장 채택·다른 탭 정지 모두에서 해제(disarm)하고, 이벤트마다 smoke-dom 단언을 둬라.
- 증상: 스트립 밖에서 버튼을 놓으면 버튼 없이 카드가 따라오고 스트립 재렌더가 멈춘다. 드래그 시작 전 재렌더로 분리된 카드(g.el)를 쓰면 드롭 위치가 한 칸 어긋난다. swallowClick 플래그가 남아 키보드 클릭이 삼켜진다. 드래그 중 Space/S 단축키가 동작한다.
- 근본 원인: 제스처 상태를 strip 요소의 이벤트에만 의존해 종료시키고, DOM 교체와 외부 상태 변화(busy, suspend, adopt)를 고려하지 않았다.
- 확인 방법: smoke-dom에 buttons 없는 move, strip 밖 pointerup, 드래그 시작 전 재렌더, 드래그 중 keydown 시나리오를 추가한다. 수동으로는 카드 윗부분을 누른 채 위로 튕겨 밖에서 놓은 뒤 다시 strip 위로 이동한다. 사전 리뷰에서는 제스처 종료 경로 전부(밖에서 놓기, 포커스 상실, 재렌더, 모달/suspend)를 확인한다.
- 증상(2회째): 각인 구매 2회 클릭 확인이 탭 전환으로 해제되지 않아 2.5초 안에 돌아와 한 번 클릭으로 구매된다 (js/main.js:361 tab 액션). 2차 검증에서 disarmSinks 추가로 해소.
- 발생: 2026-11-19 3단계 3-6 (js/strip-drag.js, js/main.js), 2026-11-23 5단계 5-B (js/main.js:361 tab에서 disarmSinks 누락)

### V6. 실제 Math.random을 쓰는 UI 테스트가 확률적으로 실패한다 (1회)
- **예방 규칙**: 강화·사냥 등 확률 동작을 실제로 실행하는 smoke-dom 시나리오는 로드 전에 Math.random을 고정하거나(loadWithRandom 방식) 파괴 확률 0인 상태에서 실행하고, 새 시나리오는 10회 이상 반복 실행해 통과를 확인하라.
- 증상: traitsUi "sink buttons disabled while enhance runs"가 약 20% 실패(+13 파괴 20%로 활성 검 소멸). 뒤의 "no purchase while busy"는 notFound로 공허하게 통과.
- 근본 원인: 테스트가 +13 검을 비시드 RNG로 강화했다.
- 확인 방법: tests/smoke-dom.js를 15회 반복 실행. 사전 리뷰에 "테스트가 확률 동작을 시드 없이 호출하는가" 항목을 넣는다.
- 발생: 2026-11-23 5단계 5-B (tests/smoke-dom.js:785-787, 2차에서 Math.random 고정으로 해소)

### V7. 버튼 문구를 차단 사유(block) 값으로 고르면 사유 검사 순서 때문에 틀린 문구가 나온다 (1회)
- **예방 규칙**: "최고 등급" 같은 상태 표시는 차단 사유 문자열이 아니라 데이터(sw.trait.t >= TRAIT_TIER_MAX)로 판단하고, 비용 함수가 null을 반환하는 분기는 fmt 호출 전에 막아라. 사유 검사 순서가 겹치는 조합(잠김+최대 등급)마다 smoke 케이스를 추가하라.
- 증상: best<13에서 등급 3 특성 검의 버튼이 "최고 등급" 대신 "등급 올리기 0G" (js/view.js:554-557, upgradeTierBlock가 locked를 maxTier보다 먼저 반환).
- 근본 원인: view가 block==='maxTier'만 보고 분기했다.
- 확인 방법: best 12 + {kind,3} 검으로 각인 패널 렌더를 확인.
- 발생: 2026-11-23 5단계 5-B (js/view.js:554, 2차에서 해소)

### V3. pointerdown에서 포인터를 capture하면 click 대상이 capture 요소로 바뀌어 위임 클릭이 죽는다 (1회)
- **예방 규칙**: 클릭이 필요한 요소 위에서 시작하는 제스처는 pointerdown에서 setPointerCapture를 호출하지 말고, 임계값을 넘어 드래그가 확정된 뒤에만 capture하라. capture를 쓰는 변경은 반드시 실제 브라우저에서 mousePressed/mouseReleased 단순 클릭을 검증하라.
- 증상: 보관함 카드를 마우스로 클릭해도 활성 검이 바뀌지 않는다(click 이벤트 target이 카드가 아닌 #strip). Node 스텁 테스트와 smoke-dom은 모두 통과했다. 2차 검증에서 headless Chrome CDP로 발견.
- 근본 원인: V1 수정(밖에서 놓기 대응)으로 strip에 pointerdown capture를 추가했고, Chrome은 capture 요소를 click target으로 보내므로 document의 e.target.closest('[data-act]') 위임이 실패한다.
- 확인 방법: DOM 스텁이 아닌 브라우저 단계(CDP 스크립트)로 단순 클릭 활성 전환을 검증한다. 사전 리뷰에서 setPointerCapture 호출 위치와 click 위임(closest)의 상호작용을 확인한다.
- 발생: 2026-11-19 3단계 3-6 2차 (js/strip-drag.js pointerdown 핸들러). 3차에서 pointerdown capture 제거 후 CDP 클릭·드래그·밖에서 놓기 통과로 해소 확인

### V4. flex 컨테이너(max-height + overflow)의 자식이 줄어들어 카드 배경이 내용보다 짧아진다 (1회)
- **예방 규칙**: max-height와 overflow로 스크롤되는 flex 컨테이너의 직계 자식(카드·탭 줄)에는 flex-shrink:0을 주고, min-height를 가진 카드는 자동 최소 높이가 사라진다는 점을 확인하라. 레이아웃 변경은 가장 내용이 긴 탭과 낮은 뷰포트(1280x600)에서 scrollHeight <= clientHeight 와 패널 하단 >= 마지막 자식 하단을 실제 브라우저(tests/browser-strip.js)로 검증하라.
- 증상: 제작 탭에서 카드 배경이 조각 교환 첫 줄 근처에서 끝나고 나머지 내용이 카드 밖으로 그려진다.
- 근본 원인: .side의 자식이 flex-shrink:1로 줄어들었고 .tab-panel의 min-height:120px가 자동 최소 높이를 없앴다. Node/DOM 스텁 테스트는 레이아웃을 계산하지 못하고, 기본 미리보기 창이 좁아 내용 길이가 늘기 전까지 드러나지 않았다.
- 확인 방법: 탭 내용·행 수를 늘리는 변경은 브라우저 테스트 시나리오 (d)(5탭 x 1280x800/1280x600)를 실행한다. 사전 리뷰에 스크롤 컨테이너 안 flex 자식의 shrink와 min-height 상호작용 항목을 넣는다.
- 발생: 2026-11-19 4단계 전 버그 수정 (css/style.css .side > *, 수정 및 tests/browser-strip.js 시나리오 d로 해소)

### ⚠️ V5. 설계 문서의 합계·식·반환 형태가 자기 표나 현재 코드와 어긋난다 (2회, 문서 정리 후 옛 서술 잔존 포함)
- **예방 규칙**: 설계 문서에 쓰는 합계·조합 수·공식은 표에서 다시 합산하고(node 한 줄), 기존 함수의 반환 필드(예: `chances()`의 `parts`가 `certain()`에서는 `null`)를 확장할 때는 모든 반환 분기(확정·최대 단계 포함)의 현재 형태를 코드에서 읽고 AC를 그에 맞춰 써라. 해금·완료 가능성이 있는 일일 과제는 풀의 항목마다 "불가능해지는 상태"(예: 모루 보유 칸 가득)를 게이트로 막아라.
- 증상: 업적 파편 합계가 표 합산 30인데 문서와 AC 31은 27. `eventGain` 공식이 같은 문서의 표와 다름. 조합 수 10,400이 실제 곱과 다름. `certain()`의 `parts`가 null인데 AC가 `parts.event=0`을 요구. `craft_m` 과제가 모루 6개 보유 시 달성 불가.
- 근본 원인: 손으로 쓴 요약 수치를 표와 코드로 재검증하지 않았다.
- 확인 방법: 문서 검토 때 합계 줄마다 표를 node로 재합산, `grep -n "parts" js/rules.js js/view.js`로 반환 형태 확인, 과제·이벤트 풀의 항목별 "불가능 상태" 점검. 사전 리뷰에 "표 합계 재계산 + 기존 반환 형태 + 불가능 과제" 항목을 넣는다.
- 발생: 2026-11-20 4단계 묶음 B (docs/design/m2-achievements.md §5·AC 31·§8.2, docs/design/m2-events.md §5.2·AC 10·AC 15), 2026-11-23 6단계 6-A 문서 정리 (m2-traits.md:295 결정표가 AC15와 반대, :310 incomeTrait 곱 서술, :174, m2-achievements.md:556 래치 범위, m2-rebirth.md:287 setTrait 위치)
- 증상(2회째): 규칙을 고친 절만 갱신하고 같은 규칙을 반복 서술한 결정표·Tech 요청·다른 문서가 옛 내용으로 남았다. 예방 보강: 규칙 문장을 바꾸면 그 키워드(예: 하락 시 특성, incomeTrait, 래치, setTrait)를 grep -rn docs/design 으로 모두 찾아 같은 변경에서 고쳐라. 확인 방법 보강: 사전 리뷰에 "바꾼 규칙의 키워드 grep 결과가 전부 갱신됐는가"를 넣는다.

### V8. 런타임 값이 로드 시 정규화 상한과 달라 재시작마다 같은 보상이 반복된다 (1회)
- **예방 규칙**: 저장 정규화에서 상한(clamp)을 두는 필드는 런타임에서 그 값을 쓰는 곳도 같은 상한을 넘으면 거부하거나 같은 상한으로 자르고, 상한 초과 입력 테스트(시계 먼 미래)를 추가하라.
- 증상: 시계가 약 4708년 이후이면 daily.maxDay가 로드에서 1,000,000으로 잘려 다음 로드마다 새 일일 세트(16H)가 생성된다 (js/achievements.js:162-166, js/save.js:160). 코드 리뷰에서 발견.
- 근본 원인: refreshDaily가 maxDay를 무상한으로 저장하고 로드만 상한을 적용했다.
- 확인 방법: 시계를 Date.UTC(5000,0,1)로 주입해 save→normalize→refreshDaily를 반복하고 created가 한 번만 true인지 확인. 사전 리뷰에 "정규화 상한과 런타임 값 범위 일치" 항목을 넣는다.
- 발생: 2026-11-23 6단계 6-A (js/achievements.js:162-166)

### V9. 애니메이션 뒤로 미룬 콜백(지연 토스트)이 실행 시점의 상태(탭 정지·상태 교체·이미 수령)를 다시 검사하지 않는다 (1회)
- **예방 규칙**: 연출이 끝난 뒤 실행하도록 미룬 알림·보상 콜백은 실행 시점에 (1) isSuspended()가 아닌지 (2) 대상이 아직 유효한지(예: achState===REACHED) 다시 확인하고, 막힌 알림은 버리지 말고 ui에 보관했다가 resume()에서 내보내라. 같은 연출 중에 눌릴 수 있는 버튼(수령 등)은 ui.busy 동안 비활성화하거나 콜백에서 대상 상태를 필터링하라.
- 증상: 탭 A 강화 중 탭 B를 열면 A의 지연 "업적 달성" 토스트가 잠금 화면 뒤에서 나가거나, 이어받기로 epoch가 바뀌면 버려져 어느 탭에서도 안내되지 않는다. 강화 중 받기를 누르면 이미 받은 업적에 "받으세요" 토스트가 뜬다 (js/main.js:259-278, js/view.js:799).
- 근본 원인: 지연 콜백이 예약 시점의 가정(활성 탭, 같은 상태, 미수령)을 그대로 믿는다.
- 확인 방법: smoke-dom에서 강화 연출 중 suspend/adopt/claim을 끼워 넣고 토스트 목록을 검사한다. 사전 리뷰에 "setTimeout/연출 뒤 콜백의 재검사 항목"을 넣는다.
- 발생: 2026-11-23 6단계 6-B (js/main.js:259-278, 낮음 등급, 2차 이후 조치 요청으로 이관)

<!--
항목 형식 (발생 횟수가 많은 순서로 정렬):

### ⚠️ V1. <문제를 한 줄로: 무엇이 어떻게 잘못되는가> (2회)
- **예방 규칙**: <프로그래머가 코드를 쓸 때 지킬 것, 한 문장 명령형>
- 증상: <검증에서 보인 현상>
- 근본 원인: <왜 생기는가>
- 확인 방법: <테스터가 재발을 확인하는 방법: 테스트 이름, 명령, 확인용 URL>
- 발생: 2026-11-05 1단계 1-2 (src/battle/wave.ts), 2026-11-08 3단계 3-1 (src/battle/boss.ts)

3회 이상 항목은 "반드시 지킬 규칙" 섹션으로 옮기고 예방 규칙 전체를 굵게 쓴다:

### 🚨 V2. <문제> (3회)
- **예방 규칙: <굵게, 한 문장>**
- ...
-->
