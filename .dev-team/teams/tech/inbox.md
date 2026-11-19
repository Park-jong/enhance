# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 3건)

### REQ-021 [P3] tools/sim-late가 F16 새 옵션(gaugeFull, mastery)을 반영하지 않음
- 보낸 팀: QA 팀 · 유형: 요구사항 · 상태: 접수 · 접수: 2026-11-18 · 단계: M1.1
- 우선순위 근거: 사용자가 시뮬레이션을 하지 않기로 해서 지금은 영향 없음. 다시 쓸 때만 필요

tools/sim-late/lib/mechanics.js:158은 R.chances를 gaugeFull과 mastery 없이 부른다. 나중에 시뮬레이션을 다시 쓸 경우 확정안의 성공 확률을 낮게 잡게 된다.

- 2026-11-18 메인 세션: 접수 — 우선순위 P3

### REQ-024 [P3] tools/sim-late가 '활성 검 없음' 상태에서 오류로 멈춤
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-18 · 단계: 3단계
- 우선순위 근거: 시뮬레이션은 사용자 요청 시에만 실행하므로 다시 쓸 때만 필요

파괴 후 R.activeSword(S)가 null이 될 수 있게 바뀌었다. 그런데 tools/sim-late/lib/engine.js:115와 profiles.js:12가 그 값의 .lv를 읽어서 selfcheck가 TypeError로 멈춘다.
- 수정: profile.manage 앞에 `if (!R.activeSword(S)) R.setActive(S, R.bestSword(S).id)`를 넣는다.
- REQ-021(새 옵션 미반영)과 함께 처리한다.
사용자가 시뮬레이션을 하지 않기로 해서 지금은 영향이 없다.

- 2026-11-18 메인 세션: 접수 — 우선순위 P3

### REQ-025 [P3] 실제 브라우저 클릭·드래그 회귀 테스트 추가 + 3-6 낮음 문제
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-18 · 단계: 3단계
- 우선순위 근거: 현재 동작에는 문제가 없고 재발 방지와 정리 목적의 개선

1) V3 버그(누르는 순간 포인터를 잡아서 클릭이 엉뚱한 곳으로 감)는 node 테스트와 DOM 흉내 테스트를 모두 통과했고, 헤드리스 Chrome(CDP)으로만 발견됐다. 그래서 헤드리스 Chrome으로 다음 세 가지를 확인하는 테스트 스크립트를 tests/에 둔다.
   - 클릭하면 활성화됨
   - 드래그로 순서 이동
   - 보관함 밖에서 놓기
   QA가 쓴 스크립트 cdp2.js와 cdp3.js를 참고한다.
2) 3-6 낮음 문제
   - S6: 빈 강화 영역 안내 문구가 두 곳에 따로 적혀 있다.
   - S7: 끌다가 가장자리에 닿으면 하는 자동 스크롤이 pointermove 이벤트에서만 동작한다.

- 2026-11-18 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (8건)

- REQ-031 [P2] 저장 안전 마무리: 원문 칸 입력 중 단축키, 모바일 헤더 높이, 헤더 줄바꿈 범위, 읽기 실패 처리 — 완료 (텍스트 입력 칸 단축키 무시, 보호 모드 헤더(줄바꿈 범위·모바일 비고정·원문 칸 120px), 읽기 실패 시 보호 유지. QA 승인 2026-11-19)
- REQ-030 [P3] smoke-dom.js의 REQ-012 주석 위치 정리 — 완료 (smoke-dom.js 주석 위치 정리. QA 승인 2026-11-19)
- REQ-027 [P3] main.js의 tabGuard를 persist·resume보다 먼저 정의 — 완료 (tabGuard를 persist·isSuspended보다 먼저 생성. QA 승인 2026-11-19)
- REQ-020 [P1] F16 QA 후속 수정: gaugeFull 잠금 알림 문구 외 정리 — 완료 (gaugeFull 문구 추가, GAUGE_TO/MASTERY_TO 유도, 중복 정리, 모바일 버튼 넘침 수정(css/style.css). 테스트 5종 통과. 상세는 tech/worklog.md)
- REQ-017 [P1] F16 천장 게이지·단계 성공 숙련 구현 — 완료 (구현 완료. 변경: js/constants.js, rules.js, save.js, view.js, main.js, index.html, test.html, css/style.css, tests/run-tests.js, tests/smoke-dom.js. 테스트 164/116/29/36 전부 통과. 브라우저 모바일 확인은 QA 필요.)
- REQ-014 [P3] 테스트 페이지 소소한 개선 (확정 강화권 소모, 설정 플래그 주석) — 완료 (강제 성공 시 확정 강화권 미소모와 효과음 생략, SG.config 테스트 전용 주석. QA 승인 2026-11-19)
- REQ-012 [P2] M1 잔여 개선 사항 (QA 권장 수정 묶음) — 완료 (항목 1, 3~12와 13의 setSeal 분리를 완료했다. QA 승인(2026-11-19, 사이클 1). 항목 2는 3-4 REQ-013으로, rules.js 책임 분리는 M2로 넘겼다. 새 파일 js/tab-guard.js)
- REQ-009 [P1] 저장 데이터 버전 이전 (sword-enhance-v1 → 새 구조) — 완료 (js/save.js migrate() 구현, tests/run-tests.js에서 v1 여러 형태·손상 데이터·v1 키 보존 검증)
