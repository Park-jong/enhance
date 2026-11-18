# 검증 문제 기록

dev-cycle 검증에서 나온 문제와 재발 방지 규칙. **프로그래머는 코드를 쓰기 전에 이 파일 전체를 읽고 아래 규칙을 지킨다.** 테스터는 이번 변경이 이 규칙을 어겼는지도 확인한다. 이 파일은 QA 팀장만 고친다.

강조 단계: 1회 = 기록 / 2회 = ⚠️ 주의 / 3회 이상 = 🚨 필수 (맨 위 섹션으로 옮김)

## 🚨 반드시 지킬 규칙 (3회 이상 반복된 문제)

(없음)

## 문제 기록

### V1. 포인터 제스처 상태가 외부 이벤트로 정리되지 않아 드래그가 남는다 (1회)
- **예방 규칙**: 포인터 제스처(드래그·롱프레스)는 드래그가 실제로 시작되는 시점(임계값 통과 후)에 포인터를 capture하거나 window에서 pointerup/pointercancel을 받고(pointerdown 시점 capture는 금지, V3 참고), move 이벤트에서 buttons를 확인하며, 렌더 교체·탭 정지·저장 채택·새 게임 때 호출할 cancel()을 반드시 제공하라.
- 증상: 스트립 밖에서 버튼을 놓으면 버튼 없이 카드가 따라오고 스트립 재렌더가 멈춘다. 드래그 시작 전 재렌더로 분리된 카드(g.el)를 쓰면 드롭 위치가 한 칸 어긋난다. swallowClick 플래그가 남아 키보드 클릭이 삼켜진다. 드래그 중 Space/S 단축키가 동작한다.
- 근본 원인: 제스처 상태를 strip 요소의 이벤트에만 의존해 종료시키고, DOM 교체와 외부 상태 변화(busy, suspend, adopt)를 고려하지 않았다.
- 확인 방법: smoke-dom에 buttons 없는 move, strip 밖 pointerup, 드래그 시작 전 재렌더, 드래그 중 keydown 시나리오를 추가한다. 수동으로는 카드 윗부분을 누른 채 위로 튕겨 밖에서 놓은 뒤 다시 strip 위로 이동한다. 사전 리뷰에서는 제스처 종료 경로 전부(밖에서 놓기, 포커스 상실, 재렌더, 모달/suspend)를 확인한다.
- 발생: 2026-11-19 3단계 3-6 (js/strip-drag.js, js/main.js)

### V2. 항상 존재하던 값(활성 검)이 null이 될 때 JS 밖 소비자(도구·QA 테스트·설계 문서)가 갱신되지 않는다 (1회)
- **예방 규칙**: 불변식(항상 존재, 항상 유효)을 깨는 규칙 변경은 grep으로 js/ 밖(tools/, tests/, docs/design)의 같은 API 사용처와 문서 서술까지 찾아 같은 변경에서 함께 고쳐라.
- 증상: tools/sim-late가 파괴 후 R.activeSword(S).lv에서 TypeError로 중단. QA 테스트 4건 실패. docs/design/m1-storage.md 16행과 154행이 옛 자동 활성 규칙을 그대로 서술.
- 근본 원인: 변경 범위를 js/와 화면 호출처로만 잡았다.
- 확인 방법: grep -rn "activeSword|S.active" tools tests docs 와 node tools/sim-late/selfcheck.js 를 실행한다. 사전 리뷰에 도구·문서 소비자 목록 항목을 넣는다.
- 발생: 2026-11-19 3단계 3-6 (tools/sim-late/lib/engine.js:115, profiles.js:12, docs/design/m1-storage.md)


### V3. pointerdown에서 포인터를 capture하면 click 대상이 capture 요소로 바뀌어 위임 클릭이 죽는다 (1회)
- **예방 규칙**: 클릭이 필요한 요소 위에서 시작하는 제스처는 pointerdown에서 setPointerCapture를 호출하지 말고, 임계값을 넘어 드래그가 확정된 뒤에만 capture하라. capture를 쓰는 변경은 반드시 실제 브라우저에서 mousePressed/mouseReleased 단순 클릭을 검증하라.
- 증상: 보관함 카드를 마우스로 클릭해도 활성 검이 바뀌지 않는다(click 이벤트 target이 카드가 아닌 #strip). Node 스텁 테스트와 smoke-dom은 모두 통과했다. 2차 검증에서 headless Chrome CDP로 발견.
- 근본 원인: V1 수정(밖에서 놓기 대응)으로 strip에 pointerdown capture를 추가했고, Chrome은 capture 요소를 click target으로 보내므로 document의 e.target.closest('[data-act]') 위임이 실패한다.
- 확인 방법: DOM 스텁이 아닌 브라우저 단계(CDP 스크립트)로 단순 클릭 활성 전환을 검증한다. 사전 리뷰에서 setPointerCapture 호출 위치와 click 위임(closest)의 상호작용을 확인한다.
- 발생: 2026-11-19 3단계 3-6 2차 (js/strip-drag.js pointerdown 핸들러). 3차에서 pointerdown capture 제거 후 CDP 클릭·드래그·밖에서 놓기 통과로 해소 확인

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
