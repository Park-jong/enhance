# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 1건)

### REQ-033 [P3] sim-late 후보 A/B가 게임의 게이지·숙련과 이중으로 계산됨
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-19 · 단계: 3단계
- 우선순위 근거: 시뮬레이션은 사용자가 요청할 때만 하므로 다음에 시뮬레이션을 요청받을 때만 필요하다

tools/sim-late의 후보 메커닉 A/B(mechanics.js 17-37행)는 자체 S._gauge와 S._mastery를 쓴다. 그런데 굴림은 R.attemptEnhance를 거치므로 게임의 S.gauge와 S.mastery도 함께 적용된다. 그래서 A/B를 켠 실행에서는 보너스가 두 번 들어간다. A/B를 끈 실행은 문제가 없고, 이번 수정으로 생긴 문제도 아니다. 다음에 A/B로 시뮬레이션하기 전에 A/B를 없애거나 게임 쪽 효과를 끄고, 게이지·숙련 출처가 하나뿐인지 확인하는 selfcheck를 추가한다.

- 2026-11-19 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (11건)

- REQ-031 [P2] 저장 안전 마무리: 원문 칸 입력 중 단축키, 모바일 헤더 높이, 헤더 줄바꿈 범위, 읽기 실패 처리 — 완료 (텍스트 입력 칸 단축키 무시, 보호 모드 헤더(줄바꿈 범위·모바일 비고정·원문 칸 120px), 읽기 실패 시 보호 유지. QA 승인 2026-11-19)
- REQ-030 [P3] smoke-dom.js의 REQ-012 주석 위치 정리 — 완료 (smoke-dom.js 주석 위치 정리. QA 승인 2026-11-19)
- REQ-027 [P3] main.js의 tabGuard를 persist·resume보다 먼저 정의 — 완료 (tabGuard를 persist·isSuspended보다 먼저 생성. QA 승인 2026-11-19)
- REQ-025 [P3] 실제 브라우저 클릭·드래그 회귀 테스트 추가 + 3-6 낮음 문제 — 완료 (tests/browser-strip.js(헤드리스 Chrome/Edge 실제 클릭·드래그·밖에서 놓기 14개), 빈 강화 영역 문구 단일화(S6), 가장자리 자동 스크롤 rAF 반복(S7). QA 승인 2026-11-19)
- REQ-024 [P3] tools/sim-late가 '활성 검 없음' 상태에서 오류로 멈춤 — 완료 (engine.js가 활성 검이 없으면 최고 단계 검을 다시 활성화. selfcheck 통과. QA 승인 2026-11-19)
- REQ-021 [P3] tools/sim-late가 F16 새 옵션(gaugeFull, mastery)을 반영하지 않음 — 완료 (mechanics.js·profiles.js가 R.enhanceOpts(S)로 확률 옵션을 만듦, selfcheck 블록 G 추가(13개 통과). QA 승인 2026-11-19)
- REQ-020 [P1] F16 QA 후속 수정: gaugeFull 잠금 알림 문구 외 정리 — 완료 (gaugeFull 문구 추가, GAUGE_TO/MASTERY_TO 유도, 중복 정리, 모바일 버튼 넘침 수정(css/style.css). 테스트 5종 통과. 상세는 tech/worklog.md)
- REQ-017 [P1] F16 천장 게이지·단계 성공 숙련 구현 — 완료 (구현 완료. 변경: js/constants.js, rules.js, save.js, view.js, main.js, index.html, test.html, css/style.css, tests/run-tests.js, tests/smoke-dom.js. 테스트 164/116/29/36 전부 통과. 브라우저 모바일 확인은 QA 필요.)
- REQ-014 [P3] 테스트 페이지 소소한 개선 (확정 강화권 소모, 설정 플래그 주석) — 완료 (강제 성공 시 확정 강화권 미소모와 효과음 생략, SG.config 테스트 전용 주석. QA 승인 2026-11-19)
- REQ-012 [P2] M1 잔여 개선 사항 (QA 권장 수정 묶음) — 완료 (항목 1, 3~12와 13의 setSeal 분리를 완료했다. QA 승인(2026-11-19, 사이클 1). 항목 2는 3-4 REQ-013으로, rules.js 책임 분리는 M2로 넘겼다. 새 파일 js/tab-guard.js)
- REQ-009 [P1] 저장 데이터 버전 이전 (sword-enhance-v1 → 새 구조) — 완료 (js/save.js migrate() 구현, tests/run-tests.js에서 v1 여러 형태·손상 데이터·v1 키 보존 검증)
