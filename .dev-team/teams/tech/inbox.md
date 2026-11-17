# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 1건)

### REQ-012 [P2] M1 잔여 개선 사항 (QA 권장 수정 묶음)
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-17 · 마일스톤: M2 장기 플레이
- 우선순위 근거: M1은 QA 승인 완료. 모두 드문 경우의 정합성·접근성·코드 품질 개선이라 다음 마일스톤에서 처리

QA 최종 승인 시 남은 권장 수정. M1 진행을 막지는 않음.
[정합성] 1) 강화 연출 중 탭 이어받기 시 ui.busy가 풀려 이전 강화 결과가 버려진 상태로 기록될 수 있음 → adoptStoredSave에서 ui.epoch 증가, enhance가 await 후 epoch 확인 (js/main.js:357, 164-200). 2) 이어받기·복귀 시 저장소의 v2가 깨져 있으면 SV.peek이 null을 돌려주고 다음 persist가 백업 없이 덮어씀 → peek이 손상 여부 반환 또는 persist 전 백업 (main.js:351-352,368). 3) 빈 문자열 v2가 손상으로 취급되어 유효한 v1을 가림 → isEmpty 사용 (save.js:223). 4) storage 이벤트 key===null 판정에 e.storageArea===localStorage 추가 (main.js:408).
[접근성] 5) 잠금 화면이 뜰 때 '이 탭에서 계속하기' 버튼으로 포커스 이동 (main.js:388-392). 6) 자동 해제된 토글 알림, 의뢰 탭 개수 표시, 저장 실패 알림 1회.
[코드 정리] 7) UI 초기화 중복 → resetUiFor(state,t) 하나로 (main.js:355-359 vs 440). 8) save.js의 backedUp이 keptAt과 중복, 결과 객체 생성 헬퍼화. 9) resume(forceAdopt) 불리언 인자 대신 takeOver에서 adoptStoredSave(t,true) 후 resume(). 10) 탭 잠금을 createTabGuard로 분리(main.js 약 480줄). 11) 파티클 상한(MAX_PARTICLES)과 크기 캐시 (fx.js:98-123). 12) 중복 제거: 인장 가격 재계산(view.js:154,420), UP_EFFECT(view.js:63-67), ITEMS.desc·'10분간' 하드코딩 숫자, USE_KEYS를 TRAY_TOGGLES에서 파생. 13) setUse의 seal 특수 처리 분리(setSeal), rules.js 책임 분리 검토.

- 2026-11-17 메인 세션: 접수 — 우선순위 P2

## 닫힌 요청 (1건)

- REQ-009 [P1] 저장 데이터 버전 이전 (sword-enhance-v1 → 새 구조) — 완료 (js/save.js migrate() 구현, tests/run-tests.js에서 v1 여러 형태·손상 데이터·v1 키 보존 검증)
