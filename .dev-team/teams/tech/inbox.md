# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 3건)

### REQ-012 [P2] M1 잔여 개선 사항 (QA 권장 수정 묶음)
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-17 · 마일스톤: M2 장기 플레이
- 우선순위 근거: M1은 QA 승인 완료. 모두 드문 경우의 정합성·접근성·코드 품질 개선이라 다음 마일스톤에서 처리

QA 최종 승인 시 남은 권장 수정. M1 진행을 막지는 않음.
[정합성] 1) 강화 연출 중 탭 이어받기 시 ui.busy가 풀려 이전 강화 결과가 버려진 상태로 기록될 수 있음 → adoptStoredSave에서 ui.epoch 증가, enhance가 await 후 epoch 확인 (js/main.js:357, 164-200). 2) 이어받기·복귀 시 저장소의 v2가 깨져 있으면 SV.peek이 null을 돌려주고 다음 persist가 백업 없이 덮어씀 → peek이 손상 여부 반환 또는 persist 전 백업 (main.js:351-352,368). 3) 빈 문자열 v2가 손상으로 취급되어 유효한 v1을 가림 → isEmpty 사용 (save.js:223). 4) storage 이벤트 key===null 판정에 e.storageArea===localStorage 추가 (main.js:408).
[접근성] 5) 잠금 화면이 뜰 때 '이 탭에서 계속하기' 버튼으로 포커스 이동 (main.js:388-392). 6) 자동 해제된 토글 알림, 의뢰 탭 개수 표시, 저장 실패 알림 1회.
[코드 정리] 7) UI 초기화 중복 → resetUiFor(state,t) 하나로 (main.js:355-359 vs 440). 8) save.js의 backedUp이 keptAt과 중복, 결과 객체 생성 헬퍼화. 9) resume(forceAdopt) 불리언 인자 대신 takeOver에서 adoptStoredSave(t,true) 후 resume(). 10) 탭 잠금을 createTabGuard로 분리(main.js 약 480줄). 11) 파티클 상한(MAX_PARTICLES)과 크기 캐시 (fx.js:98-123). 12) 중복 제거: 인장 가격 재계산(view.js:154,420), UP_EFFECT(view.js:63-67), ITEMS.desc·'10분간' 하드코딩 숫자, USE_KEYS를 TRAY_TOGGLES에서 파생. 13) setUse의 seal 특수 처리 분리(setSeal), rules.js 책임 분리 검토.

- 2026-11-17 메인 세션: 접수 — 우선순위 P2

### REQ-014 [P3] 테스트 페이지 소소한 개선 (확정 강화권 소모, 설정 플래그 주석)
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-17 · 마일스톤: M2 장기 플레이
- 우선순위 근거: 테스트 전용 페이지의 편의·명확성 개선으로 실제 게임에 영향 없음

test.html(강화 100%) QA 승인 시 남은 권장 사항. 1) chances()의 forceSuccess 분기가 확정 강화권 분기보다 앞에 있어도 확정 강화권이 켜져 있으면 테스트 모드에서 소모됨 → 강제 성공일 때는 소모하지 않도록. 2) SG.config(forceSuccess 등)는 테스트 페이지 전용이라는 주석 또는 문서 한 줄 추가(실제 페이지에서 설정 금지). 3) 100% 토글 상태 비저장, 다른 탭의 localStorage.clear()가 테스트 탭도 잠그는 동작은 현행 유지 가능.

- 2026-11-17 메인 세션: 접수 — 우선순위 P3

### REQ-021 [P3] tools/sim-late가 F16 새 옵션(gaugeFull, mastery)을 반영하지 않음
- 보낸 팀: QA 팀 · 유형: 요구사항 · 상태: 접수 · 접수: 2026-11-18 · 마일스톤: M1.1
- 우선순위 근거: 사용자가 시뮬레이션을 하지 않기로 해서 지금은 영향 없음. 다시 쓸 때만 필요

tools/sim-late/lib/mechanics.js:158은 R.chances를 gaugeFull과 mastery 없이 부른다. 나중에 시뮬레이션을 다시 쓸 경우 확정안의 성공 확률을 낮게 잡게 된다.

- 2026-11-18 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (3건)

- REQ-020 [P1] F16 QA 후속 수정: gaugeFull 잠금 알림 문구 외 정리 — 완료 (gaugeFull 문구 추가, GAUGE_TO/MASTERY_TO 유도, 중복 정리, 모바일 버튼 넘침 수정(css/style.css). 테스트 5종 통과. 상세는 tech/worklog.md)
- REQ-017 [P1] F16 천장 게이지·단계 성공 숙련 구현 — 완료 (구현 완료. 변경: js/constants.js, rules.js, save.js, view.js, main.js, index.html, test.html, css/style.css, tests/run-tests.js, tests/smoke-dom.js. 테스트 164/116/29/36 전부 통과. 브라우저 모바일 확인은 QA 필요.)
- REQ-009 [P1] 저장 데이터 버전 이전 (sword-enhance-v1 → 새 구조) — 완료 (js/save.js migrate() 구현, tests/run-tests.js에서 v1 여러 형태·손상 데이터·v1 키 보존 검증)
